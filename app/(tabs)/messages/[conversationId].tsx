import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Phone } from 'lucide-react-native';
import { Switch, Text, View, XStack } from 'tamagui';
import { GiftedChat, IMessage, Bubble, Send } from 'react-native-gifted-chat';
import api from '../../../services/api';
import { useAuthStore } from '../../../stores/authStore';
import { colors, spacing } from '../../../constants/theme';
import type { ConversationWithMessages, Message } from '../../../lib/types';

function mapMessagesToGifted(
  messages: Message[],
  userId: number
): IMessage[] {
  return messages
    .map((msg) => ({
      _id: msg.id,
      text: msg.body || '',
      createdAt: new Date(msg.created_at),
      user: {
        _id: msg.direction === 'outbound' ? userId : 'contact',
        name: msg.direction === 'outbound' ? (msg.is_ai ? 'AI' : 'You') : 'Contact',
      },
      is_ai: msg.is_ai,
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export default function ConversationScreen() {
  const router = useRouter();
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const user = useAuthStore((s) => s.user);
  const userId = user?.id ?? 0;

  const [messages, setMessages] = useState<IMessage[]>([]);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [togglingAi, setTogglingAi] = useState(false);

  const fetchConversation = useCallback(async () => {
    if (!workspaceId || !conversationId) return;
    try {
      const response = await api.get<ConversationWithMessages>(
        `/workspaces/${workspaceId}/conversations/${conversationId}`,
        { params: { limit: 50 } }
      );
      const data = response.data;
      setContactName(data.contact_name || data.contact_phone);
      setContactPhone(data.contact_phone);
      setAiEnabled(data.ai_enabled);
      setMessages(mapMessagesToGifted(data.messages, userId));
    } catch (err) {
      console.error('Failed to fetch conversation:', err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, conversationId, userId]);

  useEffect(() => {
    fetchConversation();
  }, [fetchConversation]);

  const onSend = useCallback(
    async (newMessages: IMessage[] = []) => {
      if (!workspaceId || !conversationId) return;
      const text = newMessages[0]?.text;
      if (!text) return;

      // Optimistic update
      setMessages((prev) => GiftedChat.append(prev, newMessages));

      try {
        await api.post(
          `/workspaces/${workspaceId}/conversations/${conversationId}/messages`,
          { body: text }
        );
      } catch (err) {
        console.error('Failed to send message:', err);
      }
    },
    [workspaceId, conversationId]
  );

  const toggleAi = useCallback(
    async (enabled: boolean) => {
      if (!workspaceId || !conversationId) return;
      setTogglingAi(true);
      setAiEnabled(enabled);
      try {
        await api.post(
          `/workspaces/${workspaceId}/conversations/${conversationId}/ai/toggle`,
          { enabled }
        );
      } catch (err) {
        console.error('Failed to toggle AI:', err);
        setAiEnabled(!enabled);
      } finally {
        setTogglingAi(false);
      }
    },
    [workspaceId, conversationId]
  );

  const renderBubble = (props: any) => {
    const isAi = props.currentMessage?.is_ai;

    return (
      <View>
        {isAi && props.position === 'right' && (
          <View
            alignSelf="flex-end"
            backgroundColor={colors.secondary}
            borderRadius={8}
            paddingHorizontal={6}
            paddingVertical={2}
            marginBottom={2}
            marginRight={4}
          >
            <Text color="#FFFFFF" fontSize={10} fontWeight="700">
              AI
            </Text>
          </View>
        )}
        <Bubble
          {...props}
          wrapperStyle={{
            right: {
              backgroundColor: colors.primary,
              borderRadius: 16,
              paddingVertical: 2,
            },
            left: {
              backgroundColor: colors.surfaceSecondary,
              borderRadius: 16,
              paddingVertical: 2,
            },
          }}
          textStyle={{
            right: {
              color: '#FFFFFF',
              fontSize: 15,
            },
            left: {
              color: colors.textPrimary,
              fontSize: 15,
            },
          }}
          timeTextStyle={{
            right: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
            left: { color: colors.textTertiary, fontSize: 11 },
          }}
        />
      </View>
    );
  };

  const renderSend = (props: any) => (
    <Send
      {...props}
      containerStyle={styles.sendContainer}
      textStyle={styles.sendText}
    >
      <View
        backgroundColor={colors.primary}
        borderRadius={16}
        width={32}
        height={32}
        alignItems="center"
        justifyContent="center"
      >
        <Text color="#FFFFFF" fontSize={16} fontWeight="700">
          {'↑'}
        </Text>
      </View>
    </Send>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <XStack
        paddingHorizontal={spacing.md}
        paddingVertical={10}
        alignItems="center"
        borderBottomWidth={0.5}
        borderBottomColor={colors.border}
        gap={12}
      >
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>

        <View
          width={36}
          height={36}
          borderRadius={18}
          backgroundColor={colors.primary}
          alignItems="center"
          justifyContent="center"
        >
          <Text color="#FFFFFF" fontSize={14} fontWeight="700">
            {contactName
              ? contactName.trim().split(/\s+/).map((w) => w[0]).join('').substring(0, 2).toUpperCase()
              : '..'}
          </Text>
        </View>

        <View flex={1}>
          <Text fontSize={16} fontWeight="700" color={colors.textPrimary} numberOfLines={1}>
            {contactName || 'Loading...'}
          </Text>
          {contactPhone && contactName !== contactPhone && (
            <Text fontSize={12} color={colors.textSecondary}>
              {contactPhone}
            </Text>
          )}
        </View>

        <TouchableOpacity activeOpacity={0.7} style={styles.headerButton}>
          <Phone size={20} color={colors.primary} />
        </TouchableOpacity>

        <XStack alignItems="center" gap={4}>
          <Text fontSize={11} color={aiEnabled ? colors.success : colors.textTertiary}>
            AI
          </Text>
          <Switch
            size="$2"
            checked={aiEnabled}
            onCheckedChange={toggleAi}
            disabled={togglingAi}
            backgroundColor={aiEnabled ? colors.success : colors.border}
          >
            <Switch.Thumb
              backgroundColor="#FFFFFF"
            />
          </Switch>
        </XStack>
      </XStack>

      {/* Chat */}
      <GiftedChat
        messages={messages}
        onSend={onSend}
        user={{ _id: userId, name: user?.full_name || 'You' }}
        renderBubble={renderBubble}
        renderSend={renderSend}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerButton: {
    padding: 6,
  },
  sendContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  sendText: {
    color: colors.primary,
    fontWeight: '700',
  },
  textInput: {
    fontSize: 15,
    lineHeight: 20,
    paddingTop: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 20,
    marginRight: 4,
  },
});
