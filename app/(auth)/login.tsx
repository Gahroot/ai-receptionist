import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { YStack, XStack, Input, Button, Text, H1, Paragraph, Spinner } from 'tamagui';
import { Phone } from 'lucide-react-native';
import { useAuthStore } from '../../stores/authStore';
import { colors } from '../../constants/theme';

export default function LoginScreen() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await login(email, password);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: '#fff' }}
    >
      <YStack flex={1} justifyContent="center" paddingHorizontal="$6" gap="$4">
        <YStack alignItems="center" gap="$3" marginBottom="$6">
          <YStack
            width={64}
            height={64}
            borderRadius={16}
            backgroundColor={colors.primaryLight}
            alignItems="center"
            justifyContent="center"
          >
            <Phone size={32} color={colors.primary} />
          </YStack>
          <H1 textAlign="center" fontSize={28} fontWeight="700">
            AI Receptionist
          </H1>
          <Paragraph textAlign="center" color="$colorHover" fontSize={15}>
            Your 24/7 AI-powered business phone
          </Paragraph>
        </YStack>

        {error ? (
          <YStack
            backgroundColor="#FEF2F2"
            borderRadius="$3"
            padding="$3"
          >
            <Text color={colors.error} fontSize={14} textAlign="center">
              {error}
            </Text>
          </YStack>
        ) : null}

        <YStack gap="$3">
          <Input
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            size="$5"
            borderRadius="$4"
          />
          <Input
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            size="$5"
            borderRadius="$4"
          />
        </YStack>

        <Button
          size="$5"
          backgroundColor={colors.primary}
          color="white"
          borderRadius="$4"
          onPress={handleLogin}
          disabled={loading}
          pressStyle={{ opacity: 0.8 }}
        >
          {loading ? <Spinner color="white" /> : 'Sign In'}
        </Button>

        <XStack justifyContent="center" gap="$2" marginTop="$2">
          <Text color="$colorHover" fontSize={14}>
            Don't have an account?
          </Text>
          <Text
            color={colors.primary}
            fontSize={14}
            fontWeight="600"
            onPress={() => router.push('/(auth)/register')}
          >
            Sign Up
          </Text>
        </XStack>
      </YStack>
    </KeyboardAvoidingView>
  );
}
