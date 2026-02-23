/**
 * Telnyx voice webhooks — handles inbound call events.
 *
 * IMPORTANT: This router uses express.raw() for signature verification.
 * It must be mounted BEFORE the global express.json() middleware.
 */

import express, { Router } from 'express';
import { db } from '../db/index.js';
import { phoneNumbers, agents, contacts, calls, callForwarding, callScope } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { telnyxWebhookMiddleware } from '../lib/telnyxWebhook.js';
import { answerCall, buildStreamUrl, recordStart, transferCall } from '../services/telnyxApi.js';
import { sendPushToWorkspace } from '../services/pushNotifications.js';
import { activeCalls } from '../services/voiceBridge.js';
import { uploadRecordingFromUrl } from '../services/recordingStorage.js';
import { isWithinBusinessHours } from '../lib/businessHoursUtil.js';

const router = Router();

// ─── Call context — shared with voiceStream.ts for bridge options ────────────

export interface CallContext {
  afterHours: boolean;
  screened: boolean;
  endingMessage?: string;
  forwardToNumber?: string;
}

/** Exported so voiceStream.ts can pass context to VoiceBridge. */
export const callContextMap = new Map<string, CallContext>();

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

      case 'streaming.failed':
        console.error(`[webhook] Streaming failed for ${callControlId}`);
        await handleStreamingFailed(callControlId);
        break;

      case 'streaming.stopped':
        console.log(`[webhook] Streaming stopped for ${callControlId}`);
        break;

      case 'call.recording.saved':
        await handleRecordingSaved(payload);
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

  // Handle outbound calls (already have a call record)
  if (direction === 'outgoing') {
    console.log(`[webhook] Outbound call initiated: ${callControlId}`);
    return;
  }

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
    {
      callId: callRecord.id,
      type: 'incoming_call',
      screen: `/call/${callRecord.id}?mode=ringing`,
      callerName,
      callerNumber: fromNumber,
    },
  ).catch((err) => console.error('[webhook] Push notification failed:', err));

  // 6. Check call scope (screening)
  const [scopeRow] = await db
    .select()
    .from(callScope)
    .where(eq(callScope.workspaceId, phoneRecord.workspaceId))
    .limit(1);

  const scope = scopeRow?.scope ?? 'everyone';
  const endingMessage = scopeRow?.endingMessage ?? 'Thank you for calling. Goodbye!';

  let screened = false;
  if (scope === 'disabled') {
    screened = true;
  } else if (scope === 'contacts_only' && !contact) {
    screened = true;
  } else if (scope === 'unknown_only' && contact) {
    screened = true;
  }

  if (screened) {
    console.log(`[webhook] Call screened (scope=${scope}) for ${callControlId}`);
    // Answer, start AI bridge with ending message, then it will hang up
    callContextMap.set(callControlId, { afterHours: false, screened: true, endingMessage });
    const streamUrl = buildStreamUrl();
    await answerCall(callControlId, streamUrl);
    await db.update(calls).set({ status: 'screened' }).where(eq(calls.id, callRecord.id));
    return;
  }

  // 7. Check business hours
  const afterHours = !(await isWithinBusinessHours(phoneRecord.workspaceId));

  // 8. Check call forwarding
  const [fwdRow] = await db
    .select()
    .from(callForwarding)
    .where(eq(callForwarding.workspaceId, phoneRecord.workspaceId))
    .limit(1);

  if (fwdRow?.enabled && fwdRow.forwardToNumber) {
    const mode = fwdRow.forwardMode;
    let shouldForward = false;

    if (mode === 'always') {
      shouldForward = true;
    } else if (mode === 'busy' && activeCalls.size > 0) {
      shouldForward = true;
    } else if (mode === 'after_hours' && afterHours) {
      shouldForward = true;
    }
    // 'no_answer' mode: not applicable for AI (AI always answers) — skip

    if (shouldForward) {
      console.log(`[webhook] Forwarding call ${callControlId} to ${fwdRow.forwardToNumber} (mode=${mode})`);
      await answerCall(callControlId);
      await transferCall(callControlId, fwdRow.forwardToNumber, toNumber);
      await db.update(calls).set({ status: 'forwarded' }).where(eq(calls.id, callRecord.id));
      return;
    }
  }

  // 9. Store call context for voiceBridge
  callContextMap.set(callControlId, {
    afterHours,
    screened: false,
    forwardToNumber: fwdRow?.forwardToNumber ?? undefined,
  });

  // 10. Answer call + start streaming
  const streamUrl = buildStreamUrl();
  console.log(`[webhook] Answering call ${callControlId} with streaming → ${streamUrl}`);
  await answerCall(callControlId, streamUrl);

  // 11. Start recording
  recordStart(callControlId).catch((err) =>
    console.error(`[webhook] Failed to start recording for ${callControlId}:`, err),
  );
}

async function handleCallHangup(payload: Record<string, unknown> & {
  call_control_id: string;
  hangup_cause?: string;
}): Promise<void> {
  const { call_control_id: callControlId, hangup_cause: hangupCause } = payload;

  console.log(`[webhook] Call hangup: ${callControlId}, cause=${hangupCause}`);

  // Clean up context
  callContextMap.delete(callControlId);

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

async function handleRecordingSaved(payload: Record<string, unknown>): Promise<void> {
  const callControlId = payload.call_control_id as string;
  const recordingUrls = payload.recording_urls as { wav?: string } | undefined;
  const wavUrl = recordingUrls?.wav;

  if (!wavUrl) {
    console.warn(`[webhook] recording.saved but no WAV URL for ${callControlId}`);
    return;
  }

  // Look up call by ccid
  const [callRecord] = await db
    .select({ id: calls.id })
    .from(calls)
    .where(eq(calls.telnyxCallControlId, callControlId))
    .limit(1);

  if (!callRecord) {
    console.warn(`[webhook] recording.saved: no call record for ccid=${callControlId}`);
    return;
  }

  try {
    const filename = await uploadRecordingFromUrl(wavUrl, callRecord.id, 'wav');
    await db
      .update(calls)
      .set({ recordingUrl: filename })
      .where(eq(calls.id, callRecord.id));
    console.log(`[webhook] Recording saved for call ${callRecord.id}: ${filename}`);
  } catch (err) {
    console.error(`[webhook] Failed to save recording for ${callRecord.id}:`, err);
  }
}

async function handleStreamingFailed(callControlId: string): Promise<void> {
  callContextMap.delete(callControlId);

  const bridge = activeCalls.get(callControlId);
  if (bridge) {
    await bridge.stop();
  }

  try {
    await db
      .update(calls)
      .set({ status: 'failed' })
      .where(eq(calls.telnyxCallControlId, callControlId));
  } catch (err) {
    console.error(`[webhook] Failed to update call status:`, err);
  }
}

export default router;
