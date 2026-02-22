import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../stores/authStore';
import { useNotificationStore } from '../stores/notificationStore';
import { useVoicemailStore } from '../stores/voicemailStore';
import {
  getExpoPushToken,
  registerToken,
  setupAndroidChannels,
  clearBadge,
} from '../services/notificationService';
import logger from '../lib/logger';

export function useNotifications() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const { setToken, setRegistered } = useNotificationStore();
  const hasRegistered = useRef(false);

  // Log hook mount
  useEffect(() => {
    logger.lifecycle('useNotifications', 'mount');
    return () => {
      logger.lifecycle('useNotifications', 'unmount');
    };
  }, []);

  // Register for push notifications when authenticated (native only)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!isAuthenticated || hasRegistered.current) return;

    let cancelled = false;

    async function registerForPush() {
      logger.lifecycle('Notifications', 'registerForPush:start');
      try {
        await setupAndroidChannels();
        const token = await getExpoPushToken();
        if (cancelled) return;
        await registerToken(token);
        setToken(token);
        setRegistered(true);
        hasRegistered.current = true;
        logger.lifecycle('Notifications', 'registerForPush:success', { hasToken: !!token });
      } catch (err) {
        logger.error('Push notification registration failed', err, {}, 'Notifications');
      }
    }

    registerForPush();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Notification listeners (foreground + tap, native only)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!isAuthenticated) return;

    logger.lifecycle('Notifications', 'setupListeners:start');

    // Foreground notification received
    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      const title = notification.request.content.title;
      logger.lifecycle('Notifications', 'received', { title });

      // Refresh voicemail unread count on voicemail push
      const data = notification.request.content.data;
      if (data?.type === 'voicemail' && workspaceId) {
        useVoicemailStore.getState().fetchUnreadCount(workspaceId);
      }
    });

    // User tapped notification -> deep link
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      logger.lifecycle('Notifications', 'tapped', { data });
      if (data?.screen && typeof data.screen === 'string') {
        router.push(data.screen as any);
      }
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
      logger.lifecycle('Notifications', 'setupListeners:cleanup');
    };
  }, [isAuthenticated, router, workspaceId]);

  // Handle killed-state launch (native only)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!isAuthenticated) return;

    async function handleInitialNotification() {
      const response = await Notifications.getLastNotificationResponseAsync();
      if (response) {
        const data = response.notification.request.content.data;
        logger.lifecycle('Notifications', 'initialNotification', { data });
        if (data?.screen && typeof data.screen === 'string') {
          // Small delay to let navigation mount
          setTimeout(() => router.push(data.screen as any), 500);
        }
      }
    }

    handleInitialNotification();
  }, [isAuthenticated]);

  // Clear badge when app comes to foreground (native only)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!isAuthenticated) return;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        clearBadge();
      }
    });

    // Also clear on initial mount
    clearBadge();

    return () => {
      subscription.remove();
    };
  }, [isAuthenticated]);

  // Reset registration ref when logged out
  useEffect(() => {
    if (!isAuthenticated) {
      hasRegistered.current = false;
    }
  }, [isAuthenticated]);
}
