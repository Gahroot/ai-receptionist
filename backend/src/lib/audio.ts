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
    const mu = ~i & 0xff;
    const sign = mu & 0x80 ? -1 : 1;
    const exponent = (mu >> 4) & 0x07;
    const mantissa = mu & 0x0f;
    const magnitude = ((mantissa << 1) + 33) * (1 << exponent) - 33;
    MULAW_DECODE_TABLE[i] = sign * magnitude;
  }
})();

// ─── Mu-law encode: standard compression algorithm ──────────────────────────

const MULAW_BIAS = 33;
const MULAW_CLIP = 32635;

function mulawEncodeSample(sample: number): number {
  const sign = sample < 0 ? 0x80 : 0;
  let magnitude = Math.abs(sample);
  if (magnitude > MULAW_CLIP) magnitude = MULAW_CLIP;
  magnitude += MULAW_BIAS;

  let exponent = 0;
  let mantissa: number;

  // Find the segment (exponent)
  let shifted = magnitude >> 5;
  while (shifted > 0) {
    exponent++;
    shifted >>= 1;
  }

  mantissa = (magnitude >> (exponent + 1)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
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

/** Downsample PCM16 from 24kHz to 8kHz by taking every 3rd sample. */
export function downsample24kTo8k(data: Buffer): Buffer {
  const sampleCount = data.length >> 1;
  const outCount = Math.floor(sampleCount / 3);
  const out = Buffer.alloc(outCount * 2);

  for (let i = 0; i < outCount; i++) {
    out.writeInt16LE(data.readInt16LE(i * 3 * 2), i * 2);
  }

  return out;
}

/** Pipeline: Telnyx mu-law 8kHz → Grok PCM16 24kHz. */
export function telnyxToGrok(mulawData: Buffer): Buffer {
  const pcm8k = mulawDecode(mulawData);
  return upsample8kTo24k(pcm8k);
}

/** Pipeline: Grok PCM16 24kHz → Telnyx mu-law 8kHz. */
export function grokToTelnyx(pcm24kData: Buffer): Buffer {
  const pcm8k = downsample24kTo8k(pcm24kData);
  return mulawEncode(pcm8k);
}
