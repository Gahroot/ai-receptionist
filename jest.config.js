module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@siteed/.*|tamagui|@tamagui/.*|lucide-react-native|zustand|axios)',
  ],
  setupFiles: ['./__tests__/setup.ts'],
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: [
    '**/__tests__/**/*.test.{ts,tsx}',
  ],
  collectCoverageFrom: [
    'services/**/*.ts',
    'stores/**/*.ts',
    'hooks/**/*.ts',
    'lib/**/*.ts',
    'constants/**/*.ts',
    '!**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};
