/**
 * Audio codec for voice bridge: mu-law ↔ PCM16 + 8kHz ↔ 24kHz resampling.
 * Pure TypeScript — no native dependencies.
 */

// Telnyx requires audio chunks to be 20ms–30s. At 8kHz mu-law (1 byte/sample), 20ms = 160 bytes.
export const TELNYX_MIN_CHUNK_BYTES = 160;

// ─── Mu-law decode lookup table (256 entries, G.711 standard) ────────────────

const MULAW_DECODE_TABLE = new Int16Array(256);
(() => {
  for (let i = 0; i < 256; i++) {
    const uval = ~i;
    let t = ((uval & 0x0f) << 3) + 0x84; // mantissa * 8 + bias(132)
    t <<= (uval & 0x70) >>> 4; // shift by segment
    MULAW_DECODE_TABLE[i] = uval & 0x80 ? 0x84 - t : t - 0x84;
  }
})();

// ─── Mu-law encode: standard compression algorithm ──────────────────────────

const MULAW_BIAS = 0x84; // 132 — correct for 16-bit PCM (was 33, a 14-bit value)
const MULAW_CLIP = 32635;
const MULAW_SEG_END = new Uint16Array([
  0xff, 0x1ff, 0x3ff, 0x7ff, 0xfff, 0x1fff, 0x3fff, 0x7fff,
]);

function mulawEncodeSample(pcmVal: number): number {
  let mask: number;

  if (pcmVal < 0) {
    pcmVal = MULAW_BIAS - pcmVal;
    mask = 0x7f;
  } else {
    pcmVal += MULAW_BIAS;
    mask = 0xff;
  }
  if (pcmVal > MULAW_CLIP) pcmVal = MULAW_CLIP;

  // Find segment via table lookup
  let seg = 0;
  for (; seg < 8; seg++) {
    if (pcmVal <= MULAW_SEG_END[seg]) break;
  }

  if (seg >= 8) return 0x7f ^ mask;
  const uval = (seg << 4) | ((pcmVal >> (seg + 3)) & 0x0f);
  return uval ^ mask;
}

// ─── Anti-aliasing FIR filter for downsampling ──────────────────────────────
// Matches the quality of the old Python backend's soxr HQ polyphase resampler.
// 96-tap Blackman-windowed sinc lowpass at 3,400 Hz / 24 kHz ≈ 58 dB stopband.

const DECIMATION_TAPS = 96;

/** Precomputed lowpass FIR kernel (computed once at module load). */
const DECIMATION_FIR = (() => {
  const fc = 3400 / 24000; // normalized cutoff
  const N = DECIMATION_TAPS;
  const M = N - 1;
  const coeffs = new Float64Array(N);
  let sum = 0;

  for (let i = 0; i < N; i++) {
    const n = i - M / 2;
    // Windowed sinc
    const sinc =
      Math.abs(n) < 1e-6
        ? 2 * fc
        : Math.sin(2 * Math.PI * fc * n) / (Math.PI * n);
    // Blackman window
    const w =
      0.42 -
      0.5 * Math.cos((2 * Math.PI * i) / M) +
      0.08 * Math.cos((4 * Math.PI * i) / M);
    coeffs[i] = sinc * w;
    sum += coeffs[i];
  }

  // Normalize for unity DC gain
  for (let i = 0; i < N; i++) coeffs[i] /= sum;
  return coeffs;
})();

/** Stateful anti-aliasing filter for streaming 24 kHz → 8 kHz decimation. */
export interface DownsampleFilter {
  /** Circular buffer of recent input samples (normalized floats). */
  buf: Float64Array;
  /** Write position in circular buffer. */
  pos: number;
  /** Decimation phase (0–2). Output a sample when phase === 0. */
  phase: number;
}

/** Create a persistent filter instance — one per call, shared across chunks. */
export function createDownsampleFilter(): DownsampleFilter {
  return {
    buf: new Float64Array(DECIMATION_TAPS),
    pos: 0,
    phase: 0,
  };
}

// ─── Public codec functions ─────────────────────────────────────────────────

