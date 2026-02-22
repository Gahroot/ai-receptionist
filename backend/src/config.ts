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
} as const;
