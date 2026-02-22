import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useAudioPermissions } from '@/hooks/useAudioPermissions';
import { ExpoAudioStreamModule } from '@siteed/expo-audio-stream';
import { Alert, Linking, Platform } from 'react-native';

const mockGetPermissions = ExpoAudioStreamModule.getPermissionsAsync as jest.Mock;
const mockRequestPermissions = ExpoAudioStreamModule.requestPermissionsAsync as jest.Mock;

jest.spyOn(Alert, 'alert');

describe('useAudioPermissions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPermissions.mockResolvedValue({ granted: true, status: 'granted' });
    mockRequestPermissions.mockResolvedValue({ granted: true, status: 'granted' });
  });

  test('initial state: hasPermission is null before check completes', () => {
    // Use a promise that never resolves to keep the initial state visible
    mockGetPermissions.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useAudioPermissions());

    expect(result.current.hasPermission).toBeNull();
    expect(typeof result.current.requestPermission).toBe('function');
  });

  test('after mount: checks permission and sets hasPermission to true when granted', async () => {
    mockGetPermissions.mockResolvedValue({ granted: true, status: 'granted' });

    const { result } = renderHook(() => useAudioPermissions());

    await waitFor(() => {
      expect(result.current.hasPermission).toBe(true);
    });

    expect(mockGetPermissions).toHaveBeenCalledTimes(1);
  });

  test('after mount: sets hasPermission to false when denied', async () => {
    mockGetPermissions.mockResolvedValue({ granted: false, status: 'denied' });

    const { result } = renderHook(() => useAudioPermissions());

    await waitFor(() => {
      expect(result.current.hasPermission).toBe(false);
    });
  });

  test('requestPermission returns true and sets hasPermission when granted', async () => {
    mockGetPermissions.mockResolvedValue({ granted: false, status: 'denied' });
    mockRequestPermissions.mockResolvedValue({ granted: true, status: 'granted' });

    const { result } = renderHook(() => useAudioPermissions());

    await waitFor(() => {
      expect(result.current.hasPermission).toBe(false);
    });

    let granted: boolean | undefined;
    await act(async () => {
      granted = await result.current.requestPermission();
    });

    expect(granted).toBe(true);
    expect(result.current.hasPermission).toBe(true);
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
  });

  test('requestPermission returns false and sets hasPermission when denied', async () => {
    mockGetPermissions.mockResolvedValue({ granted: true, status: 'granted' });
    mockRequestPermissions.mockResolvedValue({ granted: false, status: 'denied' });

    const { result } = renderHook(() => useAudioPermissions());

    await waitFor(() => {
      expect(result.current.hasPermission).toBe(true);
    });

    let granted: boolean | undefined;
    await act(async () => {
      granted = await result.current.requestPermission();
    });

    expect(granted).toBe(false);
    expect(result.current.hasPermission).toBe(false);
  });

  test('requestPermission shows alert when denied and canAskAgain is false', async () => {
    mockGetPermissions.mockResolvedValue({ granted: true, status: 'granted' });
    mockRequestPermissions.mockResolvedValue({
      granted: false,
      status: 'denied',
      canAskAgain: false,
    });

    const { result } = renderHook(() => useAudioPermissions());

    await waitFor(() => {
      expect(result.current.hasPermission).toBe(true);
    });

    await act(async () => {
      await result.current.requestPermission();
    });

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenCalledWith(
      'Microphone Permission Required',
      'Please enable microphone access in Settings to make voice calls.',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Open Settings' }),
      ])
    );
  });

  test('requestPermission does NOT show alert when denied but canAskAgain is not false', async () => {
    mockGetPermissions.mockResolvedValue({ granted: true, status: 'granted' });
    mockRequestPermissions.mockResolvedValue({
      granted: false,
      status: 'denied',
      canAskAgain: true,
    });

    const { result } = renderHook(() => useAudioPermissions());

    await waitFor(() => {
      expect(result.current.hasPermission).toBe(true);
    });

    await act(async () => {
      await result.current.requestPermission();
    });

    expect(Alert.alert).not.toHaveBeenCalled();
  });

  test('alert Open Settings button opens iOS settings on iOS', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true });

    const mockOpenURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);

    mockGetPermissions.mockResolvedValue({ granted: true, status: 'granted' });
    mockRequestPermissions.mockResolvedValue({
      granted: false,
      status: 'denied',
      canAskAgain: false,
    });

    const { result } = renderHook(() => useAudioPermissions());

    await waitFor(() => {
      expect(result.current.hasPermission).toBe(true);
    });

    await act(async () => {
      await result.current.requestPermission();
    });

    // Extract the Open Settings button handler and call it
    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const buttons = alertCall[2];
    const openSettingsButton = buttons.find(
      (b: { text: string }) => b.text === 'Open Settings'
    );
    openSettingsButton.onPress();

    expect(mockOpenURL).toHaveBeenCalledWith('app-settings:');

    Object.defineProperty(Platform, 'OS', { value: originalPlatform, writable: true });
    mockOpenURL.mockRestore();
  });

  test('alert Open Settings button opens Android settings on Android', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', writable: true });

    const mockOpenSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined as never);

    mockGetPermissions.mockResolvedValue({ granted: true, status: 'granted' });
    mockRequestPermissions.mockResolvedValue({
      granted: false,
      status: 'denied',
      canAskAgain: false,
    });

    const { result } = renderHook(() => useAudioPermissions());

    await waitFor(() => {
      expect(result.current.hasPermission).toBe(true);
    });

    await act(async () => {
      await result.current.requestPermission();
    });

    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const buttons = alertCall[2];
    const openSettingsButton = buttons.find(
      (b: { text: string }) => b.text === 'Open Settings'
    );
    openSettingsButton.onPress();

    expect(mockOpenSettings).toHaveBeenCalled();

    Object.defineProperty(Platform, 'OS', { value: originalPlatform, writable: true });
    mockOpenSettings.mockRestore();
  });

  test('handles errors in initial permission check gracefully', async () => {
    mockGetPermissions.mockRejectedValue(new Error('Permission check failed'));

    const { result } = renderHook(() => useAudioPermissions());

    // The hook catches the rejection — hasPermission stays null
    await waitFor(
      () => {
        expect(result.current.hasPermission).toBeNull();
      },
      { timeout: 1000 }
    );
  });

  test('handles errors in requestPermission gracefully', async () => {
    mockGetPermissions.mockResolvedValue({ granted: false, status: 'denied' });
    mockRequestPermissions.mockRejectedValue(new Error('Request permission failed'));

    const { result } = renderHook(() => useAudioPermissions());

    await waitFor(() => {
      expect(result.current.hasPermission).toBe(false);
    });

    await expect(
      act(async () => {
        await result.current.requestPermission();
      })
    ).rejects.toThrow('Request permission failed');
  });
});
