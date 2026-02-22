import { useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { YStack, XStack, Text, Input, Button } from 'tamagui';
import { ArrowLeft, Check, Phone } from 'lucide-react-native';
import { colors } from '../../../constants/theme';

const MOCK_NUMBERS = [
  { number: '+1 (555) 100-2001', area: 'New York, NY' },
  { number: '+1 (555) 100-2002', area: 'New York, NY' },
  { number: '+1 (555) 200-3001', area: 'Los Angeles, CA' },
  { number: '+1 (555) 200-3002', area: 'Los Angeles, CA' },
  { number: '+1 (555) 300-4001', area: 'Chicago, IL' },
];

export default function PhoneNumberScreen() {
  const router = useRouter();
  const [areaCode, setAreaCode] = useState('');
  const [searched, setSearched] = useState(false);
  const [selectedNumber, setSelectedNumber] = useState('');

  const handleSearch = () => {
    setSearched(true);
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
            Phone Number
          </Text>
        </YStack>
      </XStack>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <YStack paddingHorizontal="$4" gap="$4" paddingTop="$2">
          <Text fontSize={14} color={colors.textSecondary} lineHeight={20}>
            Choose a phone number for your AI receptionist. Customers will call this number to
            reach your business.
          </Text>

          {/* Area Code Search */}
          <YStack gap="$2">
            <Text fontSize={14} fontWeight="600" color={colors.textPrimary}>
              Area Code (optional)
            </Text>
            <XStack gap="$2">
              <Input
                flex={1}
                value={areaCode}
                onChangeText={setAreaCode}
                placeholder="e.g., 555"
                keyboardType="number-pad"
                maxLength={3}
                size="$5"
                borderRadius="$3"
                borderColor={colors.border}
              />
              <Button
                size="$5"
                backgroundColor={colors.primary}
                color="white"
                borderRadius="$3"
                fontWeight="600"
                pressStyle={{ opacity: 0.8 }}
                onPress={handleSearch}
              >
                Search
              </Button>
            </XStack>
          </YStack>

          {/* Available Numbers */}
          {searched && (
            <YStack gap="$2">
              <Text fontSize={14} fontWeight="600" color={colors.textPrimary}>
                Available Numbers
              </Text>
              {MOCK_NUMBERS.map((item) => (
                <XStack
                  key={item.number}
                  padding="$3"
                  borderRadius="$3"
                  borderWidth={2}
                  borderColor={selectedNumber === item.number ? colors.primary : colors.borderLight}
                  backgroundColor={selectedNumber === item.number ? colors.primaryLight : colors.background}
                  alignItems="center"
                  gap="$3"
                  pressStyle={{ backgroundColor: colors.backgroundSecondary }}
                  onPress={() => setSelectedNumber(item.number)}
                >
                  <YStack
                    width={40}
                    height={40}
                    borderRadius={20}
                    backgroundColor={
                      selectedNumber === item.number ? colors.primary : colors.backgroundSecondary
                    }
                    alignItems="center"
                    justifyContent="center"
                  >
                    <Phone
                      size={18}
                      color={selectedNumber === item.number ? '#FFFFFF' : colors.textSecondary}
                    />
                  </YStack>
                  <YStack flex={1} gap="$1">
                    <Text fontSize={16} fontWeight="600" color={colors.textPrimary}>
                      {item.number}
                    </Text>
                    <Text fontSize={13} color={colors.textSecondary}>
                      {item.area}
                    </Text>
                  </YStack>
                  {selectedNumber === item.number && <Check size={20} color={colors.primary} />}
                </XStack>
              ))}
            </YStack>
          )}

          {/* Continue */}
          <Button
            size="$5"
            backgroundColor={colors.primary}
            color="white"
            borderRadius="$4"
            fontWeight="600"
            pressStyle={{ opacity: 0.8 }}
            onPress={() => router.push('/(auth)/onboarding/greeting')}
            disabled={!selectedNumber && searched}
            opacity={!selectedNumber && searched ? 0.5 : 1}
            marginTop="$2"
          >
            Continue
          </Button>
        </YStack>
      </ScrollView>
    </SafeAreaView>
  );
}
