import { Audio } from 'expo-av';

/**
 * Audio service for real-time PCM16 capture using @siteed/expo-audio-stream
 * and audio mode configuration via expo-av.
 *
 * Note: The actual recording uses the useAudioRecorder hook from
 * @siteed/expo-audio-stream (must be called from a React component).
 * This service provides the audio mode setup and recording config.
 */

export const RECORDING_CONFIG = {
  sampleRate: 16000 as const,
  channels: 1 as const,
  encoding: 'pcm_16bit' as const,
  interval: 250,
};

const audioService = {
  /**
   * Configure audio mode for voice calls.
   * Must be called before starting recording or playback.
   */
  setupAudioMode: async () => {
    await Audio.setAudioModeAsync({
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      allowsRecordingIOS: true,
    });
  },

  /**
   * Get the recording configuration for useAudioRecorder.startRecording().
   * Pass the onAudioChunk callback to receive base64-encoded PCM16 chunks.
   */
  getRecordingConfig: (onAudioChunk: (base64: string) => void) => ({
    sampleRate: RECORDING_CONFIG.sampleRate,
    channels: RECORDING_CONFIG.channels,
    encoding: RECORDING_CONFIG.encoding,
    interval: RECORDING_CONFIG.interval,
    onAudioStream: async (event: { data: string | Float32Array; position: number }) => {
      if (event.data && typeof event.data === 'string') {
        onAudioChunk(event.data);
      }
    },
  }),
};

export default audioService;
