import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { API_V1_URL } from '../constants/api';
import logger from '../lib/logger';
import { isDevelopment } from '../lib/env';

const getToken = async (key: string): Promise<string | null> => {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key);
  }
  return await SecureStore.getItemAsync(key);
};

const setToken = async (key: string, value: string): Promise<void> => {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
};

const deleteToken = async (key: string): Promise<void> => {
  if (Platform.OS === 'web') {
    localStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
};

const api = axios.create({
  baseURL: API_V1_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach auth token + log
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const startTime = Date.now();
    // Store start time for response timing
    (config as any)._startTime = startTime;

    const token = await getToken('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Log request in development
    if (isDevelopment) {
      logger.apiRequest(
        config.method?.toUpperCase() || 'GET',
        config.url || '',
        config.data,
        config.headers as Record<string, string>
      );
    }

    return config;
  },
  (error) => {
    logger.error('API request error', error, {}, 'ApiClient');
    return Promise.reject(error);
  }
);

// Response interceptor: handle 401 + token refresh
let isRefreshing = false;
let failedQueue: {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}[] = [];

const processQueue = (error: AxiosError | null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(undefined);
    }
  });
  failedQueue = [];
};

// Response interceptor: handle 401 + token refresh + log
api.interceptors.response.use(
  (response) => {
    // Calculate request duration
    const startTime = (response.config as any)._startTime;
    const duration = startTime ? Date.now() - startTime : 0;

    // Log response in development
    if (isDevelopment) {
      logger.apiResponse(
        response.config.method?.toUpperCase() || 'GET',
        response.config.url || '',
        response.status,
        duration,
        response.data
      );
    }

    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const startTime = (originalRequest as any)._startTime;
    const duration = startTime ? Date.now() - startTime : 0;

    if (error.response?.status === 401 && !originalRequest._retry) {
      logger.warn('Token refresh needed', { url: originalRequest.url }, 'ApiClient');

      if (isRefreshing) {
        logger.debug('Token refresh already in progress, queueing request', {}, 'ApiClient');
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => api(originalRequest));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        logger.debug('Starting token refresh', {}, 'ApiClient');

        const refreshToken = await getToken('refresh_token');
        if (!refreshToken) {
          logger.error('No refresh token available', null, {}, 'ApiClient');
          throw new Error('No refresh token');
        }

        const response = await axios.post(`${API_V1_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        });

        const { access_token, refresh_token } = response.data;
        await setToken('access_token', access_token);
        await setToken('refresh_token', refresh_token);

        logger.info('Token refresh successful', {}, 'ApiClient');
        processQueue(null);
        return api(originalRequest);
      } catch (refreshError) {
        logger.error('Token refresh failed', refreshError, {}, 'ApiClient');
        processQueue(refreshError as AxiosError);
        // Clear tokens on refresh failure
        await deleteToken('access_token');
        await deleteToken('refresh_token');
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Log error response
    if (isDevelopment) {
      logger.error(
        `API error: ${error.config?.method?.toUpperCase()} ${error.config?.url}`,
        error,
        {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          duration: `${duration}ms`,
        },
        'ApiClient'
      );
    }

    return Promise.reject(error);
  }
);

export default api;
