import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="onboarding/index" />
      <Stack.Screen name="onboarding/business-info" />
      <Stack.Screen name="onboarding/phone-number" />
      <Stack.Screen name="onboarding/greeting" />
      <Stack.Screen name="onboarding/business-hours" />
      <Stack.Screen name="onboarding/complete" />
    </Stack>
  );
}
