import { useState } from 'react';
import { FlatList, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { YStack, XStack, Text, Input, Button } from 'tamagui';
import { ArrowLeft, Search, Phone, Check, ArrowRight, MapPin } from 'lucide-react-native';
import { colors } from '@/constants/theme';
import api from '@/services/api';
import { useAuthStore } from '@/stores/authStore';

interface AvailableNumber {
  phone_number: string;
  region: string;
  monthly_cost: string;
}

function formatPhoneNumber(num: string): string {
  const cleaned = num.replace(/\D/g, '');
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return num;
}

export default function PhoneNumberScreen() {
  const router = useRouter();
  const { workspaceId } = useAuthStore();
  const [areaCode, setAreaCode] = useState('');
  const [numbers, setNumbers] = useState<AvailableNumber[]>([]);
  const [selectedNumber, setSelectedNumber] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (areaCode.length !== 3 || !workspaceId) return;
    setSearching(true);
    setNumbers([]);
    setSelectedNumber(null);
    setSearched(false);

    try {
      const response = await api.get(
        `/workspaces/${workspaceId}/phone-numbers/available`,
        { params: { area_code: areaCode } }
      );
      setNumbers(response.data.numbers);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to search numbers';
      Alert.alert('Error', msg);
    } finally {
      setSearching(false);
      setSearched(true);
    }
  };

  const handleProvision = async () => {
    if (!selectedNumber || !workspaceId) return;
    setProvisioning(true);

    try {
      await api.post(`/workspaces/${workspaceId}/phone-numbers`, {
        phone_number: selectedNumber,
      });
      Alert.alert(
        'Number Acquired!',
        `${formatPhoneNumber(selectedNumber)} is now your AI receptionist number.`,
        [{ text: 'Continue', onPress: () => router.push('/(auth)/onboarding/greeting') }]
      );
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to provision number';
      Alert.alert('Error', msg);
    } finally {
      setProvisioning(false);
    }
  };

  const handleSkip = () => {
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
            Choose a Phone Number
          </Text>
        </YStack>
      </XStack>

      <YStack flex={1} paddingHorizontal="$4">
        {/* Info */}
        <YStack
          padding="$3"
          backgroundColor={colors.primaryLight}
          borderRadius="$4"
          gap="$2"
          marginBottom="$4"
        >
          <XStack alignItems="center" gap="$2">
            <Phone size={18} color={colors.primary} />
            <Text fontSize={14} fontWeight="600" color={colors.textPrimary}>
              Get a dedicated number
            </Text>
          </XStack>
          <Text fontSize={13} color={colors.textSecondary} lineHeight={18}>
            Your AI receptionist will answer calls on this number. Callers can reach your business 24/7.
          </Text>
        </YStack>

        {/* Area code search */}
        <YStack gap="$2" marginBottom="$4">
          <Text fontSize={14} fontWeight="600" color={colors.textPrimary}>
            Search by Area Code
          </Text>
          <XStack gap="$2" alignItems="center">
            <Input
              flex={1}
              value={areaCode}
              onChangeText={(text) => setAreaCode(text.replace(/\D/g, '').slice(0, 3))}
              placeholder="e.g. 212, 415, 310"
              keyboardType="number-pad"
              maxLength={3}
              size="$4"
              borderRadius="$3"
              borderColor={colors.border}
            />
            <Button
              size="$4"
              backgroundColor={colors.primary}
              color="#FFFFFF"
              borderRadius="$3"
              pressStyle={{ backgroundColor: colors.primaryDark }}
              onPress={handleSearch}
              disabled={areaCode.length !== 3 || searching}
              opacity={areaCode.length !== 3 ? 0.5 : 1}
              icon={searching ? undefined : <Search size={18} color="#FFFFFF" />}
            >
              {searching ? 'Searching...' : 'Search'}
            </Button>
          </XStack>
        </YStack>

        {/* Results */}
        {searching ? (
          <YStack flex={1} alignItems="center" justifyContent="center">
            <ActivityIndicator size="large" color={colors.primary} />
            <Text fontSize={14} color={colors.textSecondary} marginTop="$3">
              Searching available numbers...
            </Text>
          </YStack>
        ) : (
          <FlatList
            data={numbers}
            keyExtractor={(item) => item.phone_number}
            renderItem={({ item }) => {
              const isSelected = selectedNumber === item.phone_number;
              return (
                <XStack
                  padding="$3"
                  marginBottom="$2"
                  backgroundColor={isSelected ? colors.primaryLight : colors.backgroundSecondary}
                  borderRadius="$3"
                  borderWidth={isSelected ? 2 : 1}
                  borderColor={isSelected ? colors.primary : colors.borderLight}
                  alignItems="center"
                  gap="$3"
                  pressStyle={{ backgroundColor: colors.primaryLight }}
                  onPress={() => setSelectedNumber(item.phone_number)}
                >
                  <YStack
                    width={40}
                    height={40}
                    borderRadius={20}
                    backgroundColor={isSelected ? colors.primary : colors.surfaceSecondary}
                    alignItems="center"
                    justifyContent="center"
                  >
                    {isSelected ? (
                      <Check size={20} color="#FFFFFF" />
                    ) : (
                      <Phone size={20} color={colors.textSecondary} />
                    )}
                  </YStack>
                  <YStack flex={1} gap="$0.5">
                    <Text
                      fontSize={16}
                      fontWeight="700"
                      color={isSelected ? colors.primary : colors.textPrimary}
                    >
                      {formatPhoneNumber(item.phone_number)}
                    </Text>
                    {item.region ? (
                      <XStack alignItems="center" gap="$1">
                        <MapPin size={12} color={colors.textTertiary} />
                        <Text fontSize={12} color={colors.textSecondary}>
                          {item.region}
                        </Text>
                      </XStack>
                    ) : null}
                  </YStack>
                  <Text fontSize={12} color={colors.textTertiary}>
                    {item.monthly_cost}/mo
                  </Text>
                </XStack>
              );
            }}
            ListEmptyComponent={
              searched && !searching ? (
                <YStack alignItems="center" paddingVertical="$6" gap="$2">
                  <Text fontSize={15} color={colors.textTertiary}>
                    No numbers available for area code {areaCode}
                  </Text>
                  <Text fontSize={13} color={colors.textTertiary}>
                    Try a different area code
                  </Text>
                </YStack>
              ) : null
            }
            contentContainerStyle={{ paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
          />
        )}
      </YStack>

      {/* Bottom buttons */}
      <YStack paddingHorizontal="$4" paddingBottom="$4" gap="$2">
        {selectedNumber && (
          <Button
            size="$5"
            backgroundColor={colors.primary}
            color="white"
            borderRadius="$4"
            fontWeight="600"
            pressStyle={{ opacity: 0.8 }}
            onPress={handleProvision}
            disabled={provisioning}
            opacity={provisioning ? 0.6 : 1}
            icon={provisioning ? undefined : <Check size={20} color="white" />}
          >
            {provisioning ? 'Provisioning...' : `Get ${formatPhoneNumber(selectedNumber)}`}
          </Button>
        )}
        <Button
          size="$4"
          backgroundColor="transparent"
          color={colors.textSecondary}
          borderRadius="$4"
          pressStyle={{ backgroundColor: colors.backgroundSecondary }}
          onPress={handleSkip}
          iconAfter={<ArrowRight size={18} color={colors.textSecondary} />}
        >
          Skip for now
        </Button>
      </YStack>
    </SafeAreaView>
  );
}
