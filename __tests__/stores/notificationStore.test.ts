jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

import api from '@/services/api';
import { useNotificationStore } from '@/stores/notificationStore';

const mockApi = api as jest.Mocked<typeof api>;

describe('notificationStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset store to initial state
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
  });

  // --- Initial state ---

  test('has correct initial state', () => {
    const state = useNotificationStore.getState();
    expect(state.expoPushToken).toBeNull();
    expect(state.isRegistered).toBe(false);
    expect(state.preferences).toEqual({
      pushEnabled: true,
      smsAlerts: true,
      emailAlerts: true,
    });
    expect(state.isLoadingPrefs).toBe(false);
  });

  // --- setToken ---

  test('setToken updates expoPushToken', () => {
    useNotificationStore.getState().setToken('ExponentPushToken[abc123]');
    expect(useNotificationStore.getState().expoPushToken).toBe('ExponentPushToken[abc123]');
  });

  test('setToken can set token to null', () => {
    useNotificationStore.setState({ expoPushToken: 'some-token' });
    useNotificationStore.getState().setToken(null);
    expect(useNotificationStore.getState().expoPushToken).toBeNull();
  });

  // --- setRegistered ---

  test('setRegistered updates isRegistered to true', () => {
    useNotificationStore.getState().setRegistered(true);
    expect(useNotificationStore.getState().isRegistered).toBe(true);
  });

  test('setRegistered updates isRegistered to false', () => {
    useNotificationStore.setState({ isRegistered: true });
    useNotificationStore.getState().setRegistered(false);
    expect(useNotificationStore.getState().isRegistered).toBe(false);
  });

  // --- fetchPreferences ---

  test('fetchPreferences calls GET and maps backend field names to frontend', async () => {
    mockApi.get.mockResolvedValueOnce({
      data: {
        notification_push: false,
        notification_sms: true,
        notification_email: false,
      },
    });

    await useNotificationStore.getState().fetchPreferences();

    expect(mockApi.get).toHaveBeenCalledWith('/settings/users/me/notifications');

    const state = useNotificationStore.getState();
    expect(state.preferences.pushEnabled).toBe(false);
    expect(state.preferences.smsAlerts).toBe(true);
    expect(state.preferences.emailAlerts).toBe(false);
    expect(state.isLoadingPrefs).toBe(false);
  });

  test('fetchPreferences defaults to true when backend returns null/undefined', async () => {
    mockApi.get.mockResolvedValueOnce({
      data: {
        // All fields missing / undefined
      },
    });

    await useNotificationStore.getState().fetchPreferences();

    const state = useNotificationStore.getState();
    expect(state.preferences.pushEnabled).toBe(true);
    expect(state.preferences.smsAlerts).toBe(true);
    expect(state.preferences.emailAlerts).toBe(true);
  });

  test('fetchPreferences sets isLoadingPrefs during fetch', async () => {
    let resolveApi: (value: unknown) => void;
    const apiPromise = new Promise((resolve) => {
      resolveApi = resolve;
    });
    mockApi.get.mockReturnValueOnce(apiPromise as any);

    const fetchPromise = useNotificationStore.getState().fetchPreferences();

    // Should be loading
    expect(useNotificationStore.getState().isLoadingPrefs).toBe(true);

    // Resolve the API call
    resolveApi!({
      data: { notification_push: true, notification_sms: true, notification_email: true },
    });
    await fetchPromise;

    // Should be done loading
    expect(useNotificationStore.getState().isLoadingPrefs).toBe(false);
  });

  test('fetchPreferences handles API error gracefully', async () => {
    mockApi.get.mockRejectedValueOnce(new Error('Network error'));

    await useNotificationStore.getState().fetchPreferences();

    // Should stop loading and keep defaults
    const state = useNotificationStore.getState();
    expect(state.isLoadingPrefs).toBe(false);
    expect(state.preferences).toEqual({
      pushEnabled: true,
      smsAlerts: true,
      emailAlerts: true,
    });
  });

  // --- updatePreference ---

  test('updatePreference performs optimistic update (state changes immediately)', async () => {
    mockApi.put.mockResolvedValueOnce({ data: {} });

    const promise = useNotificationStore.getState().updatePreference('pushEnabled', false);

    // State should be updated immediately (optimistic)
    expect(useNotificationStore.getState().preferences.pushEnabled).toBe(false);

    await promise;

    // Should remain false after API resolves
    expect(useNotificationStore.getState().preferences.pushEnabled).toBe(false);
  });

  test('updatePreference sends correct backend key name', async () => {
    mockApi.put.mockResolvedValueOnce({ data: {} });
    await useNotificationStore.getState().updatePreference('pushEnabled', false);
    expect(mockApi.put).toHaveBeenCalledWith('/settings/users/me/notifications', {
      notification_push: false,
    });

    mockApi.put.mockResolvedValueOnce({ data: {} });
    await useNotificationStore.getState().updatePreference('smsAlerts', false);
    expect(mockApi.put).toHaveBeenCalledWith('/settings/users/me/notifications', {
      notification_sms: false,
    });

    mockApi.put.mockResolvedValueOnce({ data: {} });
    await useNotificationStore.getState().updatePreference('emailAlerts', false);
    expect(mockApi.put).toHaveBeenCalledWith('/settings/users/me/notifications', {
      notification_email: false,
    });
  });

  test('updatePreference rolls back on API error', async () => {
    mockApi.put.mockRejectedValueOnce(new Error('Server error'));

    // Initial state: pushEnabled is true
    expect(useNotificationStore.getState().preferences.pushEnabled).toBe(true);

    await useNotificationStore.getState().updatePreference('pushEnabled', false);

    // Should have rolled back to true
    expect(useNotificationStore.getState().preferences.pushEnabled).toBe(true);
  });

  test('updatePreference rollback preserves other preferences', async () => {
    // Set up mixed state
    useNotificationStore.setState({
      preferences: {
        pushEnabled: true,
        smsAlerts: false,
        emailAlerts: true,
      },
    });

    mockApi.put.mockRejectedValueOnce(new Error('Server error'));

    await useNotificationStore.getState().updatePreference('pushEnabled', false);

    // pushEnabled should roll back, others unchanged
    const prefs = useNotificationStore.getState().preferences;
    expect(prefs.pushEnabled).toBe(true);
    expect(prefs.smsAlerts).toBe(false);
    expect(prefs.emailAlerts).toBe(true);
  });

  // --- Field mapping ---

  test('field mapping: pushEnabled maps to notification_push', async () => {
    mockApi.put.mockResolvedValueOnce({ data: {} });
    await useNotificationStore.getState().updatePreference('pushEnabled', true);
    expect(mockApi.put).toHaveBeenCalledWith('/settings/users/me/notifications', {
      notification_push: true,
    });
  });

  test('field mapping: smsAlerts maps to notification_sms', async () => {
    mockApi.put.mockResolvedValueOnce({ data: {} });
    await useNotificationStore.getState().updatePreference('smsAlerts', true);
    expect(mockApi.put).toHaveBeenCalledWith('/settings/users/me/notifications', {
      notification_sms: true,
    });
  });

  test('field mapping: emailAlerts maps to notification_email', async () => {
    mockApi.put.mockResolvedValueOnce({ data: {} });
    await useNotificationStore.getState().updatePreference('emailAlerts', true);
    expect(mockApi.put).toHaveBeenCalledWith('/settings/users/me/notifications', {
      notification_email: true,
    });
  });

  // --- reset ---

  test('reset clears all state', () => {
    // Set up dirty state
    useNotificationStore.setState({
      expoPushToken: 'ExponentPushToken[xyz]',
      isRegistered: true,
      preferences: {
        pushEnabled: false,
        smsAlerts: false,
        emailAlerts: false,
      },
      isLoadingPrefs: true,
    });

    useNotificationStore.getState().reset();

    const state = useNotificationStore.getState();
    expect(state.expoPushToken).toBeNull();
    expect(state.isRegistered).toBe(false);
    expect(state.preferences).toEqual({
      pushEnabled: true,
      smsAlerts: true,
      emailAlerts: true,
    });
    expect(state.isLoadingPrefs).toBe(false);
  });
});
