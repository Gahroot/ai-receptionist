import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import api from '../services/api';
import type { User } from '../lib/types';

interface AuthState {
  user: User | null;
  workspaceId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      workspaceId: null,
      isAuthenticated: false,
      isLoading: true,

      initialize: async () => {
        try {
          const token = await SecureStore.getItemAsync('access_token');
          if (token) {
            await get().fetchUser();
          } else {
            set({ isLoading: false });
          }
        } catch {
          set({ isAuthenticated: false, isLoading: false });
        }
      },

      login: async (email: string, password: string) => {
        const formData = new URLSearchParams();
        formData.append('username', email);
        formData.append('password', password);

        const response = await api.post('/auth/login', formData.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        const { access_token, refresh_token } = response.data;
        await SecureStore.setItemAsync('access_token', access_token);
        await SecureStore.setItemAsync('refresh_token', refresh_token);

        await get().fetchUser();
      },

      register: async (email: string, password: string, fullName: string) => {
        await api.post('/auth/register', {
          email,
          password,
          full_name: fullName,
        });
        // Auto-login after registration
        await get().login(email, password);
      },

      logout: async () => {
        // Unregister push token before clearing auth
        try {
          const { useNotificationStore } = await import('./notificationStore');
          const { unregisterToken } = await import('../services/notificationService');
          const token = useNotificationStore.getState().expoPushToken;
          if (token) {
            await unregisterToken(token);
            useNotificationStore.getState().reset();
          }
        } catch {
          // Don't block logout if token cleanup fails
        }

        await SecureStore.deleteItemAsync('access_token');
        await SecureStore.deleteItemAsync('refresh_token');
        set({
          user: null,
          workspaceId: null,
          isAuthenticated: false,
        });
      },

      fetchUser: async () => {
        try {
          const response = await api.get('/auth/me');
          const user = response.data;
          set({
            user,
            workspaceId: user.default_workspace_id,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch {
          set({ isAuthenticated: false, isLoading: false });
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        workspaceId: state.workspaceId,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
