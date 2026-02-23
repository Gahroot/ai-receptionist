import { useState, useEffect, useCallback } from 'react';
import { Keyboard, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  YStack,
  XStack,
  Text,
  H3,
  Card,
  Button,
  Input,
  Separator,
  ScrollView,
  Spinner,
} from 'tamagui';
import {
  X,
  Search,
  Phone,
  MessageCircle,
  Clock,
  Sparkles,
  AlertCircle,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../constants/theme';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';
import type { AISearchResult } from '../lib/types';
import { format } from 'date-fns';

const RECENT_SEARCHES_KEY = 'recent_searches';
const MAX_RECENT_SEARCHES = 10;

async function loadRecentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveRecentSearch(query: string): Promise<string[]> {
  const existing = await loadRecentSearches();
  const filtered = existing.filter((s) => s !== query);
  const updated = [query, ...filtered].slice(0, MAX_RECENT_SEARCHES);
  await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  return updated;
}

export default function AISearchScreen() {
  const router = useRouter();
  const { workspaceId } = useAuthStore();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AISearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    loadRecentSearches().then(setRecentSearches);
  }, []);

  const runSearch = useCallback(
    async (searchQuery: string) => {
      const trimmed = searchQuery.trim();
      if (!trimmed || !workspaceId) return;

      Keyboard.dismiss();
      setQuery(trimmed);
      setLoading(true);
      setError(null);
      setResult(null);

      try {
        const response = await api.post<AISearchResult>(
          `/workspaces/${workspaceId}/ai/search`,
          { query: trimmed }
        );
        setResult(response.data);
      } catch (err: any) {
        const message =
          err?.response?.data?.detail ||
          err?.message ||
          'Search failed. Please try again.';
        setError(message);
      } finally {
        setLoading(false);
      }

      const updated = await saveRecentSearch(trimmed);
      setRecentSearches(updated);
    },
    [workspaceId]
  );

  const handleSourcePress = (source: AISearchResult['sources'][number]) => {
    if (source.type === 'call') {
      router.push(`/(tabs)/calls/${source.id}`);
    } else if (source.type === 'message' || source.type === 'conversation') {
      router.push(`/(tabs)/messages/${source.id}`);
    }
  };

  const getSourceIcon = (type: string) => {
    if (type === 'call') {
      return <Phone size={16} color={colors.primary} />;
    }
    return <MessageCircle size={16} color={colors.success} />;
  };

  const showRecentSearches = !loading && !result && !error;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <XStack
        paddingHorizontal="$4"
        paddingVertical="$3"
        alignItems="center"
        gap="$3"
      >
        <Button
          size="$3"
          circular
          backgroundColor={colors.surfaceSecondary}
          pressStyle={{ backgroundColor: colors.border }}
          onPress={() => router.back()}
          icon={<X size={20} color={colors.textPrimary} />}
        />
        <H3 flex={1} color={colors.textPrimary}>
          AI Search
        </H3>
      </XStack>

      {/* Search Input */}
      <XStack
        paddingHorizontal="$4"
        paddingBottom="$3"
        gap="$2"
        alignItems="center"
      >
        <XStack
          flex={1}
          backgroundColor={colors.backgroundSecondary}
          borderRadius="$4"
          borderWidth={1}
          borderColor={colors.border}
          alignItems="center"
          paddingHorizontal="$3"
        >
          <Search size={18} color={colors.textTertiary} />
          <Input
            flex={1}
            size="$4"
            placeholder="Ask AI about your calls and messages..."
            placeholderTextColor={colors.textTertiary as any}
            backgroundColor="transparent"
            borderWidth={0}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => runSearch(query)}
            returnKeyType="search"
            autoFocus
          />
        </XStack>
        <Button
          size="$4"
          backgroundColor={colors.primary}
          borderRadius="$4"
          pressStyle={{ backgroundColor: colors.primaryDark }}
          onPress={() => runSearch(query)}
          disabled={loading || !query.trim()}
          opacity={!query.trim() ? 0.5 : 1}
        >
          <Search size={18} color="#FFFFFF" />
        </Button>
      </XStack>

      <Separator borderColor={colors.borderLight} />

      <ScrollView
        flex={1}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Loading State */}
        {loading && (
          <YStack alignItems="center" justifyContent="center" paddingVertical="$8" gap="$3">
            <Spinner size="large" color={colors.primary} />
            <Text fontSize={14} color={colors.textSecondary}>
              Searching across your calls and messages...
            </Text>
          </YStack>
        )}

        {/* Error State */}
        {error && (
          <Card
            padding="$4"
            backgroundColor="#FEF2F2"
            borderRadius="$4"
            borderWidth={1}
            borderColor="#FECACA"
          >
            <XStack gap="$3" alignItems="flex-start">
              <AlertCircle size={20} color={colors.error} />
              <YStack flex={1} gap="$1">
                <Text fontSize={14} fontWeight="600" color={colors.error}>
                  Search failed
                </Text>
                <Text fontSize={13} color={colors.textSecondary}>
                  {error}
                </Text>
              </YStack>
            </XStack>
          </Card>
        )}

        {/* Results */}
        {result && (
          <YStack gap="$4">
            {/* AI Answer */}
            <Card
              padding="$4"
              backgroundColor={colors.backgroundSecondary}
              borderRadius="$4"
              borderWidth={1}
              borderColor={colors.borderLight}
            >
              <YStack gap="$3">
                <XStack gap="$2" alignItems="center">
                  <Sparkles size={18} color={colors.secondary} />
                  <Text fontSize={15} fontWeight="700" color={colors.textPrimary}>
                    AI Answer
                  </Text>
                </XStack>
                <Text fontSize={14} lineHeight={22} color={colors.textPrimary}>
                  {result.answer}
                </Text>
              </YStack>
            </Card>

            {/* Sources */}
            {result.sources.length > 0 && (
              <YStack gap="$2">
                <Text fontSize={13} fontWeight="600" color={colors.textSecondary} paddingLeft="$1">
                  Sources ({result.sources.length})
                </Text>
                {result.sources.map((source, index) => (
                  <Pressable key={source.id || index} onPress={() => handleSourcePress(source)}>
                    <Card
                      padding="$3"
                      backgroundColor={colors.background}
                      borderRadius="$3"
                      borderWidth={1}
                      borderColor={colors.border}
                    >
                      <XStack gap="$3" alignItems="flex-start">
                        <YStack
                          width={32}
                          height={32}
                          borderRadius={16}
                          backgroundColor={
                            source.type === 'call' ? colors.primaryLight : '#F0FDF4'
                          }
                          alignItems="center"
                          justifyContent="center"
                          marginTop="$0.5"
                        >
                          {getSourceIcon(source.type)}
                        </YStack>
                        <YStack flex={1} gap="$1">
                          <Text fontSize={14} fontWeight="600" color={colors.textPrimary}>
                            {source.title}
                          </Text>
                          <Text
                            fontSize={12}
                            color={colors.textSecondary}
                            numberOfLines={2}
                          >
                            {source.snippet}
                          </Text>
                          <Text fontSize={11} color={colors.textTertiary}>
                            {formatSourceDate(source.date)}
                          </Text>
                        </YStack>
                      </XStack>
                    </Card>
                  </Pressable>
                ))}
              </YStack>
            )}
          </YStack>
        )}

        {/* Recent Searches */}
        {showRecentSearches && recentSearches.length > 0 && (
          <YStack gap="$2">
            <Text
              fontSize={13}
              fontWeight="600"
              color={colors.textSecondary}
              paddingLeft="$1"
              paddingBottom="$1"
            >
              Recent Searches
            </Text>
            {recentSearches.map((search, index) => (
              <Pressable key={`${search}-${index}`} onPress={() => runSearch(search)}>
                <XStack
                  paddingVertical="$2.5"
                  paddingHorizontal="$3"
                  gap="$3"
                  alignItems="center"
                  borderRadius="$3"
                  hoverStyle={{ backgroundColor: colors.backgroundSecondary }}
                  pressStyle={{ backgroundColor: colors.backgroundSecondary }}
                >
                  <Clock size={16} color={colors.textTertiary} />
                  <Text flex={1} fontSize={14} color={colors.textPrimary} numberOfLines={1}>
                    {search}
                  </Text>
                </XStack>
              </Pressable>
            ))}
          </YStack>
        )}

        {/* Empty State */}
        {showRecentSearches && recentSearches.length === 0 && (
          <YStack alignItems="center" justifyContent="center" paddingVertical="$8" gap="$3">
            <YStack
              width={56}
              height={56}
              borderRadius={28}
              backgroundColor={colors.primaryLight}
              alignItems="center"
              justifyContent="center"
            >
              <Search size={24} color={colors.primary} />
            </YStack>
            <Text
              fontSize={14}
              color={colors.textTertiary}
              textAlign="center"
              paddingHorizontal="$6"
              lineHeight={22}
            >
              Search across all your calls, messages, and contacts
            </Text>
          </YStack>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function formatSourceDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'MMM d, yyyy h:mm a');
  } catch {
    return dateStr;
  }
}
