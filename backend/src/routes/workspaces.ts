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
import { eq, and, gte, lt, count, desc } from 'drizzle-orm';
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
      const yesterdayStart = new Date(todayStart.getTime() - 86400000);

      // Run all counts in parallel
      const [
        contactsResult,
        callsTodayResult,
        messagesTodayResult,
        voicemailsUnreadResult,
        // Yesterday counts for change %
        callsYesterdayResult,
        messagesYesterdayResult,
        contactsYesterdayResult,
        // Today overview
        callsCompletedResult,
        callsMissedResult,
        callsInProgressResult,
        // Recent calls
        recentCalls,
        // Recent messages
        recentMessages,
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

        // Messages today in workspace conversations
        db
          .select({ value: count() })
          .from(messages)
          .innerJoin(conversations, eq(messages.conversationId, conversations.id))
          .where(
            and(
              eq(conversations.workspaceId, workspaceId),
              gte(messages.createdAt, todayStart)
            )
          ),

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

        // Yesterday's calls
        db
          .select({ value: count() })
          .from(calls)
          .where(
            and(
              eq(calls.workspaceId, workspaceId),
              gte(calls.createdAt, yesterdayStart),
              lt(calls.createdAt, todayStart)
            )
          ),

        // Yesterday's messages
        db
          .select({ value: count() })
          .from(messages)
          .innerJoin(conversations, eq(messages.conversationId, conversations.id))
          .where(
            and(
              eq(conversations.workspaceId, workspaceId),
              gte(messages.createdAt, yesterdayStart),
              lt(messages.createdAt, todayStart)
            )
          ),

        // Contacts created yesterday
        db
          .select({ value: count() })
          .from(contacts)
          .where(
            and(
              eq(contacts.workspaceId, workspaceId),
              gte(contacts.createdAt, yesterdayStart),
              lt(contacts.createdAt, todayStart)
            )
          ),

        // Today completed calls
        db
          .select({ value: count() })
          .from(calls)
          .where(
            and(
              eq(calls.workspaceId, workspaceId),
              gte(calls.createdAt, todayStart),
              eq(calls.status, 'completed')
            )
          ),

        // Today missed calls (no_answer)
        db
          .select({ value: count() })
          .from(calls)
          .where(
            and(
              eq(calls.workspaceId, workspaceId),
              gte(calls.createdAt, todayStart),
              eq(calls.status, 'no_answer')
            )
          ),

        // Today in-progress calls
        db
          .select({ value: count() })
          .from(calls)
          .where(
            and(
              eq(calls.workspaceId, workspaceId),
              gte(calls.createdAt, todayStart),
              eq(calls.status, 'in_progress')
            )
          ),

        // Recent 10 calls with contact info
        db
          .select({
            id: calls.id,
            contactFirstName: contacts.firstName,
            contactLastName: contacts.lastName,
            fromNumber: calls.fromNumber,
            status: calls.status,
            duration: calls.durationSeconds,
            createdAt: calls.createdAt,
          })
          .from(calls)
          .leftJoin(contacts, eq(calls.contactId, contacts.id))
          .where(eq(calls.workspaceId, workspaceId))
          .orderBy(desc(calls.createdAt))
          .limit(10),

        // Recent 10 messages with contact info
        db
          .select({
            id: messages.id,
            contactFirstName: contacts.firstName,
            contactLastName: contacts.lastName,
            contactPhone: conversations.contactPhone,
            direction: messages.direction,
            body: messages.body,
            createdAt: messages.createdAt,
          })
          .from(messages)
          .innerJoin(conversations, eq(messages.conversationId, conversations.id))
          .leftJoin(contacts, eq(conversations.contactId, contacts.id))
          .where(eq(conversations.workspaceId, workspaceId))
          .orderBy(desc(messages.createdAt))
          .limit(10),
      ]);

      const totalContacts = contactsResult[0]?.value ?? 0;
      const callsToday = callsTodayResult[0]?.value ?? 0;
      const messagesToday = messagesTodayResult[0]?.value ?? 0;
      const voicemailsUnread = voicemailsUnreadResult[0]?.value ?? 0;

      // Compute change percentages
      const callsYesterday = callsYesterdayResult[0]?.value ?? 0;
      const messagesYesterday = messagesYesterdayResult[0]?.value ?? 0;
      const contactsCreatedYesterday = contactsYesterdayResult[0]?.value ?? 0;

      function changePercent(today: number, yesterday: number): string {
        if (yesterday === 0) return today > 0 ? '+100%' : '+0%';
        const pct = Math.round(((today - yesterday) / yesterday) * 100);
        return pct >= 0 ? `+${pct}%` : `${pct}%`;
      }

      // Build recent activity (merge calls + messages, sort by time, take 15)
      const activity: {
        id: string;
        type: string;
        contact: string;
        initials: string;
        action: string;
        time: string;
        duration: number | null;
      }[] = [];

      for (const c of recentCalls) {
        const name = [c.contactFirstName, c.contactLastName].filter(Boolean).join(' ')
          || c.fromNumber || 'Unknown';
        const initials = name
          .split(' ')
          .map((w) => w[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();
        activity.push({
          id: c.id,
          type: 'call',
          contact: name,
          initials,
          action: c.status === 'completed' ? 'Call completed' : `Call ${c.status}`,
          time: c.createdAt.toISOString(),
          duration: c.duration,
        });
      }

      for (const m of recentMessages) {
        const name = [m.contactFirstName, m.contactLastName].filter(Boolean).join(' ')
          || m.contactPhone || 'Unknown';
        const initials = name
          .split(' ')
          .map((w) => w[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();
        const preview = m.body
          ? m.body.length > 50 ? m.body.slice(0, 50) + '...' : m.body
          : 'Message';
        activity.push({
          id: m.id,
          type: 'message',
          contact: name,
          initials,
          action: m.direction === 'inbound' ? `Received: ${preview}` : `Sent: ${preview}`,
          time: m.createdAt.toISOString(),
          duration: null,
        });
      }

      activity.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      const recentActivity = activity.slice(0, 15);

      // Contacts created today for contacts_change
      const contactsTodayCount = await db
        .select({ value: count() })
        .from(contacts)
        .where(
          and(
            eq(contacts.workspaceId, workspaceId),
            gte(contacts.createdAt, todayStart)
          )
        );
      const contactsToday = contactsTodayCount[0]?.value ?? 0;

      res.json({
        stats: {
          total_contacts: totalContacts,
          active_campaigns: 0,
          calls_today: callsToday,
          messages_sent: messagesToday,
          voicemails_unread: voicemailsUnread,
          contacts_change: changePercent(contactsToday, contactsCreatedYesterday),
          campaigns_change: '+0%',
          calls_change: changePercent(callsToday, callsYesterday),
          messages_change: changePercent(messagesToday, messagesYesterday),
        },
        recent_activity: recentActivity,
        campaign_stats: [],
        agent_stats: [],
        today_overview: {
          completed: callsCompletedResult[0]?.value ?? 0,
          pending: callsInProgressResult[0]?.value ?? 0,
          failed: callsMissedResult[0]?.value ?? 0,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
