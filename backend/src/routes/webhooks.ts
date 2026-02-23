/**
 * Telnyx voice webhooks — handles inbound call events.
 *
 * IMPORTANT: This router uses express.raw() for signature verification.
 * It must be mounted BEFORE the global express.json() middleware.
 */

import express, { Router } from 'express';
import { db } from '../db/index.js';
import { phoneNumbers, agents, contacts, calls } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { telnyxWebhookMiddleware } from '../lib/telnyxWebhook.js';
import { answerCall, startStreaming, buildStreamUrl } from '../services/telnyxApi.js';
import { sendPushToWorkspace } from '../services/pushNotifications.js';
import { activeCalls } from '../services/voiceBridge.js';

const router = Router();

// Raw body parsing + signature verification
router.use(express.raw({ type: 'application/json' }));
router.use(telnyxWebhookMiddleware);

// ─── POST / — Telnyx voice webhook dispatcher ────────────────────────────────

router.post('/', async (req, res) => {
  // Respond immediately so Telnyx doesn't retry
  res.status(200).json({ ok: true });

  const { data } = req.body as {
    data: {
      event_type: string;
      payload: Record<string, unknown> & {
        call_control_id: string;
        call_leg_id?: string;
        direction?: string;
        from?: string;
        to?: string;
        state?: string;
        hangup_cause?: string;
      };
    };
  };

  if (!data?.event_type || !data?.payload) {
    console.warn('[webhook] Invalid webhook payload, missing data/event_type/payload');
    return;
  }

  const eventType = data.event_type;
  const payload = data.payload;
  const callControlId = payload.call_control_id;

  console.log(`[webhook] ${eventType} — ccid=${callControlId}`);

  try {
    switch (eventType) {
      case 'call.initiated':
        await handleCallInitiated(payload);
        break;

      case 'call.hangup':
        await handleCallHangup(payload);
        break;

      case 'call.answered':
      case 'streaming.started':
        console.log(`[webhook] ${eventType} — no action needed`);
        break;

      default:
        console.log(`[webhook] Unhandled event: ${eventType}`);
    }
  } catch (err) {
    console.error(`[webhook] Error handling ${eventType}:`, err);
  }
});

// ─── Event handlers ─────────────────────────────────────────────────────────

async function handleCallInitiated(payload: Record<string, unknown> & {
  call_control_id: string;
  direction?: string;
  from?: string;
  to?: string;
}): Promise<void> {
  const { call_control_id: callControlId, direction, from: fromNumber, to: toNumber } = payload;

  // Only handle inbound calls
  if (direction !== 'incoming') {
    console.log(`[webhook] Ignoring non-incoming call: ${direction}`);
    return;
  }

  if (!fromNumber || !toNumber) {
    console.warn('[webhook] Missing from/to number');
    return;
  }

  // 1. Look up phone number → workspace + agent
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
    console.warn(`[webhook] No phone number record for ${toNumber}`);
    return;
  }

  if (!phoneRecord.agentId) {
    console.warn(`[webhook] Phone ${toNumber} has no assigned agent`);
    return;
  }

  // 2. Verify agent is active
  const [agent] = await db
    .select()
    .from(agents)
    .where(
      and(
        eq(agents.id, phoneRecord.agentId),
        eq(agents.isActive, true),
      ),
    )
    .limit(1);

  if (!agent) {
    console.warn(`[webhook] Agent ${phoneRecord.agentId} not found or inactive`);
    return;
  }

  // 3. Match caller in contacts
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

  // 4. Insert call record
  const [callRecord] = await db
    .insert(calls)
    .values({
      workspaceId: phoneRecord.workspaceId,
      direction: 'inbound',
      channel: 'voice',
      status: 'ringing',
      fromNumber,
      toNumber,
      contactId: contact?.id ?? null,
      agentId: agent.id,
      telnyxCallControlId: callControlId,
    })
    .returning();

  console.log(
    `[webhook] Call record created: ${callRecord.id} from=${fromNumber} to=${toNumber}`,
  );

  // 5. Send push notification
  const callerName = contact
    ? [contact.firstName, contact.lastName].filter(Boolean).join(' ')
    : fromNumber;

  sendPushToWorkspace(
    phoneRecord.workspaceId,
    'Incoming Call',
    `${callerName} is calling`,
    { callId: callRecord.id, type: 'incoming_call' },
  ).catch((err) => console.error('[webhook] Push notification failed:', err));

  // 6. Answer call + start streaming
  console.log(`[webhook] Answering call ${callControlId}...`);
  await answerCall(callControlId);

  const streamUrl = buildStreamUrl(callControlId);
  console.log(`[webhook] Starting streaming → ${streamUrl}`);
  await startStreaming(callControlId, streamUrl);
}

async function handleCallHangup(payload: Record<string, unknown> & {
  call_control_id: string;
  hangup_cause?: string;
}): Promise<void> {
  const { call_control_id: callControlId, hangup_cause: hangupCause } = payload;

  console.log(`[webhook] Call hangup: ${callControlId}, cause=${hangupCause}`);

  // Stop voice bridge if active
  const bridge = activeCalls.get(callControlId);
  if (bridge) {
    await bridge.stop();
  }

  // Update call status based on hangup cause
  const status =
    hangupCause === 'normal_clearing' || hangupCause === 'originator_cancel'
      ? 'completed'
      : 'failed';

  try {
    await db
      .update(calls)
      .set({ status })
      .where(eq(calls.telnyxCallControlId, callControlId));
  } catch (err) {
    console.error(`[webhook] Failed to update call status:`, err);
  }
}

export default router;
