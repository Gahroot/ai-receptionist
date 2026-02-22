import * as SecureStore from 'expo-secure-store';

// Mock the api module before importing authStore
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

// Mock the dynamic imports in logout
jest.mock('@/stores/notificationStore', () => ({
  useNotificationStore: {
    getState: jest.fn(() => ({
      expoPushToken: null,
      reset: jest.fn(),
    })),
  },
}));

jest.mock('@/services/notificationService', () => ({
  unregisterToken: jest.fn().mockResolvedValue(undefined),
}));

import api from '@/services/api';
import { useAuthStore } from '@/stores/authStore';

const mockApi = api as jest.Mocked<typeof api>;
const mockSecureStore = SecureStore as jest.Mocked<typeof SecureStore>;

const mockUser = {
  id: 1,
  email: 'test@example.com',
  full_name: 'Test User',
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  default_workspace_id: 'ws-uuid-123',
};

describe('authStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset store state
    useAuthStore.setState({
      user: null,
      workspaceId: null,
      isAuthenticated: false,
      isLoading: true,
    });
  });

  // --- Initial state ---

  test('has correct initial state', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.workspaceId).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(true);
  });

  // --- login ---

  test('login success: calls api.post with form-urlencoded, stores tokens, fetches user, sets authenticated', async () => {
    mockApi.post.mockResolvedValueOnce({
      data: {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
      },
    });

    mockApi.get.mockResolvedValueOnce({
      data: mockUser,
    });

    await useAuthStore.getState().login('test@example.com', 'password123');

    // Should call login endpoint with form-urlencoded body
    expect(mockApi.post).toHaveBeenCalledWith(
      '/auth/login',
      'username=test%40example.com&password=password123',
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    // Should store tokens in SecureStore
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith('access_token', 'mock-access-token');
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith('refresh_token', 'mock-refresh-token');

    // Should fetch user
    expect(mockApi.get).toHaveBeenCalledWith('/auth/me');

    // Should set authenticated state
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual(mockUser);
    expect(state.workspaceId).toBe('ws-uuid-123');
    expect(state.isLoading).toBe(false);
  });

  test('login failure: throws error and stays unauthenticated', async () => {
    mockApi.post.mockRejectedValueOnce(new Error('Invalid credentials'));

    await expect(
      useAuthStore.getState().login('bad@email.com', 'wrongpass')
    ).rejects.toThrow('Invalid credentials');

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
  });

  // --- register ---

  test('register success: calls api.post then auto-logs in', async () => {
    // Register call
    mockApi.post.mockResolvedValueOnce({ data: { id: 1 } });

    // Login call (auto-login after register)
    mockApi.post.mockResolvedValueOnce({
      data: {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
      },
    });

    // fetchUser call (called by login)
    mockApi.get.mockResolvedValueOnce({ data: mockUser });

    await useAuthStore.getState().register('new@example.com', 'pass123', 'New User');

    // Should call register endpoint
    expect(mockApi.post).toHaveBeenCalledWith('/auth/register', {
      email: 'new@example.com',
      password: 'pass123',
      full_name: 'New User',
    });

    // Should then auto-login
    expect(mockApi.post).toHaveBeenCalledWith(
      '/auth/login',
      expect.any(String),
      expect.objectContaining({
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    );

    // Should be authenticated after auto-login
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  test('register failure: throws error', async () => {
    mockApi.post.mockRejectedValueOnce(new Error('Email already exists'));

    await expect(
      useAuthStore.getState().register('existing@example.com', 'pass', 'User')
    ).rejects.toThrow('Email already exists');

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  // --- logout ---

  test('logout clears tokens from SecureStore and resets state', async () => {
    // Set up an authenticated state first
    useAuthStore.setState({
      user: mockUser,
      workspaceId: 'ws-uuid-123',
      isAuthenticated: true,
      isLoading: false,
    });

    await useAuthStore.getState().logout();

    // Should delete tokens from SecureStore
    expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('access_token');
    expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('refresh_token');

    // Should reset state
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.workspaceId).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  // --- fetchUser ---

  test('fetchUser sets user and workspaceId from response', async () => {
    mockApi.get.mockResolvedValueOnce({ data: mockUser });

    await useAuthStore.getState().fetchUser();

    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.workspaceId).toBe('ws-uuid-123');
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  test('fetchUser sets unauthenticated on error', async () => {
    mockApi.get.mockRejectedValueOnce(new Error('Unauthorized'));

    await useAuthStore.getState().fetchUser();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  // --- initialize ---

  test('initialize with existing token: fetches user and sets authenticated', async () => {
    mockSecureStore.getItemAsync.mockResolvedValueOnce('existing-token');
    mockApi.get.mockResolvedValueOnce({ data: mockUser });

    await useAuthStore.getState().initialize();

    expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith('access_token');
    expect(mockApi.get).toHaveBeenCalledWith('/auth/me');

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual(mockUser);
    expect(state.isLoading).toBe(false);
  });

  test('initialize without token: stays unauthenticated', async () => {
    mockSecureStore.getItemAsync.mockResolvedValueOnce(null);

    await useAuthStore.getState().initialize();

    expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith('access_token');
    expect(mockApi.get).not.toHaveBeenCalled();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  test('initialize handles errors gracefully', async () => {
    mockSecureStore.getItemAsync.mockRejectedValueOnce(new Error('SecureStore error'));

    await useAuthStore.getState().initialize();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
  });
});
