import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { YStack, XStack, Input, Button, Text, H1, Paragraph, Spinner } from 'tamagui';
import { UserPlus } from 'lucide-react-native';
import { useAuthStore } from '../../stores/authStore';
import { colors } from '../../constants/theme';

export default function RegisterScreen() {
  const router = useRouter();
  const register = useAuthStore((s) => s.register);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async () => {
    if (!fullName || !email || !password) {
      setError('Please fill in all fields');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await register(email, password, fullName);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Registration failed. Please try again.');
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
        <YStack alignItems="center" gap="$3" marginBottom="$4">
          <YStack
            width={64}
            height={64}
            borderRadius={16}
            backgroundColor={colors.primaryLight}
            alignItems="center"
            justifyContent="center"
          >
            <UserPlus size={32} color={colors.primary} />
          </YStack>
          <H1 textAlign="center" fontSize={28} fontWeight="700">
            Create Account
          </H1>
          <Paragraph textAlign="center" color="$colorHover" fontSize={15}>
            Set up your AI receptionist
          </Paragraph>
        </YStack>

        {error ? (
          <YStack backgroundColor="#FEF2F2" borderRadius="$3" padding="$3">
            <Text color={colors.error} fontSize={14} textAlign="center">
              {error}
            </Text>
          </YStack>
        ) : null}

        <YStack gap="$3">
          <Input
            placeholder="Full Name"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
            size="$5"
            borderRadius="$4"
          />
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
          onPress={handleRegister}
          disabled={loading}
          pressStyle={{ opacity: 0.8 }}
        >
          {loading ? <Spinner color="white" /> : 'Create Account'}
        </Button>

        <XStack justifyContent="center" gap="$2" marginTop="$2">
          <Text color="$colorHover" fontSize={14}>
            Already have an account?
          </Text>
          <Text
            color={colors.primary}
            fontSize={14}
            fontWeight="600"
            onPress={() => router.back()}
          >
            Sign In
          </Text>
        </XStack>
      </YStack>
    </KeyboardAvoidingView>
  );
}
