import { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { YStack, XStack, Text, H2, Button, ScrollView } from 'tamagui';
import { PhoneOff, Phone, Mic, MicOff, Volume2, VolumeX } from 'lucide-react-native';
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
  const { callId, agentId: routeAgentId, mode } = useLocalSearchParams<{
    callId: string;
    agentId?: string;
    mode?: string;
  }>();

  const isRinging = mode === 'ringing';

  const {
    contactName,
    duration,
    isMuted,
    isSpeaker,
    isAiSpeaking,
    isUserSpeaking,
    transcript,
    incomingCallerName,
    incomingCallerNumber,
    startCall: storeStartCall,
    endCall: storeEndCall,
    incrementDuration,
    clearIncomingCall,
  } = useCallStore();

  const { startCall, endCall, toggleMute, toggleSpeaker } = useVoiceSession();
  const { hasPermission, requestPermission } = useAudioPermissions();

  const scrollRef = useRef<ScrollView>(null);
  const durationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasStartedRef = useRef(false);

  const [accepted, setAccepted] = useState(false);

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

  // Ringing animation values
  const ring1Scale = useSharedValue(1);
  const ring2Scale = useSharedValue(1);
  const ring3Scale = useSharedValue(1);
  const ring1Opacity = useSharedValue(0.6);
  const ring2Opacity = useSharedValue(0.4);
  const ring3Opacity = useSharedValue(0.2);

  useEffect(() => {
    if (!isRinging) return;

    // Ring 1 - innermost
    ring1Scale.value = withRepeat(
      withTiming(1.8, { duration: 1500, easing: Easing.out(Easing.ease) }),
      -1, false
    );
    ring1Opacity.value = withRepeat(
      withTiming(0, { duration: 1500, easing: Easing.out(Easing.ease) }),
      -1, false
    );

    // Ring 2 - middle (delayed)
    const timer2 = setTimeout(() => {
      ring2Scale.value = withRepeat(
        withTiming(2.2, { duration: 1500, easing: Easing.out(Easing.ease) }),
        -1, false
      );
      ring2Opacity.value = withRepeat(
        withTiming(0, { duration: 1500, easing: Easing.out(Easing.ease) }),
        -1, false
      );
    }, 400);

    // Ring 3 - outermost (more delayed)
    const timer3 = setTimeout(() => {
      ring3Scale.value = withRepeat(
        withTiming(2.6, { duration: 1500, easing: Easing.out(Easing.ease) }),
        -1, false
      );
      ring3Opacity.value = withRepeat(
        withTiming(0, { duration: 1500, easing: Easing.out(Easing.ease) }),
        -1, false
      );
    }, 800);

    return () => {
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [isRinging, ring1Scale, ring1Opacity, ring2Scale, ring2Opacity, ring3Scale, ring3Opacity]);

  const ring1Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring1Scale.value }],
    opacity: ring1Opacity.value,
  }));
  const ring2Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring2Scale.value }],
    opacity: ring2Opacity.value,
  }));
  const ring3Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring3Scale.value }],
    opacity: ring3Opacity.value,
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

  // Start the call on mount (skip if ringing)
  useEffect(() => {
    if (isRinging) return;
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

  const handleAcceptCall = useCallback(() => {
    setAccepted(true);
    clearIncomingCall();

    const initAcceptedCall = async () => {
      const granted = hasPermission ?? (await requestPermission());
      if (!granted) {
        Alert.alert('Microphone Required', 'Voice calls require microphone access.',
          [{ text: 'OK', onPress: () => router.back() }]);
        return;
      }

      let agentToUse = routeAgentId;
      if (!agentToUse) {
        try {
          const response = await api.get('/agents');
          const agents: Agent[] = response.data?.items || response.data || [];
          if (agents.length > 0) { agentToUse = agents[0].id; }
        } catch (e) { console.error('[CallScreen] Failed to fetch agents:', e); }
      }

      if (!agentToUse) { router.back(); return; }

      storeStartCall({
        callId: callId || undefined,
        contactName: incomingCallerName || 'Unknown',
        contactNumber: incomingCallerNumber || undefined,
      });
      await startCall(agentToUse);
      durationRef.current = setInterval(() => { incrementDuration(); }, 1000);
    };

    initAcceptedCall();
  }, [clearIncomingCall, hasPermission, requestPermission, routeAgentId, callId, incomingCallerName, incomingCallerNumber, storeStartCall, startCall, incrementDuration, router]);

  const handleDeclineCall = useCallback(() => {
    clearIncomingCall();
    router.back();
  }, [clearIncomingCall, router]);

  // Ringing UI
  if (isRinging && !accepted) {
    const displayCallerName = incomingCallerName || 'Unknown Caller';
    const displayCallerNumber = incomingCallerNumber || '';

    return (
      <SafeAreaView style={styles.container}>
        <YStack flex={1} padding="$4" justifyContent="space-between" alignItems="center">
          {/* Top - Incoming Call label */}
          <YStack alignItems="center" paddingTop="$8" gap="$2">
            <Text color="#94A3B8" fontSize={16} fontWeight="500" textTransform="uppercase" letterSpacing={2}>
              Incoming Call
            </Text>
          </YStack>

          {/* Center - Pulsing avatar with rings */}
          <YStack alignItems="center" justifyContent="center" flex={1} gap="$4">
            {/* Animated rings */}
            <YStack alignItems="center" justifyContent="center" width={200} height={200}>
              <Animated.View style={[styles.ringCircle, ring3Style]} />
              <Animated.View style={[styles.ringCircle, ring2Style]} />
              <Animated.View style={[styles.ringCircle, ring1Style]} />
              {/* Avatar circle */}
              <YStack
                width={100}
                height={100}
                borderRadius={50}
                backgroundColor="rgba(0, 102, 255, 0.3)"
                alignItems="center"
                justifyContent="center"
              >
                <YStack
                  width={72}
                  height={72}
                  borderRadius={36}
                  backgroundColor="#0066FF"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Text color="white" fontSize={28} fontWeight="700">
                    {displayCallerName[0].toUpperCase()}
                  </Text>
                </YStack>
              </YStack>
            </YStack>

            {/* Caller info */}
            <YStack alignItems="center" gap="$1">
              <H2 color="white" fontWeight="700">
                {displayCallerName}
              </H2>
              {displayCallerNumber ? (
                <Text color="#94A3B8" fontSize={16}>
                  {displayCallerNumber}
                </Text>
              ) : null}
            </YStack>
          </YStack>

          {/* Bottom - Accept/Decline buttons */}
          <XStack gap="$8" paddingBottom="$8">
            {/* Decline */}
            <YStack alignItems="center" gap="$2">
              <Button
                circular
                size="$7"
                backgroundColor="#EF4444"
                pressStyle={{ opacity: 0.7 }}
                onPress={handleDeclineCall}
              >
                <PhoneOff size={32} color="white" />
              </Button>
              <Text color="#94A3B8" fontSize={13}>
                Decline
              </Text>
            </YStack>

            {/* Accept */}
            <YStack alignItems="center" gap="$2">
              <Button
                circular
                size="$7"
                backgroundColor="#22C55E"
                pressStyle={{ opacity: 0.7 }}
                onPress={handleAcceptCall}
              >
                <Phone size={32} color="white" />
              </Button>
              <Text color="#94A3B8" fontSize={13}>
                Accept
              </Text>
            </YStack>
          </XStack>
        </YStack>
      </SafeAreaView>
    );
  }

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
  ringCircle: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: '#0088FF',
  },
});
