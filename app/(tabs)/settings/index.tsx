import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { YStack, XStack, Text, Button, Separator } from 'tamagui';
import {
  Bot,
  ShieldCheck,
  BookOpen,
  Clock,
  Phone,
  PhoneForwarded,
  Bell,
  User,
  ChevronRight,
  LogOut,
} from 'lucide-react-native';
import { useAuthStore } from '../../../stores/authStore';
import { colors } from '../../../constants/theme';

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}

function MenuItem({ icon, label, onPress }: MenuItemProps) {
  return (
    <XStack
      paddingVertical="$3.5"
      paddingHorizontal="$4"
      alignItems="center"
      gap="$3"
      pressStyle={{ backgroundColor: colors.backgroundSecondary }}
      onPress={onPress}
    >
      {icon}
      <Text flex={1} fontSize={16} color={colors.textPrimary}>
        {label}
      </Text>
      <ChevronRight size={20} color={colors.textTertiary} />
    </XStack>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const initials = user?.full_name
    ? user.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : 'U';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <YStack paddingHorizontal="$4" paddingTop="$2" paddingBottom="$4">
          <Text fontSize={26} fontWeight="700" color={colors.textPrimary}>
            Settings
          </Text>
        </YStack>

        {/* Profile Card */}
        <XStack
          marginHorizontal="$4"
          padding="$4"
          backgroundColor={colors.backgroundSecondary}
          borderRadius="$4"
          alignItems="center"
          gap="$3"
          marginBottom="$5"
        >
          <YStack
            width={52}
            height={52}
            borderRadius={26}
            backgroundColor={colors.primary}
            alignItems="center"
            justifyContent="center"
          >
            <Text fontSize={18} fontWeight="700" color="#FFFFFF">
              {initials}
            </Text>
          </YStack>
          <YStack flex={1} gap="$1">
            <Text fontSize={17} fontWeight="600" color={colors.textPrimary}>
              {user?.full_name || 'User'}
            </Text>
            <Text fontSize={14} color={colors.textSecondary}>
              {user?.email || ''}
            </Text>
          </YStack>
        </XStack>

        {/* Menu Items */}
        <YStack
          marginHorizontal="$4"
          backgroundColor={colors.background}
          borderRadius="$4"
          borderWidth={1}
          borderColor={colors.borderLight}
          overflow="hidden"
        >
          <MenuItem
            icon={<Bot size={22} color={colors.primary} />}
            label="AI Receptionist"
            onPress={() => router.push('/(tabs)/settings/ai-config')}
          />
          <Separator borderColor={colors.borderLight} />
          <MenuItem
            icon={<ShieldCheck size={22} color={colors.success} />}
            label="Call Scope"
            onPress={() => router.push('/(tabs)/settings/call-scope')}
          />
          <Separator borderColor={colors.borderLight} />
          <MenuItem
            icon={<BookOpen size={22} color="#10B981" />}
            label="Knowledge Base"
            onPress={() => router.push('/(tabs)/settings/knowledge-base')}
          />
          <Separator borderColor={colors.borderLight} />
          <MenuItem
            icon={<Clock size={22} color={colors.warning} />}
            label="Business Hours"
            onPress={() => router.push('/(tabs)/settings/business-hours')}
          />
          <Separator borderColor={colors.borderLight} />
          <MenuItem
            icon={<PhoneForwarded size={22} color={colors.success} />}
            label="Call Forwarding"
            onPress={() => router.push('/(tabs)/settings/call-forwarding')}
          />
          <Separator borderColor={colors.borderLight} />
          <MenuItem
            icon={<Phone size={22} color={colors.primary} />}
            label="Phone Numbers"
            onPress={() => router.push('/(tabs)/settings/phone-numbers')}
          />
          <Separator borderColor={colors.borderLight} />
          <MenuItem
            icon={<Bell size={22} color={colors.secondary} />}
            label="Notifications"
            onPress={() => router.push('/(tabs)/settings/notifications')}
          />
          <Separator borderColor={colors.borderLight} />
          <MenuItem
            icon={<User size={22} color={colors.textSecondary} />}
            label="Account"
            onPress={() => router.push('/(tabs)/settings/account')}
          />
        </YStack>

        {/* Logout */}
        <YStack marginHorizontal="$4" marginTop="$6">
          <Button
            size="$5"
            backgroundColor="#FEF2F2"
            color={colors.error}
            borderRadius="$4"
            fontWeight="600"
            icon={<LogOut size={18} color={colors.error} />}
            pressStyle={{ backgroundColor: '#FEE2E2' }}
            onPress={logout}
          >
            Log Out
          </Button>
        </YStack>
      </ScrollView>
    </SafeAreaView>
  );
}
