/**
 * Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI.
 *
 * Based on patterns from:
 * - vercel/next.js ErrorBoundary
 * - ant-design ErrorBoundary
 * - langgenius/dify error-boundary
 * - React class component error boundaries
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Platform, View, Text, ScrollView, StyleSheet } from 'react-native';
import { YStack, Button, Paragraph } from 'tamagui';
import { AlertCircle, RefreshCw } from 'lucide-react-native';
import logger from '../lib/logger';
import { isDevelopment } from '../lib/env';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Component name for better logging */
  name?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Default error fallback UI for production
 */
function DefaultFallback({
  error,
  reset,
}: {
  error: Error | null;
  reset: () => void;
}): React.ReactElement {
  return (
    <View style={styles.container}>
      <YStack gap="$4" padding="$4" alignItems="center" maxWidth={400}>
        <AlertCircle size={48} color="#EF4444" />

        <YStack gap="$2">
          <Text style={styles.title}>Something went wrong</Text>
          <Paragraph textAlign="center" color="$gray11">
            {isDevelopment
              ? 'An error occurred. Check the console for details.'
              : 'The app encountered an unexpected error. Please try again.'}
          </Paragraph>
        </YStack>

        <Button
          icon={RefreshCw}
          onPress={reset}
          backgroundColor="$blue5"
          color="$blue11"
          pressStyle={{ backgroundColor: '$blue6' }}
        >
          Try Again
        </Button>

        {isDevelopment && error && (
          <YStack gap="$2" width="100%">
            <Text style={styles.errorTitle}>Error Details:</Text>
            <ScrollView style={styles.errorScroll}>
              <Text style={styles.errorText}>{error.toString()}</Text>
              {error.stack && (
                <Text style={styles.errorStack}>{error.stack}</Text>
              )}
            </ScrollView>
          </YStack>
        )}
      </YStack>
    </View>
  );
}

/**
 * Web-specific HTML fallback (for better SSR support)
 */
function WebFallback({
  error,
  reset,
}: {
  error: Error | null;
  reset: () => void;
}): React.ReactElement {
  return (
    <div style={stylesWeb.container}>
      <div style={stylesWeb.content}>
        <svg
          width={48}
          height={48}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#EF4444"
          strokeWidth={2}
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>

        <h2 style={stylesWeb.title}>Something went wrong</h2>

        <p style={stylesWeb.message}>
          {isDevelopment
            ? 'An error occurred. Check the console for details.'
            : 'The app encountered an unexpected error. Please try again.'}
        </p>

        <button onClick={reset} style={stylesWeb.button}>
          <RefreshCw size={16} style={stylesWeb.buttonIcon} />
          Try Again
        </button>

        {isDevelopment && error && (
          <details style={stylesWeb.details}>
            <summary style={stylesWeb.summary}>Error Details</summary>
            <pre style={stylesWeb.errorText}>
              {error.toString()}
              {'\n\n'}
              {error.stack}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error with component context
    const componentName = this.props.name || 'ErrorBoundary';
    logger.error(
      `React error caught in ${componentName}`,
      error,
      {
        componentStack: errorInfo.componentStack,
        digest: (errorInfo as any).digest,
      },
      componentName
    );

    // Update state with error info
    this.setState({
      error,
      errorInfo,
    });

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Use platform-specific fallback
      if (Platform.OS === 'web') {
        return <WebFallback error={this.state.error} reset={this.handleReset} />;
      }

      return <DefaultFallback error={this.state.error} reset={this.handleReset} />;
    }

    return this.props.children;
  }
}

// Native styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    color: '#000000',
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  errorScroll: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 12,
    maxHeight: 200,
  },
  errorText: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#374151',
  },
  errorStack: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#6B7280',
    marginTop: 8,
  },
});

// Web styles
const stylesWeb = {
  container: {
    display: 'flex',
    height: '100vh',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 20,
  } as const,
  content: {
    maxWidth: 400,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
  } as const,
  title: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    margin: 0,
    color: '#000000',
  } as const,
  message: {
    textAlign: 'center',
    color: '#6B7280',
    margin: 0,
  } as const,
  button: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: '10px 20px',
    backgroundColor: '#EFF6FF',
    color: '#2563EB',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: '500',
    cursor: 'pointer',
  } as const,
  buttonIcon: {
    flexShrink: 0,
  } as const,
  details: {
    width: '100%',
    textAlign: 'left',
  } as const,
  summary: {
    cursor: 'pointer',
    color: '#6B7280',
    fontSize: 14,
  } as const,
  errorText: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 12,
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#374151',
    whiteSpace: 'pre-wrap' as const,
    overflow: 'auto' as const,
    maxHeight: 200,
  },
};

export default ErrorBoundary;
