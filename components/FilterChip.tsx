import { Button, XStack, YStack, Text } from 'tamagui';
import { colors } from '@/constants/theme';

interface FilterChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  badge?: number;
}

export function FilterChip({ label, selected, onPress, badge }: FilterChipProps) {
  return (
    <XStack position="relative">
      <Button
        size="$2"
        backgroundColor={selected ? colors.primary : colors.surfaceSecondary}
        color={selected ? '#FFFFFF' : colors.textSecondary}
        borderRadius="$6"
        pressStyle={{
          backgroundColor: selected ? colors.primaryDark : colors.border,
        }}
        onPress={onPress}
      >
        {label}
      </Button>
      {badge != null && badge > 0 && (
        <YStack
          position="absolute"
          top={-4}
          right={-4}
          minWidth={16}
          height={16}
          borderRadius={8}
          backgroundColor={colors.error}
          alignItems="center"
          justifyContent="center"
          paddingHorizontal="$1"
          zIndex={1}
        >
          <Text fontSize={9} fontWeight="700" color="#FFFFFF">
            {badge > 99 ? '99+' : badge}
          </Text>
        </YStack>
      )}
    </XStack>
  );
}