/** Decode mu-law buffer to PCM16 little-endian. */
export function mulawDecode(data: Buffer): Buffer {
  const out = Buffer.alloc(data.length * 2);
  for (let i = 0; i < data.length; i++) {
    out.writeInt16LE(MULAW_DECODE_TABLE[data[i]], i * 2);
  }
  return out;
}

/** Encode PCM16 little-endian buffer to mu-law. */
export function mulawEncode(data: Buffer): Buffer {
  const sampleCount = data.length >> 1; // 2 bytes per sample
  const out = Buffer.alloc(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const sample = data.readInt16LE(i * 2);
    out[i] = mulawEncodeSample(sample);
  }
  return out;
}

/** Upsample PCM16 from 8kHz to 24kHz using 3× linear interpolation. */
export function upsample8kTo24k(data: Buffer): Buffer {
  const sampleCount = data.length >> 1;
  if (sampleCount < 1) return Buffer.alloc(0);

  const outCount = sampleCount * 3;
  const out = Buffer.alloc(outCount * 2);

  for (let i = 0; i < sampleCount; i++) {
    const curr = data.readInt16LE(i * 2);
    const next = i + 1 < sampleCount ? data.readInt16LE((i + 1) * 2) : curr;
    const outIdx = i * 3;

    out.writeInt16LE(curr, outIdx * 2);
    out.writeInt16LE(Math.round(curr + (next - curr) / 3), (outIdx + 1) * 2);
    out.writeInt16LE(Math.round(curr + (2 * (next - curr)) / 3), (outIdx + 2) * 2);
  }

  return out;
}

/** Downsample PCM16 from 24kHz to 8kHz. When a filter is provided, applies a
 *  96-tap FIR anti-aliasing filter before decimation (matches soxr HQ quality).
 *  The filter tracks phase across chunks so audio is seamless. */
export function downsample24kTo8k(data: Buffer, filter?: DownsampleFilter): Buffer {
  const sampleCount = data.length >> 1;

  if (!filter) {
    // Naive decimation (backward compat)
    const outCount = Math.floor(sampleCount / 3);
    const out = Buffer.alloc(outCount * 2);
    for (let i = 0; i < outCount; i++) {
      out.writeInt16LE(data.readInt16LE(i * 3 * 2), i * 2);
    }
    return out;
  }

  // FIR-filtered decimation by 3
  const maxOut = Math.ceil(sampleCount / 3) + 1;
  const samples = new Int16Array(maxOut);
  let outIdx = 0;

  for (let i = 0; i < sampleCount; i++) {
    // Push sample into circular buffer
    filter.buf[filter.pos] = data.readInt16LE(i * 2) / 32768;
    filter.pos = (filter.pos + 1) % DECIMATION_TAPS;

    // Output one filtered sample every 3 input samples
    if (filter.phase === 0) {
      let sum = 0;
      for (let j = 0; j < DECIMATION_TAPS; j++) {
        sum +=
          filter.buf[(filter.pos + j) % DECIMATION_TAPS] * DECIMATION_FIR[j];
      }
      samples[outIdx++] = Math.round(
        Math.max(-1, Math.min(1, sum)) * 32767,
      );
    }
    filter.phase = (filter.phase + 1) % 3;
  }

  const out = Buffer.alloc(outIdx * 2);
  for (let i = 0; i < outIdx; i++) {
    out.writeInt16LE(samples[i], i * 2);
  }
  return out;
}

/** Pipeline: Telnyx mu-law 8kHz → Grok PCM16 24kHz. */
export function telnyxToGrok(mulawData: Buffer): Buffer {
  const pcm8k = mulawDecode(mulawData);
  return upsample8kTo24k(pcm8k);
}

/** Pipeline: Grok PCM16 24kHz → Telnyx mu-law 8kHz. */
export function grokToTelnyx(pcm24kData: Buffer, filter?: DownsampleFilter): Buffer {
  const pcm8k = downsample24kTo8k(pcm24kData, filter);
  return mulawEncode(pcm8k);
}
