import { useState, useCallback, useEffect } from 'react';
import { FlatList, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { YStack, XStack, Text, Button, Input } from 'tamagui';
import { ArrowLeft, Phone, Plus, Search, Check, Trash2, MapPin } from 'lucide-react-native';
import { colors } from '@/constants/theme';
import api from '@/services/api';
import { useAuthStore } from '@/stores/authStore';

interface PhoneNumberRecord {
  id: string;
  phone_number: string;
  label: string | null;
  is_active: boolean;
  agent_id: string | null;
  agent_name: string | null;
  created_at: string;
}

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

export default function PhoneNumbersScreen() {
  const router = useRouter();
  const { workspaceId } = useAuthStore();

  const [numbers, setNumbers] = useState<PhoneNumberRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Add number search state
  const [showSearch, setShowSearch] = useState(false);
  const [areaCode, setAreaCode] = useState('');
  const [available, setAvailable] = useState<AvailableNumber[]>([]);
  const [selectedNumber, setSelectedNumber] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [provisioning, setProvisioning] = useState(false);

  const fetchNumbers = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const response = await api.get(`/workspaces/${workspaceId}/phone-numbers`);
      setNumbers(response.data.items);
    } catch (err) {
      console.error('Failed to fetch phone numbers:', err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchNumbers();
  }, [fetchNumbers]);

  const handleSearch = async () => {
    if (areaCode.length !== 3 || !workspaceId) return;
    setSearching(true);
    setAvailable([]);
    setSelectedNumber(null);

    try {
      const response = await api.get(
        `/workspaces/${workspaceId}/phone-numbers/available`,
        { params: { area_code: areaCode } }
      );
      setAvailable(response.data.numbers);
    } catch (err: unknown) {
      Alert.alert(
        'Error',
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Search failed'
      );
    } finally {
      setSearching(false);
    }
  };

  const handleProvision = async () => {
    if (!selectedNumber || !workspaceId) return;
    setProvisioning(true);

    try {
      await api.post(`/workspaces/${workspaceId}/phone-numbers`, {
        phone_number: selectedNumber,
      });
      setShowSearch(false);
      setAreaCode('');
      setAvailable([]);
      setSelectedNumber(null);
      await fetchNumbers();
    } catch (err: unknown) {
      Alert.alert(
        'Error',
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Provisioning failed'
      );
    } finally {
      setProvisioning(false);
    }
  };

  const handleDelete = (numberId: string, phoneNumber: string) => {
    Alert.alert(
      'Release Number',
      `Are you sure you want to release ${formatPhoneNumber(phoneNumber)}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Release',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/workspaces/${workspaceId}/phone-numbers/${numberId}`);
              await fetchNumbers();
            } catch {
              Alert.alert('Error', 'Failed to release number');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <YStack flex={1} alignItems="center" justifyContent="center">
          <ActivityIndicator size="large" color={colors.primary} />
        </YStack>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {/* Header */}
      <XStack paddingHorizontal="$4" paddingVertical="$3" alignItems="center" gap="$3">
        <Button
          size="$3"
          circular
          backgroundColor="transparent"
          pressStyle={{ backgroundColor: colors.surfaceSecondary }}
          onPress={() => router.back()}
          icon={<ArrowLeft size={22} color={colors.textPrimary} />}
        />
        <Text flex={1} fontSize={18} fontWeight="700" color={colors.textPrimary}>
          Phone Numbers
        </Text>
        <Button
          size="$3"
          circular
          backgroundColor={colors.primary}
          pressStyle={{ backgroundColor: colors.primaryDark }}
          icon={<Plus size={18} color="#FFFFFF" />}
          onPress={() => setShowSearch(!showSearch)}
        />
      </XStack>

      {/* Search Panel */}
      {showSearch && (
        <YStack
          paddingHorizontal="$4"
          paddingBottom="$3"
          gap="$3"
          borderBottomWidth={1}
          borderBottomColor={colors.borderLight}
        >
          <XStack gap="$2" alignItems="center">
            <Input
              flex={1}
              value={areaCode}
              onChangeText={(text) => setAreaCode(text.replace(/\D/g, '').slice(0, 3))}
              placeholder="Area code (e.g. 212)"
              keyboardType="number-pad"
              maxLength={3}
              size="$4"
              borderRadius="$3"
              borderColor={colors.border}
            />
            <Button
              size="$4"
              backgroundColor={colors.primary}
              borderRadius="$3"
              pressStyle={{ backgroundColor: colors.primaryDark }}
              onPress={handleSearch}
              disabled={areaCode.length !== 3 || searching}
              icon={<Search size={18} color="#FFFFFF" />}
            >
              {searching ? '...' : 'Search'}
            </Button>
          </XStack>

          {available.length > 0 && (
            <YStack gap="$2" maxHeight={200}>
              {available.map((item) => {
                const isSelected = selectedNumber === item.phone_number;
                return (
                  <XStack
                    key={item.phone_number}
                    padding="$2.5"
                    backgroundColor={isSelected ? colors.primaryLight : colors.backgroundSecondary}
                    borderRadius="$3"
                    borderWidth={isSelected ? 2 : 1}
                    borderColor={isSelected ? colors.primary : colors.borderLight}
                    alignItems="center"
                    gap="$2"
                    pressStyle={{ backgroundColor: colors.primaryLight }}
                    onPress={() => setSelectedNumber(item.phone_number)}
                  >
                    {isSelected ? (
                      <Check size={16} color={colors.primary} />
                    ) : (
                      <Phone size={16} color={colors.textSecondary} />
                    )}
                    <Text flex={1} fontSize={14} fontWeight="600" color={colors.textPrimary}>
                      {formatPhoneNumber(item.phone_number)}
                    </Text>
                    {item.region ? (
                      <XStack alignItems="center" gap="$1">
                        <MapPin size={12} color={colors.textTertiary} />
                        <Text fontSize={11} color={colors.textTertiary}>{item.region}</Text>
                      </XStack>
                    ) : null}
                  </XStack>
                );
              })}
            </YStack>
          )}

          {selectedNumber && (
            <Button
              size="$4"
              backgroundColor={colors.primary}
              color="#FFFFFF"
              borderRadius="$3"
              fontWeight="600"
              pressStyle={{ backgroundColor: colors.primaryDark }}
              onPress={handleProvision}
              disabled={provisioning}
            >
              {provisioning ? 'Provisioning...' : `Get ${formatPhoneNumber(selectedNumber)}`}
            </Button>
          )}
        </YStack>
      )}

      {/* Current Numbers */}
      <FlatList
        data={numbers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <XStack
            paddingHorizontal="$4"
            paddingVertical="$3"
            alignItems="center"
            gap="$3"
          >
            <YStack
              width={40}
              height={40}
              borderRadius={20}
              backgroundColor={item.is_active ? colors.primaryLight : colors.surfaceSecondary}
              alignItems="center"
              justifyContent="center"
            >
              <Phone size={20} color={item.is_active ? colors.primary : colors.textTertiary} />
            </YStack>
            <YStack flex={1} gap="$0.5">
              <Text fontSize={15} fontWeight="600" color={colors.textPrimary}>
                {formatPhoneNumber(item.phone_number)}
              </Text>
              <Text fontSize={12} color={colors.textSecondary}>
                {item.agent_name ? `Agent: ${item.agent_name}` : 'No agent assigned'}
                {item.label ? ` · ${item.label}` : ''}
              </Text>
            </YStack>
            <XStack
              backgroundColor={item.is_active ? '#DCFCE7' : colors.surfaceSecondary}
              paddingHorizontal="$2"
              paddingVertical="$1"
              borderRadius="$2"
            >
              <Text
                fontSize={11}
                fontWeight="600"
                color={item.is_active ? '#16A34A' : colors.textTertiary}
              >
                {item.is_active ? 'Active' : 'Inactive'}
              </Text>
            </XStack>
            <Button
              size="$2"
              circular
              backgroundColor="transparent"
              pressStyle={{ backgroundColor: '#FEE2E2' }}
              icon={<Trash2 size={16} color={colors.error} />}
              onPress={() => handleDelete(item.id, item.phone_number)}
            />
          </XStack>
        )}
        ItemSeparatorComponent={() => (
          <YStack height={1} backgroundColor={colors.borderLight} marginHorizontal="$4" />
        )}
        ListEmptyComponent={
          <YStack alignItems="center" paddingVertical="$8" gap="$3">
            <YStack
              width={56}
              height={56}
              borderRadius={28}
              backgroundColor={colors.primaryLight}
              alignItems="center"
              justifyContent="center"
            >
              <Phone size={24} color={colors.primary} />
            </YStack>
            <Text fontSize={15} fontWeight="600" color={colors.textPrimary}>
              No phone numbers
            </Text>
            <Text fontSize={13} color={colors.textSecondary} textAlign="center" paddingHorizontal="$6">
              Add a phone number so your AI receptionist can receive calls
            </Text>
            <Button
              size="$4"
              backgroundColor={colors.primary}
              color="#FFFFFF"
              borderRadius="$4"
              fontWeight="600"
              pressStyle={{ backgroundColor: colors.primaryDark }}
              onPress={() => setShowSearch(true)}
              icon={<Plus size={18} color="#FFFFFF" />}
            >
              Add Number
            </Button>
          </YStack>
        }
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </SafeAreaView>
  );
}
