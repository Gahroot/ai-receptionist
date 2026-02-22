import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { agents, workspaceMemberships } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';
import { config } from '../config.js';
import { eq, and } from 'drizzle-orm';

const router = Router();

// ─── Voice Map (OpenAI-style → Grok) ────────────────────────────────────────

const GROK_VOICE_NAMES = ['Sal', 'Ara', 'Eve', 'Leo', 'Rex'] as const;
type GrokVoice = (typeof GROK_VOICE_NAMES)[number];

const VOICE_MAP: Record<string, GrokVoice> = {
  alloy: 'Sal',
  shimmer: 'Ara',
  nova: 'Eve',
  echo: 'Leo',
  onyx: 'Rex',
};

function toGrokVoice(voiceId: string): GrokVoice {
  // If already a valid Grok voice name, pass through
  if (GROK_VOICE_NAMES.includes(voiceId as GrokVoice)) {
    return voiceId as GrokVoice;
  }
  return VOICE_MAP[voiceId.toLowerCase()] ?? 'Ara';
}

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
      });

      if (!xaiResponse.ok) {
        const errorText = await xaiResponse.text();
        console.error('xAI client_secrets error:', xaiResponse.status, errorText);
        throw new AppError(502, 'Failed to obtain ephemeral token from xAI');
      }

      const xaiData = (await xaiResponse.json()) as {
        client_secret: { value: string; expires_at: number };
      };

      // 4. Return token + agent config
      res.json({
        token: xaiData.client_secret.value,
        expires_at: xaiData.client_secret.expires_at,
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

export default router;
