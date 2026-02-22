import { useEffect, useRef, useCallback } from 'react';
import { StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { YStack, XStack, Text, H2, Button, ScrollView } from 'tamagui';
import { PhoneOff, Mic, MicOff, Volume2, VolumeX } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { useCallStore } from '../../stores/callStore';
import { useVoiceSession } from '../../hooks/useVoiceSession';
import { useAudioPermissions } from '../../hooks/useAudioPermissions';
import api from '../../services/api';
import type { Agent } from '../../lib/types';

const CALL_BG = '#0F172A';

// Pulse animation configs per speaking state
const PULSE_CONFIGS = {
  aiSpeaking: { duration: 600, scale: 1.4, color: 'rgba(0, 140, 255, 0.4)', innerColor: '#0088FF' },
  userSpeaking: { duration: 400, scale: 1.3, color: 'rgba(34, 197, 94, 0.35)', innerColor: '#22C55E' },
  idle: { duration: 2000, scale: 1.1, color: 'rgba(0, 102, 255, 0.3)', innerColor: '#0066FF' },
};

export default function CallScreen() {
  const router = useRouter();
  const { callId, agentId: routeAgentId } = useLocalSearchParams<{
    callId: string;
    agentId?: string;
  }>();

  const {
    contactName,
    duration,
    isMuted,
    isSpeaker,
    isAiSpeaking,
    isUserSpeaking,
    transcript,
    startCall: storeStartCall,
    endCall: storeEndCall,
    incrementDuration,
  } = useCallStore();

  const { startCall, endCall, toggleMute, toggleSpeaker } = useVoiceSession();
  const { hasPermission, requestPermission } = useAudioPermissions();

  const scrollRef = useRef<ScrollView>(null);
  const durationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasStartedRef = useRef(false);

  // Determine current speaking state
  const speakingState = isAiSpeaking ? 'aiSpeaking' : isUserSpeaking ? 'userSpeaking' : 'idle';
  const pulseConfig = PULSE_CONFIGS[speakingState];

  // Pulsing animation - reacts to speaking state
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(pulseScale);
    pulseScale.value = 1;
    pulseScale.value = withRepeat(
      withTiming(pulseConfig.scale, {
        duration: pulseConfig.duration,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );
  }, [speakingState, pulseConfig.scale, pulseConfig.duration, pulseScale]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  // Format duration as mm:ss
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Status text based on speaking state
  const statusText = isAiSpeaking
    ? 'AI is speaking...'
    : isUserSpeaking
      ? 'Listening...'
      : 'Ready';

  const statusColor = isAiSpeaking
    ? '#60A5FA'
    : isUserSpeaking
      ? '#4ADE80'
      : '#64748B';

  // Start the call on mount
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    const initCall = async () => {
      // Check microphone permission
      const granted = hasPermission ?? (await requestPermission());
      if (!granted) {
        Alert.alert(
          'Microphone Required',
          'Voice calls require microphone access.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
        return;
      }

      let agentToUse = routeAgentId;

      // If no agentId provided, fetch the first available agent
      if (!agentToUse) {
        try {
          const response = await api.get('/agents');
          const agents: Agent[] = response.data?.items || response.data || [];
          if (agents.length > 0) {
            agentToUse = agents[0].id;
          }
        } catch (e) {
          console.error('[CallScreen] Failed to fetch agents:', e);
        }
      }

      if (!agentToUse) {
        console.error('[CallScreen] No agent available for call');
        router.back();
        return;
      }

      storeStartCall({
        callId: callId || undefined,
        contactName: contactName || 'AI Agent',
      });

      await startCall(agentToUse);

      // Start duration timer
      durationRef.current = setInterval(() => {
        incrementDuration();
      }, 1000);
    };

    initCall();
  }, []);

  // Auto-scroll transcript
  useEffect(() => {
    if (scrollRef.current && transcript.length > 0) {
      setTimeout(() => {
        (scrollRef.current as any)?.scrollToEnd?.({ animated: true });
      }, 100);
    }
  }, [transcript.length]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationRef.current) {
        clearInterval(durationRef.current);
      }
    };
  }, []);

  const handleEndCall = useCallback(async () => {
    if (durationRef.current) {
      clearInterval(durationRef.current);
      durationRef.current = null;
    }
    await endCall();
    storeEndCall();
    router.back();
  }, [endCall, storeEndCall, router]);

  const handleToggleMute = useCallback(() => {
    toggleMute();
  }, [toggleMute]);

  return (
    <SafeAreaView style={styles.container}>
      <YStack flex={1} padding="$4" justifyContent="space-between">
        {/* Top section - contact info and duration */}
        <YStack alignItems="center" paddingTop="$6" gap="$2">
          <H2 color="white" fontWeight="700">
            {contactName || 'AI Agent'}
          </H2>
          <Text color="#94A3B8" fontSize={18} fontFamily="$mono">
            {formatDuration(duration)}
          </Text>
        </YStack>

        {/* Center - pulsing circle with dynamic state */}
        <YStack alignItems="center" justifyContent="center" flex={1} gap="$3">
          <Animated.View style={[styles.pulseCircle, pulseStyle]}>
            <YStack
              width={120}
              height={120}
              borderRadius={60}
              backgroundColor={pulseConfig.color}
              alignItems="center"
              justifyContent="center"
            >
              <YStack
                width={80}
                height={80}
                borderRadius={40}
                backgroundColor={pulseConfig.innerColor}
                alignItems="center"
                justifyContent="center"
              >
                <Text color="white" fontSize={32} fontWeight="700">
                  {(contactName || 'AI')[0].toUpperCase()}
                </Text>
              </YStack>
            </YStack>
          </Animated.View>
          <Text color={statusColor} fontSize={13} fontWeight="500">
            {statusText}
          </Text>
        </YStack>

        {/* Live transcript */}
        <YStack height={200} marginBottom="$4">
          <ScrollView
            ref={scrollRef as any}
            showsVerticalScrollIndicator={false}
            paddingHorizontal="$2"
          >
            <YStack gap="$2" paddingVertical="$2">
              {transcript.map((entry, index) => (
                <YStack
                  key={index}
                  alignItems={entry.role === 'user' ? 'flex-end' : 'flex-start'}
                >
                  <Text
                    fontSize={11}
                    color="#64748B"
                    marginBottom="$1"
                    textTransform="uppercase"
                    letterSpacing={0.5}
                  >
                    {entry.role === 'user' ? 'You' : 'Assistant'}
                  </Text>
                  <YStack
                    backgroundColor={
                      entry.role === 'user'
                        ? 'rgba(0, 102, 255, 0.2)'
                        : 'rgba(148, 163, 184, 0.15)'
                    }
                    paddingHorizontal="$3"
                    paddingVertical="$2"
                    borderRadius="$3"
                    maxWidth="80%"
                  >
                    <Text color="white" fontSize={14} lineHeight={20}>
                      {entry.text}
                    </Text>
                  </YStack>
                </YStack>
              ))}
            </YStack>
          </ScrollView>
        </YStack>

        {/* Bottom controls */}
        <XStack justifyContent="center" alignItems="center" gap="$6" paddingBottom="$4">
          {/* Mute button */}
          <Button
            circular
            size="$5"
            backgroundColor={isMuted ? '#EF4444' : 'rgba(255,255,255,0.1)'}
            pressStyle={{ opacity: 0.7 }}
            onPress={handleToggleMute}
          >
            {isMuted ? (
              <MicOff size={24} color="white" />
            ) : (
              <Mic size={24} color="white" />
            )}
          </Button>

          {/* End call button */}
          <Button
            circular
            size="$7"
            backgroundColor="#EF4444"
            pressStyle={{ opacity: 0.7 }}
            onPress={handleEndCall}
          >
            <PhoneOff size={32} color="white" />
          </Button>

          {/* Speaker button */}
          <Button
            circular
            size="$5"
            backgroundColor={isSpeaker ? '#0066FF' : 'rgba(255,255,255,0.1)'}
            pressStyle={{ opacity: 0.7 }}
            onPress={toggleSpeaker}
          >
            {isSpeaker ? (
              <Volume2 size={24} color="white" />
            ) : (
              <VolumeX size={24} color="white" />
            )}
          </Button>
        </XStack>
      </YStack>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALL_BG,
  },
  pulseCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
