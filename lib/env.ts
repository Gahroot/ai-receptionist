/**
 * Environment configuration and feature flags
 * Provides centralized environment detection and debugging options
 */

const __DEV__ = process.env.EXPO_PUBLIC_DEV_MODE === 'true' || process.env.NODE_ENV !== 'production';

/**
 * Get the current environment mode
 */
export const isDevelopment = __DEV__;
export const isProduction = !__DEV__;

/**
 * Log level constants for controlling verbosity
 */
export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SILENT: 4,
} as const;
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

/**
 * Minimum log level based on environment
 */
export const minLogLevel: LogLevel = isDevelopment ? LogLevel.DEBUG : LogLevel.WARN;

/**
 * Feature flags for debugging
 */
export const DEBUG = {
  // Enable verbose logging
  verbose: isDevelopment,

  // Log API requests/responses
  api: isDevelopment,

  // Log WebSocket messages
  websocket: isDevelopment,

  // Log state changes
  state: isDevelopment,

  // Log navigation events
  navigation: isDevelopment,

  // Show error boundaries in production
  showErrorDetails: isDevelopment,

  // Log performance metrics
  performance: isDevelopment,

  // Slow request threshold in milliseconds
  slowRequestThreshold: 3000,
};

/**
 * Get current platform string for logging
 */
export function getPlatform(): string {
  if (typeof window !== 'undefined' && window.document) {
    return 'web';
  }
  // In React Native, Platform.OS would be used
  // This fallback is for non-React Native environments
  return 'unknown';
}
