import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { calls, messages, conversations, contacts } from '../db/schema.js';
import { requireAuth, requireWorkspaceMember } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { grokChatCompletion } from '../services/grokChat.js';
import { eq, and, or, ilike, desc, sql } from 'drizzle-orm';

const router = Router({ mergeParams: true });

router.use(requireAuth, requireWorkspaceMember());

const searchSchema = z.object({
  query: z.string().min(1).max(500),
});

// ─── POST /search ────────────────────────────────────────────────────────────

router.post('/search', validateBody(searchSchema), async (req, res, next) => {
  try {
    const workspaceId = req.params.workspaceId as string;
    const { query } = req.body as z.infer<typeof searchSchema>;
    const pattern = `%${query}%`;

    // Search across calls, messages, and contacts in parallel
    const [callResults, messageResults, contactResults] = await Promise.all([
      // Search call transcripts and voicemail transcriptions
      db
        .select({
          id: calls.id,
          transcript: calls.transcript,
          voicemailTranscription: calls.voicemailTranscription,
          fromNumber: calls.fromNumber,
          contactFirstName: contacts.firstName,
          contactLastName: contacts.lastName,
          createdAt: calls.createdAt,
        })
        .from(calls)
        .leftJoin(contacts, eq(calls.contactId, contacts.id))
        .where(
          and(
            eq(calls.workspaceId, workspaceId),
            or(
              ilike(calls.voicemailTranscription, pattern),
              sql`${calls.transcript}::text ILIKE ${pattern}`
            )
          )
        )
        .orderBy(desc(calls.createdAt))
        .limit(10),

      // Search message bodies
      db
        .select({
          id: messages.id,
          conversationId: messages.conversationId,
          body: messages.body,
          direction: messages.direction,
          contactPhone: conversations.contactPhone,
          contactFirstName: contacts.firstName,
          contactLastName: contacts.lastName,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .leftJoin(contacts, eq(conversations.contactId, contacts.id))
        .where(
          and(
            eq(conversations.workspaceId, workspaceId),
            ilike(messages.body, pattern)
          )
        )
        .orderBy(desc(messages.createdAt))
        .limit(10),

      // Search contacts
      db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.workspaceId, workspaceId),
            or(
              ilike(contacts.firstName, pattern),
              ilike(contacts.lastName, pattern),
              ilike(contacts.email, pattern),
              ilike(contacts.phone, pattern),
              ilike(contacts.company, pattern)
            )
          )
        )
        .orderBy(desc(contacts.createdAt))
        .limit(10),
    ]);

    // Build context for AI
    const contextParts: string[] = [];
    const sources: {
      type: string;
      id: string;
      title: string;
      snippet: string;
      date: string;
    }[] = [];

    for (const c of callResults) {
      const name = [c.contactFirstName, c.contactLastName].filter(Boolean).join(' ')
        || c.fromNumber || 'Unknown';
      let snippet = c.voicemailTranscription || '';
      if (!snippet && c.transcript && Array.isArray(c.transcript)) {
        snippet = (c.transcript as { role: string; text: string }[])
          .map((t) => `${t.role}: ${t.text}`)
          .join(' ')
          .slice(0, 200);
      }
      contextParts.push(`[Call with ${name}]: ${snippet}`);
      sources.push({
        type: 'call',
        id: c.id,
        title: `Call with ${name}`,
        snippet: snippet.slice(0, 150),
        date: c.createdAt.toISOString(),
      });
    }

    for (const m of messageResults) {
      const name = [m.contactFirstName, m.contactLastName].filter(Boolean).join(' ')
        || m.contactPhone || 'Unknown';
      contextParts.push(`[Message ${m.direction} ${name}]: ${m.body || ''}`);
      sources.push({
        type: 'message',
        id: m.conversationId,
        title: `Message with ${name}`,
        snippet: (m.body || '').slice(0, 150),
        date: m.createdAt.toISOString(),
      });
    }

    for (const c of contactResults) {
      const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.phone;
      const details = [c.email, c.company, c.phone].filter(Boolean).join(', ');
      contextParts.push(`[Contact ${name}]: ${details}`);
      sources.push({
        type: 'contact',
        id: String(c.id),
        title: name,
        snippet: details,
        date: c.createdAt.toISOString(),
      });
    }

    if (contextParts.length === 0) {
      res.json({
        answer: 'No results found matching your query.',
        sources: [],
      });
      return;
    }

    // Ask Grok to synthesize an answer
    const aiResponse = await grokChatCompletion(
      [
        {
          role: 'system',
          content: `You are a helpful business search assistant. Answer the user's question based ONLY on the provided context. Be concise and specific. If the context doesn't contain enough information to fully answer, say so.`,
        },
        {
          role: 'user',
          content: `Context:\n${contextParts.join('\n\n')}\n\nQuestion: ${query}`,
        },
      ],
      { temperature: 0.2 }
    );

    res.json({
      answer: aiResponse,
      sources,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
