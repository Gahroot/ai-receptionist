import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { agents, workspaceMemberships, phoneNumbers, contacts, calls } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';
import { config } from '../config.js';
import { toGrokVoice } from '../lib/grokVoice.js';
import { dialOutbound, buildStreamUrl } from '../services/telnyxApi.js';
import { eq, and } from 'drizzle-orm';

const router = Router();

// ─── Zod Schema ──────────────────────────────────────────────────────────────

const sessionBodySchema = z.object({
  workspace_id: z.string().uuid(),
  agent_id: z.string().uuid(),
});

// ─── POST /voice/session ─────────────────────────────────────────────────────

router.post(
  '/voice/session',
  requireAuth,
  validateBody(sessionBodySchema),
  async (req, res, next) => {
    try {
      const userId = req.user!.sub;
      const { workspace_id, agent_id } = req.body as z.infer<typeof sessionBodySchema>;

      // 1. Verify workspace membership
      const [membership] = await db
        .select()
        .from(workspaceMemberships)
        .where(
          and(
            eq(workspaceMemberships.userId, userId),
            eq(workspaceMemberships.workspaceId, workspace_id)
          )
        )
        .limit(1);

      if (!membership) {
        throw new AppError(403, 'Not a member of this workspace');
      }

      // 2. Fetch agent config
      const [agent] = await db
        .select()
        .from(agents)
        .where(
          and(
            eq(agents.id, agent_id),
            eq(agents.workspaceId, workspace_id)
          )
        )
        .limit(1);

      if (!agent) {
        throw new AppError(404, 'Agent not found');
      }

      // 3. Request ephemeral token from xAI
      if (!config.xaiApiKey) {
        throw new AppError(500, 'xAI API key is not configured');
      }

      const xaiResponse = await fetch('https://api.x.ai/v1/realtime/client_secrets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.xaiApiKey}`,
        },
        body: JSON.stringify({ expires_after: { seconds: 300 } }),
      });

      if (!xaiResponse.ok) {
        const errorText = await xaiResponse.text();
        console.error('xAI client_secrets error:', xaiResponse.status, errorText);
        throw new AppError(502, 'Failed to obtain ephemeral token from xAI');
      }

      const xaiData = (await xaiResponse.json()) as {
        value: string;
        expires_at: number;
      };

      // 4. Return token + agent config
      res.json({
        token: xaiData.value,
        expires_at: xaiData.expires_at,
        agent: {
          instructions: agent.systemPrompt,
          voice: toGrokVoice(agent.voiceId),
          initial_greeting: agent.initialGreeting ?? null,
          tools: [],
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Zod Schema for outbound calls ──────────────────────────────────────────

const outboundBodySchema = z.object({
  workspace_id: z.string().uuid(),
  agent_id: z.string().uuid(),
  to_number: z.string().min(1),
  from_phone_number: z.string().optional(),
});

// ─── POST /voice/outbound ───────────────────────────────────────────────────

router.post(
  '/voice/outbound',
  requireAuth,
  validateBody(outboundBodySchema),
  async (req, res, next) => {
    try {
      const userId = req.user!.sub;
      const { workspace_id, agent_id, to_number, from_phone_number } =
        req.body as z.infer<typeof outboundBodySchema>;

      // 1. Verify workspace membership
      const [membership] = await db
        .select()
        .from(workspaceMemberships)
        .where(
          and(
            eq(workspaceMemberships.userId, userId),
            eq(workspaceMemberships.workspaceId, workspace_id),
          ),
        )
        .limit(1);

      if (!membership) {
        throw new AppError(403, 'Not a member of this workspace');
      }

      // 2. Fetch agent
      const [agent] = await db
        .select()
        .from(agents)
        .where(
          and(
            eq(agents.id, agent_id),
            eq(agents.workspaceId, workspace_id),
          ),
        )
        .limit(1);

      if (!agent) {
        throw new AppError(404, 'Agent not found');
      }

      // 3. Determine FROM number
      let fromNumber = from_phone_number;
      if (!fromNumber) {
        const [phone] = await db
          .select()
          .from(phoneNumbers)
          .where(
            and(
              eq(phoneNumbers.workspaceId, workspace_id),
              eq(phoneNumbers.isActive, true),
            ),
          )
          .limit(1);

        if (!phone) {
          throw new AppError(422, 'No phone number configured for this workspace');
        }
        fromNumber = phone.phoneNumber;
      }

      // 4. Match contact
      const [contact] = await db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.workspaceId, workspace_id),
            eq(contacts.phone, to_number),
          ),
        )
        .limit(1);

      // 5. Insert call record
      const [callRecord] = await db
        .insert(calls)
        .values({
          workspaceId: workspace_id,
          direction: 'outbound',
          channel: 'voice',
          status: 'ringing',
          fromNumber,
          toNumber: to_number,
          contactId: contact?.id ?? null,
          agentId: agent.id,
        })
        .returning();

      // 6. Dial outbound via Telnyx
      const webhookUrl = `${config.apiBaseUrl}/api/v1/webhooks/telnyx/voice`;
      const streamUrl = buildStreamUrl();

      const result = await dialOutbound(to_number, fromNumber, webhookUrl, streamUrl);

      // 7. Update call with Telnyx call control ID
      await db
        .update(calls)
        .set({ telnyxCallControlId: result.call_control_id })
        .where(eq(calls.id, callRecord.id));

      res.json({
        id: callRecord.id,
        call_control_id: result.call_control_id,
        status: 'ringing',
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
