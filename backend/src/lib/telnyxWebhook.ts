/**
 * Telnyx webhook Ed25519 signature verification.
 * Uses Node.js built-in `node:crypto` — no external deps.
 */

import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

// Ed25519 DER OID prefix (for wrapping raw 32-byte public key)
const ED25519_OID_PREFIX = Buffer.from(
  '302a300506032b6570032100',
  'hex'
);

const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Verify a Telnyx Ed25519 webhook signature.
 */
export function verifyTelnyxSignature(
  signature: string,
  timestamp: string,
  rawBody: Buffer,
  publicKeyBase64?: string,
): boolean {
  const pubKeyB64 = publicKeyBase64 || config.telnyxPublicKey;
  if (!pubKeyB64) return false;

  // Timestamp freshness check
  const tsMs = parseInt(timestamp, 10) * 1000;
  if (isNaN(tsMs) || Math.abs(Date.now() - tsMs) > MAX_TIMESTAMP_AGE_MS) {
    return false;
  }

  try {
    // DER-wrap the raw public key
    const rawKey = Buffer.from(pubKeyB64, 'base64');
    const derKey = Buffer.concat([ED25519_OID_PREFIX, rawKey]);

    const publicKey = crypto.createPublicKey({
      key: derKey,
      format: 'der',
      type: 'spki',
    });

    const signedPayload = Buffer.concat([
      Buffer.from(`${timestamp}|`),
      rawBody,
    ]);

    const sigBytes = Buffer.from(signature, 'base64');
    return crypto.verify(null, signedPayload, publicKey, sigBytes);
  } catch {
    return false;
  }
}

/**
 * Express middleware: verifies Telnyx webhook signature on raw body,
 * then parses JSON and attaches to `req.body`.
 */
export function telnyxWebhookMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Skip verification if configured (dev only)
  if (!config.skipWebhookVerification) {
    const signature = req.headers['telnyx-signature-ed25519'] as string | undefined;
    const timestamp = req.headers['telnyx-timestamp'] as string | undefined;

    if (!signature || !timestamp) {
      res.status(403).json({ error: 'Missing Telnyx signature headers' });
      return;
    }

    const rawBody = req.body as Buffer;
    if (!verifyTelnyxSignature(signature, timestamp, rawBody)) {
      res.status(403).json({ error: 'Invalid Telnyx signature' });
      return;
    }
  }

  // Parse JSON from raw body
  try {
    req.body = JSON.parse((req.body as Buffer).toString('utf-8'));
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  next();
}
