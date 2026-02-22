import { Audio } from 'expo-av';
import audioService, { RECORDING_CONFIG } from '@/services/audioService';
import { Platform } from 'react-native';

const mockSetAudioMode = Audio.setAudioModeAsync as jest.Mock;

describe('RECORDING_CONFIG', () => {
  test('has correct sampleRate', () => {
    expect(RECORDING_CONFIG.sampleRate).toBe(16000);
  });

  test('has correct channels', () => {
    expect(RECORDING_CONFIG.channels).toBe(1);
  });

  test('has correct encoding', () => {
    expect(RECORDING_CONFIG.encoding).toBe('pcm_16bit');
  });

  test('has correct interval', () => {
    expect(RECORDING_CONFIG.interval).toBe(250);
  });

  test('exports the complete config object', () => {
    expect(RECORDING_CONFIG).toEqual({
      sampleRate: 16000,
      channels: 1,
      encoding: 'pcm_16bit',
      interval: 250,
    });
  });
});

describe('audioService.setupAudioMode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('calls setAudioModeAsync with earpiece mode by default', async () => {
    await audioService.setupAudioMode();

    expect(mockSetAudioMode).toHaveBeenCalledTimes(1);
    expect(mockSetAudioMode).toHaveBeenCalledWith({
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      allowsRecordingIOS: true,
      playThroughEarpieceAndroid: true,
    });
  });

  test('calls setAudioModeAsync with earpiece when speakerMode is false', async () => {
    await audioService.setupAudioMode(false);

    expect(mockSetAudioMode).toHaveBeenCalledTimes(1);
    expect(mockSetAudioMode).toHaveBeenCalledWith(
      expect.objectContaining({
        playThroughEarpieceAndroid: true,
      })
    );
  });

  test('calls setAudioModeAsync with speaker when speakerMode is true', async () => {
    await audioService.setupAudioMode(true);

    expect(mockSetAudioMode).toHaveBeenCalledTimes(1);
    expect(mockSetAudioMode).toHaveBeenCalledWith({
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      allowsRecordingIOS: true,
      playThroughEarpieceAndroid: false,
    });
  });
});

describe('audioService.setSpeakerMode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sets speaker mode on (playThroughEarpieceAndroid = false)', async () => {
    await audioService.setSpeakerMode(true);

    expect(mockSetAudioMode).toHaveBeenCalledTimes(1);
    expect(mockSetAudioMode).toHaveBeenCalledWith({
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      allowsRecordingIOS: true,
      playThroughEarpieceAndroid: false,
    });
  });

  test('sets speaker mode off (playThroughEarpieceAndroid = true)', async () => {
    await audioService.setSpeakerMode(false);

    expect(mockSetAudioMode).toHaveBeenCalledTimes(1);
    expect(mockSetAudioMode).toHaveBeenCalledWith({
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      allowsRecordingIOS: true,
      playThroughEarpieceAndroid: true,
    });
  });
});

