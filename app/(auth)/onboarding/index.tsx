import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { YStack, Text, Button, Paragraph } from 'tamagui';
import { Bot } from 'lucide-react-native';
import { colors } from '../../../constants/theme';

export default function OnboardingWelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <YStack flex={1} justifyContent="center" alignItems="center" paddingHorizontal="$6" gap="$5">
        <YStack
          width={80}
          height={80}
          borderRadius={20}
          backgroundColor={colors.primaryLight}
          alignItems="center"
          justifyContent="center"
        >
          <Bot size={40} color={colors.primary} />
        </YStack>

        <YStack gap="$3" alignItems="center">
          <Text fontSize={26} fontWeight="700" color={colors.textPrimary} textAlign="center">
            Your AI Receptionist is Ready
          </Text>
          <Paragraph
            fontSize={15}
            color={colors.textSecondary}
            textAlign="center"
            lineHeight={22}
          >
            Let&apos;s set up your business so your AI can start answering calls, booking
            appointments, and helping your customers.
          </Paragraph>
        </YStack>

        <Button
          size="$5"
          backgroundColor={colors.primary}
          color="white"
          borderRadius="$4"
          fontWeight="600"
          width="100%"
          pressStyle={{ opacity: 0.8 }}
          onPress={() => router.push('/(auth)/onboarding/business-info')}
        >
          Get Started
        </Button>
      </YStack>
    </SafeAreaView>
  );
}
