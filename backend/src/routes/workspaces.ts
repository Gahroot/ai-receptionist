import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import {
  workspaces,
  workspaceMemberships,
  contacts,
  calls,
  messages,
  conversations,
} from '../db/schema.js';
import { requireAuth, requireWorkspaceMember } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';
import { eq, and, gte, count } from 'drizzle-orm';
import crypto from 'node:crypto';

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(255),
  industry: z.string().max(100).optional(),
  description: z.string().optional(),
});

const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  industry: z.string().max(100).optional(),
  description: z.string().optional(),
  settings: z.record(z.unknown()).optional(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a URL-safe slug from a workspace name with a random suffix. */
function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const suffix = crypto.randomBytes(3).toString('hex'); // 6 hex chars
  return `${base}-${suffix}`;
}

/** Return a Date set to the start of today (midnight UTC). */
function startOfTodayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// ─── Router ──────────────────────────────────────────────────────────────────

const router = Router();

// All workspace routes require authentication
router.use(requireAuth);

// ─── POST /workspaces ────────────────────────────────────────────────────────

router.post(
  '/',
  validateBody(createWorkspaceSchema),
  async (req, res, next) => {
    try {
      const userId = req.user!.sub;
      const { name, industry, description } = req.body as z.infer<typeof createWorkspaceSchema>;

      const slug = generateSlug(name);

      // Create the workspace
      const [workspace] = await db
        .insert(workspaces)
        .values({ name, slug, industry, description })
        .returning();

      // Check if user already has any workspaces to determine is_default
      const existing = await db
        .select({ id: workspaceMemberships.id })
        .from(workspaceMemberships)
        .where(eq(workspaceMemberships.userId, userId))
        .limit(1);

      const isDefault = existing.length === 0;

      // Create membership linking user to workspace
      await db.insert(workspaceMemberships).values({
        userId,
        workspaceId: workspace.id,
        role: 'owner',
        isDefault,
      });

      res.status(201).json(workspace);
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /workspaces/:workspaceId ────────────────────────────────────────────

router.put(
  '/:workspaceId',
  requireWorkspaceMember(),
  validateBody(updateWorkspaceSchema),
  async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId as string;
      const updates = req.body as z.infer<typeof updateWorkspaceSchema>;

      // Build the SET clause — only include provided fields
      const setClause: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      if (updates.name !== undefined) setClause.name = updates.name;
      if (updates.industry !== undefined) setClause.industry = updates.industry;
      if (updates.description !== undefined) setClause.description = updates.description;
      if (updates.settings !== undefined) setClause.settings = updates.settings;

      const [updated] = await db
        .update(workspaces)
        .set(setClause)
        .where(eq(workspaces.id, workspaceId))
        .returning();

      if (!updated) {
        throw new AppError(404, 'Workspace not found');
      }

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /workspaces/:workspaceId/dashboard/stats ────────────────────────────

router.get(
  '/:workspaceId/dashboard/stats',
  requireWorkspaceMember(),
  async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId as string;
      const todayStart = startOfTodayUTC();

      // Run all counts in parallel
      const [
        contactsResult,
        callsTodayResult,
        messagesSentResult,
        voicemailsUnreadResult,
      ] = await Promise.all([
        // Total contacts in workspace
        db
          .select({ value: count() })
          .from(contacts)
          .where(eq(contacts.workspaceId, workspaceId)),

        // Calls created today
        db
          .select({ value: count() })
          .from(calls)
          .where(
            and(
              eq(calls.workspaceId, workspaceId),
              gte(calls.createdAt, todayStart)
            )
          ),

        // Messages sent in workspace conversations
        db
          .select({ value: count() })
          .from(messages)
          .innerJoin(
            conversations,
            eq(messages.conversationId, conversations.id)
          )
          .where(eq(conversations.workspaceId, workspaceId)),

        // Unread voicemails
        db
          .select({ value: count() })
          .from(calls)
          .where(
            and(
              eq(calls.workspaceId, workspaceId),
              eq(calls.isVoicemail, true),
              eq(calls.isRead, false)
            )
          ),
      ]);

      const totalContacts = contactsResult[0]?.value ?? 0;
      const callsToday = callsTodayResult[0]?.value ?? 0;
      const messagesSent = messagesSentResult[0]?.value ?? 0;
      const voicemailsUnread = voicemailsUnreadResult[0]?.value ?? 0;

      res.json({
        stats: {
          total_contacts: totalContacts,
          active_campaigns: 0,
          calls_today: callsToday,
          messages_sent: messagesSent,
          voicemails_unread: voicemailsUnread,
          contacts_change: '+0',
          campaigns_change: '+0',
          calls_change: '+0',
          messages_change: '+0',
        },
        recent_activity: [],
        campaign_stats: [],
        agent_stats: [],
        today_overview: { completed: 0, pending: 0, failed: 0 },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