describe('audioService.getRecordingConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns config with correct audio parameters', () => {
    const onAudioChunk = jest.fn();
    const config = audioService.getRecordingConfig({ onAudioChunk });

    expect(config.sampleRate).toBe(16000);
    expect(config.channels).toBe(1);
    expect(config.encoding).toBe('pcm_16bit');
    expect(config.interval).toBe(250);
  });

  test('returns config with onAudioStream callback', () => {
    const onAudioChunk = jest.fn();
    const config = audioService.getRecordingConfig({ onAudioChunk });

    expect(config.onAudioStream).toBeDefined();
    expect(typeof config.onAudioStream).toBe('function');
  });

  test('onAudioStream calls onAudioChunk with base64 string data', async () => {
    const onAudioChunk = jest.fn();
    const config = audioService.getRecordingConfig({ onAudioChunk });

    const onAudioStream = config.onAudioStream as (event: {
      data: string | Float32Array;
      position: number;
    }) => Promise<void>;

    await onAudioStream({ data: 'base64encodeddata', position: 0 });

    expect(onAudioChunk).toHaveBeenCalledWith('base64encodeddata');
  });

  test('onAudioStream ignores non-string data', async () => {
    const onAudioChunk = jest.fn();
    const config = audioService.getRecordingConfig({ onAudioChunk });

    const onAudioStream = config.onAudioStream as (event: {
      data: string | Float32Array;
      position: number;
    }) => Promise<void>;

    await onAudioStream({ data: new Float32Array([0.1, 0.2]), position: 0 });

    expect(onAudioChunk).not.toHaveBeenCalled();
  });

  test('onAudioStream ignores null/undefined data', async () => {
    const onAudioChunk = jest.fn();
    const config = audioService.getRecordingConfig({ onAudioChunk });

    const onAudioStream = config.onAudioStream as (event: {
      data: string | Float32Array;
      position: number;
    }) => Promise<void>;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await onAudioStream({ data: null as any, position: 0 });

    expect(onAudioChunk).not.toHaveBeenCalled();
  });

  test('accepts legacy function signature', () => {
    const onAudioChunk = jest.fn();
    const config = audioService.getRecordingConfig(onAudioChunk);

    expect(config.sampleRate).toBe(16000);
    expect(config.onAudioStream).toBeDefined();
  });

  test('legacy function signature wires onAudioChunk correctly', async () => {
    const onAudioChunk = jest.fn();
    const config = audioService.getRecordingConfig(onAudioChunk);

    const onAudioStream = config.onAudioStream as (event: {
      data: string | Float32Array;
      position: number;
    }) => Promise<void>;

    await onAudioStream({ data: 'testdata', position: 0 });

    expect(onAudioChunk).toHaveBeenCalledWith('testdata');
  });

  test('does not enable VAD processing when no onSpeechStateChange callback', () => {
    const onAudioChunk = jest.fn();
    const config = audioService.getRecordingConfig({ onAudioChunk });

    expect(config.enableProcessing).toBeUndefined();
    expect(config.features).toBeUndefined();
    expect(config.onAudioAnalysis).toBeUndefined();
  });

  test('enables VAD processing when onSpeechStateChange is provided', () => {
    const onAudioChunk = jest.fn();
    const onSpeechStateChange = jest.fn();
    const config = audioService.getRecordingConfig({
      onAudioChunk,
      onSpeechStateChange,
    });

    expect(config.enableProcessing).toBe(true);
    expect(config.features).toEqual({ energy: true, rms: true });
    expect(config.onAudioAnalysis).toBeDefined();
    expect(typeof config.onAudioAnalysis).toBe('function');
  });

  test('onAudioAnalysis calls onSpeechStateChange with true when speech detected (silent=false)', () => {
    const onAudioChunk = jest.fn();
    const onSpeechStateChange = jest.fn();
    const config = audioService.getRecordingConfig({
      onAudioChunk,
      onSpeechStateChange,
    });

    const onAudioAnalysis = config.onAudioAnalysis as (analysis: {
      dataPoints?: Array<{ silent?: boolean }>;
    }) => void;

    onAudioAnalysis({ dataPoints: [{ silent: false }] });

    expect(onSpeechStateChange).toHaveBeenCalledWith(true);
  });

  test('onAudioAnalysis calls onSpeechStateChange with false when silence detected (silent=true)', () => {
    const onAudioChunk = jest.fn();
    const onSpeechStateChange = jest.fn();
    const config = audioService.getRecordingConfig({
      onAudioChunk,
      onSpeechStateChange,
    });

    const onAudioAnalysis = config.onAudioAnalysis as (analysis: {
      dataPoints?: Array<{ silent?: boolean }>;
    }) => void;

    onAudioAnalysis({ dataPoints: [{ silent: true }] });

    expect(onSpeechStateChange).toHaveBeenCalledWith(false);
  });

  test('onAudioAnalysis uses the last data point in the array', () => {
    const onAudioChunk = jest.fn();
    const onSpeechStateChange = jest.fn();
    const config = audioService.getRecordingConfig({
      onAudioChunk,
      onSpeechStateChange,
    });

    const onAudioAnalysis = config.onAudioAnalysis as (analysis: {
      dataPoints?: Array<{ silent?: boolean }>;
    }) => void;

    // Multiple data points: first is speaking, last is silent
    onAudioAnalysis({
      dataPoints: [{ silent: false }, { silent: false }, { silent: true }],
    });

    expect(onSpeechStateChange).toHaveBeenCalledWith(false);
  });

  test('onAudioAnalysis does nothing when dataPoints is empty', () => {
    const onAudioChunk = jest.fn();
    const onSpeechStateChange = jest.fn();
    const config = audioService.getRecordingConfig({
      onAudioChunk,
      onSpeechStateChange,
    });

    const onAudioAnalysis = config.onAudioAnalysis as (analysis: {
      dataPoints?: Array<{ silent?: boolean }>;
    }) => void;

    onAudioAnalysis({ dataPoints: [] });

    expect(onSpeechStateChange).not.toHaveBeenCalled();
  });

  test('onAudioAnalysis does nothing when dataPoints is undefined', () => {
    const onAudioChunk = jest.fn();
    const onSpeechStateChange = jest.fn();
    const config = audioService.getRecordingConfig({
      onAudioChunk,
      onSpeechStateChange,
    });

    const onAudioAnalysis = config.onAudioAnalysis as (analysis: {
      dataPoints?: Array<{ silent?: boolean }>;
    }) => void;

    onAudioAnalysis({});

    expect(onSpeechStateChange).not.toHaveBeenCalled();
  });

  test('includes iOS audio session config on iOS', () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true });

    const onAudioChunk = jest.fn();
    const config = audioService.getRecordingConfig({ onAudioChunk });

    expect(config.ios).toBeDefined();
    expect(config.ios).toEqual({
      audioSession: {
        category: 'PlayAndRecord',
        mode: 'VoiceChat',
        categoryOptions: [
          'AllowBluetooth',
          'DefaultToSpeaker',
          'MixWithOthers',
        ],
      },
    });

    Object.defineProperty(Platform, 'OS', { value: originalPlatform, writable: true });
  });

  test('does not include iOS audio session config on Android', () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', writable: true });

    const onAudioChunk = jest.fn();
    const config = audioService.getRecordingConfig({ onAudioChunk });

    expect(config.ios).toBeUndefined();

    Object.defineProperty(Platform, 'OS', { value: originalPlatform, writable: true });
  });
});
