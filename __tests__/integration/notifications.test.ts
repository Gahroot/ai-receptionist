/**
 * Integration tests for the useNotifications hook.
 *
 * Tests push registration, notification listeners, deep linking,
 * badge clearing, and cleanup behavior.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';

// Mock notificationService
jest.mock('@/services/notificationService', () => ({
  getExpoPushToken: jest.fn().mockResolvedValue('ExponentPushToken[mock-token]'),
  registerToken: jest.fn().mockResolvedValue(undefined),
  unregisterToken: jest.fn().mockResolvedValue(undefined),
  setupAndroidChannels: jest.fn().mockResolvedValue(undefined),
  clearBadge: jest.fn().mockResolvedValue(undefined),
}));

import {
  getExpoPushToken,
  registerToken,
  setupAndroidChannels,
  clearBadge,
} from '@/services/notificationService';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useNotifications } from '@/hooks/useNotifications';

// Track AppState listeners for testing
let appStateListeners: Array<(state: string) => void> = [];
const mockRemoveAppState = jest.fn();

describe('useNotifications Integration', () => {
  // Store original Platform.OS
  const originalPlatformOS = Platform.OS;

  // Track notification listener callbacks
  let receivedListenerCallback: ((notification: any) => void) | null = null;
  let responseListenerCallback: ((response: any) => void) | null = null;
  const mockReceivedRemove = jest.fn();
  const mockResponseRemove = jest.fn();

  // Mock router
  const mockPush = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    appStateListeners = [];
    receivedListenerCallback = null;
    responseListenerCallback = null;

    // Reset Platform.OS to ios (native)
    Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true });

    // Set up router mock
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      replace: jest.fn(),
      back: jest.fn(),
    });

    // Set up notification listener mocks
    (Notifications.addNotificationReceivedListener as jest.Mock).mockImplementation((cb) => {
      receivedListenerCallback = cb;
      return { remove: mockReceivedRemove };
    });

    (Notifications.addNotificationResponseReceivedListener as jest.Mock).mockImplementation(
      (cb) => {
        responseListenerCallback = cb;
        return { remove: mockResponseRemove };
      }
    );

    // Mock AppState.addEventListener
    jest.spyOn(AppState, 'addEventListener').mockImplementation((event, handler) => {
      if (event === 'change') {
        appStateListeners.push(handler as any);
      }
      return { remove: mockRemoveAppState } as any;
    });

    // Mock getLastNotificationResponseAsync
    (Notifications.getLastNotificationResponseAsync as jest.Mock).mockResolvedValue(null);

    // Reset stores
    useAuthStore.setState({
      user: null,
      workspaceId: null,
      isAuthenticated: false,
      isLoading: false,
    });

    useNotificationStore.setState({
      expoPushToken: null,
      isRegistered: false,
      preferences: { pushEnabled: true, smsAlerts: true, emailAlerts: true },
      isLoadingPrefs: false,
    });
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalPlatformOS, writable: true });
  });

  describe('Push Registration', () => {
    it('registers for push notifications when authenticated on native', async () => {
      useAuthStore.setState({ isAuthenticated: true });

      const { unmount } = renderHook(() => useNotifications());

      // Wait for async registration to complete
      await waitFor(() => {
        expect(useNotificationStore.getState().isRegistered).toBe(true);
      });

      expect(setupAndroidChannels).toHaveBeenCalled();
      expect(getExpoPushToken).toHaveBeenCalled();
      expect(registerToken).toHaveBeenCalledWith('ExponentPushToken[mock-token]');

      // Verify store was updated
      const notifState = useNotificationStore.getState();
      expect(notifState.expoPushToken).toBe('ExponentPushToken[mock-token]');
      expect(notifState.isRegistered).toBe(true);

      unmount();
    });

    it('does not register when not authenticated', async () => {
      useAuthStore.setState({ isAuthenticated: false });

      const { unmount } = renderHook(() => useNotifications());

      // Flush promises
      await act(async () => {
        await new Promise((resolve) => setImmediate(resolve));
      });

      expect(getExpoPushToken).not.toHaveBeenCalled();
      expect(registerToken).not.toHaveBeenCalled();

      unmount();
    });

    it('skips registration on web platform', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'web', writable: true });
      useAuthStore.setState({ isAuthenticated: true });

      const { unmount } = renderHook(() => useNotifications());

      // Flush promises
      await act(async () => {
        await new Promise((resolve) => setImmediate(resolve));
      });

      expect(getExpoPushToken).not.toHaveBeenCalled();
      expect(registerToken).not.toHaveBeenCalled();

      unmount();
    });

    it('handles registration errors gracefully', async () => {
      (getExpoPushToken as jest.Mock).mockRejectedValueOnce(
        new Error('Push notifications require a physical device')
      );

      useAuthStore.setState({ isAuthenticated: true });

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const { unmount } = renderHook(() => useNotifications());

      // Wait for the error to be logged
      await waitFor(() => {
        expect(warnSpy).toHaveBeenCalledWith(
          'Push notification registration failed:',
          expect.any(Error)
        );
      });

      // Store should not have been updated
      expect(useNotificationStore.getState().isRegistered).toBe(false);

      warnSpy.mockRestore();
      unmount();
    });

    it('does not register twice when already registered', async () => {
      useAuthStore.setState({ isAuthenticated: true });

      const { rerender, unmount } = renderHook(() => useNotifications());

      await waitFor(() => {
        expect(useNotificationStore.getState().isRegistered).toBe(true);
      });

      expect(registerToken).toHaveBeenCalledTimes(1);

      // Re-render the hook
      rerender({});

      // Flush promises
      await act(async () => {
        await new Promise((resolve) => setImmediate(resolve));
      });

      // Should still only be called once (hasRegistered.current prevents re-registration)
      expect(registerToken).toHaveBeenCalledTimes(1);

      unmount();
    });
  });

  describe('Notification Listeners', () => {
    it('sets up foreground and response listeners when authenticated', () => {
      useAuthStore.setState({ isAuthenticated: true });

      const { unmount } = renderHook(() => useNotifications());

      expect(Notifications.addNotificationReceivedListener).toHaveBeenCalled();
      expect(Notifications.addNotificationResponseReceivedListener).toHaveBeenCalled();

      unmount();
    });

    it('does not set up listeners when not authenticated', () => {
      useAuthStore.setState({ isAuthenticated: false });

      const { unmount } = renderHook(() => useNotifications());

      // Listeners should not be set up for notification response
      // (the calls from setup.ts mock don't count since we re-mocked in beforeEach)
      // Check that our specific callback-capturing implementation was not called
      expect(receivedListenerCallback).toBeNull();
      expect(responseListenerCallback).toBeNull();

      unmount();
    });

    it('does not set up listeners on web platform', () => {
      Object.defineProperty(Platform, 'OS', { value: 'web', writable: true });
      useAuthStore.setState({ isAuthenticated: true });

      const { unmount } = renderHook(() => useNotifications());

      expect(receivedListenerCallback).toBeNull();
      expect(responseListenerCallback).toBeNull();

      unmount();
    });
  });

  describe('Deep Linking on Notification Tap', () => {
    it('navigates to screen from notification tap data', () => {
      useAuthStore.setState({ isAuthenticated: true });

      renderHook(() => useNotifications());

      // Simulate user tapping a notification
      expect(responseListenerCallback).not.toBeNull();
      act(() => {
        responseListenerCallback!({
          notification: {
            request: {
              content: {
                data: { screen: '/(tabs)/calls/call-123' },
              },
            },
          },
        });
      });

      expect(mockPush).toHaveBeenCalledWith('/(tabs)/calls/call-123');
    });

    it('does not navigate when notification has no screen data', () => {
      useAuthStore.setState({ isAuthenticated: true });

      renderHook(() => useNotifications());

      act(() => {
        responseListenerCallback!({
          notification: {
            request: {
              content: {
                data: { someOtherField: 'value' },
              },
            },
          },
        });
      });

      expect(mockPush).not.toHaveBeenCalled();
    });

    it('does not navigate when screen data is not a string', () => {
      useAuthStore.setState({ isAuthenticated: true });

      renderHook(() => useNotifications());

      act(() => {
        responseListenerCallback!({
          notification: {
            request: {
              content: {
                data: { screen: 123 }, // not a string
              },
            },
          },
        });
      });

      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe('Killed-state Launch Notification', () => {
    it('navigates from initial notification on launch', async () => {
      jest.useFakeTimers();

      (Notifications.getLastNotificationResponseAsync as jest.Mock).mockResolvedValue({
        notification: {
          request: {
            content: {
              data: { screen: '/(tabs)/messages/conv-456' },
            },
          },
        },
      });

      useAuthStore.setState({ isAuthenticated: true });

      renderHook(() => useNotifications());

      // Flush the resolved getLastNotificationResponseAsync promise
      await act(async () => {
        await Promise.resolve();
      });

      // The hook uses setTimeout(500) for navigation, advance past it
      act(() => {
        jest.advanceTimersByTime(600);
      });

      expect(mockPush).toHaveBeenCalledWith('/(tabs)/messages/conv-456');

      jest.useRealTimers();
    });
  });

  describe('Badge Clearing', () => {
    it('clears badge on initial mount when authenticated', async () => {
      useAuthStore.setState({ isAuthenticated: true });

      renderHook(() => useNotifications());

      // Flush promises to let useEffect run
      await act(async () => {
        await new Promise((resolve) => setImmediate(resolve));
      });

      expect(clearBadge).toHaveBeenCalled();
    });

    it('clears badge when app comes to foreground', async () => {
      useAuthStore.setState({ isAuthenticated: true });

      renderHook(() => useNotifications());

      // Clear initial clearBadge call count
      (clearBadge as jest.Mock).mockClear();

      // Simulate app coming to foreground
      act(() => {
        appStateListeners.forEach((listener) => listener('active'));
      });

      expect(clearBadge).toHaveBeenCalled();
    });

    it('does not clear badge on web platform', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'web', writable: true });
      useAuthStore.setState({ isAuthenticated: true });

      renderHook(() => useNotifications());

      // Flush promises
      await act(async () => {
        await new Promise((resolve) => setImmediate(resolve));
      });

      expect(clearBadge).not.toHaveBeenCalled();
    });
  });

  describe('Cleanup on Unmount', () => {
    it('removes notification listeners on unmount', () => {
      useAuthStore.setState({ isAuthenticated: true });

      const { unmount } = renderHook(() => useNotifications());

      unmount();

      expect(mockReceivedRemove).toHaveBeenCalled();
      expect(mockResponseRemove).toHaveBeenCalled();
    });

    it('removes AppState listener on unmount', () => {
      useAuthStore.setState({ isAuthenticated: true });

      const { unmount } = renderHook(() => useNotifications());

      unmount();

      expect(mockRemoveAppState).toHaveBeenCalled();
    });
  });

  describe('Re-registration on Re-auth', () => {
    it('resets hasRegistered when logged out then re-registers on re-login', async () => {
      // Start authenticated
      useAuthStore.setState({ isAuthenticated: true });

      const { rerender, unmount } = renderHook(() => useNotifications());

      await waitFor(() => {
        expect(useNotificationStore.getState().isRegistered).toBe(true);
      });

      expect(registerToken).toHaveBeenCalledTimes(1);

      // Log out
      act(() => {
        useAuthStore.setState({ isAuthenticated: false });
      });

      rerender({});

      // Flush promises
      await act(async () => {
        await new Promise((resolve) => setImmediate(resolve));
      });

      // Log back in
      act(() => {
        useAuthStore.setState({ isAuthenticated: true });
      });

      rerender({});

      // Wait for re-registration
      await waitFor(() => {
        expect(registerToken).toHaveBeenCalledTimes(2);
      });

      unmount();
    });
  });
});
