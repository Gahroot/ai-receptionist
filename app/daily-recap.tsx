import { useEffect, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { YStack, XStack, Text, Card, Button, Spinner, ScrollView } from 'tamagui';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Phone,
  PhoneMissed,
  MessageCircle,
  Mail,
  Voicemail,
  UserPlus,
  AlertCircle,
  Circle,
  CheckCircle2,
} from 'lucide-react-native';
import { format, addDays, subDays, isToday, parseISO } from 'date-fns';
import { colors } from '../constants/theme';
import { useAuthStore } from '../stores/authStore';
import { useRecapStore } from '../stores/recapStore';
import type { NotableInteraction, RecapActionItem } from '../lib/types';

const SENTIMENT_COLORS = {
  positive: colors.success,
  neutral: colors.textTertiary,
  negative: colors.error,
};

const METRIC_CONFIG = [
  { key: 'calls_answered', label: 'Calls Answered', icon: Phone, color: colors.primary, bg: colors.primaryLight },
  { key: 'calls_missed', label: 'Calls Missed', icon: PhoneMissed, color: colors.error, bg: '#FEE2E2' },
  { key: 'messages_received', label: 'Messages In', icon: MessageCircle, color: colors.success, bg: '#F0FDF4' },
  { key: 'messages_sent', label: 'Messages Out', icon: Mail, color: colors.secondary, bg: colors.secondaryLight },
  { key: 'voicemails', label: 'Voicemails', icon: Voicemail, color: colors.warning, bg: '#FEF3C7' },
  { key: 'new_contacts', label: 'New Contacts', icon: UserPlus, color: '#0EA5E9', bg: '#E0F2FE' },
] as const;

