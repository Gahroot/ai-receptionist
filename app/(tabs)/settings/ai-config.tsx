import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { YStack, XStack, Text, TextArea, Button, Spinner, Slider } from 'tamagui';
import { ArrowLeft, Check } from 'lucide-react-native';
import { colors } from '../../../constants/theme';
import api from '../../../services/api';
import { useAuthStore } from '../../../stores/authStore';
import type { Agent } from '../../../lib/types';

const VOICES = [
  { id: 'alloy', label: 'Alloy', description: 'Neutral and balanced' },
  { id: 'shimmer', label: 'Shimmer', description: 'Warm and expressive' },
  { id: 'nova', label: 'Nova', description: 'Friendly and upbeat' },
  { id: 'echo', label: 'Echo', description: 'Smooth and clear' },
  { id: 'onyx', label: 'Onyx', description: 'Deep and authoritative' },
];

export default function AIConfigScreen() {
  const router = useRouter();
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [voice, setVoice] = useState('alloy');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [greeting, setGreeting] = useState('');
  const [temperature, setTemperature] = useState(0.7);

  const fetchAgent = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const res = await api.get<{ items: Agent[] }>(`/workspaces/${workspaceId}/agents`);
      const agents = res.data.items ?? res.data;
      const active = (agents as Agent[]).find((a) => a.is_active) || (agents as Agent[])[0];
      if (active) {
        setAgent(active);
        setVoice(active.voice_id);
        setSystemPrompt(active.system_prompt);
        setGreeting(active.initial_greeting || '');
        setTemperature(active.temperature);
      }
    } catch {
      Alert.alert('Error', 'Failed to load AI configuration');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchAgent();
  }, [fetchAgent]);

  const handleSave = async () => {
    if (!workspaceId || !agent) return;
    setSaving(true);
    try {
      await api.put(`/workspaces/${workspaceId}/agents/${agent.id}`, {
        voice_id: voice,
        system_prompt: systemPrompt,
        initial_greeting: greeting,
        temperature,
      });
      Alert.alert('Saved', 'AI configuration updated successfully');
    } catch {
      Alert.alert('Error', 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <YStack flex={1} alignItems="center" justifyContent="center">
          <Spinner size="large" color={colors.primary} />
        </YStack>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {/* Header */}
      <XStack paddingHorizontal="$4" paddingVertical="$3" alignItems="center" gap="$3">
        <Button
          size="$3"
          circular
          backgroundColor={colors.backgroundSecondary}
          pressStyle={{ backgroundColor: colors.surfaceSecondary }}
          onPress={() => router.back()}
          icon={<ArrowLeft size={20} color={colors.textPrimary} />}
        />
        <Text fontSize={20} fontWeight="700" color={colors.textPrimary}>
          AI Receptionist
        </Text>
      </XStack>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Voice Picker */}
        <YStack paddingHorizontal="$4" gap="$3" marginBottom="$5">
          <Text fontSize={16} fontWeight="600" color={colors.textPrimary}>
            Voice
          </Text>
          <YStack gap="$2">
            {VOICES.map((v) => (
              <XStack
                key={v.id}
                padding="$3"
                borderRadius="$3"
                borderWidth={2}
                borderColor={voice === v.id ? colors.primary : colors.borderLight}
                backgroundColor={voice === v.id ? colors.primaryLight : colors.background}
                alignItems="center"
                gap="$3"
                pressStyle={{ backgroundColor: colors.backgroundSecondary }}
                onPress={() => setVoice(v.id)}
              >
                <YStack flex={1} gap="$1">
                  <Text fontSize={15} fontWeight="600" color={colors.textPrimary}>
                    {v.label}
                  </Text>
                  <Text fontSize={13} color={colors.textSecondary}>
                    {v.description}
                  </Text>
                </YStack>
                {voice === v.id && <Check size={20} color={colors.primary} />}
              </XStack>
            ))}
          </YStack>
        </YStack>

        {/* System Prompt */}
        <YStack paddingHorizontal="$4" gap="$2" marginBottom="$5">
          <Text fontSize={16} fontWeight="600" color={colors.textPrimary}>
            System Prompt
          </Text>
          <Text fontSize={13} color={colors.textSecondary}>
            Instructions for how your AI receptionist should behave
          </Text>
          <TextArea
            value={systemPrompt}
            onChangeText={setSystemPrompt}
            placeholder="Enter system prompt..."
            numberOfLines={6}
            size="$4"
            borderRadius="$3"
            borderColor={colors.border}
            minHeight={120}
          />
        </YStack>

        {/* Greeting */}
        <YStack paddingHorizontal="$4" gap="$2" marginBottom="$5">
          <Text fontSize={16} fontWeight="600" color={colors.textPrimary}>
            Initial Greeting
          </Text>
          <Text fontSize={13} color={colors.textSecondary}>
            The first thing your AI says when answering a call
          </Text>
          <TextArea
            value={greeting}
            onChangeText={setGreeting}
            placeholder="Enter greeting..."
            numberOfLines={3}
            size="$4"
            borderRadius="$3"
            borderColor={colors.border}
            minHeight={80}
          />
        </YStack>

        {/* Temperature */}
        <YStack paddingHorizontal="$4" gap="$2" marginBottom="$6">
          <XStack justifyContent="space-between" alignItems="center">
            <Text fontSize={16} fontWeight="600" color={colors.textPrimary}>
              Temperature
            </Text>
            <Text fontSize={15} fontWeight="600" color={colors.primary}>
              {temperature.toFixed(1)}
            </Text>
          </XStack>
          <Text fontSize={13} color={colors.textSecondary}>
            Higher values make responses more creative, lower values more focused
          </Text>
          <Slider
            value={[temperature]}
            onValueChange={([val]) => setTemperature(Math.round(val * 10) / 10)}
            min={0}
            max={1}
            step={0.1}
            size="$4"
          >
            <Slider.Track backgroundColor={colors.borderLight}>
              <Slider.TrackActive backgroundColor={colors.primary} />
            </Slider.Track>
            <Slider.Thumb index={0} circular size="$2" backgroundColor={colors.primary} />
          </Slider>
          <XStack justifyContent="space-between">
            <Text fontSize={12} color={colors.textTertiary}>Focused</Text>
            <Text fontSize={12} color={colors.textTertiary}>Creative</Text>
          </XStack>
        </YStack>

        {/* Save Button */}
        <YStack paddingHorizontal="$4">
          <Button
            size="$5"
            backgroundColor={colors.primary}
            color="white"
            borderRadius="$4"
            fontWeight="600"
            onPress={handleSave}
            disabled={saving}
            pressStyle={{ opacity: 0.8 }}
          >
            {saving ? <Spinner color="white" /> : 'Save Changes'}
          </Button>
        </YStack>
      </ScrollView>
    </SafeAreaView>
  );
}
