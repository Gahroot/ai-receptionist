import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { calls, callSummaries, contacts, agents } from '../db/schema.js';
import { requireAuth, requireWorkspaceMember } from '../middleware/auth.js';
import { AppError } from '../lib/errors.js';
import { eq, and, desc, sql, count } from 'drizzle-orm';

// ─── Types ──────────────────────────────────────────────────────────────────

interface CallSummary {
  id: string;
  call_id: string;
  summary: string;
  key_topics: string[] | null;
  action_items: unknown;
  sentiment: string;
  created_at: string;
}

interface CallResponse {
  id: string;
  conversation_id: string | null;
  direction: string;
  channel: string;
  status: string;
  duration_seconds: number | null;
  recording_url: string | null;
  transcript: unknown;
  created_at: string;
  from_number: string | null;
  to_number: string | null;
  contact_name: string | null;
  contact_id: number | null;
  agent_id: string | null;
  agent_name: string | null;
  is_ai: boolean;
  booking_outcome: string | null;
  is_voicemail: boolean;
  voicemail_transcription: string | null;
  is_read: boolean;
  summary: CallSummary | null;
}

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  is_voicemail: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Computed SQL expression for contact full name: first_name || ' ' || last_name */
const contactFullName = sql<string>`CONCAT(${contacts.firstName}, ' ', ${contacts.lastName})`;

/**
 * Map a raw row (from left-joined query) into a CallResponse object.
 */
function toCallResponse(row: {
  call: typeof calls.$inferSelect;
  contact: typeof contacts.$inferSelect | null;
  agent: typeof agents.$inferSelect | null;
  contact_name: string | null;
  summary: typeof callSummaries.$inferSelect | null;
}): CallResponse {
  const c = row.call;
  return {
    id: c.id,
    conversation_id: c.conversationId,
    direction: c.direction,
    channel: c.channel,
    status: c.status,
    duration_seconds: c.durationSeconds,
    recording_url: c.recordingUrl,
    transcript: c.transcript,
    created_at: c.createdAt.toISOString(),
    from_number: c.fromNumber,
    to_number: c.toNumber,
    contact_name: row.contact_name ?? null,
    contact_id: c.contactId,
    agent_id: c.agentId,
    agent_name: row.agent?.name ?? null,
    is_ai: true,
    booking_outcome: null,
    is_voicemail: c.isVoicemail,
    voicemail_transcription: c.voicemailTranscription,
    is_read: c.isRead,
    summary: row.summary
      ? {
          id: row.summary.id,
          call_id: row.summary.callId,
          summary: row.summary.summary,
          key_topics: row.summary.keyTopics,
          action_items: row.summary.actionItems,
          sentiment: row.summary.sentiment,
          created_at: row.summary.createdAt.toISOString(),
        }
      : null,
  };
}

// ─── Router ─────────────────────────────────────────────────────────────────

const router = Router();

// All call routes require authentication + workspace membership
router.use(requireAuth);

// ─── GET /workspaces/:workspaceId/calls/voicemail/unread-count ──────────────
// IMPORTANT: This must be defined BEFORE the :callId route so 'voicemail'
// is not captured as a callId parameter.

