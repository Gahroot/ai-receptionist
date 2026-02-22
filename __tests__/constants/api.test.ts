describe('API constants', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset module registry so we get fresh imports with the current env
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('default API_BASE_URL when no env var is set', () => {
    delete process.env.EXPO_PUBLIC_API_URL;

    const { API_BASE_URL } = require('@/constants/api');
    expect(API_BASE_URL).toBe('http://localhost:8000');
  });

  test('API_BASE_URL uses EXPO_PUBLIC_API_URL env var when set', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.com';

    const { API_BASE_URL } = require('@/constants/api');
    expect(API_BASE_URL).toBe('https://api.example.com');
  });

  test('API_V1_URL appends /api/v1 to base URL', () => {
    delete process.env.EXPO_PUBLIC_API_URL;

    const { API_V1_URL } = require('@/constants/api');
    expect(API_V1_URL).toBe('http://localhost:8000/api/v1');
  });

  test('API_V1_URL appends /api/v1 to custom base URL', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.com';

    const { API_V1_URL } = require('@/constants/api');
    expect(API_V1_URL).toBe('https://api.example.com/api/v1');
  });

  test('WS_BASE_URL converts http to ws', () => {
    delete process.env.EXPO_PUBLIC_API_URL;

    const { WS_BASE_URL } = require('@/constants/api');
    expect(WS_BASE_URL).toBe('ws://localhost:8000');
  });

  test('WS_BASE_URL converts https to wss', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.com';

    const { WS_BASE_URL } = require('@/constants/api');
    expect(WS_BASE_URL).toBe('wss://api.example.com');
  });

  test('all constants are consistent with each other', () => {
    delete process.env.EXPO_PUBLIC_API_URL;

    const { API_BASE_URL, API_V1_URL, WS_BASE_URL } = require('@/constants/api');

    expect(API_V1_URL).toBe(`${API_BASE_URL}/api/v1`);
    expect(WS_BASE_URL).toBe(API_BASE_URL.replace('http', 'ws'));
  });
});
