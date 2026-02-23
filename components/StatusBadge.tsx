import { XStack, Text } from 'tamagui';
import { colors } from '@/constants/theme';

interface StatusBadgeProps {
  status: string;
  variant?: 'call' | 'sentiment';
}

const CALL_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  completed: { bg: '#DCFCE7', text: '#16A34A' },
  no_answer: { bg: '#FEE2E2', text: '#DC2626' },
  in_progress: { bg: '#FEF3C7', text: '#D97706' },
  voicemail: { bg: colors.secondaryLight, text: colors.secondary },
  ringing: { bg: '#FEF3C7', text: '#D97706' },
  failed: { bg: '#FEE2E2', text: '#DC2626' },
};

const SENTIMENT_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  positive: { bg: '#DCFCE7', text: '#16A34A', label: 'Positive' },
  negative: { bg: '#FEE2E2', text: '#DC2626', label: 'Negative' },
  neutral: { bg: colors.surfaceSecondary, text: colors.textSecondary, label: 'Neutral' },
};

export function StatusBadge({ status, variant = 'call' }: StatusBadgeProps) {
  let bg: string = colors.surfaceSecondary;
  let textColor: string = colors.textSecondary;
  let label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  if (variant === 'sentiment') {
    const s = SENTIMENT_COLORS[status] ?? SENTIMENT_COLORS.neutral;
    bg = s.bg;
    textColor = s.text;
    label = s.label;
  } else {
    const c = CALL_STATUS_COLORS[status];
    if (c) {
      bg = c.bg;
      textColor = c.text;
    }
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
