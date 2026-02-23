import { Card, YStack, XStack, Text } from 'tamagui';
import { TrendingUp, TrendingDown } from 'lucide-react-native';
import { colors } from '@/constants/theme';

interface StatCardProps {
  label: string;
  value: number;
  change: string;
  icon: React.ReactNode;
  iconBg: string;
}

export function StatCard({ label, value, change, icon, iconBg }: StatCardProps) {
  const isPositive = change.startsWith('+');
  const isNeutral = change === '0%' || change === '+0%';

  return (
    <Card
      flex={1}
      padding="$3"
      backgroundColor="$background"
      borderRadius="$4"
      borderWidth={1}
      borderColor={colors.borderLight}
      elevation={2}
      size="$2"
    >
      <YStack gap="$2">
        <XStack justifyContent="space-between" alignItems="center">
          <YStack
            width={36}
            height={36}
            borderRadius="$3"
            backgroundColor={iconBg}
            alignItems="center"
            justifyContent="center"
          >
            {icon}
          </YStack>
        </XStack>
        <Text fontSize={20} fontWeight="700" color={colors.textPrimary}>
          {value}
        </Text>
        <Text fontSize={11} color={colors.textSecondary} numberOfLines={1}>
          {label}
        </Text>
        {!isNeutral && (
          <XStack alignItems="center" gap="$1">
            {isPositive ? (
              <TrendingUp size={12} color={colors.success} />
            ) : (
              <TrendingDown size={12} color={colors.error} />
            )}
            <Text
              fontSize={11}
              color={isPositive ? colors.success : colors.error}
              fontWeight="600"
            >
              {change}
            </Text>
          </XStack>
        )}
      </YStack>
    </Card>
  );
}
