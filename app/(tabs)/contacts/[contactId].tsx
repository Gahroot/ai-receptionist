import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  YStack,
  XStack,
  Text,
  H2,
  Button,
  Input,
  TextArea,
  Spinner,
  ScrollView,
  Separator,
} from 'tamagui';
import {
  ArrowLeft,
  Phone,
  MessageCircle,
  Mail,
  Building2,
  StickyNote,
  Tag,
  Pencil,
  Check,
  X,
} from 'lucide-react-native';
import { colors } from '../../../constants/theme';
import api from '../../../services/api';
import { useAuthStore } from '../../../stores/authStore';
import type { Contact } from '../../../lib/types';

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

interface InfoRowProps {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  editing: boolean;
  onChangeText?: (text: string) => void;
  multiline?: boolean;
}

function InfoRow({ icon, label, value, editing, onChangeText, multiline }: InfoRowProps) {
  return (
    <XStack paddingVertical="$3" paddingHorizontal="$4" gap="$3" alignItems="flex-start">
      <YStack
        width={36}
        height={36}
        borderRadius="$3"
        backgroundColor={colors.backgroundSecondary}
        alignItems="center"
        justifyContent="center"
        marginTop={2}
      >
        {icon}
      </YStack>
      <YStack flex={1} gap="$1">
        <Text fontSize={12} color={colors.textTertiary} fontWeight="600">
          {label}
        </Text>
        {editing && onChangeText ? (
          multiline ? (
            <TextArea
              value={value ?? ''}
              onChangeText={onChangeText}
              fontSize={15}
              color={colors.textPrimary}
              backgroundColor={colors.backgroundSecondary}
              borderWidth={1}
              borderColor={colors.border}
              borderRadius="$3"
              minHeight={80}
              padding="$2"
            />
          ) : (
            <Input
              value={value ?? ''}
              onChangeText={onChangeText}
              fontSize={15}
              color={colors.textPrimary}
              backgroundColor={colors.backgroundSecondary}
              borderWidth={1}
              borderColor={colors.border}
              borderRadius="$3"
              paddingHorizontal="$2"
            />
          )
        ) : (
          <Text fontSize={15} color={value ? colors.textPrimary : colors.textTertiary}>
            {value || 'Not set'}
          </Text>
        )}
      </YStack>
    </XStack>
  );
}

