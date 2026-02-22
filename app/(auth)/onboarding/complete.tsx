import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { YStack, Text, Button, Paragraph } from 'tamagui';
import { CheckCircle, Phone, Clock, MessageCircle } from 'lucide-react-native';
import { colors } from '../../../constants/theme';
import { useAuthStore } from '../../../stores/authStore';

interface SetupItemProps {
  icon: React.ReactNode;
  label: string;
}

function SetupItem({ icon, label }: SetupItemProps) {
  return (
    <YStack
      flexDirection="row"
      alignItems="center"
      gap="$3"
      paddingVertical="$2.5"
      paddingHorizontal="$4"
    >
      {icon}
      <Text fontSize={15} color={colors.textPrimary} flex={1}>
        {label}
      </Text>
      <CheckCircle size={20} color={colors.success} />
    </YStack>
  );
}

export default function OnboardingCompleteScreen() {
  const router = useRouter();
  const fetchUser = useAuthStore((s) => s.fetchUser);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <YStack flex={1} justifyContent="center" paddingHorizontal="$6" gap="$5">
        {/* Success Icon */}
        <YStack alignItems="center" gap="$4">
          <YStack
            width={80}
            height={80}
            borderRadius={40}
            backgroundColor="#F0FDF4"
            alignItems="center"
            justifyContent="center"
          >
            <CheckCircle size={44} color={colors.success} />
          </YStack>

          <Text fontSize={26} fontWeight="700" color={colors.textPrimary} textAlign="center">
            You&apos;re All Set!
          </Text>
          <Paragraph
            fontSize={15}
            color={colors.textSecondary}
            textAlign="center"
            lineHeight={22}
          >
            Your AI receptionist is configured and ready to start handling calls for your
            business.
          </Paragraph>
        </YStack>

        {/* Setup Summary */}
        <YStack
          borderRadius="$4"
          borderWidth={1}
          borderColor={colors.borderLight}
          overflow="hidden"
        >
          <SetupItem
            icon={<Phone size={20} color={colors.primary} />}
            label="Phone number selected"
          />
          <YStack height={1} backgroundColor={colors.borderLight} />
          <SetupItem
            icon={<MessageCircle size={20} color={colors.success} />}
            label="AI greeting configured"
          />
          <YStack height={1} backgroundColor={colors.borderLight} />
          <SetupItem
            icon={<Clock size={20} color={colors.warning} />}
            label="Business hours set"
          />
        </YStack>

        {/* Go to Dashboard */}
        <Button
          size="$5"
          backgroundColor={colors.primary}
          color="white"
          borderRadius="$4"
          fontWeight="600"
          pressStyle={{ opacity: 0.8 }}
          onPress={async () => {
            await fetchUser();
            router.replace('/(tabs)');
          }}
        >
          Go to Dashboard
        </Button>
      </YStack>
    </SafeAreaView>
  );
}
