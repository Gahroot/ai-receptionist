import { useState, useEffect } from 'react';
import { ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { YStack, XStack, Text, TextArea, Button, Spinner, Slider } from 'tamagui';
import { ArrowLeft, Check } from 'lucide-react-native';
import { colors } from '../../../constants/theme';
import api from '../../../services/api';
import { useAuthStore } from '../../../stores/authStore';
import type { CallScopeSettings } from '../../../lib/types';

const SCOPE_OPTIONS: { id: CallScopeSettings['scope']; label: string; description: string }[] = [
  { id: 'everyone', label: 'Everyone', description: 'AI answers all incoming calls' },
  { id: 'unknown_only', label: 'Unknown Callers Only', description: 'AI only answers calls from numbers not in contacts' },
  { id: 'contacts_only', label: 'Saved Contacts Only', description: 'AI only answers calls from saved contacts' },
  { id: 'disabled', label: 'No One (Disabled)', description: "AI doesn't answer any calls" },
];

export default function CallScopeScreen() {
  const router = useRouter();
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const [scope, setScope] = useState<CallScopeSettings['scope']>('everyone');
  const [ringCount, setRingCount] = useState(3);
  const [endingMessage, setEndingMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    const loadSettings = async () => {
      try {
        const res = await api.get<CallScopeSettings>(`/settings/workspaces/${workspaceId}/call-scope`);
        const data = res.data;
        if (data.scope) setScope(data.scope);
        if (data.ring_count) setRingCount(data.ring_count);
        if (data.ending_message) setEndingMessage(data.ending_message);
      } catch {
        // Use defaults on 404 or error
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, [workspaceId]);

  const handleSave = async () => {
    if (!workspaceId) return;
    setSaving(true);
    try {
      await api.put(`/settings/workspaces/${workspaceId}/call-scope`, {
        scope,
        ring_count: ringCount,
        ending_message: endingMessage,
      });
      Alert.alert('Saved', 'Call scope settings updated');
    } catch {
      Alert.alert('Error', 'Failed to save call scope settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
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
        <Text fontSize={20} fontWeight="700" color={colors.textPrimary}>
          Call Scope
        </Text>
      </XStack>

      {loading ? (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Spinner size="large" color={colors.primary} />
        </YStack>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {/* Scope Selection */}
          <YStack paddingHorizontal="$4" gap="$3" marginBottom="$5">
            <Text fontSize={16} fontWeight="600" color={colors.textPrimary}>
              Who should AI answer?
            </Text>
            <YStack gap="$2">
              {SCOPE_OPTIONS.map((option) => (
                <XStack
                  key={option.id}
                  padding="$3"
                  borderRadius="$3"
                  borderWidth={2}
                  borderColor={scope === option.id ? colors.primary : colors.borderLight}
                  backgroundColor={scope === option.id ? colors.primaryLight : colors.background}
                  alignItems="center"
                  gap="$3"
                  pressStyle={{ backgroundColor: colors.backgroundSecondary }}
                  onPress={() => setScope(option.id)}
                >
                  <YStack flex={1} gap="$1">
                    <Text fontSize={15} fontWeight="600" color={colors.textPrimary}>
                      {option.label}
                    </Text>
                    <Text fontSize={13} color={colors.textSecondary}>
                      {option.description}
                    </Text>
                  </YStack>
                  {scope === option.id && <Check size={20} color={colors.primary} />}
                </XStack>
              ))}
            </YStack>
          </YStack>

          {/* Rings Before Pickup */}
          <YStack paddingHorizontal="$4" gap="$2" marginBottom="$5">
            <XStack justifyContent="space-between" alignItems="center">
              <Text fontSize={16} fontWeight="600" color={colors.textPrimary}>
                Rings Before Pickup
              </Text>
              <Text fontSize={15} fontWeight="600" color={colors.primary}>
                {ringCount}
              </Text>
            </XStack>
            <Text fontSize={13} color={colors.textSecondary}>
              How many times the phone rings before AI picks up
            </Text>
            <Slider
              value={[ringCount]}
              onValueChange={([val]) => setRingCount(Math.round(val))}
              min={1}
              max={10}
              step={1}
              size="$4"
            >
              <Slider.Track backgroundColor={colors.borderLight}>
                <Slider.TrackActive backgroundColor={colors.primary} />
              </Slider.Track>
              <Slider.Thumb index={0} circular size="$2" backgroundColor={colors.primary} />
            </Slider>
            <XStack justifyContent="space-between">
              <Text fontSize={12} color={colors.textTertiary}>1 ring</Text>
              <Text fontSize={12} color={colors.textTertiary}>10 rings</Text>
            </XStack>
          </YStack>

          {/* Ending Message */}
          <YStack paddingHorizontal="$4" gap="$2" marginBottom="$6">
            <Text fontSize={16} fontWeight="600" color={colors.textPrimary}>
              Ending Message
            </Text>
            <Text fontSize={13} color={colors.textSecondary}>
              What the AI says before ending a call
            </Text>
            <TextArea
              value={endingMessage}
              onChangeText={setEndingMessage}
              placeholder="Thank you for calling, have a great day!"
              numberOfLines={3}
              size="$4"
              borderRadius="$3"
              borderColor={colors.border}
              minHeight={80}
            />
          </YStack>

          {/* Save Button */}
          <YStack paddingHorizontal="$4">
            <Button
              size="$5"
              backgroundColor={colors.primary}
              color="white"
              borderRadius="$4"
              fontWeight="600"
              onPress={handleSave}
              disabled={saving}
              pressStyle={{ opacity: 0.8 }}
            >
              {saving ? <Spinner color="white" /> : 'Save Changes'}
            </Button>
          </YStack>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
