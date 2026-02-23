import { useState, useCallback, useRef, useEffect } from 'react';
import { FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { YStack, XStack, Text, Button, Input } from 'tamagui';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Search,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Bot,
  Voicemail,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { formatDistanceToNow } from 'date-fns';
import { colors } from '../../../constants/theme';
import api from '../../../services/api';
import { useAuthStore } from '../../../stores/authStore';
import { useVoicemailStore } from '../../../stores/voicemailStore';
import { EmptyState } from '../../../components/EmptyState';
import type { CallResponse, PaginatedCalls } from '../../../lib/types';

type FilterType = 'all' | 'inbound' | 'outbound' | 'missed' | 'voicemail';

const FILTERS: { label: string; value: FilterType }[] = [
  { label: 'All', value: 'all' },
  { label: 'Inbound', value: 'inbound' },
  { label: 'Outbound', value: 'outbound' },
  { label: 'Missed', value: 'missed' },
  { label: 'Voicemail', value: 'voicemail' },
];

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds === 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getInitials(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name[0].toUpperCase();
}

function DirectionIcon({ call }: { call: CallResponse }) {
  if (call.is_voicemail) {
    return <Voicemail size={16} color={colors.secondary} />;
  }
  if (call.status === 'no_answer') {
    return <PhoneMissed size={16} color={colors.error} />;
  }
  if (call.direction === 'inbound') {
    return <PhoneIncoming size={16} color={colors.success} />;
  }
  return <PhoneOutgoing size={16} color={colors.primary} />;
}

export default function CallsScreen() {
  const router = useRouter();
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const unreadCount = useVoicemailStore((s) => s.unreadCount);
  const fetchUnreadCount = useVoicemailStore((s) => s.fetchUnreadCount);

  const [calls, setCalls] = useState<CallResponse[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [initialLoaded, setInitialLoaded] = useState(false);

  // Fetch voicemail unread count on mount
  useEffect(() => {
    if (workspaceId) {
      fetchUnreadCount(workspaceId);
    }
  }, [workspaceId, fetchUnreadCount]);

  const fetchCalls = useCallback(
    async (pageNum: number, isRefresh = false) => {
      if (!workspaceId) return;

      if (isRefresh) {
        setRefreshing(true);
      } else if (pageNum === 1) {
        setLoading(true);
      }

      try {
        const params: Record<string, string | number | boolean> = {
          page: pageNum,
          page_size: 20,
        };
        if (filter === 'inbound' || filter === 'outbound') {
          params.direction = filter;
        }
        if (filter === 'missed') {
          params.status = 'no_answer';
        }
        if (filter === 'voicemail') {
          params.is_voicemail = true;
        }
        if (search.trim()) {
          params.search = search.trim();
        }

        const response = await api.get<PaginatedCalls>(
          `/workspaces/${workspaceId}/calls`,
          { params }
        );

        const data = response.data;
        if (pageNum === 1) {
          setCalls(data.items);
        } else {
          setCalls((prev) => [...prev, ...data.items]);
        }
        setTotalPages(data.pages);
        setPage(pageNum);
      } catch (err) {
        console.error('Failed to fetch calls:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setInitialLoaded(true);
      }
    },
    [workspaceId, filter, search]
  );

  // Initial load and filter/search changes
  const prevDepsRef = useRef<string>('');
  const depsKey = `${workspaceId}-${filter}-${search}`;
  if (depsKey !== prevDepsRef.current && workspaceId) {
    prevDepsRef.current = depsKey;
    // Defer the fetch to avoid setState during render
    setTimeout(() => fetchCalls(1), 0);
  }

  const handleRefresh = useCallback(() => {
    if (workspaceId) {
      fetchUnreadCount(workspaceId);
    }
    fetchCalls(1, true);
  }, [fetchCalls, workspaceId, fetchUnreadCount]);

  const handleLoadMore = useCallback(() => {
    if (!loading && page < totalPages) {
      fetchCalls(page + 1);
    }
  }, [loading, page, totalPages, fetchCalls]);

  const handleSearchChange = useCallback(
    (text: string) => {
      setSearch(text);
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      searchTimeout.current = setTimeout(() => {
        // The deps change above will trigger a re-fetch
      }, 400);
    },
    []
  );

  const handleFilterChange = useCallback((f: FilterType) => {
    setFilter(f);
  }, []);

  const renderCallItem = useCallback(
    ({ item }: { item: CallResponse }) => {
      const displayName = item.contact_name || item.from_number || item.to_number || 'Unknown';
      const timeAgo = formatDistanceToNow(new Date(item.created_at), { addSuffix: true });
      const isUnreadVoicemail = item.is_voicemail && !item.is_read;

      return (
        <XStack
          paddingHorizontal="$4"
          paddingVertical="$3"
          alignItems="center"
          gap="$3"
          pressStyle={{ backgroundColor: colors.backgroundSecondary }}
          onPress={() => router.push(`/(tabs)/calls/${item.id}`)}
        >
          {/* Avatar */}
          <YStack
            width={44}
            height={44}
            borderRadius={22}
            backgroundColor={item.is_voicemail ? colors.secondaryLight : colors.primaryLight}
            alignItems="center"
            justifyContent="center"
          >
            {item.is_voicemail ? (
              <Voicemail size={20} color={colors.secondary} />
            ) : (
              <Text fontSize={16} fontWeight="600" color={colors.primary}>
                {getInitials(item.contact_name || displayName)}
              </Text>
            )}
          </YStack>

          {/* Info */}
          <YStack flex={1} gap="$1">
            <XStack alignItems="center" gap="$2">
              {/* Unread blue dot */}
              {isUnreadVoicemail && (
                <YStack
                  width={6}
                  height={6}
                  borderRadius={3}
                  backgroundColor={colors.primary}
                />
              )}
              <Text
                fontSize={15}
                fontWeight={isUnreadVoicemail ? '700' : '600'}
                color={colors.textPrimary}
                numberOfLines={1}
                flex={1}
              >
                {displayName}
              </Text>
              {item.is_ai && (
                <XStack
                  backgroundColor={colors.secondaryLight}
                  paddingHorizontal="$2"
                  paddingVertical="$0.5"
                  borderRadius="$2"
                  alignItems="center"
                  gap="$1"
                >
                  <Bot size={12} color={colors.secondary} />
                  <Text fontSize={10} fontWeight="600" color={colors.secondary}>
                    AI
                  </Text>
                </XStack>
              )}
            </XStack>
            <XStack alignItems="center" gap="$1.5">
              <DirectionIcon call={item} />
              <Text fontSize={13} color={colors.textSecondary}>
                {timeAgo}
              </Text>
            </XStack>
            {/* Voicemail transcription preview */}
            {item.is_voicemail && item.voicemail_transcription && (
              <Text
                fontSize={12}
                color={colors.textTertiary}
                numberOfLines={1}
              >
                {item.voicemail_transcription}
              </Text>
            )}
          </YStack>

          {/* Duration */}
          <Text fontSize={13} color={colors.textSecondary}>
            {formatDuration(item.duration_seconds)}
          </Text>
        </XStack>
      );
    },
    [router]
  );

  const keyExtractor = useCallback((item: CallResponse) => item.id, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <YStack flex={1}>
        {/* Header */}
        <YStack paddingHorizontal="$4" paddingTop="$2" paddingBottom="$3" gap="$3">
          <Text fontSize={28} fontWeight="700" color={colors.textPrimary}>
            Calls
          </Text>

          {/* Search */}
          <XStack
            backgroundColor={colors.surfaceSecondary}
            borderRadius="$3"
            alignItems="center"
            paddingHorizontal="$3"
            gap="$2"
          >
            <Search size={18} color={colors.textTertiary} />
            <Input
              flex={1}
              placeholder="Search calls..."
              placeholderTextColor={colors.textTertiary as any}
              value={search}
              onChangeText={handleSearchChange}
              borderWidth={0}
              backgroundColor="transparent"
              fontSize={15}
              paddingHorizontal="$0"
            />
          </XStack>

          {/* Filter chips */}
          <XStack gap="$2">
            {FILTERS.map((f) => {
              const isActive = filter === f.value;
              const isVoicemail = f.value === 'voicemail';
              return (
                <XStack key={f.value} position="relative">
                  <Button
                    size="$2"
                    backgroundColor={isActive ? colors.primary : colors.surfaceSecondary}
                    color={isActive ? '#FFFFFF' : colors.textSecondary}
                    borderRadius="$6"
                    pressStyle={{
                      backgroundColor: isActive ? colors.primaryDark : colors.border,
                    }}
                    onPress={() => handleFilterChange(f.value)}
                  >
                    {f.label}
                  </Button>
                  {/* Unread badge on voicemail chip */}
                  {isVoicemail && unreadCount > 0 && (
                    <YStack
                      position="absolute"
                      top={-4}
                      right={-4}
                      minWidth={16}
                      height={16}
                      borderRadius={8}
                      backgroundColor={colors.error}
                      alignItems="center"
                      justifyContent="center"
                      paddingHorizontal="$1"
                      zIndex={1}
                    >
                      <Text fontSize={9} fontWeight="700" color="#FFFFFF">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </Text>
                    </YStack>
                  )}
                </XStack>
              );
            })}
          </XStack>
        </YStack>

        {/* Call list */}
        {loading && !initialLoaded ? (
          <YStack flex={1} alignItems="center" justifyContent="center">
            <ActivityIndicator size="large" color={colors.primary} />
          </YStack>
        ) : (
          <FlatList
            data={calls}
            renderItem={renderCallItem}
            keyExtractor={keyExtractor}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
              />
            }
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            ListEmptyComponent={
              <EmptyState
                icon={<Phone size={28} color={colors.primary} />}
                title={filter === 'voicemail' ? 'No voicemails found' : 'No calls yet'}
                description="Make a test call to try your AI receptionist"
                actionLabel="Test Receptionist"
                onAction={() => router.push('/call/new')}
              />
            }
            ListFooterComponent={
              loading && page > 1 ? (
                <YStack padding="$4" alignItems="center">
                  <ActivityIndicator size="small" color={colors.primary} />
                </YStack>
              ) : null
            }
          />
        )}
      </YStack>
    </SafeAreaView>
  );
}
