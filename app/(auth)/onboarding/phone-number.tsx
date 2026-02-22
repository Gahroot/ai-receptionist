import { useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { YStack, XStack, Text, Input, Button } from 'tamagui';
import { ArrowLeft, Phone, ArrowRight } from 'lucide-react-native';
import { colors } from '../../../constants/theme';

export default function PhoneNumberScreen() {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState('');

  const handleContinue = () => {
    // For MVP: phone number is optional (display purposes only)
    // Real telephony via Telnyx call forwarding is a future phase
    router.push('/(auth)/onboarding/greeting');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <XStack paddingHorizontal="$4" paddingVertical="$3" alignItems="center" gap="$3">
        <Button
          size="$3"
          circular
          backgroundColor={colors.backgroundSecondary}
          pressStyle={{ backgroundColor: colors.surfaceSecondary }}
          onPress={() => router.back()}
          icon={<ArrowLeft size={20} color={colors.textPrimary} />}
        />
        <YStack flex={1}>
          <Text fontSize={14} color={colors.textSecondary}>Step 2 of 5</Text>
          <Text fontSize={18} fontWeight="700" color={colors.textPrimary}>
            Your Phone Number
          </Text>
        </YStack>
      </XStack>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <YStack paddingHorizontal="$4" gap="$4" paddingTop="$2">
          {/* Info */}
          <YStack
            padding="$4"
            backgroundColor={colors.primaryLight}
            borderRadius="$4"
            gap="$2"
          >
            <XStack alignItems="center" gap="$2">
              <Phone size={20} color={colors.primary} />
              <Text fontSize={15} fontWeight="600" color={colors.textPrimary}>
                How it works
              </Text>
            </XStack>
            <Text fontSize={14} color={colors.textSecondary} lineHeight={20}>
              Your AI receptionist will handle calls in-app. In a future update,
              you&apos;ll be able to forward your existing business number so the AI
              answers real incoming calls automatically.
            </Text>
          </YStack>

          {/* Phone number input (optional) */}
          <YStack gap="$2">
            <Text fontSize={14} fontWeight="600" color={colors.textPrimary}>
              Your Business Phone (optional)
            </Text>
            <Text fontSize={13} color={colors.textSecondary} lineHeight={18}>
              Enter your existing business phone number for display purposes.
              You can add this later in Settings.
            </Text>
            <Input
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="+1 (555) 123-4567"
              keyboardType="phone-pad"
              size="$5"
              borderRadius="$3"
              borderColor={colors.border}
            />
          </YStack>

          {/* Continue */}
          <Button
            size="$5"
            backgroundColor={colors.primary}
            color="white"
            borderRadius="$4"
            fontWeight="600"
            pressStyle={{ opacity: 0.8 }}
            onPress={handleContinue}
            marginTop="$2"
            iconAfter={<ArrowRight size={20} color="white" />}
          >
            Continue
          </Button>
        </YStack>
      </ScrollView>
    </SafeAreaView>
  );
}
