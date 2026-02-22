import { useEffect, useState } from 'react';
import { ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { YStack, XStack, Text, Button, Switch, Separator, Spinner } from 'tamagui';
import { ArrowLeft } from 'lucide-react-native';
import { colors } from '../../../constants/theme';
import { useNotificationStore } from '../../../stores/notificationStore';
import api from '../../../services/api';

interface NotificationToggleProps {
  label: string;
  description: string;
  value: boolean;
  onToggle: (val: boolean) => void;
  disabled?: boolean;
}

function NotificationToggle({ label, description, value, onToggle, disabled }: NotificationToggleProps) {
  return (
    <XStack
      padding="$4"
      alignItems="center"
      justifyContent="space-between"
      gap="$3"
      opacity={disabled ? 0.5 : 1}
    >
      <YStack flex={1} gap="$1">
        <Text fontSize={15} fontWeight="600" color={colors.textPrimary}>
          {label}
        </Text>
        <Text fontSize={13} color={colors.textSecondary}>
          {description}
        </Text>
      </YStack>
      <Switch
        size="$3"
        checked={value}
        onCheckedChange={onToggle}
        disabled={disabled}
        backgroundColor={value ? colors.primary : colors.borderLight}
      >
        <Switch.Thumb backgroundColor="white" />
      </Switch>
    </XStack>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { preferences, isLoadingPrefs, fetchPreferences, updatePreference } =
    useNotificationStore();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPreferences();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/settings/users/me/notifications', {
        notification_push: preferences.pushEnabled,
        notification_sms: preferences.smsAlerts,
        notification_email: preferences.emailAlerts,
      });
      Alert.alert('Saved', 'Notification preferences updated');
    } catch {
      Alert.alert('Error', 'Failed to save notification preferences');
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
          Notifications
        </Text>
      </XStack>

      {isLoadingPrefs ? (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Spinner size="large" color={colors.primary} />
        </YStack>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <YStack
            marginHorizontal="$4"
            borderRadius="$4"
            borderWidth={1}
            borderColor={colors.borderLight}
            overflow="hidden"
          >
            <NotificationToggle
              label="Push Notifications"
              description="Receive push notifications on your device"
              value={preferences.pushEnabled}
              onToggle={(val) => updatePreference('pushEnabled', val)}
            />
            <Separator borderColor={colors.borderLight} />
            <NotificationToggle
              label="SMS Alerts"
              description="Get notified via SMS for new messages"
              value={preferences.smsAlerts}
              onToggle={(val) => updatePreference('smsAlerts', val)}
            />
            <Separator borderColor={colors.borderLight} />
            <NotificationToggle
              label="Email Alerts"
              description="Get notified via email for voicemails and updates"
              value={preferences.emailAlerts}
              onToggle={(val) => updatePreference('emailAlerts', val)}
            />
          </YStack>

          <YStack paddingHorizontal="$4" marginTop="$4">
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
              {saving ? <Spinner color="white" /> : 'Save Preferences'}
            </Button>
          </YStack>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
