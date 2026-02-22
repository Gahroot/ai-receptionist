import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { TamaguiProvider } from 'tamagui';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../stores/authStore';
import { useNotifications } from '../hooks/useNotifications';
import tamaguiConfig from '../tamagui.config';

export default function RootLayout() {
  const { isAuthenticated, isLoading, initialize } = useAuthStore();

  useNotifications();

  useEffect(() => {
    initialize();
  }, []);

  if (isLoading) {
    return null;
  }

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <StatusBar style="dark" />
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
  );
}
