/**
 * Centralized logging service with structured output and log levels
 * Based on patterns from expo/expo, sentry-react-native, and ever-co/ever-gauzy
 */

import { LogLevel, minLogLevel, isDevelopment, DEBUG } from './env';

// Re-export for convenience
export { isDevelopment, DEBUG };

export type LogContext = Record<string, unknown>;

/**
 * ANSI color codes for terminal output (development only)
 */
const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

/**
 * Log level display names and colors
 */
const levelConfig = {
  [LogLevel.DEBUG]: { name: 'DEBUG', color: colors.dim },
  [LogLevel.INFO]: { name: 'INFO', color: colors.blue },
  [LogLevel.WARN]: { name: 'WARN', color: colors.yellow },
  [LogLevel.ERROR]: { name: 'ERROR', color: colors.red },
  [LogLevel.SILENT]: { name: 'SILENT', color: colors.reset },
};

/**
 * Format timestamp for log entries
 */
function getTimestamp(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * Sanitize context objects for logging (handles circular refs, sensitive data)
 */
function sanitizeContext(ctx: LogContext): LogContext {
  if (!ctx || typeof ctx !== 'object') {
    return {};
  }

  const sanitized: LogContext = {};
  const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'accessToken', 'refreshToken'];

  for (const [key, value] of Object.entries(ctx)) {
    // Check if this is a sensitive key
    const isSensitive = sensitiveKeys.some((sensitive) =>
      key.toLowerCase().includes(sensitive.toLowerCase())
    );

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (value instanceof Error) {
      sanitized[key] = {
        name: value.name,
        message: value.message,
        stack: isDevelopment ? value.stack : undefined,
      };
    } else if (typeof value === 'object' && value !== null) {
      try {
        // Handle potential circular references
        sanitized[key] = JSON.parse(JSON.stringify(value));
      } catch {
        sanitized[key] = '[Object]';
      }
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Core logging function
 */
function log(
  level: LogLevel,
  message: string,
  error: Error | unknown = null,
  context: LogContext = {},
  component = ''
): void {
  // Check if this log level should be output
  if (level < minLogLevel) {
    return;
  }

  const config = levelConfig[level];
  const timestamp = getTimestamp();
  const componentTag = component ? `[${component}] ` : '';
  const sanitizedCtx = sanitizeContext(context);

  // Build log entry
  let logMessage: string;

  if (isDevelopment) {
    // Colorized, structured output for development
    const colorPrefix = config.color;
    const colorSuffix = colors.reset;
    const ctxStr = Object.keys(sanitizedCtx).length > 0
      ? `${colors.dim} ${JSON.stringify(sanitizedCtx)}${colors.reset}`
      : '';

    logMessage = `${colorPrefix}[${config.name}]${colorSuffix} ${colors.dim}${timestamp}${colors.reset} ${componentTag}${message}${ctxStr}`;

    // Use appropriate console method
    switch (level) {
      case LogLevel.DEBUG:
      case LogLevel.INFO:
        console.log(logMessage);
        break;
      case LogLevel.WARN:
        console.warn(logMessage);
        break;
      case LogLevel.ERROR:
        console.error(logMessage);
        break;
    }

    // Log error stack separately if present
    if (error instanceof Error && error.stack) {
      console.error(`${colorPrefix}[ERROR]${colorSuffix} Stack:`, error.stack);
    }
  } else {
    // Simple output for production
    const ctxStr = Object.keys(sanitizedCtx).length > 0
      ? ` ${JSON.stringify(sanitizedCtx)}`
      : '';
    logMessage = `[${config.name}] ${timestamp} ${componentTag}${message}${ctxStr}`;

    // In production, only send warnings and errors to console
    if (level >= LogLevel.WARN) {
      switch (level) {
        case LogLevel.WARN:
          console.warn(logMessage);
          break;
        case LogLevel.ERROR:
          console.error(logMessage);
          // In production, you might want to send errors to a monitoring service
          break;
      }
    }
  }
}

/**
 * Logger interface with fluent API
 */
export const logger = {
  /**
   * Log debug message (lowest level, dev only)
   */
  debug(message: string, context: LogContext = {}, component = ''): void {
    log(LogLevel.DEBUG, message, null, context, component);
  },

  /**
   * Log informational message
   */
  info(message: string, context: LogContext = {}, component = ''): void {
    log(LogLevel.INFO, message, null, context, component);
  },

  /**
   * Log warning message
   */
  warn(message: string, context: LogContext = {}, component = ''): void {
    log(LogLevel.WARN, message, null, context, component);
  },

  /**
   * Log error with optional error object
   */
  error(message: string, error: Error | unknown = null, context: LogContext = {}, component = ''): void {
    log(LogLevel.ERROR, message, error, context, component);
  },

  /**
   * Log API request
   */
  apiRequest(method: string, url: string, data?: unknown, headers?: Record<string, string>): void {
    if (!DEBUG.api) return;

    const context: LogContext = { method, url };
    if (data) context.data = data;
    if (headers) {
      // Sanitize headers
      const safeHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() === 'authorization') {
          safeHeaders[k] = v ? '[REDACTED]' : '';
        } else {
          safeHeaders[k] = v;
        }
      }
      context.headers = safeHeaders;
    }

    log(LogLevel.DEBUG, `API Request: ${method} ${url}`, null, context, 'ApiClient');
  },

  /**
   * Log API response
   */
  apiResponse(
    method: string,
    url: string,
    status: number,
    durationMs: number,
    data?: unknown
  ): void {
    if (!DEBUG.api) return;

    const context: LogContext = {
      method,
      url,
      status,
      duration: `${durationMs}ms`,
    };

    // Warn on slow requests
    if (durationMs > DEBUG.slowRequestThreshold) {
      log(
        LogLevel.WARN,
        `Slow API response: ${method} ${url}`,
        null,
        context,
        'ApiClient'
      );
      return;
    }

    // Warn on error status
    if (status >= 400) {
      log(
        LogLevel.WARN,
        `API error response: ${method} ${url}`,
        null,
        { ...context, data },
        'ApiClient'
      );
      return;
    }

    log(LogLevel.DEBUG, `API Response: ${method} ${url}`, null, context, 'ApiClient');
  },

  /**
   * Log WebSocket message
   */
  websocket(messageType: string, context: LogContext = {}): void {
    if (!DEBUG.websocket) return;
    log(LogLevel.DEBUG, `WS: ${messageType}`, null, context, 'WebSocket');
  },

  /**
   * Log state change
   */
  stateChange(store: string, action: string, newState: Record<string, unknown>): void {
    if (!DEBUG.state) return;
    log(LogLevel.DEBUG, `State: ${store}.${action}`, null, { state: newState }, `${store}Store`);
  },

  /**
   * Log lifecycle event (mount, unmount, etc.)
   */
  lifecycle(component: string, event: string, context: LogContext = {}): void {
    log(LogLevel.DEBUG, `Lifecycle: ${component}.${event}`, null, context, component);
  },

  /**
   * Log navigation event
   */
  navigation(from: string, to: string, context: LogContext = {}): void {
    if (!DEBUG.navigation) return;
    log(LogLevel.INFO, `Navigation: ${from} → ${to}`, null, context, 'Navigator');
  },

  /**
   * Log performance metric
   */
  performance(operation: string, durationMs: number, context: LogContext = {}): void {
    if (!DEBUG.performance) return;
    log(LogLevel.DEBUG, `Performance: ${operation}`, null, { ...context, duration: `${durationMs}ms` }, 'Perf');
  },
};

// Also export as default for convenience
export default logger;
