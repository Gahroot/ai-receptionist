// Fix Expo 54 winter runtime lazy getters that fail in Jest context.
// jest-expo's setup installs lazy getters (via installGlobal) for various globals.
// When these getters fire during test execution, the dynamic require() fails with
// "import outside of scope" error. We replace them all with concrete values using
// Object.defineProperty (bypasses getter/setter without triggering them).
/* eslint-disable @typescript-eslint/no-require-imports */
const nodeUtil = require('util');
const nodeUrl = require('url');
/* eslint-enable @typescript-eslint/no-require-imports */

const lazyGetterFixes: Record<string, unknown> = {
  __ExpoImportMetaRegistry: { url: null },
  structuredClone: (obj: unknown) => JSON.parse(JSON.stringify(obj)),
  TextDecoder: nodeUtil.TextDecoder,
  URL: nodeUrl.URL,
  URLSearchParams: nodeUrl.URLSearchParams,
};

for (const [name, value] of Object.entries(lazyGetterFixes)) {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    enumerable: true,
    writable: true,
  });
}

// Global mocks for Expo modules
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExponentPushToken[mock]' }),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  setBadgeCountAsync: jest.fn().mockResolvedValue(undefined),
  getBadgeCountAsync: jest.fn().mockResolvedValue(0),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3 },
}));

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => ({
    play: jest.fn(), pause: jest.fn(), remove: jest.fn(),
    replace: jest.fn(), seekTo: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    playing: false, currentTime: 0, duration: 0,
  })),
  useAudioPlayer: jest.fn(() => ({
    play: jest.fn(), pause: jest.fn(), remove: jest.fn(),
    replace: jest.fn(), seekTo: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    playing: false, currentTime: 0, duration: 0,
  })),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-device', () => ({
  isDevice: true,
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        eas: {
          projectId: 'mock-project-id',
        },
      },
    },
  },
}));

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  })),
  useSegments: jest.fn(() => []),
  usePathname: jest.fn(() => '/'),
}));

jest.mock('@siteed/expo-audio-studio', () => ({
  useAudioRecorder: jest.fn(() => ({
    startRecording: jest.fn().mockResolvedValue(undefined),
    stopRecording: jest.fn().mockResolvedValue(undefined),
    isRecording: false,
    isPaused: false,
  })),
  ExpoAudioStreamModule: {
    requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, status: 'granted' }),
    getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, status: 'granted' }),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Provide global atob / btoa (not always available in Node/jsdom test environment)
if (typeof globalThis.atob === 'undefined') {
  globalThis.atob = (input: string) => Buffer.from(input, 'base64').toString('binary');
}
if (typeof globalThis.btoa === 'undefined') {
  globalThis.btoa = (input: string) => Buffer.from(input, 'binary').toString('base64');
}

// Suppress act() warnings for Zustand state updates
// This is a known issue when using Zustand with React Testing Library:
// https://github.com/pmndrs/zustand/issues/1635
// The warnings occur because Zustand's store updates can trigger React renders
// outside of test act() blocks when used in hooks, but this doesn't indicate
// actual test flakiness or incorrect behavior.
const originalError = console.error;
console.error = (...args: unknown[]) => {
  // Convert all args to string for checking
  const message = args.map((arg) =>
    typeof arg === 'string' ? arg : JSON.stringify(arg)
  ).join(' ');
  if (message.includes('An update to HookContainer inside a test was not wrapped in act')) {
    return; // Suppress Zustand-related act warnings
  }
  if (message.includes('When testing, code that causes React state updates')) {
    return; // Suppress the follow-up act() warning
  }
  originalError.apply(console, args as unknown as Parameters<typeof console.error>);
};
