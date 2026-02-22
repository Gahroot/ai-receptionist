import { Audio } from 'expo-av';
import { Platform } from 'react-native';

/**
 * Audio service for real-time PCM16 capture using @siteed/expo-audio-stream
 * and audio mode configuration via expo-av.
 *
 * Note: The actual recording uses the useAudioRecorder hook from
 * @siteed/expo-audio-stream (must be called from a React component).
 * This service provides the audio mode setup and recording config.
 *
 * Grok Realtime API uses 24kHz PCM16 natively — no sample rate conversion needed.
 * Server-side VAD is handled by Grok, so client-side VAD is removed.
 */

export const RECORDING_CONFIG = {
  sampleRate: 24000 as const,
  channels: 1 as const,
  encoding: 'pcm_16bit' as const,
  interval: 250,
};

interface RecordingCallbacks {
  onAudioChunk: (base64: string) => void;
}

const audioService = {
  /**
   * Configure audio mode for voice calls.
   * Uses PlayAndRecord category on iOS for simultaneous recording + playback.
   * @param speakerMode - true for speaker, false for earpiece (default)
   */
  setupAudioMode: async (speakerMode = false) => {
    await Audio.setAudioModeAsync({
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      // iOS: allowsRecordingIOS=true enables PlayAndRecord category
      allowsRecordingIOS: true,
      // Android: explicit earpiece/speaker control
      playThroughEarpieceAndroid: !speakerMode,
    });
  },

  /**
   * Switch audio output between speaker and earpiece.
   */
  setSpeakerMode: async (speaker: boolean) => {
    await Audio.setAudioModeAsync({
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      allowsRecordingIOS: true,
      playThroughEarpieceAndroid: !speaker,
    });
  },

  /**
   * Get the recording configuration for useAudioRecorder.startRecording().
   * Grok handles VAD server-side, so no client-side speech detection needed.
   */
  getRecordingConfig: (callbacks: RecordingCallbacks | ((base64: string) => void)) => {
    const onAudioChunk =
      typeof callbacks === 'function' ? callbacks : callbacks.onAudioChunk;

    const config: Record<string, unknown> = {
      sampleRate: RECORDING_CONFIG.sampleRate,
      channels: RECORDING_CONFIG.channels,
      encoding: RECORDING_CONFIG.encoding,
      interval: RECORDING_CONFIG.interval,
      onAudioStream: async (event: { data: string | Float32Array; position: number }) => {
        if (event.data && typeof event.data === 'string') {
          onAudioChunk(event.data);
        }
      },
    };

    // iOS audio session for full-duplex (simultaneous record + playback)
    if (Platform.OS === 'ios') {
      config.ios = {
        audioSession: {
          category: 'PlayAndRecord',
          mode: 'VoiceChat',
          categoryOptions: [
            'AllowBluetooth',
            'DefaultToSpeaker',
            'MixWithOthers',
          ],
        },
      };
    }

    return config;
  },
};

export default audioService;
