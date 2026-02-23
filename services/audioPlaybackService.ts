import { createAudioPlayer, AudioPlayer } from 'expo-audio';

/**
 * AudioPlaybackService — queues incoming PCM16/24kHz chunks,
 * wraps them in WAV headers, and plays them sequentially via expo-audio.
 *
 * Uses double-buffered playback (A/B slots) to minimize gaps between chunks.
 */

// --- Base64 / binary helpers (pure JS, no deps) ---

function base64ToUint8Array(b64: string): Uint8Array {
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Prepend a 44-byte WAV header to raw PCM16 mono data and return a data URI.
 */
function createWavDataUri(pcmData: Uint8Array, sampleRate: number): string {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const headerSize = 44;
  const fileSize = headerSize + dataSize;

  const header = new ArrayBuffer(headerSize);
  const view = new DataView(header);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, fileSize - 8, true); // file size minus RIFF header
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // sub-chunk size (PCM = 16)
  view.setUint16(20, 1, true); // audio format (PCM = 1)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Combine header + PCM data
  const wav = new Uint8Array(fileSize);
  wav.set(new Uint8Array(header), 0);
  wav.set(pcmData, headerSize);

  return `data:audio/wav;base64,${uint8ArrayToBase64(wav)}`;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// --- Playback Service ---

const SAMPLE_RATE = 24000;
// Buffer threshold: ~200ms of PCM16 mono audio at 24kHz = 24000 * 2 * 0.2 = 9600 bytes
const BUFFER_THRESHOLD = 9600;
// Flush timeout: if no new chunks arrive within this time, play what we have
const FLUSH_TIMEOUT_MS = 150;

class AudioPlaybackService {
  private accumulationBuffer: Uint8Array[] = [];
  private accumulationSize = 0;
  private playbackQueue: string[] = []; // WAV data URIs
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  // Double-buffer playback slots
  private soundA: AudioPlayer | null = null;
  private soundB: AudioPlayer | null = null;
  private subscriptionA: { remove(): void } | null = null;
  private subscriptionB: { remove(): void } | null = null;
  private isPlaying = false;
  private destroyed = false;

  // AI speaking state callback
  private onAiSpeakingChange: ((speaking: boolean) => void) | null = null;
  private _aiSpeaking = false;

  /**
   * Set callback for AI speaking state changes.
   */
  setOnAiSpeakingChange(cb: (speaking: boolean) => void): void {
    this.onAiSpeakingChange = cb;
  }

  private _setAiSpeaking(speaking: boolean): void {
    if (this._aiSpeaking !== speaking) {
      this._aiSpeaking = speaking;
      this.onAiSpeakingChange?.(speaking);
    }
  }

  /**
   * Enqueue a base64-encoded PCM16/24kHz chunk for playback.
   */
  enqueue(base64Chunk: string): void {
    if (this.destroyed) return;

    const pcmBytes = base64ToUint8Array(base64Chunk);
    this.accumulationBuffer.push(pcmBytes);
    this.accumulationSize += pcmBytes.length;

    // Reset flush timer on each new chunk
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    if (this.accumulationSize >= BUFFER_THRESHOLD) {
      this._flushBuffer();
    } else {
      // Set a timeout to flush smaller buffers (end of speech, etc.)
      this.flushTimer = setTimeout(() => {
        this._flushBuffer();
      }, FLUSH_TIMEOUT_MS);
    }
  }

  /**
   * Flush the accumulation buffer into the playback queue.
   */
  private _flushBuffer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.accumulationSize === 0) return;

    // Merge accumulated chunks into a single buffer
    const merged = new Uint8Array(this.accumulationSize);
    let offset = 0;
    for (const chunk of this.accumulationBuffer) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    this.accumulationBuffer = [];
    this.accumulationSize = 0;

    // Wrap in WAV and enqueue
    const uri = createWavDataUri(merged, SAMPLE_RATE);
    this.playbackQueue.push(uri);

    // Start playback if not already running
    if (!this.isPlaying) {
      this._playNext();
    }
  }

  /**
   * Play the next item from the queue using double-buffered sounds.
   */
  private async _playNext(): Promise<void> {
    if (this.destroyed || this.playbackQueue.length === 0) {
      this.isPlaying = false;
      this._setAiSpeaking(false);
      return;
    }

    this.isPlaying = true;
    this._setAiSpeaking(true);
    const uri = this.playbackQueue.shift()!;

    try {
      // Remove previous player in slot A
      if (this.soundA) {
        this.subscriptionA?.remove();
        this.subscriptionA = null;
        this.soundA.remove();
        this.soundA = null;
      }

      // Create and play player A
      const playerA = createAudioPlayer({ uri });
      this.soundA = playerA;
      playerA.play();

      // Pre-load player B while A plays
      if (this.playbackQueue.length > 0) {
        const nextUri = this.playbackQueue.shift()!;
        if (this.soundB) {
          this.subscriptionB?.remove();
          this.subscriptionB = null;
          this.soundB.remove();
        }
        const playerB = createAudioPlayer({ uri: nextUri });
        this.soundB = playerB;
      }

      // Wait for A to finish
      await new Promise<void>((resolve) => {
        this.subscriptionA = playerA.addListener('playbackStatusUpdate', () => {
          if (!playerA.playing && playerA.currentTime > 0) {
            resolve();
          }
        });
      });

      // Now play B if loaded
      if (this.soundB && !this.destroyed) {
        const playing = this.soundB;
        this.soundB = null;
        this.subscriptionB = null;

        playing.play();

        // While B plays, continue with the rest of the queue
        const bSub = await new Promise<{ remove(): void }>((resolve) => {
          const sub = playing.addListener('playbackStatusUpdate', () => {
            if (!playing.playing && playing.currentTime > 0) {
              resolve(sub);
            }
          });
        });

        bSub.remove();
        playing.remove();
      }

      // Continue playing queue
      await this._playNext();
    } catch (e) {
      console.error('[AudioPlayback] Playback error:', e);
      this.isPlaying = false;
      // Try next chunk on error
      if (this.playbackQueue.length > 0) {
        this._playNext();
      }
    }
  }

  /**
   * Stop all playback and clear buffers (for barge-in).
   */
  flush(): void {
    // Clear timers
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // Clear buffers
    this.accumulationBuffer = [];
    this.accumulationSize = 0;
    this.playbackQueue = [];

    // Stop and remove players
    this.isPlaying = false;
    this._setAiSpeaking(false);
    if (this.soundA) {
      this.subscriptionA?.remove();
      this.subscriptionA = null;
      this.soundA.pause();
      this.soundA.remove();
      this.soundA = null;
    }
    if (this.soundB) {
      this.subscriptionB?.remove();
      this.subscriptionB = null;
      this.soundB.pause();
      this.soundB.remove();
      this.soundB = null;
    }
  }

  /**
   * Fully destroy the service. Call on unmount / call end.
   */
  destroy(): void {
    this.destroyed = true;
    this.flush();
    this.onAiSpeakingChange = null;
  }

  /**
   * Reset destroyed state so the service can be reused for the next call.
   */
  reset(): void {
    this.destroyed = false;
    this._aiSpeaking = false;
  }
}

// Singleton instance
const audioPlaybackService = new AudioPlaybackService();
export default audioPlaybackService;
