/**
 * Integration tests for the useAudioPermissions hook.
 *
 * Tests permission checking, requesting, granted/denied states,
 * and alert behavior for permanent denial.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Alert, Linking, Platform } from 'react-native';
import { ExpoAudioStreamModule } from '@siteed/expo-audio-studio';
import { useAudioPermissions } from '@/hooks/useAudioPermissions';

describe('useAudioPermissions Integration', () => {
  const originalPlatformOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset to default: permission granted
    (ExpoAudioStreamModule.getPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
      status: 'granted',
    });

    (ExpoAudioStreamModule.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
      status: 'granted',
      canAskAgain: true,
    });

    // Mock Alert.alert
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());

    // Mock Linking
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);
    jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalPlatformOS, writable: true });
  });

  describe('Initial State', () => {
    it('hasPermission is null before mount resolves', () => {
      // Make getPermissionsAsync slow so we can check initial state
      (ExpoAudioStreamModule.getPermissionsAsync as jest.Mock).mockReturnValue(
        new Promise(() => {}) // Never resolves
      );

      const { result } = renderHook(() => useAudioPermissions());

      expect(result.current.hasPermission).toBeNull();
    });

    it('sets hasPermission to true after mount when permission is granted', async () => {
      (ExpoAudioStreamModule.getPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: true,
      });

      const { result } = renderHook(() => useAudioPermissions());

      await waitFor(() => {
        expect(result.current.hasPermission).toBe(true);
      });
    });

    it('sets hasPermission to false after mount when permission is denied', async () => {
      (ExpoAudioStreamModule.getPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: false,
      });

      const { result } = renderHook(() => useAudioPermissions());

      await waitFor(() => {
        expect(result.current.hasPermission).toBe(false);
      });
    });
  });

  describe('requestPermission()', () => {
    it('returns true and updates state when permission is granted', async () => {
      (ExpoAudioStreamModule.requestPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: true,
        status: 'granted',
        canAskAgain: true,
      });

      const { result } = renderHook(() => useAudioPermissions());

      await waitFor(() => {
        expect(result.current.hasPermission).not.toBeNull();
      });

      let granted: boolean | undefined;
      await act(async () => {
        granted = await result.current.requestPermission();
      });

      expect(granted).toBe(true);
      expect(result.current.hasPermission).toBe(true);
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('returns false and updates state when permission is denied', async () => {
      (ExpoAudioStreamModule.requestPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: false,
        status: 'denied',
        canAskAgain: true,
      });

      const { result } = renderHook(() => useAudioPermissions());

      await waitFor(() => {
        expect(result.current.hasPermission).not.toBeNull();
      });

      let granted: boolean | undefined;
      await act(async () => {
        granted = await result.current.requestPermission();
      });

      expect(granted).toBe(false);
      expect(result.current.hasPermission).toBe(false);
      // canAskAgain is true, so no alert
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('shows alert when denied with canAskAgain=false', async () => {
      (ExpoAudioStreamModule.requestPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: false,
        status: 'denied',
        canAskAgain: false,
      });

      const { result } = renderHook(() => useAudioPermissions());

      await waitFor(() => {
        expect(result.current.hasPermission).not.toBeNull();
      });

      await act(async () => {
        await result.current.requestPermission();
      });

      expect(Alert.alert).toHaveBeenCalledWith(
        'Microphone Permission Required',
        'Please enable microphone access in Settings to make voice calls.',
        expect.arrayContaining([
          expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
          expect.objectContaining({ text: 'Open Settings', onPress: expect.any(Function) }),
        ])
      );
    });

    it('alert Open Settings opens app settings on iOS', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true });

      (ExpoAudioStreamModule.requestPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: false,
        status: 'denied',
        canAskAgain: false,
      });

      const { result } = renderHook(() => useAudioPermissions());

      await waitFor(() => {
        expect(result.current.hasPermission).not.toBeNull();
      });

      await act(async () => {
        await result.current.requestPermission();
      });

      // Find the "Open Settings" button and press it
      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const buttons = alertCall[2];
      const openSettingsButton = buttons.find((b: any) => b.text === 'Open Settings');

      openSettingsButton.onPress();

      expect(Linking.openURL).toHaveBeenCalledWith('app-settings:');
    });

    it('alert Open Settings opens settings on Android', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'android', writable: true });

      (ExpoAudioStreamModule.requestPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: false,
        status: 'denied',
        canAskAgain: false,
      });

      const { result } = renderHook(() => useAudioPermissions());

      await waitFor(() => {
        expect(result.current.hasPermission).not.toBeNull();
      });

      await act(async () => {
        await result.current.requestPermission();
      });

      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const buttons = alertCall[2];
      const openSettingsButton = buttons.find((b: any) => b.text === 'Open Settings');

      openSettingsButton.onPress();

      expect(Linking.openSettings).toHaveBeenCalled();
    });

    it('does not show alert when granted is false but canAskAgain is true', async () => {
      (ExpoAudioStreamModule.requestPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: false,
        status: 'denied',
        canAskAgain: true,
      });

      const { result } = renderHook(() => useAudioPermissions());

      await waitFor(() => {
        expect(result.current.hasPermission).not.toBeNull();
      });

      await act(async () => {
        await result.current.requestPermission();
      });

      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('does not show alert when canAskAgain is undefined (not explicitly false)', async () => {
      (ExpoAudioStreamModule.requestPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: false,
        status: 'denied',
        // canAskAgain not set (undefined)
      });

      const { result } = renderHook(() => useAudioPermissions());

      await waitFor(() => {
        expect(result.current.hasPermission).not.toBeNull();
      });

      await act(async () => {
        await result.current.requestPermission();
      });

      // The condition is `canAskAgain === false`, undefined won't match
      expect(Alert.alert).not.toHaveBeenCalled();
    });
  });

  describe('Multiple calls', () => {
    it('can request permission multiple times', async () => {
      (ExpoAudioStreamModule.requestPermissionsAsync as jest.Mock)
        .mockResolvedValueOnce({ granted: false, status: 'denied', canAskAgain: true })
        .mockResolvedValueOnce({ granted: true, status: 'granted', canAskAgain: true });

      const { result } = renderHook(() => useAudioPermissions());

      await waitFor(() => {
        expect(result.current.hasPermission).not.toBeNull();
      });

      // First request: denied
      let granted: boolean | undefined;
      await act(async () => {
        granted = await result.current.requestPermission();
      });
      expect(granted).toBe(false);
      expect(result.current.hasPermission).toBe(false);

      // Second request: granted
      await act(async () => {
        granted = await result.current.requestPermission();
      });
      expect(granted).toBe(true);
      expect(result.current.hasPermission).toBe(true);
    });
  });
});
