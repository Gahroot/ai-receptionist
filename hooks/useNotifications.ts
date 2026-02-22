import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../stores/authStore';
import { useNotificationStore } from '../stores/notificationStore';
import {
  getExpoPushToken,
  registerToken,
  setupAndroidChannels,
  clearBadge,
} from '../services/notificationService';

export function useNotifications() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { setToken, setRegistered } = useNotificationStore();
  const hasRegistered = useRef(false);

  // Register for push notifications when authenticated
  useEffect(() => {
    if (!isAuthenticated || hasRegistered.current) return;

    let cancelled = false;

    async function registerForPush() {
      try {
        await setupAndroidChannels();
        const token = await getExpoPushToken();
        if (cancelled) return;
        await registerToken(token);
        setToken(token);
        setRegistered(true);
        hasRegistered.current = true;
      } catch (err) {
        console.warn('Push notification registration failed:', err);
      }
    }

    registerForPush();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Notification listeners (foreground + tap)
  useEffect(() => {
    if (!isAuthenticated) return;

    // Foreground notification received
    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification received:', notification.request.content.title);
    });

    // User tapped notification -> deep link
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.screen && typeof data.screen === 'string') {
        router.push(data.screen as any);
      }
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, [isAuthenticated, router]);

  // Handle killed-state launch (user tapped notification while app was closed)
  useEffect(() => {
    if (!isAuthenticated) return;

    async function handleInitialNotification() {
      const response = await Notifications.getLastNotificationResponseAsync();
      if (response) {
        const data = response.notification.request.content.data;
        if (data?.screen && typeof data.screen === 'string') {
          // Small delay to let navigation mount
          setTimeout(() => router.push(data.screen as any), 500);
        }
      }
    }

    handleInitialNotification();
  }, [isAuthenticated]);

  // Clear badge when app comes to foreground
  useEffect(() => {
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
