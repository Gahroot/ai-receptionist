import { useState, useEffect } from 'react';
import { ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { YStack, XStack, Text, Input, Button, Switch, Spinner } from 'tamagui';
import { ArrowLeft, Check } from 'lucide-react-native';
import { colors } from '../../../constants/theme';
import api from '../../../services/api';
import { useAuthStore } from '../../../stores/authStore';

const FORWARD_MODES = [
  { id: 'always', label: 'Always', description: 'Forward all calls immediately' },
  { id: 'busy', label: 'When Busy', description: 'Forward when the line is busy' },
  { id: 'no_answer', label: 'No Answer', description: 'Forward after no answer (30 seconds)' },
  { id: 'after_hours', label: 'After Hours', description: 'Forward outside business hours' },
];

export default function CallForwardingScreen() {
  const router = useRouter();
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const [enabled, setEnabled] = useState(false);
  const [forwardTo, setForwardTo] = useState('');
  const [mode, setMode] = useState('no_answer');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    const loadForwarding = async () => {
      try {
        const res = await api.get(`/settings/workspaces/${workspaceId}/call-forwarding`);
        const data = res.data;
        if (data.enabled != null) setEnabled(data.enabled);
        if (data.forward_to) setForwardTo(data.forward_to);
        if (data.mode) setMode(data.mode);
      } catch {
        // Use defaults on error
      } finally {
        setLoading(false);
      }
    };
    loadForwarding();
  }, [workspaceId]);

  const handleSave = async () => {
    if (!workspaceId) return;
    setSaving(true);
    try {
      await api.put(`/settings/workspaces/${workspaceId}/call-forwarding`, {
        enabled,
        forward_to: forwardTo,
        mode,
      });
      Alert.alert('Saved', 'Call forwarding settings updated');
    } catch {
      Alert.alert('Error', 'Failed to save call forwarding settings');
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
          Call Forwarding
        </Text>
      </XStack>

      {loading ? (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Spinner size="large" color={colors.primary} />
        </YStack>
      ) : (
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Enable Toggle */}
        <XStack
          marginHorizontal="$4"
          padding="$4"
          backgroundColor={colors.backgroundSecondary}
          borderRadius="$4"
          alignItems="center"
          justifyContent="space-between"
          marginBottom="$5"
        >
          <YStack gap="$1">
            <Text fontSize={16} fontWeight="600" color={colors.textPrimary}>
              Enable Forwarding
            </Text>
            <Text fontSize={13} color={colors.textSecondary}>
              Redirect calls to another number
            </Text>
          </YStack>
          <Switch
            size="$3"
            checked={enabled}
            onCheckedChange={setEnabled}
            backgroundColor={enabled ? colors.primary : colors.borderLight}
          >
            <Switch.Thumb backgroundColor="white" />
          </Switch>
        </XStack>

        {enabled && (
          <>
            {/* Forward To */}
            <YStack paddingHorizontal="$4" gap="$2" marginBottom="$5">
              <Text fontSize={16} fontWeight="600" color={colors.textPrimary}>
                Forward To
              </Text>
              <Input
                value={forwardTo}
                onChangeText={setForwardTo}
                placeholder="+1 (555) 000-0000"
                keyboardType="phone-pad"
                size="$5"
                borderRadius="$3"
                borderColor={colors.border}
              />
            </YStack>

            {/* Mode Selection */}
            <YStack paddingHorizontal="$4" gap="$3" marginBottom="$5">
              <Text fontSize={16} fontWeight="600" color={colors.textPrimary}>
                Forward Mode
              </Text>
              <YStack gap="$2">
                {FORWARD_MODES.map((m) => (
                  <XStack
                    key={m.id}
                    padding="$3"
                    borderRadius="$3"
                    borderWidth={2}
                    borderColor={mode === m.id ? colors.primary : colors.borderLight}
                    backgroundColor={mode === m.id ? colors.primaryLight : colors.background}
                    alignItems="center"
                    gap="$3"
                    pressStyle={{ backgroundColor: colors.backgroundSecondary }}
                    onPress={() => setMode(m.id)}
                  >
                    <YStack flex={1} gap="$1">
                      <Text fontSize={15} fontWeight="600" color={colors.textPrimary}>
                        {m.label}
                      </Text>
                      <Text fontSize={13} color={colors.textSecondary}>
                        {m.description}
                      </Text>
                    </YStack>
                    {mode === m.id && <Check size={20} color={colors.primary} />}
                  </XStack>
                ))}
              </YStack>
            </YStack>
          </>
        )}

        {/* Save */}
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
