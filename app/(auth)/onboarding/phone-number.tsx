import { useState } from 'react';
import { ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { YStack, XStack, Text, Input, Button } from 'tamagui';
import { ArrowLeft, Check, Phone } from 'lucide-react-native';
import { colors } from '../../../constants/theme';
import api from '../../../services/api';
import { useAuthStore } from '../../../stores/authStore';

interface PhoneNumberResult {
  phone_number: string;
  friendly_name?: string;
  locality?: string;
  region?: string;
}

export default function PhoneNumberScreen() {
  const router = useRouter();
  const { workspaceId } = useAuthStore();
  const [areaCode, setAreaCode] = useState('');
  const [numbers, setNumbers] = useState<PhoneNumberResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [selectedNumber, setSelectedNumber] = useState('');

  const handleSearch = async () => {
    if (!workspaceId) {
      Alert.alert('Error', 'No workspace found. Please go back and set up your business first.');
      return;
    }
    setSearching(true);
    setSelectedNumber('');
    try {
      const res = await api.post(`/workspaces/${workspaceId}/phone-numbers/search`, {
        country: 'US',
        area_code: areaCode || undefined,
        limit: 10,
      });
      const data = res.data;
      setNumbers(Array.isArray(data) ? data : data.items || []);
      setSearched(true);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || 'Failed to search for numbers.');
    } finally {
      setSearching(false);
    }
  };

  const handleContinue = async () => {
    if (!selectedNumber) return;
    if (!workspaceId) {
      Alert.alert('Error', 'No workspace found.');
      return;
    }
    setPurchasing(true);
    try {
      await api.post(`/workspaces/${workspaceId}/phone-numbers/purchase`, {
        phone_number: selectedNumber,
      });
      router.push('/(auth)/onboarding/greeting');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || 'Failed to purchase number.');
    } finally {
      setPurchasing(false);
    }
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
                disabled={searching}
                opacity={searching ? 0.6 : 1}
              >
                {searching ? 'Searching...' : 'Search'}
              </Button>
            </XStack>
          </YStack>

          {/* Loading indicator */}
          {searching && (
            <YStack alignItems="center" paddingVertical="$4">
              <ActivityIndicator size="large" color={colors.primary} />
            </YStack>
          )}

          {/* Available Numbers */}
          {searched && !searching && (
            <YStack gap="$2">
              <Text fontSize={14} fontWeight="600" color={colors.textPrimary}>
                Available Numbers
              </Text>
              {numbers.length === 0 ? (
                <Text fontSize={14} color={colors.textSecondary} paddingVertical="$2">
                  No numbers found. Try a different area code.
                </Text>
              ) : (
                numbers.map((item) => (
                  <XStack
                    key={item.phone_number}
                    padding="$3"
                    borderRadius="$3"
                    borderWidth={2}
                    borderColor={selectedNumber === item.phone_number ? colors.primary : colors.borderLight}
                    backgroundColor={selectedNumber === item.phone_number ? colors.primaryLight : colors.background}
                    alignItems="center"
                    gap="$3"
                    pressStyle={{ backgroundColor: colors.backgroundSecondary }}
                    onPress={() => setSelectedNumber(item.phone_number)}
                  >
                    <YStack
                      width={40}
                      height={40}
                      borderRadius={20}
                      backgroundColor={
                        selectedNumber === item.phone_number ? colors.primary : colors.backgroundSecondary
                      }
                      alignItems="center"
                      justifyContent="center"
                    >
                      <Phone
                        size={18}
                        color={selectedNumber === item.phone_number ? '#FFFFFF' : colors.textSecondary}
                      />
                    </YStack>
                    <YStack flex={1} gap="$1">
                      <Text fontSize={16} fontWeight="600" color={colors.textPrimary}>
                        {item.friendly_name || item.phone_number}
                      </Text>
                      {(item.locality || item.region) && (
                        <Text fontSize={13} color={colors.textSecondary}>
                          {[item.locality, item.region].filter(Boolean).join(', ')}
                        </Text>
                      )}
                    </YStack>
                    {selectedNumber === item.phone_number && <Check size={20} color={colors.primary} />}
                  </XStack>
                ))
              )}
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
            onPress={handleContinue}
            disabled={(searched && !selectedNumber) || purchasing}
            opacity={(searched && !selectedNumber) || purchasing ? 0.5 : 1}
            marginTop="$2"
          >
            {purchasing ? 'Purchasing...' : 'Continue'}
          </Button>
        </YStack>
      </ScrollView>
    </SafeAreaView>
  );
}