export default function ContactDetailScreen() {
  const { contactId } = useLocalSearchParams<{ contactId: string }>();
  const router = useRouter();
  const { workspaceId } = useAuthStore();
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Partial<Contact>>({});

  const isNew = contactId === 'new';

  const fetchContact = useCallback(async () => {
    if (!workspaceId || isNew) {
      setLoading(false);
      return;
    }
    try {
      const response = await api.get<Contact>(
        `/workspaces/${workspaceId}/contacts/${contactId}`
      );
      setContact(response.data);
      setDraft(response.data);
    } catch (error) {
      console.error('Failed to fetch contact:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId, contactId, isNew]);

  useEffect(() => {
    if (isNew) {
      setEditing(true);
      setDraft({ first_name: '', last_name: '', phone: '', email: '', company: '', notes: '', tags: [] });
      setLoading(false);
    } else {
      fetchContact();
    }
  }, [fetchContact, isNew]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchContact();
  }, [fetchContact]);

  const handleSave = async () => {
    if (!workspaceId) return;
    setSaving(true);
    try {
      if (isNew) {
        if (!draft.phone) {
          Alert.alert('Error', 'Phone number is required.');
          setSaving(false);
          return;
        }
        const response = await api.post<Contact>(
          `/workspaces/${workspaceId}/contacts`,
          {
            first_name: draft.first_name || null,
            last_name: draft.last_name || null,
            phone: draft.phone,
            email: draft.email || null,
            company: draft.company || null,
            notes: draft.notes || null,
            tags: draft.tags ?? [],
          }
        );
        setContact(response.data);
        setDraft(response.data);
        setEditing(false);
        router.replace(`/(tabs)/contacts/${response.data.id}`);
      } else {
        const response = await api.put<Contact>(
          `/workspaces/${workspaceId}/contacts/${contactId}`,
          {
            first_name: draft.first_name || null,
            last_name: draft.last_name || null,
            phone: draft.phone,
            email: draft.email || null,
            company: draft.company || null,
            notes: draft.notes || null,
            tags: draft.tags ?? [],
          }
        );
        setContact(response.data);
        setDraft(response.data);
        setEditing(false);
      }
    } catch (error) {
      console.error('Failed to save contact:', error);
      Alert.alert('Error', 'Failed to save contact. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (isNew) {
      router.back();
    } else {
      setDraft(contact ?? {});
      setEditing(false);
    }
  };

  const displayContact = editing ? (draft as Contact) : contact;

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Spinner size="large" color={colors.primary} />
        </YStack>
      </SafeAreaView>
    );
  }

  if (!displayContact && !isNew) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <YStack flex={1} alignItems="center" justifyContent="center" paddingHorizontal="$4">
          <Text fontSize={16} color={colors.textSecondary}>
            Contact not found.
          </Text>
          <Button marginTop="$4" onPress={() => router.back()}>
            Go Back
          </Button>
        </YStack>
      </SafeAreaView>
    );
  }

  const initials = displayContact
    ? getInitials(displayContact)
    : '?';
  const fullName = displayContact
    ? getFullName(displayContact)
    : 'New Contact';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {/* Top Bar */}
      <XStack paddingHorizontal="$3" paddingVertical="$2" alignItems="center" justifyContent="space-between">
        <Button
          size="$3"
          circular
          chromeless
          icon={<ArrowLeft size={22} color={colors.textPrimary} />}
          onPress={() => router.back()}
        />
        {editing ? (
          <XStack gap="$2">
            <Button
              size="$3"
              circular
              chromeless
              icon={<X size={20} color={colors.textSecondary} />}
              onPress={handleCancel}
            />
            <Button
              size="$3"
              circular
              backgroundColor={colors.primary}
              pressStyle={{ backgroundColor: colors.primaryDark }}
              icon={saving ? <Spinner size="small" color="#FFFFFF" /> : <Check size={18} color="#FFFFFF" />}
              onPress={handleSave}
              disabled={saving}
            />
          </XStack>
        ) : (
          <Button
            size="$3"
            circular
            chromeless
            icon={<Pencil size={18} color={colors.primary} />}
            onPress={() => setEditing(true)}
          />
        )}
      </XStack>

      <ScrollView
        flex={1}
        showsVerticalScrollIndicator={false}
        refreshControl={
          !isNew ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          ) : undefined
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Avatar + Name */}
        <YStack alignItems="center" paddingVertical="$5" gap="$3">
          <YStack
            width={88}
            height={88}
            borderRadius={44}
            backgroundColor={colors.primaryLight}
            alignItems="center"
            justifyContent="center"
          >
            <Text fontSize={32} fontWeight="700" color={colors.primary}>
              {initials}
            </Text>
          </YStack>
          {editing ? (
            <YStack alignItems="center" gap="$2" paddingHorizontal="$6" width="100%">
              <XStack gap="$2" width="100%">
                <Input
                  flex={1}
                  placeholder="First name"
                  placeholderTextColor={colors.textTertiary as any}
                  value={draft.first_name ?? ''}
                  onChangeText={(t) => setDraft((d) => ({ ...d, first_name: t }))}
                  fontSize={15}
                  backgroundColor={colors.backgroundSecondary}
                  borderWidth={1}
                  borderColor={colors.border}
                  borderRadius="$3"
                  textAlign="center"
                />
                <Input
                  flex={1}
                  placeholder="Last name"
                  placeholderTextColor={colors.textTertiary as any}
                  value={draft.last_name ?? ''}
                  onChangeText={(t) => setDraft((d) => ({ ...d, last_name: t }))}
                  fontSize={15}
                  backgroundColor={colors.backgroundSecondary}
                  borderWidth={1}
                  borderColor={colors.border}
                  borderRadius="$3"
                  textAlign="center"
                />
              </XStack>
            </YStack>
          ) : (
            <YStack alignItems="center" gap="$1">
              <H2 color={colors.textPrimary} textAlign="center">
                {fullName}
              </H2>
              {displayContact?.company && (
                <Text fontSize={15} color={colors.textSecondary}>
                  {displayContact.company}
                </Text>
              )}
            </YStack>
          )}
        </YStack>

        {/* Action Buttons - hide during edit */}
        {!editing && displayContact && (
          <>
            <XStack justifyContent="center" gap="$6" paddingVertical="$2">
              <YStack alignItems="center" gap="$1.5">
                <Button
                  size="$4"
                  circular
                  backgroundColor={colors.primaryLight}
                  pressStyle={{ backgroundColor: colors.border }}
                  icon={<Phone size={20} color={colors.primary} />}
                  onPress={() => {
                    if (displayContact.phone) {
                      Linking.openURL(`tel:${displayContact.phone}`);
                    }
                  }}
                />
                <Text fontSize={11} color={colors.textSecondary} fontWeight="600">
                  Call
                </Text>
              </YStack>
              <YStack alignItems="center" gap="$1.5">
                <Button
                  size="$4"
                  circular
                  backgroundColor="#F0FDF4"
                  pressStyle={{ backgroundColor: colors.border }}
                  icon={<MessageCircle size={20} color={colors.success} />}
                  onPress={() => {
                    if (displayContact.phone) {
                      Linking.openURL(`sms:${displayContact.phone}`);
                    }
                  }}
                />
                <Text fontSize={11} color={colors.textSecondary} fontWeight="600">
                  Message
                </Text>
              </YStack>
              <YStack alignItems="center" gap="$1.5">
                <Button
                  size="$4"
                  circular
                  backgroundColor="#FEF3C7"
                  pressStyle={{ backgroundColor: colors.border }}
                  icon={<Mail size={20} color={colors.warning} />}
                  onPress={() => {
                    if (displayContact.email) {
                      Linking.openURL(`mailto:${displayContact.email}`);
                    }
                  }}
                />
                <Text fontSize={11} color={colors.textSecondary} fontWeight="600">
                  Email
                </Text>
              </YStack>
            </XStack>
            <Separator marginVertical="$3" borderColor={colors.borderLight} />
          </>
        )}

        {/* Info Rows */}
        <YStack>
          <InfoRow
            icon={<Phone size={18} color={colors.textSecondary} />}
            label="Phone"
            value={draft.phone ?? displayContact?.phone ?? null}
            editing={editing}
            onChangeText={(t) => setDraft((d) => ({ ...d, phone: t }))}
          />
          <Separator borderColor={colors.borderLight} marginLeft={71} />
          <InfoRow
            icon={<Mail size={18} color={colors.textSecondary} />}
            label="Email"
            value={draft.email ?? displayContact?.email ?? null}
            editing={editing}
            onChangeText={(t) => setDraft((d) => ({ ...d, email: t }))}
          />
          <Separator borderColor={colors.borderLight} marginLeft={71} />
          <InfoRow
            icon={<Building2 size={18} color={colors.textSecondary} />}
            label="Company"
            value={draft.company ?? displayContact?.company ?? null}
            editing={editing}
            onChangeText={(t) => setDraft((d) => ({ ...d, company: t }))}
          />
          <Separator borderColor={colors.borderLight} marginLeft={71} />
          <InfoRow
            icon={<StickyNote size={18} color={colors.textSecondary} />}
            label="Notes"
            value={draft.notes ?? displayContact?.notes ?? null}
            editing={editing}
            onChangeText={(t) => setDraft((d) => ({ ...d, notes: t }))}
            multiline
          />
        </YStack>

        {/* Tags */}
        <YStack paddingHorizontal="$4" paddingTop="$3" gap="$2">
          <XStack alignItems="center" gap="$2">
            <Tag size={16} color={colors.textSecondary} />
            <Text fontSize={12} color={colors.textTertiary} fontWeight="600">
              Tags
            </Text>
          </XStack>
          <XStack flexWrap="wrap" gap="$2">
            {(displayContact?.tags ?? []).length > 0 ? (
              (displayContact?.tags ?? []).map((tag) => (
                <YStack
                  key={tag}
                  backgroundColor={colors.primaryLight}
                  paddingHorizontal="$3"
                  paddingVertical="$1.5"
                  borderRadius="$6"
                >
                  <Text fontSize={13} color={colors.primary} fontWeight="600">
                    {tag}
                  </Text>
                </YStack>
              ))
            ) : (
              <Text fontSize={13} color={colors.textTertiary}>
                No tags
              </Text>
            )}
          </XStack>
        </YStack>
      </ScrollView>
    </SafeAreaView>
  );
}
