import { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, Alert } from 'react-native';
import { YStack, XStack, Text, Button, ScrollView, Separator, Spinner } from 'tamagui';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Phone,
  MessageCircle,
  User,
  Play,
  Pause,
  Bot,
  Voicemail,
  Sparkles,
  CheckCircle,
  ChevronRight,
} from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { format } from 'date-fns';
import { useAudioPlayer } from 'expo-audio';
import { colors } from '../../../constants/theme';
import api from '../../../services/api';
import { useAuthStore } from '../../../stores/authStore';
import { useVoicemailStore } from '../../../stores/voicemailStore';
import type { CallResponse, CallSummary, TranscriptEntry, ActionItem } from '../../../lib/types';

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds === 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function StatusBadge({ status }: { status: string }) {
  let bg: string = colors.surfaceSecondary;
  let textColor: string = colors.textSecondary;

  if (status === 'completed') {
    bg = '#DCFCE7';
    textColor = '#16A34A';
  } else if (status === 'no_answer') {
    bg = '#FEE2E2';
    textColor = '#DC2626';
  } else if (status === 'in_progress') {
    bg = '#FEF3C7';
    textColor = '#D97706';
  } else if (status === 'voicemail') {
    bg = colors.secondaryLight;
    textColor = colors.secondary;
  }

  return (
    <XStack
      backgroundColor={bg}
      paddingHorizontal="$2"
      paddingVertical="$1"
      borderRadius="$2"
    >
      <Text fontSize={12} fontWeight="600" color={textColor}>
        {status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
      </Text>
    </XStack>
  );
}

function SentimentBadge({ sentiment }: { sentiment: CallSummary['sentiment'] }) {
  let bg: string;
  let textColor: string;
  let label: string;

  if (sentiment === 'positive') {
    bg = '#DCFCE7';
    textColor = '#16A34A';
    label = 'Positive';
  } else if (sentiment === 'negative') {
    bg = '#FEE2E2';
    textColor = '#DC2626';
    label = 'Negative';
  } else {
    bg = colors.surfaceSecondary;
    textColor = colors.textSecondary;
    label = 'Neutral';
  }

  return (
    <XStack
      backgroundColor={bg}
      paddingHorizontal="$2"
      paddingVertical="$1"
      borderRadius="$2"
    >
      <Text fontSize={12} fontWeight="600" color={textColor}>
        {label}
      </Text>
    </XStack>
  );
}

function DirectionIcon({ call }: { call: CallResponse }) {
  if (call.is_voicemail) {
    return <Voicemail size={20} color={colors.secondary} />;
  }
  if (call.status === 'no_answer') {
    return <PhoneMissed size={20} color={colors.error} />;
  }
  if (call.direction === 'inbound') {
    return <PhoneIncoming size={20} color={colors.success} />;
  }
  return <PhoneOutgoing size={20} color={colors.primary} />;
}

export default function CallDetailScreen() {
  const { callId } = useLocalSearchParams<{ callId: string }>();
  const router = useRouter();
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const markAsRead = useVoicemailStore((s) => s.markAsRead);

  const [call, setCall] = useState<CallResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  const [callingBack, setCallingBack] = useState(false);

  // AI Summary state
  const [summary, setSummary] = useState<CallSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryFetched, setSummaryFetched] = useState(false);

  // Audio state
  const player = useAudioPlayer(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioPosition, setAudioPosition] = useState(0);

  useEffect(() => {
    if (!workspaceId || !callId) return;

    const fetchCall = async () => {
      try {
        const response = await api.get<CallResponse>(
          `/workspaces/${workspaceId}/calls/${callId}`
        );
        const data = response.data;
        setCall(data);

        // Mark voicemail as read
        if (data.is_voicemail && !data.is_read) {
          markAsRead(workspaceId, callId);
        }

        // Set inline summary if present
        if (data.summary) {
          setSummary(data.summary);
          setSummaryFetched(true);
        }

        if (data.transcript) {
          try {
            const parsed = JSON.parse(data.transcript);
            if (Array.isArray(parsed)) {
              setTranscript(parsed);
            }
          } catch {
            // transcript isn't valid JSON
          }
        }
      } catch (err) {
        console.error('Failed to fetch call:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCall();
  }, [workspaceId, callId, markAsRead]);

  // Fetch AI summary for completed calls if not inline
  useEffect(() => {
    if (!workspaceId || !callId || !call) return;
    if (call.status !== 'completed' || summaryFetched) return;

    const fetchSummary = async () => {
      setSummaryLoading(true);
      try {
        const response = await api.get<CallSummary>(
          `/workspaces/${workspaceId}/calls/${callId}/summary`
        );
        setSummary(response.data);
      } catch {
        // 404 = no summary yet, that's fine
      } finally {
        setSummaryLoading(false);
        setSummaryFetched(true);
      }
    };

    fetchSummary();
  }, [workspaceId, callId, call, summaryFetched]);

  // Track playback status
  useEffect(() => {
    const subscription = player.addListener('playbackStatusUpdate', () => {
      setAudioPosition(player.currentTime * 1000);
      setAudioDuration(player.duration * 1000);
      if (!player.playing && isPlaying && player.currentTime > 0) {
        setIsPlaying(false);
        setAudioPosition(0);
        player.seekTo(0);
      }
    });
    return () => {
      subscription.remove();
    };
  }, [player, isPlaying]);

  const handlePlayPause = useCallback(async () => {
    if (!call?.recording_url) return;

    try {
      if (isPlaying) {
        player.pause();
        setIsPlaying(false);
      } else {
        // Load new source if needed
        if (player.duration === 0) {
          player.replace({ uri: call.recording_url });
        }
        player.play();
        setIsPlaying(true);
      }
    } catch (err) {
      console.error('Audio playback error:', err);
    }
  }, [call?.recording_url, isPlaying, player]);

  const handleGenerateSummary = useCallback(async () => {
    if (!workspaceId || !callId) return;
    setSummaryLoading(true);
    try {
      const response = await api.post<CallSummary>(
        `/workspaces/${workspaceId}/calls/${callId}/summary`
      );
      setSummary(response.data);
    } catch {
      Alert.alert('Error', 'Failed to generate summary');
    } finally {
      setSummaryLoading(false);
    }
  }, [workspaceId, callId]);

  const handleActionItem = useCallback(
    (item: ActionItem) => {
      if (!call) return;

      switch (item.type) {
        case 'call_back': {
          if (!workspaceId) return;
          const customerNumber = call.direction === 'inbound' ? call.from_number : call.to_number;
          const workspaceNumber = call.direction === 'inbound' ? call.to_number : call.from_number;
          api
            .post(`/workspaces/${workspaceId}/calls`, {
              to_number: customerNumber,
              from_phone_number: workspaceNumber,
              agent_id: call.agent_id,
            })
            .then((res) => router.push(`/call/${res.data.id}`))
            .catch(() => Alert.alert('Error', 'Failed to initiate call back'));
          break;
        }
        case 'send_message':
        case 'follow_up':
          router.push('/(tabs)/messages');
          break;
        case 'add_contact':
          router.push('/(tabs)/contacts');
          break;
        default:
          break;
      }
    },
    [call, workspaceId, router]
  );

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <YStack flex={1} alignItems="center" justifyContent="center">
          <ActivityIndicator size="large" color={colors.primary} />
        </YStack>
      </SafeAreaView>
    );
  }

  if (!call) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Text color={colors.textTertiary}>Call not found</Text>
        </YStack>
      </SafeAreaView>
    );
  }

  const displayName = call.contact_name || call.from_number || call.to_number || 'Unknown';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
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
          backgroundColor="transparent"
          pressStyle={{ backgroundColor: colors.surfaceSecondary }}
          onPress={() => router.back()}
          icon={<ArrowLeft size={22} color={colors.textPrimary} />}
        />
        <YStack flex={1}>
          <XStack alignItems="center" gap="$2">
            <Text fontSize={18} fontWeight="700" color={colors.textPrimary}>
              {displayName}
            </Text>
            <DirectionIcon call={call} />
          </XStack>
          {call.contact_name && (call.from_number || call.to_number) && (
            <Text fontSize={13} color={colors.textSecondary}>
              {call.direction === 'inbound' ? call.from_number : call.to_number}
            </Text>
          )}
        </YStack>
        {call.is_ai && (
          <XStack
            backgroundColor="#F0EBFF"
            paddingHorizontal="$2"
            paddingVertical="$1"
            borderRadius="$2"
            alignItems="center"
            gap="$1"
          >
            <Bot size={14} color={colors.secondary} />
            <Text fontSize={12} fontWeight="600" color={colors.secondary}>
              AI
            </Text>
          </XStack>
        )}
      </XStack>

      <ScrollView flex={1}>
        <YStack paddingHorizontal="$4" gap="$4" paddingBottom="$6">
          {/* Call Info Section */}
          <YStack
            backgroundColor={colors.surfaceSecondary}
            borderRadius="$4"
            padding="$4"
            gap="$3"
          >
            <XStack justifyContent="space-between" alignItems="center">
              <Text fontSize={13} color={colors.textSecondary}>
                Status
              </Text>
              <StatusBadge status={call.is_voicemail ? 'voicemail' : call.status} />
            </XStack>

            <Separator backgroundColor={colors.border} />

            <XStack justifyContent="space-between" alignItems="center">
              <Text fontSize={13} color={colors.textSecondary}>
                From
              </Text>
              <Text fontSize={14} fontWeight="500" color={colors.textPrimary}>
                {call.from_number || '-'}
              </Text>
            </XStack>

            <Separator backgroundColor={colors.border} />

            <XStack justifyContent="space-between" alignItems="center">
              <Text fontSize={13} color={colors.textSecondary}>
                To
              </Text>
              <Text fontSize={14} fontWeight="500" color={colors.textPrimary}>
                {call.to_number || '-'}
              </Text>
            </XStack>

            <Separator backgroundColor={colors.border} />

            <XStack justifyContent="space-between" alignItems="center">
              <Text fontSize={13} color={colors.textSecondary}>
                Date & Time
              </Text>
              <Text fontSize={14} fontWeight="500" color={colors.textPrimary}>
                {format(new Date(call.created_at), 'MMM d, yyyy h:mm a')}
              </Text>
            </XStack>

            <Separator backgroundColor={colors.border} />

            <XStack justifyContent="space-between" alignItems="center">
              <Text fontSize={13} color={colors.textSecondary}>
                Duration
              </Text>
              <Text fontSize={14} fontWeight="500" color={colors.textPrimary}>
                {formatDuration(call.duration_seconds)}
              </Text>
            </XStack>

            {call.agent_name && (
              <>
                <Separator backgroundColor={colors.border} />
                <XStack justifyContent="space-between" alignItems="center">
                  <Text fontSize={13} color={colors.textSecondary}>
                    Agent
                  </Text>
                  <Text fontSize={14} fontWeight="500" color={colors.textPrimary}>
                    {call.agent_name}
                  </Text>
                </XStack>
              </>
            )}
          </YStack>

          {/* Voicemail Transcription Section */}
          {call.is_voicemail && call.voicemail_transcription && (
            <YStack gap="$2">
              <XStack alignItems="center" gap="$2">
                <Voicemail size={18} color={colors.secondary} />
                <Text fontSize={16} fontWeight="600" color={colors.textPrimary}>
                  Voicemail Transcription
                </Text>
              </XStack>
              <YStack
                backgroundColor={colors.secondaryLight}
                borderRadius="$4"
                padding="$3"
                borderLeftWidth={3}
                borderLeftColor={colors.secondary}
              >
                <Text fontSize={14} color={colors.textPrimary} lineHeight={22}>
                  {call.voicemail_transcription}
                </Text>
              </YStack>
            </YStack>
          )}

          {/* AI Summary Section */}
          {call.status === 'completed' && (
            <YStack gap="$2">
              <XStack alignItems="center" gap="$2">
                <Sparkles size={18} color={colors.primary} />
                <Text fontSize={16} fontWeight="600" color={colors.textPrimary}>
                  AI Summary
                </Text>
              </XStack>

              {summary ? (
                <YStack
                  backgroundColor={colors.surfaceSecondary}
                  borderRadius="$4"
                  padding="$3"
                  gap="$3"
                >
                  {/* Summary text */}
                  <Text fontSize={14} color={colors.textPrimary} lineHeight={22}>
                    {summary.summary}
                  </Text>

                  {/* Key topics */}
                  {summary.key_topics.length > 0 && (
                    <XStack flexWrap="wrap" gap="$1.5">
                      {summary.key_topics.map((topic) => (
                        <XStack
                          key={topic}
                          backgroundColor={colors.primaryLight}
                          paddingHorizontal="$2"
                          paddingVertical="$1"
                          borderRadius="$6"
                        >
                          <Text fontSize={12} fontWeight="500" color={colors.primary}>
                            {topic}
                          </Text>
                        </XStack>
                      ))}
                    </XStack>
                  )}

                  {/* Sentiment */}
                  <XStack alignItems="center" gap="$2">
                    <Text fontSize={13} color={colors.textSecondary}>
                      Sentiment
                    </Text>
                    <SentimentBadge sentiment={summary.sentiment} />
                  </XStack>

                  {/* Action items */}
                  {summary.action_items.length > 0 && (
                    <YStack gap="$1">
                      <Text fontSize={13} fontWeight="600" color={colors.textSecondary}>
                        Suggested Actions
                      </Text>
                      {summary.action_items.map((item, index) => (
                        <XStack
                          key={index}
                          alignItems="center"
                          gap="$2"
                          paddingVertical="$2"
                          pressStyle={{ opacity: 0.7 }}
                          onPress={() => handleActionItem(item)}
                        >
                          <CheckCircle size={16} color={colors.success} />
                          <Text
                            flex={1}
                            fontSize={14}
                            color={colors.textPrimary}
                          >
                            {item.label}
                          </Text>
                          <ChevronRight size={16} color={colors.textTertiary} />
                        </XStack>
                      ))}
                    </YStack>
                  )}
                </YStack>
              ) : summaryLoading ? (
                <YStack
                  backgroundColor={colors.surfaceSecondary}
                  borderRadius="$4"
                  padding="$4"
                  alignItems="center"
                  gap="$2"
                >
                  <Spinner size="small" color={colors.primary} />
                  <Text fontSize={13} color={colors.textSecondary}>
                    Generating summary...
                  </Text>
                </YStack>
              ) : summaryFetched ? (
                <Button
                  size="$4"
                  backgroundColor={colors.secondaryLight}
                  color={colors.secondary}
                  fontWeight="600"
                  borderRadius="$4"
                  pressStyle={{ backgroundColor: colors.border }}
                  icon={<Sparkles size={16} color={colors.secondary} />}
                  onPress={handleGenerateSummary}
                >
                  Generate AI Summary
                </Button>
              ) : null}
            </YStack>
          )}

          {/* Recording Section */}
          {call.recording_url && (
            <YStack gap="$2">
              <Text fontSize={16} fontWeight="600" color={colors.textPrimary}>
                Recording
              </Text>
              <XStack
                backgroundColor={colors.surfaceSecondary}
                borderRadius="$4"
                padding="$3"
                alignItems="center"
                gap="$3"
              >
                <Button
                  size="$3"
                  circular
                  backgroundColor={colors.primary}
                  pressStyle={{ backgroundColor: colors.primaryDark }}
                  onPress={handlePlayPause}
                  icon={
                    isPlaying ? (
                      <Pause size={18} color="#FFFFFF" />
                    ) : (
                      <Play size={18} color="#FFFFFF" />
                    )
                  }
                />
                <YStack flex={1} gap="$1">
                  {/* Progress bar */}
                  <YStack
                    height={4}
                    backgroundColor={colors.border}
                    borderRadius="$1"
                    overflow="hidden"
                  >
                    <YStack
                      height={4}
                      backgroundColor={colors.primary}
                      borderRadius="$1"
                      width={
                        audioDuration > 0
                          ? `${(audioPosition / audioDuration) * 100}%`
                          : '0%'
                      }
                    />
                  </YStack>
                  <XStack justifyContent="space-between">
                    <Text fontSize={11} color={colors.textTertiary}>
                      {formatDuration(Math.floor(audioPosition / 1000))}
                    </Text>
                    <Text fontSize={11} color={colors.textTertiary}>
                      {formatDuration(Math.floor(audioDuration / 1000))}
                    </Text>
                  </XStack>
                </YStack>
              </XStack>
            </YStack>
          )}

          {/* Transcript Section */}
          {transcript.length > 0 && (
            <YStack gap="$2">
              <Text fontSize={16} fontWeight="600" color={colors.textPrimary}>
                Transcript
              </Text>
              <YStack
                backgroundColor={colors.surfaceSecondary}
                borderRadius="$4"
                padding="$3"
                gap="$2"
              >
                {transcript.map((entry, index) => {
                  const isAssistant = entry.role === 'assistant';
                  return (
                    <XStack
                      key={index}
                      justifyContent={isAssistant ? 'flex-start' : 'flex-end'}
                    >
                      <YStack
                        maxWidth="80%"
                        backgroundColor={isAssistant ? '#FFFFFF' : colors.primary}
                        paddingHorizontal="$3"
                        paddingVertical="$2"
                        borderRadius="$3"
                        borderTopLeftRadius={isAssistant ? '$1' : '$3'}
                        borderTopRightRadius={isAssistant ? '$3' : '$1'}
                      >
                        <Text
                          fontSize={11}
                          fontWeight="600"
                          color={isAssistant ? colors.textTertiary : 'rgba(255,255,255,0.7)'}
                          marginBottom="$1"
                        >
                          {isAssistant ? 'AI Assistant' : 'Caller'}
                        </Text>
                        <Text
                          fontSize={14}
                          color={isAssistant ? colors.textPrimary : '#FFFFFF'}
                          lineHeight={20}
                        >
                          {entry.text}
                        </Text>
                      </YStack>
                    </XStack>
                  );
                })}
              </YStack>
            </YStack>
          )}

          {/* Action Buttons */}
          <XStack gap="$3" justifyContent="center" paddingTop="$2">
            <YStack alignItems="center" gap="$1.5">
              <Button
                size="$4"
                circular
                backgroundColor={colors.primaryLight}
                pressStyle={{ backgroundColor: colors.primary }}
                icon={<Phone size={20} color={colors.primary} />}
                disabled={callingBack}
                onPress={async () => {
                  if (!workspaceId || !call) return;
                  setCallingBack(true);
                  try {
                    const customerNumber = call.direction === 'inbound' ? call.from_number : call.to_number;
                    const workspaceNumber = call.direction === 'inbound' ? call.to_number : call.from_number;
                    const res = await api.post(`/workspaces/${workspaceId}/calls`, {
                      to_number: customerNumber,
                      from_phone_number: workspaceNumber,
                      agent_id: call.agent_id,
                    });
                    router.push(`/call/${res.data.id}`);
                  } catch {
                    Alert.alert('Error', 'Failed to initiate call back');
                  } finally {
                    setCallingBack(false);
                  }
                }}
              />
              <Text fontSize={12} color={colors.textSecondary}>
                Call Back
              </Text>
            </YStack>

            <YStack alignItems="center" gap="$1.5">
              <Button
                size="$4"
                circular
                backgroundColor={colors.primaryLight}
                pressStyle={{ backgroundColor: colors.primary }}
                icon={<MessageCircle size={20} color={colors.primary} />}
                onPress={() => {
                  router.push('/(tabs)/messages');
                }}
              />
              <Text fontSize={12} color={colors.textSecondary}>
                Message
              </Text>
            </YStack>

            {call.contact_id && (
              <YStack alignItems="center" gap="$1.5">
                <Button
                  size="$4"
                  circular
                  backgroundColor={colors.primaryLight}
                  pressStyle={{ backgroundColor: colors.primary }}
                  icon={<User size={20} color={colors.primary} />}
                  onPress={() => {
                    router.push(`/(tabs)/contacts/${call.contact_id}`);
                  }}
                />
                <Text fontSize={12} color={colors.textSecondary}>
                  Contact
                </Text>
              </YStack>
            )}
          </XStack>
        </YStack>
      </ScrollView>
    </SafeAreaView>
  );
}
