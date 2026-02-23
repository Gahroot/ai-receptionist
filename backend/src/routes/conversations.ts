import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { conversations, messages, contacts } from '../db/schema.js';
import { requireAuth, requireWorkspaceMember } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';
import { eq, and, desc, sql, count } from 'drizzle-orm';

const router = Router();

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const sendMessageSchema = z.object({
  body: z.string().min(1),
});

const toggleAiSchema = z.object({
  enabled: z.boolean(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatConversation(row: typeof conversations.$inferSelect) {
  return {
    id: row.id,
    contact_phone: row.contactPhone,
    workspace_phone: row.workspacePhone,
    channel: row.channel,
    status: row.status,
    ai_enabled: row.aiEnabled,
    contact_id: row.contactId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function formatMessage(row: typeof messages.$inferSelect) {
  return {
    id: row.id,
    conversation_id: row.conversationId,
    direction: row.direction,
    channel: row.channel,
    body: row.body,
    status: row.status,
    is_ai: row.isAi,
    agent_id: row.agentId,
    created_at: row.createdAt.toISOString(),
  };
}

// ─── GET /workspaces/:workspaceId/conversations ─────────────────────────────

router.get(
  '/workspaces/:workspaceId/conversations',
  requireAuth,
  requireWorkspaceMember(),
  async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId as string;
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.max(1, Math.min(100, parseInt(req.query.page_size as string) || 20));
      const offset = (page - 1) * pageSize;

      // Subquery: aggregate last_message_at and last_message_preview per conversation
      const msgAgg = db
        .select({
          conversationId: messages.conversationId,
          lastMessageAt: sql<string>`MAX(${messages.createdAt})`.as('last_message_at'),
          messageCount: count().as('message_count'),
        })
        .from(messages)
        .groupBy(messages.conversationId)
        .as('msg_agg');

      // Count total conversations for this workspace
      const [totalResult] = await db
        .select({ value: count() })
        .from(conversations)
        .where(eq(conversations.workspaceId, workspaceId));

      const total = totalResult?.value ?? 0;
      const pages = Math.ceil(total / pageSize);

      // Fetch paginated conversations with contact name and message aggregates
      const rows = await db
        .select({
          conversation: conversations,
          contactFirstName: contacts.firstName,
          contactLastName: contacts.lastName,
          lastMessageAt: msgAgg.lastMessageAt,
        })
        .from(conversations)
        .leftJoin(contacts, eq(conversations.contactId, contacts.id))
        .leftJoin(msgAgg, eq(conversations.id, msgAgg.conversationId))
        .where(eq(conversations.workspaceId, workspaceId))
        .orderBy(desc(sql`COALESCE(${msgAgg.lastMessageAt}, ${conversations.createdAt})`))
        .limit(pageSize)
        .offset(offset);

      // For each conversation, fetch the latest message body for the preview
      const items = await Promise.all(
        rows.map(async (row) => {
          const contactName = [row.contactFirstName, row.contactLastName]
            .filter(Boolean)
            .join(' ') || null;

          // Fetch latest message body for preview
          let lastMessagePreview: string | null = null;
          if (row.lastMessageAt) {
            const [latestMsg] = await db
              .select({ body: messages.body })
              .from(messages)
              .where(eq(messages.conversationId, row.conversation.id))
              .orderBy(desc(messages.createdAt))
              .limit(1);

            if (latestMsg?.body) {
              lastMessagePreview =
                latestMsg.body.length > 100
                  ? latestMsg.body.slice(0, 100) + '...'
                  : latestMsg.body;
            }
          }

          // Count inbound messages newer than the last outbound message
          const [unreadResult] = await db
            .select({ value: count() })
            .from(messages)
            .where(
              and(
                eq(messages.conversationId, row.conversation.id),
                eq(messages.direction, 'inbound'),
                sql`${messages.createdAt} > COALESCE(
                  (SELECT MAX(m2.created_at) FROM messages m2
                   WHERE m2.conversation_id = ${row.conversation.id}
                     AND m2.direction = 'outbound'),
                  '1970-01-01'::timestamptz
                )`
              )
            );

          return {
            ...formatConversation(row.conversation),
            contact_name: contactName,
            last_message_at: row.lastMessageAt ?? row.conversation.createdAt.toISOString(),
            last_message_preview: lastMessagePreview,
            unread_count: unreadResult?.value ?? 0,
          };
        })
      );

      res.json({ items, total, page, page_size: pageSize, pages });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /workspaces/:workspaceId/conversations/:conversationId ─────────────

router.get(
  '/workspaces/:workspaceId/conversations/:conversationId',
  requireAuth,
  requireWorkspaceMember(),
  async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId as string;
      const conversationId = req.params.conversationId as string;

      // Fetch conversation with contact name
      const [row] = await db
        .select({
          conversation: conversations,
          contactFirstName: contacts.firstName,
          contactLastName: contacts.lastName,
        })
        .from(conversations)
        .leftJoin(contacts, eq(conversations.contactId, contacts.id))
        .where(
          and(
            eq(conversations.id, conversationId),
            eq(conversations.workspaceId, workspaceId)
          )
        )
        .limit(1);

      if (!row) {
        throw new AppError(404, 'Conversation not found');
      }

      const contactName = [row.contactFirstName, row.contactLastName]
        .filter(Boolean)
        .join(' ') || null;

      // Fetch all messages sorted oldest first
      const msgRows = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(messages.createdAt);

      res.json({
        ...formatConversation(row.conversation),
        contact_name: contactName,
        messages: msgRows.map(formatMessage),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /workspaces/:workspaceId/conversations/:conversationId/messages ───

router.post(
  '/workspaces/:workspaceId/conversations/:conversationId/messages',
  requireAuth,
  requireWorkspaceMember(),
  validateBody(sendMessageSchema),
  async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId as string;
      const conversationId = req.params.conversationId as string;
      const { body } = req.body as z.infer<typeof sendMessageSchema>;

      // Verify conversation exists and belongs to this workspace
      const [conv] = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          and(
            eq(conversations.id, conversationId),
            eq(conversations.workspaceId, workspaceId)
          )
        )
        .limit(1);

      if (!conv) {
        throw new AppError(404, 'Conversation not found');
      }

      // Create the outbound message
      const [created] = await db
        .insert(messages)
        .values({
          conversationId,
          direction: 'outbound',
          channel: 'sms',
          body,
          status: 'delivered',
          isAi: false,
        })
        .returning();

      // Update conversation's updatedAt timestamp
      await db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));

      res.status(201).json(formatMessage(created));
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /workspaces/:workspaceId/conversations/:conversationId/ai/toggle ──

router.post(
  '/workspaces/:workspaceId/conversations/:conversationId/ai/toggle',
  requireAuth,
  requireWorkspaceMember(),
  validateBody(toggleAiSchema),
  async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId as string;
      const conversationId = req.params.conversationId as string;
      const { enabled } = req.body as z.infer<typeof toggleAiSchema>;

      const [updated] = await db
        .update(conversations)
        .set({ aiEnabled: enabled, updatedAt: new Date() })
        .where(
          and(
            eq(conversations.id, conversationId),
            eq(conversations.workspaceId, workspaceId)
          )
        )
        .returning();

      if (!updated) {
        throw new AppError(404, 'Conversation not found');
      }

      res.json(formatConversation(updated));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
