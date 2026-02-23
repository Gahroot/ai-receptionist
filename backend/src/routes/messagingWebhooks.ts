/**
 * Telnyx messaging webhooks — handles inbound SMS events.
 *
 * IMPORTANT: This router uses express.raw() for signature verification.
 * It must be mounted BEFORE the global express.json() middleware.
 */

import express, { Router } from 'express';
import { db } from '../db/index.js';
import { phoneNumbers, contacts, conversations, messages } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { telnyxWebhookMiddleware } from '../lib/telnyxWebhook.js';
import { sendPushToWorkspace } from '../services/pushNotifications.js';
import { generateAndSendAiReply } from '../services/aiSmsReply.js';

const router = Router();

// Raw body parsing + signature verification
router.use(express.raw({ type: 'application/json' }));
router.use(telnyxWebhookMiddleware);

// ─── POST / — Telnyx messaging webhook dispatcher ───────────────────────────

router.post('/', async (req, res) => {
  // Respond immediately so Telnyx doesn't retry
  res.status(200).json({ ok: true });

  const { data } = req.body as {
    data: {
      event_type: string;
      payload: {
        from?: { phone_number?: string };
        to?: { phone_number?: string }[];
        text?: string;
        direction?: string;
      };
    };
  };

  if (!data?.event_type || !data?.payload) {
    console.warn('[sms-webhook] Invalid payload');
    return;
  }

  const eventType = data.event_type;

  try {
    switch (eventType) {
      case 'message.received':
        await handleMessageReceived(data.payload);
        break;

      default:
        console.log(`[sms-webhook] Unhandled event: ${eventType}`);
    }
  } catch (err) {
    console.error(`[sms-webhook] Error handling ${eventType}:`, err);
  }
});

// ─── Event handlers ─────────────────────────────────────────────────────────

async function handleMessageReceived(payload: {
  from?: { phone_number?: string };
  to?: { phone_number?: string }[];
  text?: string;
  direction?: string;
}): Promise<void> {
  const fromNumber = payload.from?.phone_number;
  const toNumber = payload.to?.[0]?.phone_number;
  const text = payload.text ?? '';

  if (!fromNumber || !toNumber) {
    console.warn('[sms-webhook] Missing from/to number');
    return;
  }

  // Only handle inbound messages
  if (payload.direction !== 'inbound') {
    console.log(`[sms-webhook] Ignoring non-inbound message: ${payload.direction}`);
    return;
  }

  console.log(`[sms-webhook] Inbound SMS from=${fromNumber} to=${toNumber}`);

  // 1. Look up phone number → workspace
  const [phoneRecord] = await db
    .select()
    .from(phoneNumbers)
    .where(
      and(
        eq(phoneNumbers.phoneNumber, toNumber),
        eq(phoneNumbers.isActive, true),
      ),
    )
    .limit(1);

  if (!phoneRecord) {
    console.warn(`[sms-webhook] No phone number record for ${toNumber}`);
    return;
  }

  // 2. Match caller in contacts
  const [contact] = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, phoneRecord.workspaceId),
        eq(contacts.phone, fromNumber),
      ),
    )
    .limit(1);

  // 3. Find or create conversation
  let [conv] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.workspaceId, phoneRecord.workspaceId),
        eq(conversations.contactPhone, fromNumber),
        eq(conversations.workspacePhone, toNumber),
      ),
    )
    .limit(1);

  if (!conv) {
    [conv] = await db
      .insert(conversations)
      .values({
        workspaceId: phoneRecord.workspaceId,
        contactPhone: fromNumber,
        workspacePhone: toNumber,
        channel: 'sms',
        contactId: contact?.id ?? null,
      })
      .returning();
    console.log(`[sms-webhook] Created conversation ${conv.id}`);
  }

  // 4. Insert inbound message
  await db.insert(messages).values({
    conversationId: conv.id,
    direction: 'inbound',
    channel: 'sms',
    body: text,
    status: 'delivered',
  });

  // 5. Update conversation timestamp
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conv.id));

  console.log(`[sms-webhook] Message saved in conversation ${conv.id}`);

  // 6. Send push notification
  const callerName = contact
    ? [contact.firstName, contact.lastName].filter(Boolean).join(' ')
    : fromNumber;

  sendPushToWorkspace(
    phoneRecord.workspaceId,
    `SMS from ${callerName}`,
    text.slice(0, 100) || '(empty message)',
    {
      conversationId: conv.id,
      type: 'incoming_sms',
      screen: `/(tabs)/messages/${conv.id}`,
    },
  ).catch((err) => console.error('[sms-webhook] Push notification failed:', err));

  // 7. If AI auto-reply is enabled, generate and send reply
  if (conv.aiEnabled) {
    generateAndSendAiReply(conv, text, phoneRecord, contact ?? null).catch((err) =>
      console.error(`[sms-webhook] AI auto-reply failed:`, err),
    );
  }
}

export default router;
