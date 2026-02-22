import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import api from '../services/api';
import { unregisterToken } from '../services/notificationService';
import { useNotificationStore } from './notificationStore';
import type { User } from '../lib/types';
import logger from '../lib/logger';
import { showErrorFrom } from '../services/toastService';

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
        logger.lifecycle('AuthStore', 'initialize:start');
        try {
          // On web, use localStorage instead of SecureStore
          const token =
            Platform.OS === 'web'
              ? localStorage.getItem('access_token')
              : await SecureStore.getItemAsync('access_token');

          logger.debug('Token found', { hasToken: !!token }, 'AuthStore');

          if (token) {
            await get().fetchUser();
          } else {
            logger.info('No token found, skipping user fetch', {}, 'AuthStore');
            set({ isAuthenticated: false, isLoading: false });
          }
        } catch (err) {
          logger.error('Initialize failed', err, {}, 'AuthStore');
          set({ isAuthenticated: false, isLoading: false });
        }
        logger.lifecycle('AuthStore', 'initialize:complete');
      },

      login: async (email: string, password: string) => {
        logger.lifecycle('AuthStore', 'login:start', { email });
        try {
          const formData = new URLSearchParams();
          formData.append('username', email);
          formData.append('password', password);

          const response = await api.post('/auth/login', formData.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          });

          const { access_token, refresh_token } = response.data;
          if (Platform.OS === 'web') {
            localStorage.setItem('access_token', access_token);
            localStorage.setItem('refresh_token', refresh_token);
          } else {
            await SecureStore.setItemAsync('access_token', access_token);
            await SecureStore.setItemAsync('refresh_token', refresh_token);
          }

          await get().fetchUser();
          logger.lifecycle('AuthStore', 'login:success');
        } catch (err) {
          logger.error('Login failed', err, { email }, 'AuthStore');
          showErrorFrom(err, 'Login failed. Please check your credentials.');
          throw err;
        }
      },

      register: async (email: string, password: string, fullName: string) => {
        logger.lifecycle('AuthStore', 'register:start', { email, fullName });
        try {
          await api.post('/auth/register', {
            email,
            password,
            full_name: fullName,
          });
          logger.lifecycle('AuthStore', 'register:success');
          // Auto-login after registration
          await get().login(email, password);
        } catch (err) {
          logger.error('Registration failed', err, { email }, 'AuthStore');
          showErrorFrom(err, 'Registration failed. Please try again.');
          throw err;
        }
      },

      logout: async () => {
        logger.lifecycle('AuthStore', 'logout:start');
        // Unregister push token before clearing auth
        try {
          const token = useNotificationStore.getState().expoPushToken;
          if (token) {
            await unregisterToken(token);
            useNotificationStore.getState().reset();
          }
        } catch (err) {
          logger.warn('Failed to unregister push token during logout', { error: err }, 'AuthStore');
          // Don't block logout if token cleanup fails
        }

        if (Platform.OS === 'web') {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        } else {
          await SecureStore.deleteItemAsync('access_token');
          await SecureStore.deleteItemAsync('refresh_token');
        }
        set({
          user: null,
          workspaceId: null,
          isAuthenticated: false,
        });
        logger.lifecycle('AuthStore', 'logout:complete');
      },

      fetchUser: async () => {
        logger.lifecycle('AuthStore', 'fetchUser:start');
        try {
          const response = await api.get('/auth/me');
          const user = response.data;
          logger.info('User fetched', { email: user?.email, workspaceId: user?.default_workspace_id }, 'AuthStore');
          set({
            user,
            workspaceId: user.default_workspace_id,
            isAuthenticated: true,
            isLoading: false,
          });
          logger.lifecycle('AuthStore', 'fetchUser:success');
        } catch (err) {
          logger.error('Fetch user failed', err, {}, 'AuthStore');
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
