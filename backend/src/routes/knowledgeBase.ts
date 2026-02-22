import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { knowledgeBase } from '../db/schema.js';
import { requireAuth, requireWorkspaceMember } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';
import { eq, and } from 'drizzle-orm';

const router = Router({ mergeParams: true });

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const createFAQSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});

const updateFAQSchema = z.object({
  question: z.string().min(1).optional(),
  answer: z.string().min(1).optional(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatItem(row: typeof knowledgeBase.$inferSelect) {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

// All routes require auth + workspace membership
router.use(requireAuth, requireWorkspaceMember());

// ─── GET /workspaces/:workspaceId/knowledge-base ─────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const workspaceId = (req.params as Record<string, string>).workspaceId;

    const rows = await db
      .select()
      .from(knowledgeBase)
      .where(eq(knowledgeBase.workspaceId, workspaceId))
      .orderBy(knowledgeBase.createdAt);

    res.json(rows.map(formatItem));
  } catch (err) {
    next(err);
  }
});

// ─── POST /workspaces/:workspaceId/knowledge-base ────────────────────────────

router.post('/', validateBody(createFAQSchema), async (req, res, next) => {
  try {
    const workspaceId = (req.params as Record<string, string>).workspaceId;
    const body = req.body as z.infer<typeof createFAQSchema>;

    const [created] = await db
      .insert(knowledgeBase)
      .values({
        workspaceId,
        question: body.question,
        answer: body.answer,
      })
      .returning();

    res.status(201).json(formatItem(created));
  } catch (err) {
    next(err);
  }
});

// ─── PUT /workspaces/:workspaceId/knowledge-base/:itemId ─────────────────────

router.put('/:itemId', validateBody(updateFAQSchema), async (req, res, next) => {
  try {
    const { workspaceId, itemId } = req.params as Record<string, string>;
    const body = req.body as z.infer<typeof updateFAQSchema>;

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (body.question !== undefined) updates.question = body.question;
    if (body.answer !== undefined) updates.answer = body.answer;

    if (Object.keys(updates).length === 1) {
      // Only updatedAt — nothing to change
      throw new AppError(422, 'No fields to update');
    }

    const [updated] = await db
      .update(knowledgeBase)
      .set(updates)
      .where(
        and(
          eq(knowledgeBase.id, itemId),
          eq(knowledgeBase.workspaceId, workspaceId)
        )
      )
      .returning();

    if (!updated) {
      throw new AppError(404, 'Knowledge base item not found');
    }

    res.json(formatItem(updated));
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /workspaces/:workspaceId/knowledge-base/:itemId ──────────────────

router.delete('/:itemId', async (req, res, next) => {
  try {
    const { workspaceId, itemId } = req.params as Record<string, string>;

    const [deleted] = await db
      .delete(knowledgeBase)
      .where(
        and(
          eq(knowledgeBase.id, itemId),
          eq(knowledgeBase.workspaceId, workspaceId)
        )
      )
      .returning();

    if (!deleted) {
      throw new AppError(404, 'Knowledge base item not found');
    }

    res.json({ message: 'Deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;
