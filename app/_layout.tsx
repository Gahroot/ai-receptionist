import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { TamaguiProvider, YStack } from 'tamagui';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../stores/authStore';
import { useNotifications } from '../hooks/useNotifications';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { initGlobalErrorHandlers } from '../lib/debug';
import logger from '../lib/logger';
import tamaguiConfig from '../tamagui.config';

// Separate component for notifications to avoid hook rules violations on web
// Separate component for notifications to avoid hook rules violations on web
function NotificationsManager() {
  // Only call the hook inside this component which is only rendered on native
  useNotifications();
  return null;
}

// Global error handler initializer component
function ErrorHandlerInitializer() {
  useEffect(() => {
    // Initialize global error handlers once on app start
    initGlobalErrorHandlers();
    logger.lifecycle('RootLayout', 'globalHandlersInitialized');
  }, []);
  return null;
}

function LoadingScreen() {
  // Use plain HTML/CSS on web to avoid Tamagui style injection issues
  if (Platform.OS === 'web') {
    return (
      <div style={{
        display: 'flex',
        height: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
      }}>
        <div style={{
          width: 40,
          height: 40,
          border: '4px solid #f3f3f3',
          borderTop: '4px solid #0066FF',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }
  return (
    <YStack flex={1} backgroundColor="#FFFFFF" alignItems="center" justifyContent="center">
      <ActivityIndicator size="large" color="#0066FF" />
    </YStack>
  );
}

export default function RootLayout() {
  const { isAuthenticated, isLoading, initialize } = useAuthStore();
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    logger.lifecycle('RootLayout', 'mount');
    initialize()
      .then(() => {
        logger.lifecycle('RootLayout', 'initialize:complete');
        setIsInitialized(true);
      })
      .catch((err) => {
        logger.error('Initialize error', err, {}, 'RootLayout');
        // Still set initialized so the app can render
        setIsInitialized(true);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debug logging for state changes
  useEffect(() => {
    logger.debug('Auth state changed', { isAuthenticated, isLoading }, 'RootLayout');
  }, [isAuthenticated, isLoading]);

  // Don't render until initialize is complete on web to prevent state issues
  if (Platform.OS === 'web' && !isInitialized && isLoading) {
    return (
      <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
        <LoadingScreen />
      </TamaguiProvider>
    );
  }

  if (isLoading) {
    logger.debug('Rendering loading screen', {}, 'RootLayout');
    return (
      <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
        <StatusBar style="dark" />
        <LoadingScreen />
      </TamaguiProvider>
    );
  }

  logger.debug('Rendering main layout', { isAuthenticated }, 'RootLayout');

  return (
    <ErrorBoundary name="RootLayout">
      <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
        <StatusBar style="dark" />
        {/* Initialize global error handlers */}
        <ErrorHandlerInitializer />
        {/* Only render notifications manager on native platforms */}
        {Platform.OS !== 'web' && <NotificationsManager />}
        <Stack screenOptions={{ headerShown: false }}>
          {isAuthenticated ? (
            <>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="call/[callId]"
                options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="ai-search"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
            </>
          ) : (
            <Stack.Screen name="(auth)" />
          )}
        </Stack>
      </TamaguiProvider>
    </ErrorBoundary>
  );
}
