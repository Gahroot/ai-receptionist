import * as jose from 'jose';
import { config } from '../config.js';

const accessSecret = new TextEncoder().encode(config.jwtSecret);
const refreshSecret = new TextEncoder().encode(config.jwtRefreshSecret);

export interface TokenPayload {
  sub: number; // user id
  email: string;
}

export async function signAccessToken(payload: TokenPayload): Promise<string> {
  return new jose.SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(payload.sub))
    .setIssuedAt()
    .setExpirationTime(config.accessTokenExpiry)
    .sign(accessSecret);
}

export async function signRefreshToken(payload: TokenPayload): Promise<string> {
  return new jose.SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(payload.sub))
    .setIssuedAt()
    .setExpirationTime(config.refreshTokenExpiry)
    .sign(refreshSecret);
}

export async function verifyAccessToken(token: string): Promise<TokenPayload> {
  const { payload } = await jose.jwtVerify(token, accessSecret);
  return {
    sub: Number(payload.sub),
    email: payload.email as string,
  };
}

export async function verifyRefreshToken(token: string): Promise<TokenPayload> {
  const { payload } = await jose.jwtVerify(token, refreshSecret);
  return {
    sub: Number(payload.sub),
    email: payload.email as string,
  };
}
