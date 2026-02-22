/**
 * Integration tests for Axios interceptors in api.ts
 *
 * Tests the request interceptor (Bearer token attachment) and
 * response interceptor (401 handling with token refresh + queue).
 *
 * Strategy: We use jest.resetModules() + require() (no jest.isolateModules)
 * so that api.ts and expo-secure-store share the same mock registry.
 * A custom adapter on the api instance controls HTTP behavior without real
 * network calls. For the refresh flow, we spy on axios.post (used by
 * api.ts's response interceptor directly).
 */
import { AxiosError } from 'axios';

// Do NOT mock axios at the module level — we need the real axios.create()
// so that interceptors are properly attached.

describe('API Interceptors', () => {
  // These will be re-required per test after jest.resetModules()
  let api: typeof import('@/services/api').default;
  let SecureStore: typeof import('expo-secure-store');
  let axiosDefault: typeof import('axios').default;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Require SecureStore from the fresh module registry.
    // The global jest.mock('expo-secure-store') in setup.ts still applies,
    // so this gives us the mock — but it's the SAME mock instance that
    // api.ts will import after we require it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    SecureStore = require('expo-secure-store');
  });

  /**
   * Helper: require the api module (which registers interceptors) and
   * the axios default export (needed to mock axios.post for refresh).
   */
  function loadApi() {
    // Require axios first so we can spy on its .post method
    /* eslint-disable @typescript-eslint/no-require-imports */
    axiosDefault = require('axios').default ?? require('axios');

    // Now require api.ts — this calls axios.create() and registers interceptors
    api = require('@/services/api').default;
    /* eslint-enable @typescript-eslint/no-require-imports */
  }

  describe('Request Interceptor', () => {
    it('attaches Authorization header when access_token exists in SecureStore', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('test-access-token');

      loadApi();

      // Use a custom adapter to intercept the final request config
      api.defaults.adapter = async (config: any) => {
        // AxiosHeaders provides a .get() method; also supports direct property access
        const authHeader =
          typeof config.headers?.get === 'function'
            ? config.headers.get('Authorization')
            : config.headers?.Authorization;
        expect(authHeader).toBe('Bearer test-access-token');
        return {
          data: { success: true },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      };

      const response = await api.get('/test');
      expect(response.data).toEqual({ success: true });
      expect(SecureStore.getItemAsync).toHaveBeenCalledWith('access_token');
    });

    it('skips Authorization header when no token in SecureStore', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

      loadApi();

      api.defaults.adapter = async (config: any) => {
        const authHeader =
          typeof config.headers?.get === 'function'
            ? config.headers.get('Authorization')
            : config.headers?.Authorization;
        // When no token, the header should not be set (null or undefined)
        expect(authHeader).toBeFalsy();
        return {
          data: { success: true },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      };

      const response = await api.get('/test');
      expect(response.data).toEqual({ success: true });
    });
  });

  describe('Response Interceptor - 401 Handling', () => {
    it('triggers token refresh on 401 response', async () => {
      // Request interceptor calls getItemAsync('access_token') for every request.
      // Response interceptor calls getItemAsync('refresh_token') on 401.
      // After refresh, the retry request calls getItemAsync('access_token') again.
      (SecureStore.getItemAsync as jest.Mock).mockImplementation(
        async (key: string) => {
          if (key === 'access_token') return 'expired-token';
          if (key === 'refresh_token') return 'mock-refresh-token';
          return null;
        }
      );

      loadApi();

      // Mock axios.post (used by api.ts for the refresh call)
      jest.spyOn(axiosDefault, 'post').mockResolvedValue({
        data: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
        },
      });

      let callCount = 0;
      api.defaults.adapter = async (config: any) => {
        callCount++;
        if (callCount === 1) {
          // First request: simulate 401
          const error = new AxiosError(
            'Unauthorized',
            '401',
            config,
            {},
            {
              status: 401,
              statusText: 'Unauthorized',
              headers: {},
              config,
              data: { detail: 'Token expired' },
            } as any
          );
          throw error;
        }
        // Retried original request succeeds
        return {
          data: { success: true },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      };

      const response = await api.get('/protected-resource');
      expect(response.data).toEqual({ success: true });

      // Verify refresh was called with the refresh token
      expect(axiosDefault.post).toHaveBeenCalledWith(
        expect.stringContaining('/auth/refresh'),
        { refresh_token: 'mock-refresh-token' }
      );

      // Verify new tokens were stored
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'access_token',
        'new-access-token'
      );
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'refresh_token',
        'new-refresh-token'
      );
    });

    it('clears tokens and rejects when refresh fails', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockImplementation(
        async (key: string) => {
          if (key === 'access_token') return 'expired-token';
          if (key === 'refresh_token') return 'mock-refresh-token';
          return null;
        }
      );

      loadApi();

      // Mock refresh to fail
      jest
        .spyOn(axiosDefault, 'post')
        .mockRejectedValue(new Error('Refresh failed'));

      api.defaults.adapter = async (config: any) => {
        const error = new AxiosError(
          'Unauthorized',
          '401',
          config,
          {},
          {
            status: 401,
            statusText: 'Unauthorized',
            headers: {},
            config,
            data: { detail: 'Token expired' },
          } as any
        );
        throw error;
      };

      await expect(api.get('/protected-resource')).rejects.toThrow(
        'Refresh failed'
      );

      // Verify tokens were cleared
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('access_token');
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('refresh_token');
    });

    it('clears tokens when no refresh token is available', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockImplementation(
        async (key: string) => {
          if (key === 'access_token') return 'expired-token';
          // No refresh token
          return null;
        }
      );

      loadApi();

      api.defaults.adapter = async (config: any) => {
        const error = new AxiosError(
          'Unauthorized',
          '401',
          config,
          {},
          {
            status: 401,
            statusText: 'Unauthorized',
            headers: {},
            config,
            data: { detail: 'Token expired' },
          } as any
        );
        throw error;
      };

      await expect(api.get('/protected-resource')).rejects.toThrow(
        'No refresh token'
      );

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('access_token');
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('refresh_token');
    });

    it('queues concurrent 401s and triggers only one refresh', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockImplementation(
        async (key: string) => {
          if (key === 'access_token') return 'expired-token';
          if (key === 'refresh_token') return 'mock-refresh-token';
          return null;
        }
      );

      loadApi();

      // Mock refresh to succeed (with a small delay to simulate async)
      jest.spyOn(axiosDefault, 'post').mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  data: {
                    access_token: 'new-access-token',
                    refresh_token: 'new-refresh-token',
                  },
                } as any),
              50
            )
          )
      );

      let requestCount = 0;
      api.defaults.adapter = async (config: any) => {
        requestCount++;
        if (requestCount <= 3) {
          // First 3 requests all get 401
          const error = new AxiosError(
            'Unauthorized',
            '401',
            config,
            {},
            {
              status: 401,
              statusText: 'Unauthorized',
              headers: {},
              config,
              data: { detail: 'Token expired' },
            } as any
          );
          throw error;
        }
        // Retried requests succeed
        return {
          data: { id: requestCount },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      };

      // Fire 3 concurrent requests
      const results = await Promise.all([
        api.get('/resource-1'),
        api.get('/resource-2'),
        api.get('/resource-3'),
      ]);

      // All should eventually resolve
      results.forEach((r) => {
        expect(r.status).toBe(200);
      });

      // Refresh should only be called once
      expect(axiosDefault.post).toHaveBeenCalledTimes(1);
    });

    it('passes non-401 errors through without refresh', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('valid-token');

      loadApi();

      jest.spyOn(axiosDefault, 'post');

      api.defaults.adapter = async (config: any) => {
        const error = new AxiosError(
          'Server Error',
          '500',
          config,
          {},
          {
            status: 500,
            statusText: 'Internal Server Error',
            headers: {},
            config,
            data: { detail: 'Something went wrong' },
          } as any
        );
        throw error;
      };

      await expect(api.get('/broken-endpoint')).rejects.toThrow();

      // Refresh should NOT have been called
      expect(axiosDefault.post).not.toHaveBeenCalled();
      // Tokens should NOT have been cleared
      expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    });

    it('does not retry a request that already has _retry flag', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockImplementation(
        async (key: string) => {
          if (key === 'access_token') return 'expired-token';
          if (key === 'refresh_token') return 'mock-refresh-token';
          return null;
        }
      );

      loadApi();

      // Mock refresh to succeed, but the retried request will still 401
      jest.spyOn(axiosDefault, 'post').mockResolvedValue({
        data: {
          access_token: 'still-bad-token',
          refresh_token: 'new-refresh-token',
        },
      });

      api.defaults.adapter = async (config: any) => {
        // Always return 401
        const error = new AxiosError(
          'Unauthorized',
          '401',
          config,
          {},
          {
            status: 401,
            statusText: 'Unauthorized',
            headers: {},
            config,
            data: { detail: 'Token expired' },
          } as any
        );
        throw error;
      };

      // Should eventually reject after one refresh attempt
      await expect(api.get('/protected')).rejects.toThrow();

      // Refresh called only once — the retried 401 should not trigger another refresh
      expect(axiosDefault.post).toHaveBeenCalledTimes(1);
    });
  });
});
