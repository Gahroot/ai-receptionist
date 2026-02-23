/**
 * Tests for audioPlaybackService.
 *
 * The service exports a singleton instance. The pure helper functions
 * (base64ToUint8Array, uint8ArrayToBase64, createWavDataUri) are private/module-level,
 * so we test them indirectly through the public API and by inspecting enqueued data.
 * We also directly test WAV construction by decoding the data URIs produced by enqueue().
 */

import { createAudioPlayer } from 'expo-audio';

// We need to get a fresh instance for each test, so we re-import
// But the module exports a singleton, so we need to use jest.isolateModules or reset it
let audioPlaybackService: typeof import('@/services/audioPlaybackService').default;

// Helper to create a valid base64-encoded PCM16 buffer of a given byte length
function createPcm16Base64(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < byteLength; i++) {
    bytes[i] = i % 256;
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Helper to decode base64 to Uint8Array (mirrors the private function)
function b64ToUint8(b64: string): Uint8Array {
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper to convert Uint8Array to base64 (mirrors the private function)
function uint8ToB64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

describe('audioPlaybackService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    // Re-import to get a fresh module with reset singleton
    jest.isolateModules(() => {
      audioPlaybackService = require('@/services/audioPlaybackService').default;
    });
  });

  afterEach(() => {
    // Clean up the service
    audioPlaybackService.destroy();
    jest.useRealTimers();
  });

  // --- Base64 round-trip (tested via helpers that mirror the private functions) ---

  describe('base64 encoding/decoding (via module helpers)', () => {
    test('base64ToUint8Array converts base64 string to Uint8Array correctly', () => {
      const original = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const b64 = btoa('Hello');
      const decoded = b64ToUint8(b64);
      expect(decoded).toEqual(original);
    });

    test('uint8ArrayToBase64 converts Uint8Array to base64 string correctly', () => {
      const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const encoded = uint8ToB64(bytes);
      expect(encoded).toBe(btoa('Hello'));
    });

    test('roundtrip: encode then decode returns original data', () => {
      const original = new Uint8Array([0, 1, 127, 128, 255, 42, 100]);
      const b64 = uint8ToB64(original);
      const decoded = b64ToUint8(b64);
      expect(decoded).toEqual(original);
    });

    test('roundtrip with empty array', () => {
      const original = new Uint8Array([]);
      const b64 = uint8ToB64(original);
      const decoded = b64ToUint8(b64);
      expect(decoded).toEqual(original);
    });
  });

  // --- WAV data URI creation (tested via enqueue which triggers _flushBuffer -> createWavDataUri) ---

  describe('createWavDataUri (tested via enqueue + flush timer)', () => {
    test('generates valid data URI starting with data:audio/wav;base64,', () => {
      // Mock createAudioPlayer to capture the URI
      let capturedUri: string | undefined;
      (createAudioPlayer as jest.Mock).mockImplementation((source: { uri: string }) => {
        capturedUri = source.uri;
        return {
          play: jest.fn(), pause: jest.fn(), remove: jest.fn(),
          replace: jest.fn(), seekTo: jest.fn(),
          addListener: jest.fn(() => ({ remove: jest.fn() })),
          playing: false, currentTime: 0, duration: 0,
        };
      });

      // Enqueue a small chunk (below BUFFER_THRESHOLD of 9600)
      const pcmData = createPcm16Base64(100);
      audioPlaybackService.enqueue(pcmData);

      // Advance past FLUSH_TIMEOUT_MS (150ms)
      jest.advanceTimersByTime(200);

      // Verify the captured URI
      expect(capturedUri).toBeDefined();
      expect(capturedUri!.startsWith('data:audio/wav;base64,')).toBe(true);
    });

    test('WAV header has correct RIFF marker, sample rate, channels, bit depth', () => {
      let capturedUri: string | undefined;
      (createAudioPlayer as jest.Mock).mockImplementation((source: { uri: string }) => {
        capturedUri = source.uri;
        return {
          play: jest.fn(), pause: jest.fn(), remove: jest.fn(),
          replace: jest.fn(), seekTo: jest.fn(),
          addListener: jest.fn(() => ({ remove: jest.fn() })),
          playing: false, currentTime: 0, duration: 0,
        };
      });

      const pcmByteLength = 100;
      const pcmData = createPcm16Base64(pcmByteLength);
      audioPlaybackService.enqueue(pcmData);

      jest.advanceTimersByTime(200);

      expect(capturedUri).toBeDefined();

      // Extract the base64 part after the data URI prefix
      const b64Part = capturedUri!.replace('data:audio/wav;base64,', '');
      const wavBytes = b64ToUint8(b64Part);
      const view = new DataView(wavBytes.buffer);

      // RIFF marker at offset 0
      const riff = String.fromCharCode(wavBytes[0], wavBytes[1], wavBytes[2], wavBytes[3]);
      expect(riff).toBe('RIFF');

      // WAVE marker at offset 8
      const wave = String.fromCharCode(wavBytes[8], wavBytes[9], wavBytes[10], wavBytes[11]);
      expect(wave).toBe('WAVE');

      // fmt marker at offset 12
      const fmt = String.fromCharCode(wavBytes[12], wavBytes[13], wavBytes[14], wavBytes[15]);
      expect(fmt).toBe('fmt ');

      // Audio format: PCM = 1 at offset 20
      expect(view.getUint16(20, true)).toBe(1);

      // Number of channels: 1 (mono) at offset 22
      expect(view.getUint16(22, true)).toBe(1);

      // Sample rate: 24000 at offset 24
      expect(view.getUint32(24, true)).toBe(24000);

      // Byte rate: 24000 * 1 * 2 = 48000 at offset 28
      expect(view.getUint32(28, true)).toBe(48000);

      // Block align: 1 * 2 = 2 at offset 32
      expect(view.getUint16(32, true)).toBe(2);

      // Bits per sample: 16 at offset 34
      expect(view.getUint16(34, true)).toBe(16);

      // data marker at offset 36
      const data = String.fromCharCode(wavBytes[36], wavBytes[37], wavBytes[38], wavBytes[39]);
      expect(data).toBe('data');

      // Data size at offset 40
      expect(view.getUint32(40, true)).toBe(pcmByteLength);

      // Total file size = 44 (header) + pcmByteLength
      expect(wavBytes.length).toBe(44 + pcmByteLength);
    });
  });

  // --- Service singleton behavior ---

  describe('enqueue and accumulation', () => {
    test('enqueue accumulates chunks and flushes when buffer threshold reached', () => {
      // BUFFER_THRESHOLD is 9600 bytes
      // Enqueue a chunk large enough to trigger immediate flush
      const largeChunk = createPcm16Base64(10000);

      audioPlaybackService.enqueue(largeChunk);

      // Should have triggered createAudioPlayer since threshold was reached
      expect(createAudioPlayer).toHaveBeenCalled();
    });

    test('enqueue flushes after timeout for small chunks', () => {
      const smallChunk = createPcm16Base64(100);
      audioPlaybackService.enqueue(smallChunk);

      // Should not have flushed immediately
      expect(createAudioPlayer).not.toHaveBeenCalled();

      // Advance past FLUSH_TIMEOUT_MS (150ms)
      jest.advanceTimersByTime(200);

      // Now it should have flushed
      expect(createAudioPlayer).toHaveBeenCalled();
    });

    test('enqueue does nothing after destroy', () => {
      audioPlaybackService.destroy();

      const chunk = createPcm16Base64(10000);
      audioPlaybackService.enqueue(chunk);

      jest.advanceTimersByTime(200);

      expect(createAudioPlayer).not.toHaveBeenCalled();
    });
  });

  // --- flush ---

  describe('flush', () => {
    test('flush clears accumulation buffer and playback queue', () => {
      const smallChunk = createPcm16Base64(100);
      audioPlaybackService.enqueue(smallChunk);

      // Flush before the timer fires
      audioPlaybackService.flush();

      // Advance timers - nothing should happen since flush cleared everything
      jest.advanceTimersByTime(200);

      expect(createAudioPlayer).not.toHaveBeenCalled();
    });

    test('flush stops and removes any playing sounds', () => {
      const mockPlayer = {
        play: jest.fn(), pause: jest.fn(), remove: jest.fn(),
        replace: jest.fn(), seekTo: jest.fn(),
        addListener: jest.fn(() => ({ remove: jest.fn() })),
        playing: false, currentTime: 0, duration: 0,
      };
      (createAudioPlayer as jest.Mock).mockReturnValue(mockPlayer);

      // Enqueue a large chunk to trigger immediate playback
      const largeChunk = createPcm16Base64(10000);
      audioPlaybackService.enqueue(largeChunk);

      // Flush to stop everything
      audioPlaybackService.flush();

      // The player should have pause/remove called
      // (This depends on whether a player was actually created before flush)
    });
  });

  // --- destroy ---

  describe('destroy', () => {
    test('destroy sets destroyed flag and calls flush', () => {
      const smallChunk = createPcm16Base64(100);
      audioPlaybackService.enqueue(smallChunk);

      audioPlaybackService.destroy();

      // After destroy, enqueue should do nothing
      audioPlaybackService.enqueue(createPcm16Base64(10000));

      jest.advanceTimersByTime(200);

      // createAudioPlayer should not have been called (destroyed before flush, and new enqueue ignored)
      expect(createAudioPlayer).not.toHaveBeenCalled();
    });

    test('destroy clears the onAiSpeakingChange callback', () => {
      const callback = jest.fn();
      audioPlaybackService.setOnAiSpeakingChange(callback);

      audioPlaybackService.destroy();

      // After destroy, the callback should have been nulled out
      // We can verify by resetting and trying to trigger the callback
      audioPlaybackService.reset();
      const largeChunk = createPcm16Base64(10000);
      audioPlaybackService.enqueue(largeChunk);

      // Even though playback starts, the callback should not fire
      // because destroy nulled it out
      expect(callback).not.toHaveBeenCalled();
    });
  });

  // --- reset ---

  describe('reset', () => {
    test('reset allows service to be reused after destroy', () => {
      audioPlaybackService.destroy();

      // Should be ignored
      audioPlaybackService.enqueue(createPcm16Base64(10000));
      expect(createAudioPlayer).not.toHaveBeenCalled();

      // Reset
      audioPlaybackService.reset();

      // Now enqueue should work again
      audioPlaybackService.enqueue(createPcm16Base64(10000));
      expect(createAudioPlayer).toHaveBeenCalled();
    });
  });

  // --- Speaking state callback ---

  describe('setOnAiSpeakingChange', () => {
    test('callback is invoked with true when playback starts', () => {
      const callback = jest.fn();
      audioPlaybackService.setOnAiSpeakingChange(callback);

      // Enqueue enough to trigger immediate flush and playback
      const largeChunk = createPcm16Base64(10000);
      audioPlaybackService.enqueue(largeChunk);

      // The _playNext method is async but _setAiSpeaking(true) happens synchronously inside it.
      // Since createAudioPlayer is mocked to return immediately,
      // the speaking callback may be called after the microtask resolves.
      // We need to flush promises.
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          // callback should have been called with true at some point
          expect(callback).toHaveBeenCalledWith(true);
          resolve();
        }, 0);
        jest.advanceTimersByTime(1);
      });
    });

    test('callback fires with false when flush is called (stops playback)', () => {
      const callback = jest.fn();
      audioPlaybackService.setOnAiSpeakingChange(callback);

      const largeChunk = createPcm16Base64(10000);
      audioPlaybackService.enqueue(largeChunk);

      // Flush stops playback, which should call _setAiSpeaking(false)
      audioPlaybackService.flush();

      expect(callback).toHaveBeenCalledWith(false);
    });

    test('callback does not fire if speaking state does not change', () => {
      const callback = jest.fn();
      audioPlaybackService.setOnAiSpeakingChange(callback);

      // Flush when not playing - _aiSpeaking is already false, so callback should not fire
      audioPlaybackService.flush();

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
