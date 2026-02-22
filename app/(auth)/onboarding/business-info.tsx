import { useState } from 'react';
import { ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { YStack, XStack, Text, Input, TextArea, Button } from 'tamagui';
import { ArrowLeft } from 'lucide-react-native';
import { colors } from '../../../constants/theme';

const INDUSTRIES = [
  'Healthcare',
  'Legal',
  'Real Estate',
  'Salon & Spa',
  'Automotive',
  'Restaurant',
  'Dental',
  'Home Services',
  'Other',
];

export default function BusinessInfoScreen() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState('');
  const [industry, setIndustry] = useState('');
  const [description, setDescription] = useState('');

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
            <Text fontSize={14} color={colors.textSecondary}>Step 1 of 5</Text>
            <Text fontSize={18} fontWeight="700" color={colors.textPrimary}>
              Business Info
            </Text>
          </YStack>
        </XStack>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <YStack paddingHorizontal="$4" gap="$4" paddingTop="$2">
            {/* Business Name */}
            <YStack gap="$2">
              <Text fontSize={14} fontWeight="600" color={colors.textPrimary}>
                Business Name
              </Text>
              <Input
                value={businessName}
                onChangeText={setBusinessName}
                placeholder="e.g., Downtown Dental"
                size="$5"
                borderRadius="$3"
                borderColor={colors.border}
              />
            </YStack>

            {/* Industry */}
            <YStack gap="$2">
              <Text fontSize={14} fontWeight="600" color={colors.textPrimary}>
                Industry
              </Text>
              <XStack flexWrap="wrap" gap="$2">
                {INDUSTRIES.map((ind) => (
                  <Button
                    key={ind}
                    size="$3"
                    backgroundColor={industry === ind ? colors.primary : colors.backgroundSecondary}
                    color={industry === ind ? 'white' : colors.textPrimary}
                    borderRadius="$4"
                    fontWeight="500"
                    pressStyle={{ opacity: 0.8 }}
                    onPress={() => setIndustry(ind)}
                  >
                    {ind}
                  </Button>
                ))}
              </XStack>
            </YStack>

            {/* Description */}
            <YStack gap="$2">
              <Text fontSize={14} fontWeight="600" color={colors.textPrimary}>
                Business Description
              </Text>
              <TextArea
                value={description}
                onChangeText={setDescription}
                placeholder="Brief description of your business and services..."
                numberOfLines={4}
                size="$4"
                borderRadius="$3"
                borderColor={colors.border}
                minHeight={100}
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
              onPress={() => router.push('/(auth)/onboarding/phone-number')}
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
