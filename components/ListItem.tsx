import { XStack, YStack, Text } from 'tamagui';
import { colors } from '@/constants/theme';

interface ListItemProps {
  avatar?: React.ReactNode;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
}

export function ListItem({ avatar, title, subtitle, right, onPress }: ListItemProps) {
  return (
    <XStack
      paddingHorizontal="$4"
      paddingVertical="$3"
      alignItems="center"
      gap="$3"
      pressStyle={{ backgroundColor: colors.backgroundSecondary }}
      onPress={onPress}
    >
      {avatar}
      <YStack flex={1} gap="$1">
        <Text fontSize={15} fontWeight="600" color={colors.textPrimary} numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text fontSize={13} color={colors.textSecondary} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </YStack>
      {right}
    </XStack>
  );
}