router.get(
  '/:workspaceId/calls/voicemail/unread-count',
  requireWorkspaceMember(),
  async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId as string;

      const [result] = await db
        .select({ value: count() })
        .from(calls)
        .where(
          and(
            eq(calls.workspaceId, workspaceId),
            eq(calls.isVoicemail, true),
            eq(calls.isRead, false)
          )
        );

      res.json({ count: result?.value ?? 0 });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /workspaces/:workspaceId/calls ─────────────────────────────────────

router.get(
  '/:workspaceId/calls',
  requireWorkspaceMember(),
  async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId as string;
      const { page, page_size, is_voicemail } = paginationSchema.parse(req.query);

      // Build WHERE conditions
      const conditions = [eq(calls.workspaceId, workspaceId)];
      if (is_voicemail !== undefined) {
        conditions.push(eq(calls.isVoicemail, is_voicemail));
      }
      const whereClause = and(...conditions);

      // Total count
      const [totalResult] = await db
        .select({ value: count() })
        .from(calls)
        .where(whereClause);
      const total = totalResult?.value ?? 0;

      // Completed count (status = 'completed')
      const [completedResult] = await db
        .select({ value: count() })
        .from(calls)
        .where(and(whereClause, eq(calls.status, 'completed')));
      const completedCount = completedResult?.value ?? 0;

      // Total duration
      const [durationResult] = await db
        .select({
          value: sql<number>`COALESCE(SUM(${calls.durationSeconds}), 0)`,
        })
        .from(calls)
        .where(whereClause);
      const totalDurationSeconds = Number(durationResult?.value ?? 0);

      // Voicemail unread count (always for the workspace, regardless of filter)
      const [voicemailResult] = await db
        .select({ value: count() })
        .from(calls)
        .where(
          and(
            eq(calls.workspaceId, workspaceId),
            eq(calls.isVoicemail, true),
            eq(calls.isRead, false)
          )
        );
      const voicemailUnreadCount = voicemailResult?.value ?? 0;

      // Paginated call list with left joins
      const offset = (page - 1) * page_size;
      const rows = await db
        .select({
          call: calls,
          contact: contacts,
          agent: agents,
          contact_name: contactFullName,
          summary: callSummaries,
        })
        .from(calls)
        .leftJoin(contacts, eq(calls.contactId, contacts.id))
        .leftJoin(agents, eq(calls.agentId, agents.id))
        .leftJoin(callSummaries, eq(calls.id, callSummaries.callId))
        .where(whereClause)
        .orderBy(desc(calls.createdAt))
        .limit(page_size)
        .offset(offset);

      const items: CallResponse[] = rows.map(toCallResponse);
      const pages = Math.ceil(total / page_size);

      res.json({
        items,
        total,
        page,
        page_size,
        pages,
        completed_count: completedCount,
        total_duration_seconds: totalDurationSeconds,
        voicemail_unread_count: voicemailUnreadCount,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /workspaces/:workspaceId/calls/:callId ─────────────────────────────

router.get(
  '/:workspaceId/calls/:callId',
  requireWorkspaceMember(),
  async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId as string;
      const callId = req.params.callId as string;

      const rows = await db
        .select({
          call: calls,
          contact: contacts,
          agent: agents,
          contact_name: contactFullName,
          summary: callSummaries,
        })
        .from(calls)
        .leftJoin(contacts, eq(calls.contactId, contacts.id))
        .leftJoin(agents, eq(calls.agentId, agents.id))
        .leftJoin(callSummaries, eq(calls.id, callSummaries.callId))
        .where(and(eq(calls.id, callId), eq(calls.workspaceId, workspaceId)))
        .limit(1);

      if (rows.length === 0) {
        throw new AppError(404, 'Call not found');
      }

      res.json(toCallResponse(rows[0]));
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /workspaces/:workspaceId/calls/:callId/summary ─────────────────────

router.get(
  '/:workspaceId/calls/:callId/summary',
  requireWorkspaceMember(),
  async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId as string;
      const callId = req.params.callId as string;

      // Verify call belongs to workspace
      const [call] = await db
        .select({ id: calls.id })
        .from(calls)
        .where(and(eq(calls.id, callId), eq(calls.workspaceId, workspaceId)))
        .limit(1);

      if (!call) {
        throw new AppError(404, 'Call not found');
      }

      const [summary] = await db
        .select()
        .from(callSummaries)
        .where(eq(callSummaries.callId, callId))
        .limit(1);

      if (!summary) {
        throw new AppError(404, 'Summary not found for this call');
      }

      res.json({
        id: summary.id,
        call_id: summary.callId,
        summary: summary.summary,
        key_topics: summary.keyTopics,
        action_items: summary.actionItems,
        sentiment: summary.sentiment,
        created_at: summary.createdAt.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /workspaces/:workspaceId/calls/:callId/read ────────────────────────

router.put(
  '/:workspaceId/calls/:callId/read',
  requireWorkspaceMember(),
  async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId as string;
      const callId = req.params.callId as string;

      const [updated] = await db
        .update(calls)
        .set({ isRead: true })
        .where(and(eq(calls.id, callId), eq(calls.workspaceId, workspaceId)))
        .returning({ id: calls.id });

      if (!updated) {
        throw new AppError(404, 'Call not found');
      }

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
