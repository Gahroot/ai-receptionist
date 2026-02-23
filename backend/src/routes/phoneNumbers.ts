import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { phoneNumbers, agents } from '../db/schema.js';
import { requireAuth, requireWorkspaceMember } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';
import { eq, and } from 'drizzle-orm';
import { config } from '../config.js';
import {
  searchAvailableNumbers,
  orderPhoneNumber,
  releasePhoneNumber,
} from '../services/telnyxApi.js';

const router = Router();
router.use(requireAuth);

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const searchSchema = z.object({
  area_code: z.string().regex(/^\d{3}$/, 'Area code must be 3 digits'),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

const provisionSchema = z.object({
  phone_number: z.string().min(10),
  label: z.string().max(255).optional(),
  agent_id: z.string().uuid().optional(),
});

// ─── GET /workspaces/:workspaceId/phone-numbers/available ────────────────────

router.get(
  '/:workspaceId/phone-numbers/available',
  requireWorkspaceMember(),
  async (req, res, next) => {
    try {
      const { area_code, limit } = searchSchema.parse(req.query);

      if (!config.telnyxApiKey) {
        throw new AppError(503, 'Telnyx API key not configured');
      }

      const result = await searchAvailableNumbers(area_code, limit);

      const numbers = result.data.map((n) => ({
        phone_number: n.phone_number,
        region: n.region_information?.[0]?.region_name ?? '',
        monthly_cost: n.cost_information?.monthly_cost ?? 'N/A',
      }));

      res.json({ numbers });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /workspaces/:workspaceId/phone-numbers ──────────────────────────────

router.get(
  '/:workspaceId/phone-numbers',
  requireWorkspaceMember(),
  async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId as string;

      const rows = await db
        .select({
          id: phoneNumbers.id,
          phone_number: phoneNumbers.phoneNumber,
          label: phoneNumbers.label,
          is_active: phoneNumbers.isActive,
          agent_id: phoneNumbers.agentId,
          agent_name: agents.name,
          created_at: phoneNumbers.createdAt,
        })
        .from(phoneNumbers)
        .leftJoin(agents, eq(phoneNumbers.agentId, agents.id))
        .where(eq(phoneNumbers.workspaceId, workspaceId))
        .orderBy(phoneNumbers.createdAt);

      res.json({ items: rows });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /workspaces/:workspaceId/phone-numbers ─────────────────────────────

router.post(
  '/:workspaceId/phone-numbers',
  requireWorkspaceMember(),
  validateBody(provisionSchema),
  async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId as string;
      const { phone_number, label, agent_id } = req.body as z.infer<typeof provisionSchema>;

      if (!config.telnyxApiKey || !config.telnyxConnectionId) {
        throw new AppError(503, 'Telnyx not configured');
      }

      // Validate agent if provided
      if (agent_id) {
        const [agent] = await db
          .select({ id: agents.id })
          .from(agents)
          .where(and(eq(agents.id, agent_id), eq(agents.workspaceId, workspaceId)))
          .limit(1);

        if (!agent) {
          throw new AppError(400, 'Agent not found in this workspace');
        }
      }

      // Order the number via Telnyx
      const orderResult = await orderPhoneNumber(phone_number, config.telnyxConnectionId);
      const resourceId = orderResult.data?.id ?? null;

      // Get first agent in workspace if none specified
      let assignAgentId = agent_id ?? null;
      if (!assignAgentId) {
        const [firstAgent] = await db
          .select({ id: agents.id })
          .from(agents)
          .where(eq(agents.workspaceId, workspaceId))
          .limit(1);
        assignAgentId = firstAgent?.id ?? null;
      }

      // Insert into DB
      const [record] = await db
        .insert(phoneNumbers)
        .values({
          workspaceId,
          phoneNumber: phone_number,
          label: label ?? null,
          provider: 'telnyx',
          providerResourceId: resourceId ? String(resourceId) : null,
          agentId: assignAgentId,
          isActive: true,
        })
        .returning();

      res.status(201).json({
        id: record.id,
        phone_number: record.phoneNumber,
        label: record.label,
        is_active: record.isActive,
        agent_id: record.agentId,
        created_at: record.createdAt.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /workspaces/:workspaceId/phone-numbers/:id ───────────────────────

router.delete(
  '/:workspaceId/phone-numbers/:id',
  requireWorkspaceMember(),
  async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId as string;
      const numberId = req.params.id as string;

      const [record] = await db
        .select()
        .from(phoneNumbers)
        .where(and(eq(phoneNumbers.id, numberId), eq(phoneNumbers.workspaceId, workspaceId)))
        .limit(1);

      if (!record) {
        throw new AppError(404, 'Phone number not found');
      }

      // Release from Telnyx if we have a resource ID
      if (record.providerResourceId) {
        try {
          await releasePhoneNumber(record.providerResourceId);
        } catch (err) {
          console.error('[phoneNumbers] Failed to release from Telnyx:', err);
          // Continue with DB deletion anyway
        }
      }

      // Delete from DB
      await db
        .delete(phoneNumbers)
        .where(eq(phoneNumbers.id, numberId));

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

export default router;
