import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import api from './api';

// Configure foreground notification display at module level (native only)
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

export async function getExpoPushToken(): Promise<string> {
  if (!Device.isDevice) {
    throw new Error('Push notifications require a physical device');
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    throw new Error('Push notification permission not granted');
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    throw new Error('EAS project ID not configured');
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  return tokenData.data;
}

export async function registerToken(token: string): Promise<void> {
  await api.post('/settings/device-tokens', {
    expo_push_token: token,
    platform: Platform.OS,
  });
}

export async function unregisterToken(token: string): Promise<void> {
  await api.delete(`/settings/device-tokens/${encodeURIComponent(token)}`);
}

export async function setupAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('calls', {
    name: 'Calls',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
  });

  await Notifications.setNotificationChannelAsync('messages', {
    name: 'Messages',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
  });

  await Notifications.setNotificationChannelAsync('voicemail', {
    name: 'Voicemail',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
}

export async function clearBadge(): Promise<void> {
  await Notifications.setBadgeCountAsync(0);
}

export async function getBadgeCount(): Promise<number> {
  return Notifications.getBadgeCountAsync();
}
