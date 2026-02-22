import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import logger from '../lib/logger';
import { showErrorFrom } from '../services/toastService';

interface NotificationPreferences {
  pushEnabled: boolean;
  smsAlerts: boolean;
  emailAlerts: boolean;
}

interface NotificationState {
  expoPushToken: string | null;
  isRegistered: boolean;
  preferences: NotificationPreferences;
  isLoadingPrefs: boolean;

  setToken: (token: string | null) => void;
  setRegistered: (registered: boolean) => void;
  fetchPreferences: () => Promise<void>;
  updatePreference: (key: keyof NotificationPreferences, value: boolean) => Promise<void>;
  reset: () => void;
}

// Map frontend keys to backend field names
const prefKeyToBackend: Record<keyof NotificationPreferences, string> = {
  pushEnabled: 'notification_push',
  smsAlerts: 'notification_sms',
  emailAlerts: 'notification_email',
};

const defaultPreferences: NotificationPreferences = {
  pushEnabled: true,
  smsAlerts: true,
  emailAlerts: true,
};

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      expoPushToken: null,
      isRegistered: false,
      preferences: { ...defaultPreferences },
      isLoadingPrefs: false,

      setToken: (token) => set({ expoPushToken: token }),

      setRegistered: (registered) => set({ isRegistered: registered }),

      fetchPreferences: async () => {
        logger.lifecycle('NotificationStore', 'fetchPreferences:start');
        set({ isLoadingPrefs: true });
        try {
          const response = await api.get('/settings/users/me/notifications');
          const data = response.data;
          const newPrefs = {
            pushEnabled: data.notification_push ?? true,
            smsAlerts: data.notification_sms ?? true,
            emailAlerts: data.notification_email ?? true,
          };
          set({
            preferences: newPrefs,
            isLoadingPrefs: false,
          });
          logger.stateChange('Notification', 'fetchPreferences', newPrefs);
        } catch (err) {
          logger.error('Failed to fetch notification preferences', err, {}, 'NotificationStore');
          set({ isLoadingPrefs: false });
        }
      },

      updatePreference: async (key, value) => {
        logger.lifecycle('NotificationStore', 'updatePreference:start', { key, value });
        const previous = { ...get().preferences };

        // Optimistic update
        set({
          preferences: { ...get().preferences, [key]: value },
        });

        try {
          const backendKey = prefKeyToBackend[key];
          await api.put('/settings/users/me/notifications', {
            [backendKey]: value,
          });
          logger.lifecycle('NotificationStore', 'updatePreference:success');
        } catch (err) {
          logger.error('Failed to update notification preference', err, { key, value }, 'NotificationStore');
          // Rollback on failure
          set({ preferences: previous });
          showErrorFrom(err, 'Failed to update notification preference.');
        }
      },

      reset: () =>
        set({
          expoPushToken: null,
          isRegistered: false,
          preferences: { ...defaultPreferences },
          isLoadingPrefs: false,
        }),
    }),
    {
      name: 'notification-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        expoPushToken: state.expoPushToken,
        isRegistered: state.isRegistered,
        preferences: state.preferences,
      }),
    }
  )
);
