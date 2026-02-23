import { Router, type Request } from 'express';
import { db } from '../db/index.js';
import {
  dailyRecaps,
  calls,
  messages,
  conversations,
  contacts,
} from '../db/schema.js';
import { requireAuth, requireWorkspaceMember } from '../middleware/auth.js';
import { AppError } from '../lib/errors.js';
import { grokChatCompletion } from '../services/grokChat.js';
import { eq, and, gte, lt, count, desc } from 'drizzle-orm';

const router = Router({ mergeParams: true });

router.use(requireAuth, requireWorkspaceMember());

function formatRecap(row: typeof dailyRecaps.$inferSelect) {
  return {
    id: row.id,
    date: row.date,
    summary: row.summary,
    metrics: row.metrics,
    notable_interactions: row.notableInteractions,
    action_items: row.actionItems,
    generated_at: row.generatedAt.toISOString(),
  };
}

// ─── GET /daily-recap?date=yyyy-MM-dd ────────────────────────────────────────

type WsParams = { workspaceId: string };

router.get('/', async (req: Request<WsParams>, res, next) => {
  try {
    const { workspaceId } = req.params;
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);

    const [recap] = await db
      .select()
      .from(dailyRecaps)
      .where(
        and(
          eq(dailyRecaps.workspaceId, workspaceId),
          eq(dailyRecaps.date, date)
        )
      )
      .limit(1);

    if (!recap) {
      throw new AppError(404, 'No recap found for this date');
    }

    res.json(formatRecap(recap));
  } catch (err) {
    next(err);
  }
});

// ─── POST /daily-recap/generate ──────────────────────────────────────────────

router.post('/generate', async (req: Request<WsParams>, res, next) => {
  try {
    const { workspaceId } = req.params;
    const today = new Date().toISOString().slice(0, 10);
    const dayStart = new Date(today + 'T00:00:00.000Z');
    const dayEnd = new Date(dayStart.getTime() + 86400000);

    // Check for existing recap (idempotent for same day)
    const [existing] = await db
      .select()
      .from(dailyRecaps)
      .where(
        and(
          eq(dailyRecaps.workspaceId, workspaceId),
          eq(dailyRecaps.date, today)
        )
      )
      .limit(1);

    if (existing) {
      res.json(formatRecap(existing));
      return;
    }

    // Aggregate today's data
    const dayFilter = and(
      eq(calls.workspaceId, workspaceId),
      gte(calls.createdAt, dayStart),
      lt(calls.createdAt, dayEnd)
    );

    const [
      callsAnsweredResult,
      callsMissedResult,
      voicemailsResult,
      msgsInResult,
      msgsOutResult,
      newContactsResult,
      recentCallRows,
    ] = await Promise.all([
      db.select({ value: count() }).from(calls)
        .where(and(dayFilter, eq(calls.status, 'completed'))),
      db.select({ value: count() }).from(calls)
        .where(and(dayFilter, eq(calls.status, 'no_answer'))),
      db.select({ value: count() }).from(calls)
        .where(and(dayFilter, eq(calls.isVoicemail, true))),
      db.select({ value: count() }).from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(and(
          eq(conversations.workspaceId, workspaceId),
          gte(messages.createdAt, dayStart),
          lt(messages.createdAt, dayEnd),
          eq(messages.direction, 'inbound')
        )),
      db.select({ value: count() }).from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(and(
          eq(conversations.workspaceId, workspaceId),
          gte(messages.createdAt, dayStart),
          lt(messages.createdAt, dayEnd),
          eq(messages.direction, 'outbound')
        )),
      db.select({ value: count() }).from(contacts)
        .where(and(
          eq(contacts.workspaceId, workspaceId),
          gte(contacts.createdAt, dayStart),
          lt(contacts.createdAt, dayEnd)
        )),
      // Fetch completed calls with transcripts for AI context
      db.select({
        id: calls.id,
        transcript: calls.transcript,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        fromNumber: calls.fromNumber,
        duration: calls.durationSeconds,
        createdAt: calls.createdAt,
      })
        .from(calls)
        .leftJoin(contacts, eq(calls.contactId, contacts.id))
        .where(and(dayFilter, eq(calls.status, 'completed')))
        .orderBy(desc(calls.createdAt))
        .limit(20),
    ]);

    const metrics = {
      calls_answered: callsAnsweredResult[0]?.value ?? 0,
      calls_missed: callsMissedResult[0]?.value ?? 0,
      messages_received: msgsInResult[0]?.value ?? 0,
      messages_sent: msgsOutResult[0]?.value ?? 0,
      voicemails: voicemailsResult[0]?.value ?? 0,
      new_contacts: newContactsResult[0]?.value ?? 0,
    };

    // Build context for AI
    const callSummaries = recentCallRows.map((c) => {
      const name = [c.contactFirstName, c.contactLastName].filter(Boolean).join(' ')
        || c.fromNumber || 'Unknown';
      let transcript = '';
      if (c.transcript && Array.isArray(c.transcript)) {
        transcript = (c.transcript as { role: string; text: string }[])
          .map((t) => `${t.role}: ${t.text}`)
          .join('\n')
          .slice(0, 500);
      }
      return `Call with ${name} (${c.duration ?? 0}s): ${transcript || 'No transcript'}`;
    }).join('\n\n');

    const aiResponse = await grokChatCompletion(
      [
        {
          role: 'system',
          content: `You are a business assistant. Generate a daily recap based on the following metrics and call data. Return a JSON object with:
- "summary": A 2-4 sentence recap of the day's activity
- "notable_interactions": Array of up to 5 notable interactions, each with: "id" (uuid string), "type" (call/message/voicemail), "contact_name" (string or null), "summary" (1 sentence), "sentiment" (positive/neutral/negative), "time" (ISO string)
- "action_items": Array of action items, each with: "id" (uuid string), "type" (follow_up/call_back/respond/review), "description" (string), "contact_name" (string or null), "completed" (false)

Return ONLY valid JSON.`,
        },
        {
          role: 'user',
          content: `Date: ${today}
Metrics: ${JSON.stringify(metrics)}
Call transcripts:
${callSummaries || 'No calls today.'}`,
        },
      ],
      { response_format: { type: 'json_object' } }
    );

    let parsed: {
      summary: string;
      notable_interactions: unknown[];
      action_items: unknown[];
    };
    try {
      parsed = JSON.parse(aiResponse);
    } catch {
      throw new AppError(502, 'Failed to parse AI recap response');
    }

    const [recap] = await db
      .insert(dailyRecaps)
      .values({
        workspaceId,
        date: today,
        summary: parsed.summary,
        metrics,
        notableInteractions: parsed.notable_interactions ?? [],
        actionItems: parsed.action_items ?? [],
      })
      .returning();

    res.json(formatRecap(recap));
  } catch (err) {
    next(err);
  }
});

export default router;
