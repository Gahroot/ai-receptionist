// API configuration
// Change this to your backend URL
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
export const API_V1_URL = `${API_BASE_URL}/api/v1`;
export const WS_BASE_URL = API_BASE_URL.replace('http', 'ws');
