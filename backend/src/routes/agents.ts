import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { agents, workspaceMemberships } from '../db/schema.js';
import { requireAuth, requireWorkspaceMember } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';
import { eq, and } from 'drizzle-orm';

const router = Router();

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const createAgentSchema = z.object({
  name: z.string().min(1).max(255),
  voice_id: z.string().min(1).max(100),
  system_prompt: z.string().min(1),
  initial_greeting: z.string().nullish(),
  temperature: z.number().min(0).max(2).default(0.7),
  max_tokens: z.number().int().min(1).max(16384).default(1024),
  description: z.string().nullish(),
  channel_mode: z.string().max(50).default('voice'),
  voice_provider: z.string().max(50).default('grok'),
  language: z.string().max(10).default('en'),
});

const updateAgentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  voice_id: z.string().min(1).max(100).optional(),
  system_prompt: z.string().min(1).optional(),
  initial_greeting: z.string().nullish(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(16384).optional(),
  description: z.string().nullish(),
  channel_mode: z.string().max(50).optional(),
  voice_provider: z.string().max(50).optional(),
  language: z.string().max(10).optional(),
  is_active: z.boolean().optional(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAgent(row: typeof agents.$inferSelect) {
  return {
    id: row.id,
    workspace_id: row.workspaceId,
    name: row.name,
    description: row.description ?? null,
    channel_mode: row.channelMode,
    voice_provider: row.voiceProvider,
    voice_id: row.voiceId,
    language: row.language,
    system_prompt: row.systemPrompt,
    temperature: row.temperature,
    max_tokens: row.maxTokens,
    initial_greeting: row.initialGreeting ?? null,
    is_active: row.isActive,
    total_calls: 0,
    total_messages: 0,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

// ─── GET /workspaces/:workspaceId/agents ─────────────────────────────────────

router.get(
  '/workspaces/:workspaceId/agents',
  requireAuth,
  requireWorkspaceMember(),
  async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId as string;

      const rows = await db
        .select()
        .from(agents)
        .where(eq(agents.workspaceId, workspaceId))
        .orderBy(agents.createdAt);

      res.json(rows.map(formatAgent));
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /workspaces/:workspaceId/agents ────────────────────────────────────

router.post(
  '/workspaces/:workspaceId/agents',
  requireAuth,
  requireWorkspaceMember(),
  validateBody(createAgentSchema),
  async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId as string;
      const body = req.body as z.infer<typeof createAgentSchema>;

      const [created] = await db
        .insert(agents)
        .values({
          workspaceId,
          name: body.name,
          voiceId: body.voice_id,
          systemPrompt: body.system_prompt,
          initialGreeting: body.initial_greeting ?? null,
          temperature: body.temperature,
          maxTokens: body.max_tokens,
          description: body.description ?? null,
          channelMode: body.channel_mode,
          voiceProvider: body.voice_provider,
          language: body.language,
        })
        .returning();

      res.status(201).json(formatAgent(created));
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /workspaces/:workspaceId/agents/:agentId ────────────────────────────

router.put(
  '/workspaces/:workspaceId/agents/:agentId',
  requireAuth,
  requireWorkspaceMember(),
  validateBody(updateAgentSchema),
  async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId as string;
      const agentId = req.params.agentId as string;
      const body = req.body as z.infer<typeof updateAgentSchema>;

      // Build the set of columns to update
      const updates: Record<string, unknown> = {};
      if (body.name !== undefined) updates.name = body.name;
      if (body.voice_id !== undefined) updates.voiceId = body.voice_id;
      if (body.system_prompt !== undefined) updates.systemPrompt = body.system_prompt;
      if (body.initial_greeting !== undefined) updates.initialGreeting = body.initial_greeting ?? null;
      if (body.temperature !== undefined) updates.temperature = body.temperature;
      if (body.max_tokens !== undefined) updates.maxTokens = body.max_tokens;
      if (body.description !== undefined) updates.description = body.description ?? null;
      if (body.channel_mode !== undefined) updates.channelMode = body.channel_mode;
      if (body.voice_provider !== undefined) updates.voiceProvider = body.voice_provider;
      if (body.language !== undefined) updates.language = body.language;
      if (body.is_active !== undefined) updates.isActive = body.is_active;

      if (Object.keys(updates).length === 0) {
        throw new AppError(422, 'No fields to update');
      }

      updates.updatedAt = new Date();

      const [updated] = await db
        .update(agents)
        .set(updates)
        .where(
          and(
            eq(agents.id, agentId),
            eq(agents.workspaceId, workspaceId)
          )
        )
        .returning();

      if (!updated) {
        throw new AppError(404, 'Agent not found');
      }

      res.json(formatAgent(updated));
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /agents (legacy) ────────────────────────────────────────────────────

router.get(
  '/agents',
  requireAuth,
  async (req, res, next) => {
    try {
      const userId = req.user!.sub;

      // Find the user's default workspace
      const [membership] = await db
        .select()
        .from(workspaceMemberships)
        .where(
          and(
            eq(workspaceMemberships.userId, userId),
            eq(workspaceMemberships.isDefault, true)
          )
        )
        .limit(1);

      if (!membership) {
        throw new AppError(404, 'No default workspace found');
      }

      // Return the first agent in that workspace
      const [agent] = await db
        .select()
        .from(agents)
        .where(eq(agents.workspaceId, membership.workspaceId))
        .orderBy(agents.createdAt)
        .limit(1);

      if (!agent) {
        throw new AppError(404, 'No agent found');
      }

      res.json(formatAgent(agent));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
