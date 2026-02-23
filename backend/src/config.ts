/* eslint-disable expo/no-dynamic-env-var */
import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
  xaiApiKey: process.env.XAI_API_KEY || '',
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '30d',

  // Telnyx telephony
  telnyxApiKey: process.env.TELNYX_API_KEY || '',
  telnyxPublicKey: process.env.TELNYX_PUBLIC_KEY || '',
  telnyxConnectionId: process.env.TELNYX_CONNECTION_ID || '',
  apiBaseUrl: process.env.API_BASE_URL || '',
  skipWebhookVerification: process.env.SKIP_WEBHOOK_VERIFICATION === 'true',

  // Recordings
  recordingsDir: process.env.RECORDINGS_DIR || './uploads/recordings',

  // CORS
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:8081,http://localhost:19006')
    .split(',').map((s: string) => s.trim()),
} as const;
