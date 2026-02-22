import { createAnimations as createNativeAnimations } from '@tamagui/animations-react-native';
import { createAnimations as createCSSAnimations } from '@tamagui/animations-css';
import { createTamagui, createTokens } from 'tamagui';
import { config as defaultConfig } from '@tamagui/config/v3';
import { Platform } from 'react-native';

const animations = Platform.OS === 'web'
  ? createCSSAnimations({
      fast: 'ease-in 150ms',
      medium: 'ease-in 250ms',
      slow: 'ease-in 450ms',
      bouncy: 'ease-in 250ms',
      lazy: 'ease-in 600ms',
    })
  : createNativeAnimations({
      fast: {
        type: 'spring',
        damping: 20,
        mass: 1.2,
        stiffness: 250,
      },
      medium: {
        type: 'spring',
        damping: 15,
        mass: 0.9,
        stiffness: 150,
      },
      slow: {
        type: 'spring',
        damping: 20,
        stiffness: 60,
      },
      bouncy: {
        type: 'spring',
        damping: 9,
        mass: 0.9,
        stiffness: 150,
      },
      lazy: {
        type: 'spring',
        damping: 18,
        stiffness: 50,
      },
    });

const tokens = createTokens({
  ...defaultConfig.tokens,
  color: {
    ...defaultConfig.tokens.color,
    // Brand colors
    primary: '#0066FF',
    primaryLight: '#E6F0FF',
    primaryDark: '#0052CC',
    secondary: '#6C47FF',
    // Semantic colors
    success: '#22C55E',
    warning: '#F59E0B',
    error: '#EF4444',
    // Neutral
    background: '#FFFFFF',
    backgroundSecondary: '#F8F9FA',
    surface: '#FFFFFF',
    surfaceSecondary: '#F1F3F5',
    textPrimary: '#111827',
    textSecondary: '#6B7280',
    textTertiary: '#9CA3AF',
    border: '#E5E7EB',
    borderLight: '#F3F4F6',
  },
});

const tamaguiConfig = createTamagui({
  ...defaultConfig,
  animations,
  tokens,
  themes: {
    ...defaultConfig.themes,
    light: {
      ...defaultConfig.themes.light,
      background: '#FFFFFF',
      backgroundHover: '#F8F9FA',
      backgroundPress: '#F1F3F5',
      backgroundFocus: '#F8F9FA',
      color: '#111827',
      colorHover: '#111827',
      colorPress: '#111827',
      borderColor: '#E5E7EB',
      borderColorHover: '#D1D5DB',
      blue1: '#E6F0FF',
      blue10: '#0066FF',
    },
    dark: {
      ...defaultConfig.themes.dark,
      background: '#0F172A',
      backgroundHover: '#1E293B',
      backgroundPress: '#334155',
      backgroundFocus: '#1E293B',
      color: '#F8FAFC',
      colorHover: '#F8FAFC',
      colorPress: '#F8FAFC',
      borderColor: '#334155',
      borderColorHover: '#475569',
      blue1: '#1E3A5F',
      blue10: '#3B82F6',
    },
  },
});

export type AppConfig = typeof tamaguiConfig;

declare module 'tamagui' {
  interface TamaguiCustomConfig extends AppConfig {}
}

export default tamaguiConfig;
