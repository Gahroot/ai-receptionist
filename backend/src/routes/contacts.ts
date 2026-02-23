import { Router, type Request } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { contacts } from '../db/schema.js';
import { requireAuth, requireWorkspaceMember } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';
import { eq, and, or, ilike, count } from 'drizzle-orm';

/** Params inherited from the parent mount: /workspaces/:workspaceId/contacts */
type WsParams = { workspaceId: string };
type WsIdParams = { workspaceId: string; id: string };

// mergeParams so :workspaceId from the parent mount path is accessible
const router = Router({ mergeParams: true });

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const createContactSchema = z.object({
  first_name: z.string().max(255).nullable().optional(),
  last_name: z.string().max(255).nullable().optional(),
  email: z.string().email().max(255).nullable().optional(),
  phone: z.string().min(1).max(50),
  company: z.string().max(255).nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional().default([]),
});

const updateContactSchema = z.object({
  first_name: z.string().max(255).nullable().optional(),
  last_name: z.string().max(255).nullable().optional(),
  email: z.string().email().max(255).nullable().optional(),
  phone: z.string().min(1).max(50).optional(),
  company: z.string().max(255).nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toSnakeCase(row: typeof contacts.$inferSelect) {
  return {
    id: row.id,
    first_name: row.firstName,
    last_name: row.lastName,
    email: row.email,
    phone: row.phone,
    company: row.company,
    notes: row.notes,
    tags: row.tags ?? [],
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

// All routes require auth + workspace membership
router.use(requireAuth, requireWorkspaceMember());

// ─── GET /workspaces/:workspaceId/contacts ───────────────────────────────────

router.get('/', async (req: Request<WsParams>, res, next) => {
  try {
    const { workspaceId } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(req.query.page_size as string) || 20));
    const search = (req.query.search as string)?.trim();

    const offset = (page - 1) * pageSize;

    // Base condition: filter by workspace
    const baseCondition = eq(contacts.workspaceId, workspaceId);

    // Build search condition
    let whereCondition = baseCondition;
    if (search) {
      const pattern = `%${search}%`;
      const searchCondition = or(
        ilike(contacts.firstName, pattern),
        ilike(contacts.lastName, pattern),
        ilike(contacts.email, pattern),
        ilike(contacts.phone, pattern),
        ilike(contacts.company, pattern),
      );
      whereCondition = and(baseCondition, searchCondition)!;
    }

    // Run count and data queries in parallel
    const [totalResult, rows] = await Promise.all([
      db
        .select({ count: count() })
        .from(contacts)
        .where(whereCondition),
      db
        .select()
        .from(contacts)
        .where(whereCondition)
        .orderBy(contacts.createdAt)
        .limit(pageSize)
        .offset(offset),
    ]);

    const total = totalResult[0].count;
    const pages = Math.ceil(total / pageSize);

    res.json({
      items: rows.map(toSnakeCase),
      total,
      page,
      page_size: pageSize,
      pages,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /workspaces/:workspaceId/contacts/:id ──────────────────────────────

router.get('/:id', async (req: Request<WsIdParams>, res, next) => {
  try {
    const { workspaceId } = req.params;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw new AppError(400, 'Invalid contact ID');
    }

    const rows = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.id, id),
          eq(contacts.workspaceId, workspaceId),
        )
      )
      .limit(1);

    if (rows.length === 0) {
      throw new AppError(404, 'Contact not found');
    }

    res.json(toSnakeCase(rows[0]));
  } catch (err) {
    next(err);
  }
});

// ─── POST /workspaces/:workspaceId/contacts ─────────────────────────────────

router.post('/', validateBody(createContactSchema), async (req: Request<WsParams>, res, next) => {
  try {
    const { workspaceId } = req.params;
    const body = req.body as z.infer<typeof createContactSchema>;

    const [created] = await db
      .insert(contacts)
      .values({
        workspaceId,
        firstName: body.first_name ?? null,
        lastName: body.last_name ?? null,
        email: body.email ?? null,
        phone: body.phone,
        company: body.company ?? null,
        notes: body.notes ?? null,
        tags: body.tags ?? [],
      })
      .returning();

    res.status(201).json(toSnakeCase(created));
  } catch (err) {
    next(err);
  }
});

// ─── PUT /workspaces/:workspaceId/contacts/:id ──────────────────────────────

router.put('/:id', validateBody(updateContactSchema), async (req: Request<WsIdParams>, res, next) => {
  try {
    const { workspaceId } = req.params;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw new AppError(400, 'Invalid contact ID');
    }

    const body = req.body as z.infer<typeof updateContactSchema>;

    // Build the update object from provided fields only
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (body.first_name !== undefined) updates.firstName = body.first_name;
    if (body.last_name !== undefined) updates.lastName = body.last_name;
    if (body.email !== undefined) updates.email = body.email;
    if (body.phone !== undefined) updates.phone = body.phone;
    if (body.company !== undefined) updates.company = body.company;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.tags !== undefined) updates.tags = body.tags;

    const [updated] = await db
      .update(contacts)
      .set(updates)
      .where(
        and(
          eq(contacts.id, id),
          eq(contacts.workspaceId, workspaceId),
        )
      )
      .returning();

    if (!updated) {
      throw new AppError(404, 'Contact not found');
    }

    res.json(toSnakeCase(updated));
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /workspaces/:workspaceId/contacts/:id ────────────────────────────

router.delete('/:id', async (req: Request<WsIdParams>, res, next) => {
  try {
    const { workspaceId } = req.params;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw new AppError(400, 'Invalid contact ID');
    }

    const [deleted] = await db
      .delete(contacts)
      .where(
        and(
          eq(contacts.id, id),
          eq(contacts.workspaceId, workspaceId),
        )
      )
      .returning({ id: contacts.id });

    if (!deleted) {
      throw new AppError(404, 'Contact not found');
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
