import { Audio } from 'expo-av';
import { Platform } from 'react-native';

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

interface RecordingCallbacks {
  onAudioChunk: (base64: string) => void;
  onSpeechStateChange?: (isSpeaking: boolean) => void;
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
   * Pass callbacks for audio chunks and optional speech state changes (VAD).
   */
  getRecordingConfig: (callbacks: RecordingCallbacks | ((base64: string) => void)) => {
    // Support both legacy function signature and new object signature
    const { onAudioChunk, onSpeechStateChange } =
      typeof callbacks === 'function'
        ? { onAudioChunk: callbacks, onSpeechStateChange: undefined }
        : callbacks;

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

    // Enable audio analysis for VAD if callback provided
    if (onSpeechStateChange) {
      config.enableProcessing = true;
      config.features = { energy: true, rms: true };
      config.onAudioAnalysis = (analysis: {
        dataPoints?: Array<{ silent?: boolean }>;
      }) => {
        // The library provides a `silent` boolean on each data point
        const points = analysis.dataPoints;
        if (points && points.length > 0) {
          const lastPoint = points[points.length - 1];
          // silent=true means no speech detected
          onSpeechStateChange(!lastPoint.silent);
        }
      };
    }

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
