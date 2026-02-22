/**
 * Global error handling utilities
 * Based on patterns from sentry-react-native, expo/expo-router, and React Native ErrorUtils
 *
 * Sets up handlers for:
 * - Uncaught errors (via ErrorUtils)
 * - Unhandled promise rejections
 * - Fatal errors
 */

import { ErrorUtils } from 'react-native';
import logger from './logger';

/**
 * Original global error handler (saved for fallback)
 */
let originalHandler: ((error: Error, isFatal?: boolean) => void) | null = null;

/**
 * Enhanced global error handler with logging
 */
function globalErrorHandler(error: Error, isFatal = false): void {
  logger.error(
    `Uncaught ${isFatal ? 'fatal ' : ''}error`,
    error,
    { isFatal },
    'GlobalHandler'
  );

  // Call original handler to ensure default behavior (red screen in dev)
  if (originalHandler) {
    originalHandler(error, isFatal);
  }
}

/**
 * Handler for unhandled promise rejections
 */
function unhandledRejectionHandler(event: PromiseRejectionEvent): void {
  const error = event.reason instanceof Error
    ? event.reason
    : new Error(String(event.reason));

  logger.error(
    'Unhandled promise rejection',
    error,
    { promise: 'PromiseRejectionEvent' },
    'GlobalHandler'
  );

  // Prevent default browser/console error
  event.preventDefault();
}

/**
 * Initialize global error handlers
 * Call once at app startup
 */
export function initGlobalErrorHandlers(): void {
  if (typeof ErrorUtils !== 'undefined' && ErrorUtils.setGlobalHandler) {
    // Save original handler
    originalHandler = ErrorUtils.getGlobalHandler();

    // Set our enhanced handler
    ErrorUtils.setGlobalHandler(globalErrorHandler);

    logger.info('Global error handler initialized', {}, 'Debug');
  }

  // Handle unhandled promise rejections (web and RN)
  if (typeof window !== 'undefined' && 'onunhandledrejection' in window) {
    window.addEventListener('unhandledrejection', unhandledRejectionHandler);
    logger.info('Unhandled rejection handler initialized', {}, 'Debug');
  }
}

/**
 * Cleanup global error handlers
 * Call when shutting down custom error handling
 */
export function cleanupGlobalErrorHandlers(): void {
  if (originalHandler && typeof ErrorUtils !== 'undefined' && ErrorUtils.setGlobalHandler) {
    ErrorUtils.setGlobalHandler(originalHandler);
    originalHandler = null;
  }

  if (typeof window !== 'undefined' && 'onunhandledrejection' in window) {
    window.removeEventListener('unhandledrejection', unhandledRejectionHandler);
  }

  logger.info('Global error handlers cleaned up', {}, 'Debug');
}

/**
 * Development-only debugging utilities
 */
export const devTools = {
  /**
   * Log all Redux/Zustand state changes (dev only)
   */
  logStateChanges: () => {
    if (process.env.NODE_ENV === 'production') return;
    logger.info('State change logging enabled', {}, 'DevTools');
  },

  /**
   * Enable verbose logging for all modules
   */
  enableVerboseLogging: () => {
    if (process.env.NODE_ENV === 'production') return;
    logger.info('Verbose logging enabled', {}, 'DevTools');
  },

  /**
   * Get current memory usage (if available)
   */
  getMemoryUsage: (): Record<string, number> | null => {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      const memory = (performance as any).memory;
      return {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
      };
    }
    return null;
  },
};

/**
 * Assert helper - throws in dev, logs in prod
 */
export function assert(
  condition: boolean,
  message: string,
  context: Record<string, unknown> = {}
): void {
  if (!condition) {
    const error = new Error(`Assertion failed: ${message}`);
    logger.error('Assertion failed', error, context, 'Assert');

    if (process.env.NODE_ENV !== 'production') {
      throw error;
    }
  }
}

/**
 * Measure async operation performance
 */
export async function measureAsync<T>(
  operation: string,
  fn: () => Promise<T>,
  context: Record<string, unknown> = {}
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;
    logger.performance(operation, duration, context);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error(
      `Failed operation: ${operation}`,
      error instanceof Error ? error : new Error(String(error)),
      { ...context, duration: `${duration}ms` },
      'Debug'
    );
    throw error;
  }
}

/**
 * Measure sync operation performance
 */
export function measure<T>(
  operation: string,
  fn: () => T,
  context: Record<string, unknown> = {}
): T {
  const start = Date.now();
  try {
    const result = fn();
    const duration = Date.now() - start;
    logger.performance(operation, duration, context);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error(
      `Failed operation: ${operation}`,
      error instanceof Error ? error : new Error(String(error)),
      { ...context, duration: `${duration}ms` },
      'Debug'
    );
    throw error;
  }
}
