import { useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { YStack, XStack, Text, Button, Switch, Separator } from 'tamagui';
import { ArrowLeft } from 'lucide-react-native';
import { colors } from '../../../constants/theme';

interface NotificationToggleProps {
  label: string;
  description: string;
  value: boolean;
  onToggle: (val: boolean) => void;
}

function NotificationToggle({ label, description, value, onToggle }: NotificationToggleProps) {
  return (
    <XStack padding="$4" alignItems="center" justifyContent="space-between" gap="$3">
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
        backgroundColor={value ? colors.primary : colors.borderLight}
      >
        <Switch.Thumb backgroundColor="white" />
      </Switch>
    </XStack>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [callAlerts, setCallAlerts] = useState(true);
  const [messageAlerts, setMessageAlerts] = useState(true);
  const [voicemailAlerts, setVoicemailAlerts] = useState(true);

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
            value={pushEnabled}
            onToggle={setPushEnabled}
          />
          <Separator borderColor={colors.borderLight} />
          <NotificationToggle
            label="Call Alerts"
            description="Get notified when calls come in or are missed"
            value={callAlerts}
            onToggle={setCallAlerts}
          />
          <Separator borderColor={colors.borderLight} />
          <NotificationToggle
            label="Message Alerts"
            description="Get notified for new text messages"
            value={messageAlerts}
            onToggle={setMessageAlerts}
          />
          <Separator borderColor={colors.borderLight} />
          <NotificationToggle
            label="Voicemail Alerts"
            description="Get notified when a voicemail is received"
            value={voicemailAlerts}
            onToggle={setVoicemailAlerts}
          />
        </YStack>
      </ScrollView>
    </SafeAreaView>
  );
}
