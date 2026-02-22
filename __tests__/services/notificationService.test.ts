import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
  },
}));

import api from '@/services/api';
import {
  getExpoPushToken,
  registerToken,
  unregisterToken,
  setupAndroidChannels,
  clearBadge,
  getBadgeCount,
} from '@/services/notificationService';

const mockApi = api as jest.Mocked<typeof api>;

describe('notificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mocks to default happy-path values
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: 'ExponentPushToken[mock-token]',
    });
    (Device as any).isDevice = true;
  });

  // --- getExpoPushToken ---

  describe('getExpoPushToken', () => {
    test('returns token string on success', async () => {
      const token = await getExpoPushToken();
      expect(token).toBe('ExponentPushToken[mock-token]');
      expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
        projectId: 'mock-project-id',
      });
    });

    test('requests permission if not already granted', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'undetermined',
      });
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'granted',
      });

      const token = await getExpoPushToken();
      expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
      expect(token).toBe('ExponentPushToken[mock-token]');
    });

    test('throws error when permission denied', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'denied',
      });
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'denied',
      });

      await expect(getExpoPushToken()).rejects.toThrow(
        'Push notification permission not granted'
      );
    });

    test('throws error on non-device (simulator)', async () => {
      (Device as any).isDevice = false;

      await expect(getExpoPushToken()).rejects.toThrow(
        'Push notifications require a physical device'
      );
    });

    test('does not request permission if already granted', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'granted',
      });

      await getExpoPushToken();
      expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    });
  });

  // --- registerToken ---

  describe('registerToken', () => {
    test('calls api.post with correct endpoint and payload', async () => {
      mockApi.post.mockResolvedValueOnce({ data: {} });

      await registerToken('ExponentPushToken[test123]');

      expect(mockApi.post).toHaveBeenCalledWith('/settings/device-tokens', {
        expo_push_token: 'ExponentPushToken[test123]',
        platform: Platform.OS,
      });
    });
  });

  // --- unregisterToken ---

  describe('unregisterToken', () => {
    test('calls api.delete with correct endpoint', async () => {
      mockApi.delete.mockResolvedValueOnce({ data: {} });

      await unregisterToken('ExponentPushToken[test123]');

      expect(mockApi.delete).toHaveBeenCalledWith(
        `/settings/device-tokens/${encodeURIComponent('ExponentPushToken[test123]')}`
      );
    });

    test('URL-encodes special characters in token', async () => {
      mockApi.delete.mockResolvedValueOnce({ data: {} });

      const tokenWithBrackets = 'ExponentPushToken[abc+def]';
      await unregisterToken(tokenWithBrackets);

      expect(mockApi.delete).toHaveBeenCalledWith(
        `/settings/device-tokens/${encodeURIComponent(tokenWithBrackets)}`
      );
    });
  });

  // --- setupAndroidChannels ---

  describe('setupAndroidChannels', () => {
    test('creates channels on Android', async () => {
      const originalPlatform = Platform.OS;
      Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });

      await setupAndroidChannels();

      expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledTimes(3);
      expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
        'calls',
        expect.objectContaining({
          name: 'Calls',
          importance: Notifications.AndroidImportance.MAX,
          sound: 'default',
          vibrationPattern: [0, 250, 250, 250],
        })
      );
      expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
        'messages',
        expect.objectContaining({
          name: 'Messages',
          importance: Notifications.AndroidImportance.HIGH,
          sound: 'default',
        })
      );
      expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
        'voicemail',
        expect.objectContaining({
          name: 'Voicemail',
          importance: Notifications.AndroidImportance.DEFAULT,
          sound: 'default',
        })
      );

      Object.defineProperty(Platform, 'OS', { value: originalPlatform, configurable: true });
    });

    test('does nothing on non-Android platforms', async () => {
      const originalPlatform = Platform.OS;
      Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });

      await setupAndroidChannels();

      expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();

      Object.defineProperty(Platform, 'OS', { value: originalPlatform, configurable: true });
    });
  });

  // --- clearBadge ---

  describe('clearBadge', () => {
    test('calls setBadgeCountAsync(0)', async () => {
      await clearBadge();
      expect(Notifications.setBadgeCountAsync).toHaveBeenCalledWith(0);
    });
  });

  // --- getBadgeCount ---

  describe('getBadgeCount', () => {
    test('returns badge count', async () => {
      (Notifications.getBadgeCountAsync as jest.Mock).mockResolvedValueOnce(5);

      const count = await getBadgeCount();
      expect(count).toBe(5);
    });

    test('returns 0 when no badges', async () => {
      (Notifications.getBadgeCountAsync as jest.Mock).mockResolvedValueOnce(0);

      const count = await getBadgeCount();
      expect(count).toBe(0);
    });
  });
});
