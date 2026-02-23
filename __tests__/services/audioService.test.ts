import { setAudioModeAsync } from 'expo-audio';
import audioService, { RECORDING_CONFIG } from '@/services/audioService';
import { Platform } from 'react-native';

const mockSetAudioMode = setAudioModeAsync as jest.Mock;

describe('RECORDING_CONFIG', () => {
  test('has correct sampleRate (24kHz for Grok)', () => {
    expect(RECORDING_CONFIG.sampleRate).toBe(24000);
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
      sampleRate: 24000,
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

  test('calls setAudioModeAsync with correct parameters by default', async () => {
    await audioService.setupAudioMode();

    expect(mockSetAudioMode).toHaveBeenCalledTimes(1);
    expect(mockSetAudioMode).toHaveBeenCalledWith({
      shouldPlayInBackground: true,
      playsInSilentMode: true,
      allowsRecording: true,
    });
  });

  test('calls setAudioModeAsync when speakerMode is false', async () => {
    await audioService.setupAudioMode(false);

    expect(mockSetAudioMode).toHaveBeenCalledTimes(1);
    expect(mockSetAudioMode).toHaveBeenCalledWith({
      shouldPlayInBackground: true,
      playsInSilentMode: true,
      allowsRecording: true,
    });
  });

  test('calls setAudioModeAsync when speakerMode is true', async () => {
    await audioService.setupAudioMode(true);

    expect(mockSetAudioMode).toHaveBeenCalledTimes(1);
    expect(mockSetAudioMode).toHaveBeenCalledWith({
      shouldPlayInBackground: true,
      playsInSilentMode: true,
      allowsRecording: true,
    });
  });
});

describe('audioService.setSpeakerMode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sets speaker mode on', async () => {
    await audioService.setSpeakerMode(true);

    expect(mockSetAudioMode).toHaveBeenCalledTimes(1);
    expect(mockSetAudioMode).toHaveBeenCalledWith({
      shouldPlayInBackground: true,
      playsInSilentMode: true,
      allowsRecording: true,
    });
  });

  test('sets speaker mode off', async () => {
    await audioService.setSpeakerMode(false);

    expect(mockSetAudioMode).toHaveBeenCalledTimes(1);
    expect(mockSetAudioMode).toHaveBeenCalledWith({
      shouldPlayInBackground: true,
      playsInSilentMode: true,
      allowsRecording: true,
    });
  });
});

describe('audioService.getRecordingConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns config with correct audio parameters (24kHz for Grok)', () => {
    const onAudioChunk = jest.fn();
    const config = audioService.getRecordingConfig({ onAudioChunk });

    expect(config.sampleRate).toBe(24000);
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

    await onAudioStream({ data: null as unknown as string, position: 0 });

    expect(onAudioChunk).not.toHaveBeenCalled();
  });

  test('accepts legacy function signature', () => {
    const onAudioChunk = jest.fn();
    const config = audioService.getRecordingConfig(onAudioChunk);

    expect(config.sampleRate).toBe(24000);
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

  test('does not include VAD processing (Grok handles server-side VAD)', () => {
    const onAudioChunk = jest.fn();
    const config = audioService.getRecordingConfig({ onAudioChunk });

    expect(config.enableProcessing).toBeUndefined();
    expect(config.features).toBeUndefined();
    expect(config.onAudioAnalysis).toBeUndefined();
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