export default function DailyRecapScreen() {
  const router = useRouter();
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const { currentRecap, isLoading, error, selectedDate, fetchRecap, generateRecap, setSelectedDate } =
    useRecapStore();

  const selectedDateObj = parseISO(selectedDate);
  const isSelectedToday = isToday(selectedDateObj);

  const loadRecap = useCallback(() => {
    if (workspaceId) {
      fetchRecap(workspaceId, selectedDate);
    }
  }, [workspaceId, selectedDate, fetchRecap]);

  useEffect(() => {
    loadRecap();
  }, [loadRecap]);

  const handlePrevDay = () => {
    const prev = format(subDays(selectedDateObj, 1), 'yyyy-MM-dd');
    setSelectedDate(prev);
  };

  const handleNextDay = () => {
    if (isSelectedToday) return;
    const next = format(addDays(selectedDateObj, 1), 'yyyy-MM-dd');
    setSelectedDate(next);
  };

  const handleGenerate = () => {
    if (workspaceId) {
      generateRecap(workspaceId);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <XStack paddingHorizontal="$4" paddingVertical="$3" alignItems="center" gap="$3">
        <Button
          size="$3"
          circular
          backgroundColor={colors.surfaceSecondary}
          pressStyle={{ backgroundColor: colors.border }}
          onPress={() => router.back()}
          icon={<X size={20} color={colors.textPrimary} />}
        />
        <Text flex={1} fontSize={20} fontWeight="700" color={colors.textPrimary}>
          Daily Recap
        </Text>
      </XStack>

      {/* Date Navigator */}
      <XStack paddingHorizontal="$4" paddingBottom="$3" alignItems="center" justifyContent="center" gap="$3">
        <Button
          size="$3"
          circular
          backgroundColor={colors.backgroundSecondary}
          pressStyle={{ backgroundColor: colors.surfaceSecondary }}
          onPress={handlePrevDay}
          icon={<ChevronLeft size={20} color={colors.textPrimary} />}
        />
        <Text fontSize={16} fontWeight="600" color={colors.textPrimary} minWidth={180} textAlign="center">
          {isSelectedToday ? 'Today' : format(selectedDateObj, 'EEEE, MMM d')}
        </Text>
        <Button
          size="$3"
          circular
          backgroundColor={colors.backgroundSecondary}
          pressStyle={{ backgroundColor: colors.surfaceSecondary }}
          onPress={handleNextDay}
          disabled={isSelectedToday}
          opacity={isSelectedToday ? 0.3 : 1}
          icon={<ChevronRight size={20} color={colors.textPrimary} />}
        />
      </XStack>

      {/* Loading State */}
      {isLoading && (
        <YStack flex={1} alignItems="center" justifyContent="center" gap="$3">
          <Spinner size="large" color={colors.primary} />
          <Text fontSize={14} color={colors.textSecondary}>
            Loading recap...
          </Text>
        </YStack>
      )}

      {/* Error State */}
      {!isLoading && error && (
        <YStack flex={1} alignItems="center" justifyContent="center" paddingHorizontal="$4">
          <Card
            padding="$4"
            backgroundColor="#FEF2F2"
            borderRadius="$4"
            borderWidth={1}
            borderColor="#FECACA"
            width="100%"
          >
            <XStack gap="$3" alignItems="flex-start">
              <AlertCircle size={20} color={colors.error} />
              <YStack flex={1} gap="$1">
                <Text fontSize={14} fontWeight="600" color={colors.error}>
                  Error
                </Text>
                <Text fontSize={13} color={colors.textSecondary}>
                  {error}
                </Text>
              </YStack>
            </XStack>
          </Card>
        </YStack>
      )}

      {/* No Recap - Generate */}
      {!isLoading && !error && !currentRecap && (
        <YStack flex={1} alignItems="center" justifyContent="center" paddingHorizontal="$4" gap="$4">
          <YStack
            width={64}
            height={64}
            borderRadius={32}
            backgroundColor={colors.secondaryLight}
            alignItems="center"
            justifyContent="center"
          >
            <Sparkles size={28} color={colors.secondary} />
          </YStack>
          <YStack alignItems="center" gap="$2">
            <Text fontSize={17} fontWeight="600" color={colors.textPrimary}>
              No recap for this day
            </Text>
            <Text fontSize={14} color={colors.textSecondary} textAlign="center" lineHeight={22}>
              Generate an AI-powered summary of your calls, messages, and interactions
            </Text>
          </YStack>
          <Button
            size="$5"
            backgroundColor={colors.primary}
            color="white"
            borderRadius="$4"
            fontWeight="600"
            pressStyle={{ opacity: 0.8 }}
            icon={<Sparkles size={18} color="white" />}
            onPress={handleGenerate}
          >
            Generate Recap
          </Button>
        </YStack>
      )}

      {/* Recap Content */}
      {!isLoading && !error && currentRecap && (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {/* Summary Card */}
          <Card
            padding="$4"
            backgroundColor={colors.backgroundSecondary}
            borderRadius="$4"
            borderWidth={1}
            borderColor={colors.borderLight}
            marginBottom="$4"
          >
            <YStack gap="$3">
              <XStack gap="$2" alignItems="center">
                <Sparkles size={18} color={colors.secondary} />
                <Text fontSize={15} fontWeight="700" color={colors.textPrimary}>
                  Summary
                </Text>
              </XStack>
              <Text fontSize={14} lineHeight={22} color={colors.textPrimary}>
                {currentRecap.summary}
              </Text>
            </YStack>
          </Card>

          {/* Metrics Grid */}
          <Text fontSize={16} fontWeight="600" color={colors.textPrimary} marginBottom="$3">
            Metrics
          </Text>
          <XStack flexWrap="wrap" gap="$2" marginBottom="$4">
            {METRIC_CONFIG.map(({ key, label, icon: Icon, color, bg }) => (
              <YStack
                key={key}
                width="31%"
                padding="$3"
                backgroundColor={colors.background}
                borderRadius="$3"
                borderWidth={1}
                borderColor={colors.borderLight}
                alignItems="center"
                gap="$1"
              >
                <YStack
                  width={36}
                  height={36}
                  borderRadius={18}
                  backgroundColor={bg}
                  alignItems="center"
                  justifyContent="center"
                >
                  <Icon size={18} color={color} />
                </YStack>
                <Text fontSize={20} fontWeight="700" color={colors.textPrimary}>
                  {currentRecap.metrics[key]}
                </Text>
                <Text fontSize={10} color={colors.textSecondary} textAlign="center">
                  {label}
                </Text>
              </YStack>
            ))}
          </XStack>

          {/* Notable Interactions */}
          {currentRecap.notable_interactions.length > 0 && (
            <>
              <Text fontSize={16} fontWeight="600" color={colors.textPrimary} marginBottom="$3">
                Notable Interactions
              </Text>
              <YStack gap="$2" marginBottom="$4">
                {currentRecap.notable_interactions.map((interaction: NotableInteraction) => (
                  <Card
                    key={interaction.id}
                    padding="$3"
                    backgroundColor={colors.background}
                    borderRadius="$3"
                    borderWidth={1}
                    borderColor={colors.borderLight}
                  >
                    <XStack gap="$3" alignItems="flex-start">
                      <YStack
                        width={8}
                        height={8}
                        borderRadius={4}
                        backgroundColor={SENTIMENT_COLORS[interaction.sentiment]}
                        marginTop="$1"
                      />
                      <YStack flex={1} gap="$1">
                        <XStack justifyContent="space-between" alignItems="center">
                          <Text fontSize={14} fontWeight="600" color={colors.textPrimary}>
                            {interaction.contact_name || 'Unknown'}
                          </Text>
                          <Text fontSize={11} color={colors.textTertiary}>
                            {interaction.time}
                          </Text>
                        </XStack>
                        <Text fontSize={13} color={colors.textSecondary} lineHeight={20}>
                          {interaction.summary}
                        </Text>
                      </YStack>
                    </XStack>
                  </Card>
                ))}
              </YStack>
            </>
          )}

          {/* Action Items */}
          {currentRecap.action_items.length > 0 && (
            <>
              <Text fontSize={16} fontWeight="600" color={colors.textPrimary} marginBottom="$3">
                Action Items
              </Text>
              <YStack gap="$2" marginBottom="$4">
                {currentRecap.action_items.map((item: RecapActionItem) => (
                  <Card
                    key={item.id}
                    padding="$3"
                    backgroundColor={colors.background}
                    borderRadius="$3"
                    borderWidth={1}
                    borderColor={colors.borderLight}
                  >
                    <XStack gap="$3" alignItems="flex-start">
                      {item.completed ? (
                        <CheckCircle2 size={20} color={colors.success} />
                      ) : (
                        <Circle size={20} color={colors.textTertiary} />
                      )}
                      <YStack flex={1} gap="$1">
                        <Text
                          fontSize={14}
                          fontWeight="500"
                          color={item.completed ? colors.textTertiary : colors.textPrimary}
                          textDecorationLine={item.completed ? 'line-through' : 'none'}
                        >
                          {item.description}
                        </Text>
                        {item.contact_name && (
                          <Text fontSize={12} color={colors.textSecondary}>
                            {item.contact_name}
                          </Text>
                        )}
                      </YStack>
                    </XStack>
                  </Card>
                ))}
              </YStack>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
