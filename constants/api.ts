// API configuration
// Change this to your backend URL
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
export const API_V1_URL = `${API_BASE_URL}/api/v1`;
export const WS_BASE_URL = API_BASE_URL.replace('http', 'ws');

// Grok Realtime API (direct WebSocket from client)
export const GROK_REALTIME_URL = 'wss://api.x.ai/v1/realtime';
