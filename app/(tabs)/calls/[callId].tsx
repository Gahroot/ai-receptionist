import { useState, useEffect, useRef, useCallback } from 'react';
import { ActivityIndicator, Alert } from 'react-native';
import { YStack, XStack, Text, Button, ScrollView, Separator } from 'tamagui';
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
} from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { format } from 'date-fns';
import { Audio } from 'expo-av';
import { colors } from '../../../constants/theme';
import api from '../../../services/api';
import { useAuthStore } from '../../../stores/authStore';
import type { CallResponse, TranscriptEntry } from '../../../lib/types';

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

function DirectionIcon({ call }: { call: CallResponse }) {
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

  const [call, setCall] = useState<CallResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  const [callingBack, setCallingBack] = useState(false);

  // Audio state
  const soundRef = useRef<Audio.Sound | null>(null);
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
  }, [workspaceId, callId]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const handlePlayPause = useCallback(async () => {
    if (!call?.recording_url) return;

    try {
      if (soundRef.current) {
        if (isPlaying) {
          await soundRef.current.pauseAsync();
          setIsPlaying(false);
        } else {
          await soundRef.current.playAsync();
          setIsPlaying(true);
        }
        return;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: call.recording_url },
        { shouldPlay: true },
        (status) => {
          if (!status.isLoaded) return;
          setAudioPosition(status.positionMillis);
          setAudioDuration(status.durationMillis ?? 0);
          if (status.didJustFinish) {
            setIsPlaying(false);
            setAudioPosition(0);
            soundRef.current?.setPositionAsync(0);
          }
        }
      );
      soundRef.current = sound;
      setIsPlaying(true);
    } catch (err) {
      console.error('Audio playback error:', err);
    }
  }, [call?.recording_url, isPlaying]);

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
              <StatusBadge status={call.status} />
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
