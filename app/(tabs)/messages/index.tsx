import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MessageCircle, PenSquare, Search } from 'lucide-react-native';
import { Input, Text, View, XStack, YStack } from 'tamagui';
import api from '../../../services/api';
import { useAuthStore } from '../../../stores/authStore';
import { colors, spacing } from '../../../constants/theme';
import { EmptyState } from '../../../components/EmptyState';
import type { ConversationSummary, PaginatedConversations } from '../../../lib/types';
import { formatDistanceToNow } from 'date-fns';

function getInitials(name: string | null, phone: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
  }
  return phone.slice(-2);
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '';
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return '';
  }
}

function ConversationListItem({
  item,
  onPress,
}: {
  item: ConversationSummary;
  onPress: () => void;
}) {
  const displayName = item.contact_name || item.contact_phone;
  const initials = getInitials(item.contact_name, item.contact_phone);
  const preview = item.last_message_preview || 'No messages yet';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <XStack
        paddingHorizontal={spacing.md}
        paddingVertical={12}
        alignItems="center"
        gap={12}
        backgroundColor={item.unread_count > 0 ? colors.primaryLight : 'transparent'}
      >
        {/* Avatar */}
        <View
          width={48}
          height={48}
          borderRadius={24}
          backgroundColor={colors.primary}
          alignItems="center"
          justifyContent="center"
          position="relative"
        >
          <Text color="#FFFFFF" fontSize={16} fontWeight="700">
            {initials}
          </Text>
          {item.ai_enabled && (
            <View
              position="absolute"
              bottom={-1}
              right={-1}
              width={14}
              height={14}
              borderRadius={7}
              backgroundColor={colors.success}
              borderWidth={2}
              borderColor="#FFFFFF"
            />
          )}
        </View>

        {/* Content */}
        <YStack flex={1} gap={2}>
          <XStack justifyContent="space-between" alignItems="center">
            <Text
              fontSize={15}
              fontWeight={item.unread_count > 0 ? '700' : '500'}
              color={colors.textPrimary}
              numberOfLines={1}
              flex={1}
              marginRight={8}
            >
              {displayName}
            </Text>
            <Text fontSize={12} color={colors.textTertiary}>
              {formatTime(item.last_message_at)}
            </Text>
          </XStack>
          <XStack alignItems="center" justifyContent="space-between">
            <Text
              fontSize={13}
              color={colors.textSecondary}
              numberOfLines={1}
              flex={1}
              marginRight={8}
            >
              {preview}
            </Text>
            {item.unread_count > 0 && (
              <View
                minWidth={20}
                height={20}
                borderRadius={10}
                backgroundColor={colors.primary}
                alignItems="center"
                justifyContent="center"
                paddingHorizontal={6}
              >
                <Text color="#FFFFFF" fontSize={11} fontWeight="700">
                  {item.unread_count > 99 ? '99+' : item.unread_count}
                </Text>
              </View>
            )}
          </XStack>
        </YStack>
      </XStack>
    </TouchableOpacity>
  );
}

export default function MessagesScreen() {
  const router = useRouter();
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [filteredConversations, setFilteredConversations] = useState<ConversationSummary[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const response = await api.get<PaginatedConversations>(
        `/workspaces/${workspaceId}/conversations`,
        {
          params: {
            channel_filter: 'sms',
            page: 1,
            page_size: 50,
          },
        }
      );
      setConversations(response.data.items);
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (!search.trim()) {
      setFilteredConversations(conversations);
      return;
    }
    const query = search.toLowerCase();
    setFilteredConversations(
      conversations.filter(
        (c) =>
          (c.contact_name && c.contact_name.toLowerCase().includes(query)) ||
          c.contact_phone.includes(query) ||
          (c.last_message_preview && c.last_message_preview.toLowerCase().includes(query))
      )
    );
  }, [search, conversations]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchConversations();
    setRefreshing(false);
  }, [fetchConversations]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <XStack
        paddingHorizontal={spacing.md}
        paddingVertical={12}
        alignItems="center"
        justifyContent="space-between"
      >
        <Text fontSize={28} fontWeight="800" color={colors.textPrimary}>
          Messages
        </Text>
        <TouchableOpacity activeOpacity={0.7}>
          <PenSquare size={22} color={colors.primary} />
        </TouchableOpacity>
      </XStack>

      {/* Search */}
      <View paddingHorizontal={spacing.md} paddingBottom={8}>
        <XStack
          backgroundColor={colors.surfaceSecondary}
          borderRadius={10}
          alignItems="center"
          paddingHorizontal={12}
          height={38}
        >
          <Search size={16} color={colors.textTertiary} />
          <Input
            flex={1}
            placeholder="Search conversations..."
            placeholderTextColor={colors.textTertiary as any}
            value={search}
            onChangeText={setSearch}
            borderWidth={0}
            backgroundColor="transparent"
            fontSize={14}
            height={38}
            paddingHorizontal={8}
          />
        </XStack>
      </View>

      {/* Conversation List */}
      <FlatList
        data={filteredConversations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ConversationListItem
            item={item}
            onPress={() => router.push(`/(tabs)/messages/${item.id}`)}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ItemSeparatorComponent={() => (
          <View
            height={0.5}
            backgroundColor={colors.border}
            marginLeft={76}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <YStack flex={1} alignItems="center" justifyContent="center" paddingTop={80}>
              <Text color={colors.textTertiary} fontSize={15}>
                Loading conversations...
              </Text>
            </YStack>
          ) : (
            <EmptyState
              icon={<MessageCircle size={28} color={colors.primary} />}
              title="No conversations yet"
              description="Messages from callers will appear here"
            />
          )
        }
        contentContainerStyle={
          filteredConversations.length === 0 ? { flex: 1 } : undefined
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
