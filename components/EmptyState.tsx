import { YStack, Text, Button } from 'tamagui';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors } from '@/constants/theme';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <Animated.View entering={FadeInDown.duration(400).delay(100)}>
      <YStack alignItems="center" justifyContent="center" paddingVertical="$8" paddingHorizontal="$6" gap="$3">
        <YStack
          width={64}
          height={64}
          borderRadius={32}
          backgroundColor={colors.primaryLight}
          alignItems="center"
          justifyContent="center"
          marginBottom="$2"
        >
          {icon}
        </YStack>
        <Text fontSize={17} fontWeight="700" color={colors.textPrimary} textAlign="center">
          {title}
        </Text>
        {description && (
          <Text fontSize={14} color={colors.textSecondary} textAlign="center" lineHeight={22}>
            {description}
          </Text>
        )}
        {actionLabel && onAction && (
          <Button
            size="$4"
            backgroundColor={colors.primary}
            color="#FFFFFF"
            borderRadius="$4"
            fontWeight="600"
            pressStyle={{ backgroundColor: colors.primaryDark }}
            onPress={onAction}
            marginTop="$2"
          >
            {actionLabel}
          </Button>
        )}
      </YStack>
    </Animated.View>
  );
}
