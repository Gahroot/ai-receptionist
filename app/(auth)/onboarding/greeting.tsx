import { useState } from 'react';
import { ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { YStack, XStack, Text, TextArea, Button } from 'tamagui';
import { ArrowLeft, Volume2 } from 'lucide-react-native';
import { colors } from '../../../constants/theme';

const DEFAULT_GREETING =
  "Hello! Thank you for calling. I'm your AI receptionist. How can I help you today? I can schedule appointments, answer questions about our services, or connect you with a team member.";

export default function GreetingScreen() {
  const router = useRouter();
  const [greeting, setGreeting] = useState(DEFAULT_GREETING);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
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
            <Text fontSize={14} color={colors.textSecondary}>Step 3 of 5</Text>
            <Text fontSize={18} fontWeight="700" color={colors.textPrimary}>
              AI Greeting
            </Text>
          </YStack>
        </XStack>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <YStack paddingHorizontal="$4" gap="$4" paddingTop="$2">
            <Text fontSize={14} color={colors.textSecondary} lineHeight={20}>
              Customize what your AI receptionist says when it first answers a call. Make it
              sound natural and welcoming.
            </Text>

            <YStack gap="$2">
              <Text fontSize={14} fontWeight="600" color={colors.textPrimary}>
                Greeting Message
              </Text>
              <TextArea
                value={greeting}
                onChangeText={setGreeting}
                placeholder="Enter your greeting..."
                numberOfLines={6}
                size="$4"
                borderRadius="$3"
                borderColor={colors.border}
                minHeight={150}
              />
              <Text fontSize={12} color={colors.textTertiary}>
                {greeting.length} characters
              </Text>
            </YStack>

            {/* Preview Button */}
            <Button
              size="$4"
              backgroundColor={colors.backgroundSecondary}
              color={colors.textPrimary}
              borderRadius="$4"
              fontWeight="600"
              borderWidth={1}
              borderColor={colors.border}
              icon={<Volume2 size={18} color={colors.textPrimary} />}
              pressStyle={{ backgroundColor: colors.surfaceSecondary }}
              onPress={() => {
                // Placeholder - would play TTS preview
              }}
            >
              Preview Voice
            </Button>

            {/* Continue */}
            <Button
              size="$5"
              backgroundColor={colors.primary}
              color="white"
              borderRadius="$4"
              fontWeight="600"
              pressStyle={{ opacity: 0.8 }}
              onPress={() => router.push('/(auth)/onboarding/business-hours')}
              marginTop="$2"
            >
              Continue
            </Button>
          </YStack>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
