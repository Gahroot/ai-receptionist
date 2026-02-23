/**
 * Expo Push Notifications — send push notifications to workspace members.
 */

import { db } from '../db/index.js';
import { deviceTokens, workspaceMemberships } from '../db/schema.js';
import { eq } from 'drizzle-orm';

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: string;
}

/**
 * Send a push notification to all members of a workspace.
 */
export async function sendPushToWorkspace(
  workspaceId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  // Get all user IDs in this workspace
  const members = await db
    .select({ userId: workspaceMemberships.userId })
    .from(workspaceMemberships)
    .where(eq(workspaceMemberships.workspaceId, workspaceId));

  if (members.length === 0) return;

  // Get all device tokens for those users
  const tokens: string[] = [];
  for (const member of members) {
    const rows = await db
      .select({ token: deviceTokens.expoPushToken })
      .from(deviceTokens)
      .where(eq(deviceTokens.userId, member.userId));
    for (const row of rows) {
      tokens.push(row.token);
    }
  }

  if (tokens.length === 0) return;

  const messages: PushMessage[] = tokens.map((token) => ({
    to: token,
    title,
    body,
    data,
    sound: 'default',
  }));

  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      console.error('[push] Expo push send failed:', res.status, await res.text());
    }
  } catch (err) {
    console.error('[push] Failed to send push notifications:', err);
  }
}
