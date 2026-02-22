import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { YStack, XStack, Text, Card, Button, Spinner } from 'tamagui';
import {
  Phone,
  MessageCircle,
  Users,
  Voicemail,
  PhoneCall,
  Search,
  TrendingUp,
  TrendingDown,
} from 'lucide-react-native';
import { format } from 'date-fns';
import { colors } from '../../constants/theme';
import api from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import type { DashboardResponse, RecentActivity } from '../../lib/types';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

interface StatCardProps {
  label: string;
  value: number;
  change: string;
  icon: React.ReactNode;
  iconBg: string;
}

function StatCard({ label, value, change, icon, iconBg }: StatCardProps) {
  const isPositive = change.startsWith('+');
  const isNeutral = change === '0%' || change === '+0%';

  return (
    <Card
      flex={1}
      padding="$3"
      backgroundColor="$background"
      borderRadius="$4"
      borderWidth={1}
      borderColor={colors.borderLight}
      elevation={2}
      size="$2"
    >
      <YStack gap="$2">
        <XStack justifyContent="space-between" alignItems="center">
          <YStack
            width={36}
            height={36}
            borderRadius="$3"
            backgroundColor={iconBg}
            alignItems="center"
            justifyContent="center"
          >
            {icon}
          </YStack>
        </XStack>
        <Text fontSize={20} fontWeight="700" color={colors.textPrimary}>
          {value}
        </Text>
        <Text fontSize={11} color={colors.textSecondary} numberOfLines={1}>
          {label}
        </Text>
        {!isNeutral && (
          <XStack alignItems="center" gap="$1">
            {isPositive ? (
              <TrendingUp size={12} color={colors.success} />
            ) : (
              <TrendingDown size={12} color={colors.error} />
            )}
            <Text
              fontSize={11}
              color={isPositive ? colors.success : colors.error}
              fontWeight="600"
            >
              {change}
            </Text>
          </XStack>
        )}
      </YStack>
    </Card>
  );
}

function ActivityItem({ item }: { item: RecentActivity }) {
  const isCall = item.type === 'call';
  const isVoicemail = item.type === 'voicemail';

  let iconBg: string;
  let icon: React.ReactNode;

  if (isVoicemail) {
    iconBg = colors.secondaryLight;
    icon = <Voicemail size={18} color={colors.secondary} />;
  } else if (isCall) {
    iconBg = colors.primaryLight;
    icon = <Phone size={18} color={colors.primary} />;
  } else {
    iconBg = '#F0FDF4';
    icon = <MessageCircle size={18} color={colors.success} />;
  }

  return (
    <XStack
      paddingVertical="$3"
      paddingHorizontal="$4"
      gap="$3"
      alignItems="center"
      backgroundColor="$background"
    >
      <YStack
        width={40}
        height={40}
        borderRadius={20}
        backgroundColor={iconBg}
        alignItems="center"
        justifyContent="center"
      >
        {icon}
      </YStack>
      <YStack flex={1} gap="$1">
        <Text fontSize={14} fontWeight="600" color={colors.textPrimary}>
          {item.contact}
        </Text>
        <Text fontSize={12} color={colors.textSecondary} numberOfLines={1}>
          {item.action}
          {item.duration ? ` · ${item.duration}` : ''}
        </Text>
      </YStack>
      <Text fontSize={11} color={colors.textTertiary}>
        {item.time}
      </Text>
    </XStack>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const { user, workspaceId } = useAuthStore();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const response = await api.get<DashboardResponse>(
        `/workspaces/${workspaceId}/dashboard/stats`
      );
      setData(response.data);
    } catch (error) {
      console.error('Failed to fetch dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDashboard();
  }, [fetchDashboard]);

  const stats = data?.stats;
  const today = format(new Date(), 'EEEE, MMMM d, yyyy');

  const renderHeader = () => (
    <YStack gap="$4" paddingHorizontal="$4" paddingBottom="$2">
      {/* Greeting */}
      <YStack gap="$1" paddingTop="$2">
        <Text fontSize={26} fontWeight="700" color={colors.textPrimary}>
          {getGreeting()}, {user?.full_name?.split(' ')[0] || 'there'}
        </Text>
        <Text fontSize={14} color={colors.textSecondary}>
          {today}
        </Text>
      </YStack>

      {/* Quick Stats */}
      <XStack gap="$2">
        <StatCard
          label="Calls Today"
          value={stats?.calls_today ?? 0}
          change={stats?.calls_change ?? '+0%'}
          icon={<Phone size={18} color={colors.primary} />}
          iconBg={colors.primaryLight}
        />
        <StatCard
          label="Messages Sent"
          value={stats?.messages_sent ?? 0}
          change={stats?.messages_change ?? '+0%'}
          icon={<MessageCircle size={18} color={colors.success} />}
          iconBg="#F0FDF4"
        />
      </XStack>
      <XStack gap="$2">
        <StatCard
          label="Total Contacts"
          value={stats?.total_contacts ?? 0}
          change={stats?.contacts_change ?? '+0%'}
          icon={<Users size={18} color={colors.secondary} />}
          iconBg="#F3EEFF"
        />
        <StatCard
          label="Voicemails"
          value={stats?.voicemails_unread ?? 0}
          change="+0%"
          icon={<Voicemail size={18} color={colors.error} />}
          iconBg="#FEE2E2"
        />
      </XStack>

      {/* Quick Actions */}
      <XStack gap="$3">
        <Button
          flex={1}
          size="$4"
          backgroundColor={colors.primary}
          color="#FFFFFF"
          fontWeight="700"
          borderRadius="$4"
          pressStyle={{ backgroundColor: colors.primaryDark }}
          icon={<PhoneCall size={18} color="#FFFFFF" />}
          onPress={() => router.push('/call/new')}
        >
          Test Receptionist
        </Button>
        <Button
          flex={1}
          size="$4"
          backgroundColor={colors.backgroundSecondary}
          color={colors.textPrimary}
          fontWeight="700"
          borderRadius="$4"
          borderWidth={1}
          borderColor={colors.border}
          pressStyle={{ backgroundColor: colors.surfaceSecondary }}
          icon={<Search size={18} color={colors.textPrimary} />}
          onPress={() => router.push('/ai-search')}
        >
          Ask AI
        </Button>
      </XStack>

      {/* Recent Activity Header */}
      <Text
        fontSize={17}
        fontWeight="700"
        color={colors.textPrimary}
        paddingTop="$2"
      >
        Recent Activity
      </Text>
    </YStack>
  );

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Spinner size="large" color={colors.primary} />
        </YStack>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <FlatList
        data={data?.recent_activity ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ActivityItem item={item} />}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <YStack alignItems="center" paddingVertical="$6" paddingHorizontal="$4">
            <Text fontSize={14} color={colors.textTertiary} textAlign="center">
              No recent activity yet. Start by making a call or sending a message.
            </Text>
          </YStack>
        }
        ItemSeparatorComponent={() => (
          <YStack
            height={1}
            backgroundColor={colors.borderLight}
            marginHorizontal="$4"
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}
