import { useCallback, useEffect, useMemo, useState } from 'react';
import { SectionList, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { YStack, XStack, Text, Input, Spinner, Button } from 'tamagui';
import { Search, UserPlus, Users } from 'lucide-react-native';
import { colors } from '../../../constants/theme';
import api from '../../../services/api';
import { useAuthStore } from '../../../stores/authStore';
import { EmptyState } from '../../../components/EmptyState';
import type { Contact, PaginatedContacts } from '../../../lib/types';

function getInitials(contact: Contact): string {
  const first = contact.first_name?.charAt(0) ?? '';
  const last = contact.last_name?.charAt(0) ?? '';
  if (first || last) return (first + last).toUpperCase();
  return contact.phone.charAt(0) ?? '?';
}

function getFullName(contact: Contact): string {
  const parts = [contact.first_name, contact.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : contact.phone;
}

interface Section {
  title: string;
  data: Contact[];
}

function groupContactsByLetter(contacts: Contact[]): Section[] {
  const groups: Record<string, Contact[]> = {};
  for (const contact of contacts) {
    const name = getFullName(contact);
    const letter = name.charAt(0).toUpperCase();
    const key = /[A-Z]/.test(letter) ? letter : '#';
    if (!groups[key]) groups[key] = [];
    groups[key].push(contact);
  }
  return Object.keys(groups)
    .sort()
    .map((key) => ({ title: key, data: groups[key] }));
}

function ContactItem({ contact, onPress }: { contact: Contact; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <XStack
        paddingVertical="$3"
        paddingHorizontal="$4"
        gap="$3"
        alignItems="center"
        backgroundColor="$background"
      >
        <YStack
          width={44}
          height={44}
          borderRadius={22}
          backgroundColor={colors.primaryLight}
          alignItems="center"
          justifyContent="center"
        >
          <Text fontSize={16} fontWeight="700" color={colors.primary}>
            {getInitials(contact)}
          </Text>
        </YStack>
        <YStack flex={1} gap="$1">
          <Text fontSize={15} fontWeight="600" color={colors.textPrimary}>
            {getFullName(contact)}
          </Text>
          {contact.company && (
            <Text fontSize={12} color={colors.textSecondary} numberOfLines={1}>
              {contact.company}
            </Text>
          )}
        </YStack>
        <Text fontSize={13} color={colors.textTertiary}>
          {contact.phone}
        </Text>
      </XStack>
    </Pressable>
  );
}

export default function ContactsScreen() {
  const router = useRouter();
  const { workspaceId } = useAuthStore();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const fetchContacts = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const response = await api.get<PaginatedContacts>(
        `/workspaces/${workspaceId}/contacts`,
        { params: { search: search || undefined, page: 1, page_size: 100 } }
      );
      setContacts(response.data.items);
    } catch (error) {
      console.error('Failed to fetch contacts:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId, search]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchContacts();
  }, [fetchContacts]);

  const sections = useMemo(() => groupContactsByLetter(contacts), [contacts]);

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
      <YStack flex={1}>
        {/* Header */}
        <XStack
          paddingHorizontal="$4"
          paddingVertical="$3"
          alignItems="center"
          justifyContent="space-between"
        >
          <Text fontSize={26} fontWeight="700" color={colors.textPrimary}>
            Contacts
          </Text>
          <Button
            size="$3"
            circular
            backgroundColor={colors.primary}
            pressStyle={{ backgroundColor: colors.primaryDark }}
            icon={<UserPlus size={18} color="#FFFFFF" />}
            onPress={() => router.push('/(tabs)/contacts/new')}
          />
        </XStack>

        {/* Search */}
        <XStack paddingHorizontal="$4" paddingBottom="$3">
          <XStack
            flex={1}
            alignItems="center"
            backgroundColor={colors.backgroundSecondary}
            borderRadius="$4"
            paddingHorizontal="$3"
            gap="$2"
            borderWidth={1}
            borderColor={colors.borderLight}
          >
            <Search size={18} color={colors.textTertiary} />
            <Input
              flex={1}
              placeholder="Search contacts..."
              placeholderTextColor={colors.textTertiary as any}
              value={search}
              onChangeText={setSearch}
              backgroundColor="transparent"
              borderWidth={0}
              fontSize={15}
              paddingHorizontal="$0"
              color={colors.textPrimary}
            />
          </XStack>
        </XStack>

        {/* Contact List */}
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <ContactItem
              contact={item}
              onPress={() => router.push(`/(tabs)/contacts/${item.id}`)}
            />
          )}
          renderSectionHeader={({ section }) => (
            <YStack
              paddingHorizontal="$4"
              paddingVertical="$1.5"
              backgroundColor={colors.backgroundSecondary}
            >
              <Text fontSize={13} fontWeight="700" color={colors.textSecondary}>
                {section.title}
              </Text>
            </YStack>
          )}
          ItemSeparatorComponent={() => (
            <YStack
              height={1}
              backgroundColor={colors.borderLight}
              marginLeft={71}
              marginRight={16}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon={<Users size={28} color={colors.primary} />}
              title="No contacts yet"
              description="Add your first contact to get started"
              actionLabel="Add Contact"
              onAction={() => router.push('/(tabs)/contacts/new')}
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled
        />
      </YStack>
    </SafeAreaView>
  );
}
