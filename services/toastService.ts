/**
 * Toast notification service
 * Wraps react-native-toast-message with typed convenience methods
 */

import Toast from 'react-native-toast-message';
import logger from '../lib/logger';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastOptions {
  title?: string;
  message: string;
  duration?: number;
  position?: 'top' | 'bottom';
  autoHide?: boolean;
  topOffset?: number;
  bottomOffset?: number;
  visibilityTime?: number;
}

/**
 * Show a toast notification
 */
export function showToast({
  title,
  message,
  duration = 3000,
  position = 'top',
  autoHide = true,
  visibilityTime = duration,
}: ToastOptions): void {
  Toast.show({
    type: 'info',
    text1: title,
    text2: message,
    position,
    autoHide,
    visibilityTime,
    topOffset: 40,
    bottomOffset: 40,
  });

  logger.debug('Toast shown', { title, message, position }, 'Toast');
}

/**
 * Show success toast
 */
export function showSuccess(message: string, title = 'Success'): void {
  Toast.show({
    type: 'success',
    text1: title,
    text2: message,
    position: 'top',
    autoHide: true,
    visibilityTime: 2500,
    topOffset: 40,
  });

  logger.info('Success toast shown', { title, message }, 'Toast');
}

/**
 * Show error toast
 */
export function showError(message: string, title = 'Error', duration = 4000): void {
  Toast.show({
    type: 'error',
    text1: title,
    text2: message,
    position: 'top',
    autoHide: true,
    visibilityTime: duration,
    topOffset: 40,
  });

  logger.warn('Error toast shown', { title, message }, 'Toast');
}

/**
 * Show warning toast
 */
export function showWarning(message: string, title = 'Warning'): void {
  Toast.show({
    type: 'warning', // Will use custom type config
    text1: title,
    text2: message,
    position: 'top',
    autoHide: true,
    visibilityTime: 3000,
    topOffset: 40,
  });

  logger.info('Warning toast shown', { title, message }, 'Toast');
}

/**
 * Show info toast
 */
export function showInfo(message: string, title = 'Info'): void {
  Toast.show({
    type: 'info',
    text1: title,
    text2: message,
    position: 'top',
    autoHide: true,
    visibilityTime: 2500,
    topOffset: 40,
  });

  logger.info('Info toast shown', { title, message }, 'Toast');
}

/**
 * Hide all toasts
 */
export function hideToast(): void {
  Toast.hide();
  logger.debug('Toast hidden', {}, 'Toast');
}

/**
 * Convert API error to user-friendly message
 */
export function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    // Common API error messages
    const message = error.message.toLowerCase();

    if (message.includes('network')) {
      return 'Network error. Please check your connection.';
    }
    if (message.includes('timeout')) {
      return 'Request timed out. Please try again.';
    }
    if (message.includes('401') || message.includes('unauthorized')) {
      return 'Session expired. Please log in again.';
    }
    if (message.includes('403') || message.includes('forbidden')) {
      return "You don't have permission to do this.";
    }
    if (message.includes('404') || message.includes('not found')) {
      return 'Resource not found.';
    }
    if (message.includes('500') || message.includes('server error')) {
      return 'Server error. Please try again later.';
    }

    return error.message;
  }

  // Axios-like error with response data
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as any).response;
    if (response?.data?.detail) {
      return response.data.detail;
    }
    if (response?.data?.message) {
      return response.data.message;
    }
  }

  return 'An unexpected error occurred.';
}

/**
 * Show error toast from error object
 */
export function showErrorFrom(error: unknown, fallbackMessage = 'An error occurred'): void {
  const message = getErrorMessage(error) || fallbackMessage;
  showError(message);
  logger.error('Error toast from error', error instanceof Error ? error : new Error(String(error)), {}, 'Toast');
}

/**
 * Toast configuration for react-native-toast-message
 * Import this in your app root configuration
 */
export const toastConfig = {
  success: {
    fontFamily: 'System',
    backgroundColor: '#10B981',
    textColor: '#FFFFFF',
    text1Style: {
      fontSize: 16,
      fontWeight: '600',
    },
    text2Style: {
      fontSize: 14,
    },
  },
  error: {
    fontFamily: 'System',
    backgroundColor: '#EF4444',
    textColor: '#FFFFFF',
    text1Style: {
      fontSize: 16,
      fontWeight: '600',
    },
    text2Style: {
      fontSize: 14,
    },
  },
  info: {
    fontFamily: 'System',
    backgroundColor: '#3B82F6',
    textColor: '#FFFFFF',
    text1Style: {
      fontSize: 16,
      fontWeight: '600',
    },
    text2Style: {
      fontSize: 14,
    },
  },
  warning: {
    fontFamily: 'System',
    backgroundColor: '#F59E0B',
    textColor: '#FFFFFF',
    text1Style: {
      fontSize: 16,
      fontWeight: '600',
    },
    text2Style: {
      fontSize: 14,
    },
  },
};

export default {
  show: showToast,
  success: showSuccess,
  error: showError,
  warning: showWarning,
  info: showInfo,
  hide: hideToast,
  errorFrom: showErrorFrom,
  getErrorMessage,
};
