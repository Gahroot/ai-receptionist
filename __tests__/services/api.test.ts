import api from '@/services/api';
import * as SecureStore from 'expo-secure-store';
import { API_V1_URL } from '@/constants/api';

const mockGetItemAsync = SecureStore.getItemAsync as jest.Mock;
const mockDeleteItemAsync = SecureStore.deleteItemAsync as jest.Mock;

describe('API service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('instance configuration', () => {
    test('exports an axios instance (has request/get/post methods)', () => {
      expect(api).toBeDefined();
      expect(typeof api.request).toBe('function');
      expect(typeof api.get).toBe('function');
      expect(typeof api.post).toBe('function');
      expect(typeof api.put).toBe('function');
      expect(typeof api.delete).toBe('function');
    });

    test('has correct baseURL from constants', () => {
      expect(api.defaults.baseURL).toBe(API_V1_URL);
    });

    test('has 30 second timeout', () => {
      expect(api.defaults.timeout).toBe(30000);
    });

    test('has Content-Type set to application/json', () => {
      expect(api.defaults.headers['Content-Type']).toBe('application/json');
    });

    test('has request interceptors registered', () => {
      expect(
        (api.interceptors.request as unknown as { handlers: unknown[] }).handlers
          .length,
      ).toBeGreaterThan(0);
    });

    test('has response interceptors registered', () => {
      expect(
        (api.interceptors.response as unknown as { handlers: unknown[] })
          .handlers.length,
      ).toBeGreaterThan(0);
    });
  });

  describe('request interceptor', () => {
    // Access the internal handlers array via type assertion
    const getRequestHandler = () =>
      (api.interceptors.request as unknown as { handlers: Array<{ fulfilled: (config: any) => any; rejected: (err: any) => any }> }).handlers[0];

    test('attaches Authorization header when token exists', async () => {
      mockGetItemAsync.mockResolvedValue('test-jwt-token');

      const { fulfilled } = getRequestHandler();

      const config = {
        headers: { Authorization: undefined as string | undefined },
      };

      const result = await fulfilled(config);

      expect(mockGetItemAsync).toHaveBeenCalledWith('access_token');
      expect(result.headers.Authorization).toBe('Bearer test-jwt-token');
    });

    test('does not attach Authorization header when no token exists', async () => {
      mockGetItemAsync.mockResolvedValue(null);

      const { fulfilled } = getRequestHandler();

      const config = {
        headers: { Authorization: undefined as string | undefined },
      };

      const result = await fulfilled(config);

      expect(mockGetItemAsync).toHaveBeenCalledWith('access_token');
      expect(result.headers.Authorization).toBeUndefined();
    });

    test('error handler rejects the error', async () => {
      const { rejected } = getRequestHandler();
      const error = new Error('request error');
      await expect(rejected(error)).rejects.toThrow('request error');
    });
  });

  describe('response interceptor', () => {
    const getResponseHandler = () =>
      (api.interceptors.response as unknown as { handlers: Array<{ fulfilled: (res: any) => any; rejected: (err: any) => any }> }).handlers[0];

    test('success handler passes response through', () => {
      const { fulfilled } = getResponseHandler();
      const mockResponse = { data: { message: 'ok' }, status: 200 };
      const result = fulfilled(mockResponse);
      expect(result).toBe(mockResponse);
    });

    test('rejects non-401 errors without retry', async () => {
      const { rejected } = getResponseHandler();

      const error = {
        config: {},
        response: { status: 500 },
        isAxiosError: true,
      };

      await expect(rejected(error)).rejects.toBe(error);
    });

    test('clears tokens when refresh token is not available on 401', async () => {
      const { rejected } = getResponseHandler();

      mockGetItemAsync.mockResolvedValue(null);

      const error = {
        config: { headers: {}, _retry: undefined },
        response: { status: 401 },
        isAxiosError: true,
      };

      await expect(rejected(error)).rejects.toThrow('No refresh token');

      expect(mockDeleteItemAsync).toHaveBeenCalledWith('access_token');
      expect(mockDeleteItemAsync).toHaveBeenCalledWith('refresh_token');
    });
  });

  describe('module exports', () => {
    test('default export is the configured api instance', () => {
      expect(api.defaults).toBeDefined();
      expect(api.interceptors).toBeDefined();
      expect(api.defaults.baseURL).toBe(API_V1_URL);
    });
  });
});
