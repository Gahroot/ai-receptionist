import { useState, useEffect } from 'react';
import { ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { YStack, XStack, Text, Input, Button, Switch, Separator, Spinner } from 'tamagui';
import { ArrowLeft } from 'lucide-react-native';
import { colors } from '../../../constants/theme';
import api from '../../../services/api';
import { useAuthStore } from '../../../stores/authStore';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface DaySchedule {
  enabled: boolean;
  open: string;
  close: string;
}

const DEFAULT_SCHEDULE: Record<string, DaySchedule> = {
  Monday: { enabled: true, open: '9:00 AM', close: '5:00 PM' },
  Tuesday: { enabled: true, open: '9:00 AM', close: '5:00 PM' },
  Wednesday: { enabled: true, open: '9:00 AM', close: '5:00 PM' },
  Thursday: { enabled: true, open: '9:00 AM', close: '5:00 PM' },
  Friday: { enabled: true, open: '9:00 AM', close: '5:00 PM' },
  Saturday: { enabled: false, open: '10:00 AM', close: '2:00 PM' },
  Sunday: { enabled: false, open: '10:00 AM', close: '2:00 PM' },
};

export default function BusinessHoursScreen() {
  const router = useRouter();
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const [is24_7, setIs24_7] = useState(false);
  const [schedule, setSchedule] = useState<Record<string, DaySchedule>>(DEFAULT_SCHEDULE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    const loadHours = async () => {
      try {
        const res = await api.get(`/settings/workspaces/${workspaceId}/business-hours`);
        const data = res.data;
        if (data.is_24_7 != null) setIs24_7(data.is_24_7);
        if (data.schedule) setSchedule(data.schedule);
      } catch {
        // Use defaults on error
      } finally {
        setLoading(false);
      }
    };
    loadHours();
  }, [workspaceId]);

  const updateDay = (day: string, field: keyof DaySchedule, value: string | boolean) => {
    setSchedule((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  };

  const handleSave = async () => {
    if (!workspaceId) return;
    setSaving(true);
    try {
      await api.put(`/settings/workspaces/${workspaceId}/business-hours`, {
        is_24_7: is24_7,
        schedule,
      });
      Alert.alert('Saved', 'Business hours updated successfully');
    } catch {
      Alert.alert('Error', 'Failed to save business hours');
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
          Business Hours
        </Text>
      </XStack>

      {loading ? (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Spinner size="large" color={colors.primary} />
        </YStack>
      ) : (
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* 24/7 Toggle */}
        <XStack
          marginHorizontal="$4"
          padding="$4"
          backgroundColor={colors.backgroundSecondary}
          borderRadius="$4"
          alignItems="center"
          justifyContent="space-between"
          marginBottom="$4"
        >
          <YStack gap="$1">
            <Text fontSize={16} fontWeight="600" color={colors.textPrimary}>
              Available 24/7
            </Text>
            <Text fontSize={13} color={colors.textSecondary}>
              AI answers calls at all times
            </Text>
          </YStack>
          <Switch
            size="$3"
            checked={is24_7}
            onCheckedChange={setIs24_7}
            backgroundColor={is24_7 ? colors.primary : colors.borderLight}
          >
            <Switch.Thumb backgroundColor="white" />
          </Switch>
        </XStack>

        {/* Day Schedule */}
        {!is24_7 && (
          <YStack
            marginHorizontal="$4"
            borderRadius="$4"
            borderWidth={1}
            borderColor={colors.borderLight}
            overflow="hidden"
          >
            {DAYS.map((day, idx) => (
              <YStack key={day}>
                {idx > 0 && <Separator borderColor={colors.borderLight} />}
                <YStack padding="$3" gap="$2">
                  <XStack alignItems="center" justifyContent="space-between">
                    <Text fontSize={15} fontWeight="600" color={colors.textPrimary}>
                      {day}
                    </Text>
                    <Switch
                      size="$2"
                      checked={schedule[day].enabled}
                      onCheckedChange={(val) => updateDay(day, 'enabled', val)}
                      backgroundColor={schedule[day].enabled ? colors.primary : colors.borderLight}
                    >
                      <Switch.Thumb backgroundColor="white" />
                    </Switch>
                  </XStack>
                  {schedule[day].enabled && (
                    <XStack gap="$2" alignItems="center">
                      <Input
                        flex={1}
                        size="$3"
                        value={schedule[day].open}
                        onChangeText={(val) => updateDay(day, 'open', val)}
                        borderRadius="$3"
                        borderColor={colors.border}
                        textAlign="center"
                      />
                      <Text fontSize={14} color={colors.textSecondary}>to</Text>
                      <Input
                        flex={1}
                        size="$3"
                        value={schedule[day].close}
                        onChangeText={(val) => updateDay(day, 'close', val)}
                        borderRadius="$3"
                        borderColor={colors.border}
                        textAlign="center"
                      />
                    </XStack>
                  )}
                </YStack>
              </YStack>
            ))}
          </YStack>
        )}

        {/* Save */}
        <YStack paddingHorizontal="$4" marginTop="$5">
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
