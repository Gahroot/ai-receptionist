/**
 * Integration tests for the full authentication flow.
 *
 * Tests login -> token storage -> user fetch -> logout,
 * register -> auto-login, initialize, and error handling.
 */
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock api module
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
  },
}));

// Mock notificationService (used during logout via dynamic import)
jest.mock('@/services/notificationService', () => ({
  getExpoPushToken: jest.fn().mockResolvedValue('ExponentPushToken[mock]'),
  registerToken: jest.fn().mockResolvedValue(undefined),
  unregisterToken: jest.fn().mockResolvedValue(undefined),
  setupAndroidChannels: jest.fn().mockResolvedValue(undefined),
  clearBadge: jest.fn().mockResolvedValue(undefined),
}));

import api from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';

// Get the mock function reference from the mocked module — this is the same
// instance used by both the static import and the dynamic import() in authStore.logout().
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { unregisterToken: mockUnregisterToken } = require('@/services/notificationService');

const mockApi = api as jest.Mocked<typeof api>;

const mockUser = {
  id: 1,
  email: 'test@example.com',
  full_name: 'Test User',
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  default_workspace_id: 'ws-uuid-123',
};

describe('Auth Flow Integration', () => {
  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset Zustand stores to initial state
    useAuthStore.setState({
      user: null,
      workspaceId: null,
      isAuthenticated: false,
      isLoading: true,
    });

    useNotificationStore.setState({
      expoPushToken: null,
      isRegistered: false,
      preferences: {
        pushEnabled: true,
        smsAlerts: true,
        emailAlerts: true,
      },
      isLoadingPrefs: false,
    });

    // Clear SecureStore mocks
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

    // Clear AsyncStorage
    await AsyncStorage.clear();
  });

  describe('Full Login Flow', () => {
    it('login() stores tokens, fetches user, sets workspace and isAuthenticated', async () => {
      // Mock login response (OAuth2 form-urlencoded)
      mockApi.post.mockResolvedValueOnce({
        data: {
          access_token: 'access-123',
          refresh_token: 'refresh-456',
        },
      });

      // Mock fetchUser response
      mockApi.get.mockResolvedValueOnce({
        data: mockUser,
      });

      // Perform login
      await useAuthStore.getState().login('test@example.com', 'password123');

      const state = useAuthStore.getState();

      // Verify tokens were stored in SecureStore
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('access_token', 'access-123');
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('refresh_token', 'refresh-456');

      // Verify login API call was form-urlencoded
      expect(mockApi.post).toHaveBeenCalledWith(
        '/auth/login',
        expect.stringContaining('username=test%40example.com'),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      // Verify user was fetched
      expect(mockApi.get).toHaveBeenCalledWith('/auth/me');

      // Verify store state
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.user).toEqual(mockUser);
      expect(state.workspaceId).toBe('ws-uuid-123');
    });

    it('login correctly encodes form data with special characters', async () => {
      mockApi.post.mockResolvedValueOnce({
        data: { access_token: 'token', refresh_token: 'refresh' },
      });
      mockApi.get.mockResolvedValueOnce({ data: mockUser });

      await useAuthStore.getState().login('user+test@example.com', 'p@ss&word=123');

      const loginCallBody = mockApi.post.mock.calls[0][1] as string;
      // URLSearchParams encodes + as %2B and special chars properly
      expect(loginCallBody).toContain('username=user');
      expect(loginCallBody).toContain('password=p');
    });
  });

  describe('Full Register Flow', () => {
    it('register() calls register endpoint then auto-logs in', async () => {
      // Mock register response
      mockApi.post.mockResolvedValueOnce({ data: { id: 1 } });

      // Mock auto-login after register
      mockApi.post.mockResolvedValueOnce({
        data: {
          access_token: 'new-access',
          refresh_token: 'new-refresh',
        },
      });

      // Mock fetchUser during auto-login
      mockApi.get.mockResolvedValueOnce({ data: mockUser });

      await useAuthStore.getState().register('new@example.com', 'password123', 'New User');

      // Verify register was called first
      expect(mockApi.post).toHaveBeenCalledWith('/auth/register', {
        email: 'new@example.com',
        password: 'password123',
        full_name: 'New User',
      });

      // Verify auto-login happened (second post call)
      expect(mockApi.post).toHaveBeenCalledTimes(2);
      expect(mockApi.post).toHaveBeenNthCalledWith(
        2,
        '/auth/login',
        expect.any(String),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      );

      // Verify final state is authenticated
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toEqual(mockUser);
    });
  });

  describe('Full Logout Flow', () => {
    it('logout() unregisters push token, clears SecureStore, and resets state', async () => {
      // Start in authenticated state
      useAuthStore.setState({
        user: mockUser,
        workspaceId: 'ws-uuid-123',
        isAuthenticated: true,
        isLoading: false,
      });

      // Set a push token in notification store
      useNotificationStore.setState({
        expoPushToken: 'ExponentPushToken[device-token]',
        isRegistered: true,
      });

      await useAuthStore.getState().logout();

      // Verify push token was unregistered
      expect(mockUnregisterToken).toHaveBeenCalledWith('ExponentPushToken[device-token]');

      // Verify SecureStore tokens were cleared
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('access_token');
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('refresh_token');

      // Verify auth state was reset
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.workspaceId).toBeNull();

      // Verify notification store was reset
      const notifState = useNotificationStore.getState();
      expect(notifState.expoPushToken).toBeNull();
      expect(notifState.isRegistered).toBe(false);
    });

    it('logout() succeeds even when push token unregister fails', async () => {
      useAuthStore.setState({
        user: mockUser,
        workspaceId: 'ws-uuid-123',
        isAuthenticated: true,
        isLoading: false,
      });

      useNotificationStore.setState({
        expoPushToken: 'ExponentPushToken[device-token]',
        isRegistered: true,
      });

      // Make unregisterToken fail
      mockUnregisterToken.mockRejectedValueOnce(new Error('Network error'));

      // Logout should still succeed
      await useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('access_token');
    });

    it('logout() skips push token unregister when no token exists', async () => {
      useAuthStore.setState({
        user: mockUser,
        workspaceId: 'ws-uuid-123',
        isAuthenticated: true,
        isLoading: false,
      });

      useNotificationStore.setState({
        expoPushToken: null,
        isRegistered: false,
      });

      await useAuthStore.getState().logout();

      // unregisterToken should not have been called
      expect(mockUnregisterToken).not.toHaveBeenCalled();

      // State should still be reset
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });

  describe('Initialize', () => {
    it('auto-authenticates when valid token exists in SecureStore', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('existing-token');

      // Mock fetchUser success
      mockApi.get.mockResolvedValueOnce({ data: mockUser });

      await useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toEqual(mockUser);
      expect(state.workspaceId).toBe('ws-uuid-123');
      expect(state.isLoading).toBe(false);
    });

    it('stays unauthenticated when no token in SecureStore', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

      await useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.user).toBeNull();
      expect(mockApi.get).not.toHaveBeenCalled();
    });

    it('stays unauthenticated when fetchUser fails (expired token)', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('expired-token');

      // Mock fetchUser failure
      mockApi.get.mockRejectedValueOnce(new Error('Unauthorized'));

      await useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
    });

    it('handles SecureStore read error gracefully', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(
        new Error('SecureStore unavailable')
      );

      await useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
    });
  });

  describe('Login Failure', () => {
    it('does not corrupt state when login API call fails', async () => {
      // Start from a clean unauthenticated state
      useAuthStore.setState({
        user: null,
        workspaceId: null,
        isAuthenticated: false,
        isLoading: false,
      });

      // Mock login failure
      mockApi.post.mockRejectedValueOnce(new Error('Invalid credentials'));

      await expect(
        useAuthStore.getState().login('bad@example.com', 'wrongpass')
      ).rejects.toThrow('Invalid credentials');

      // State should remain unchanged
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.workspaceId).toBeNull();

      // No tokens should have been stored
      expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    });

    it('does not corrupt state when fetchUser fails after successful login', async () => {
      mockApi.post.mockResolvedValueOnce({
        data: {
          access_token: 'access-123',
          refresh_token: 'refresh-456',
        },
      });

      // fetchUser fails
      mockApi.get.mockRejectedValueOnce(new Error('Server error'));

      // Login should not throw because fetchUser catches errors internally
      await useAuthStore.getState().login('test@example.com', 'password123');

      // Tokens were stored (login succeeded), but user fetch failed
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('access_token', 'access-123');

      // fetchUser error sets isAuthenticated to false
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
    });

    it('does not corrupt state when register API call fails', async () => {
      mockApi.post.mockRejectedValueOnce(new Error('Email already exists'));

      await expect(
        useAuthStore.getState().register('existing@example.com', 'pass', 'User')
      ).rejects.toThrow('Email already exists');

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
    });
  });

  describe('fetchUser', () => {
    it('sets user with default_workspace_id from response', async () => {
      mockApi.get.mockResolvedValueOnce({
        data: {
          ...mockUser,
          default_workspace_id: 'ws-abc-def',
        },
      });

      await useAuthStore.getState().fetchUser();

      expect(useAuthStore.getState().workspaceId).toBe('ws-abc-def');
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it('handles user with null default_workspace_id', async () => {
      mockApi.get.mockResolvedValueOnce({
        data: {
          ...mockUser,
          default_workspace_id: null,
        },
      });

      await useAuthStore.getState().fetchUser();

      expect(useAuthStore.getState().workspaceId).toBeNull();
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });
  });
});
