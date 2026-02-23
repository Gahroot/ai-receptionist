import { YStack, Text } from 'tamagui';
import { Image } from 'react-native';
import { colors } from '@/constants/theme';

interface AvatarProps {
  name: string;
  size?: number;
  backgroundColor?: string;
  imageUrl?: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

export function Avatar({ name, size = 48, backgroundColor = colors.primaryLight, imageUrl }: AvatarProps) {
  const fontSize = size * 0.35;
  const borderRadius = size / 2;

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={{ width: size, height: size, borderRadius }}
      />
    );
  }

  return (
    <YStack
      width={size}
      height={size}
      borderRadius={borderRadius}
      backgroundColor={backgroundColor}
      alignItems="center"
      justifyContent="center"
    >
      <Text fontSize={fontSize} fontWeight="700" color={colors.primary}>
        {getInitials(name)}
      </Text>
    </YStack>
  );
}
