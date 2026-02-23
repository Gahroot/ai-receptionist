import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { users, businessHours, callForwarding, callScope, deviceTokens } from '../db/schema.js';
import { requireAuth, requireWorkspaceMember } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';
import { eq, and } from 'drizzle-orm';

const router = Router();

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const updateProfileSchema = z.object({
  full_name: z.string().max(255).optional(),
  phone_number: z.string().max(50).optional(),
});

const updateNotificationsSchema = z.object({
  notification_prefs: z.record(z.unknown()),
});

const businessHoursSchema = z.object({
  is_24_7: z.boolean(),
  schedule: z.record(z.unknown()),
});

const callForwardingSchema = z.object({
  enabled: z.boolean(),
  forward_to_number: z.string().max(50).nullable().optional(),
  forward_mode: z.enum(['always', 'busy', 'no_answer', 'after_hours']).optional(),
  ring_count: z.number().int().min(1).max(20).optional(),
});

const callScopeSchema = z.object({
  scope: z.string().max(50),
  ring_count: z.number().int().min(1).max(20).optional(),
  ending_message: z.string().optional(),
});

const deviceTokenSchema = z.object({
  expo_push_token: z.string().min(1),
  platform: z.string().min(1).max(20),
});

const deleteDeviceTokenSchema = z.object({
  expo_push_token: z.string().min(1),
});

// ─── User Profile ────────────────────────────────────────────────────────────

// GET /settings/users/me/profile
router.get(
  '/users/me/profile',
  requireAuth,
  async (req, res, next) => {
    try {
      const userId = req.user!.sub;

      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          full_name: users.fullName,
          phone_number: users.phoneNumber,
          is_active: users.isActive,
          created_at: users.createdAt,
          updated_at: users.updatedAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new AppError(404, 'User not found');
      }

      res.json(user);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /settings/users/me/profile
router.put(
  '/users/me/profile',
  requireAuth,
  validateBody(updateProfileSchema),
  async (req, res, next) => {
    try {
      const userId = req.user!.sub;
      const body = req.body as z.infer<typeof updateProfileSchema>;

      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      if (body.full_name !== undefined) updates.fullName = body.full_name;
      if (body.phone_number !== undefined) updates.phoneNumber = body.phone_number;

      const [updated] = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, userId))
        .returning({
          id: users.id,
          email: users.email,
          full_name: users.fullName,
          phone_number: users.phoneNumber,
          is_active: users.isActive,
          created_at: users.createdAt,
          updated_at: users.updatedAt,
        });

      if (!updated) {
        throw new AppError(404, 'User not found');
      }

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// ─── Notifications ───────────────────────────────────────────────────────────

// GET /settings/users/me/notifications
router.get(
  '/users/me/notifications',
  requireAuth,
  async (req, res, next) => {
    try {
      const userId = req.user!.sub;

      const [user] = await db
        .select({ notification_prefs: users.notificationPrefs })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new AppError(404, 'User not found');
      }

      res.json({ notification_prefs: user.notification_prefs ?? {} });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /settings/users/me/notifications
router.put(
  '/users/me/notifications',
  requireAuth,
  validateBody(updateNotificationsSchema),
  async (req, res, next) => {
    try {
      const userId = req.user!.sub;
      const { notification_prefs } = req.body as z.infer<typeof updateNotificationsSchema>;

      const [updated] = await db
        .update(users)
        .set({ notificationPrefs: notification_prefs, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning({ notification_prefs: users.notificationPrefs });

      if (!updated) {
        throw new AppError(404, 'User not found');
      }

      res.json({ notification_prefs: updated.notification_prefs ?? {} });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Business Hours ──────────────────────────────────────────────────────────

// GET /settings/workspaces/:workspaceId/business-hours
router.get(
  '/workspaces/:workspaceId/business-hours',
  requireAuth,
  requireWorkspaceMember(),
  async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId as string;

      const [row] = await db
        .select()
        .from(businessHours)
        .where(eq(businessHours.workspaceId, workspaceId))
        .limit(1);

      if (!row) {
        res.json({ is_24_7: false, schedule: {} });
        return;
      }

      res.json({
        is_24_7: row.is24_7,
        schedule: row.schedule ?? {},
      });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /settings/workspaces/:workspaceId/business-hours
router.put(
  '/workspaces/:workspaceId/business-hours',
  requireAuth,
  requireWorkspaceMember(),
  validateBody(businessHoursSchema),
  async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId as string;
      const body = req.body as z.infer<typeof businessHoursSchema>;

      // Check if a record already exists
      const [existing] = await db
        .select({ id: businessHours.id })
        .from(businessHours)
        .where(eq(businessHours.workspaceId, workspaceId))
        .limit(1);

      let row;
      if (existing) {
        [row] = await db
          .update(businessHours)
          .set({
            is24_7: body.is_24_7,
            schedule: body.schedule,
            updatedAt: new Date(),
          })
          .where(eq(businessHours.workspaceId, workspaceId))
          .returning();
      } else {
        [row] = await db
          .insert(businessHours)
          .values({
            workspaceId,
            is24_7: body.is_24_7,
            schedule: body.schedule,
          })
          .returning();
      }

      res.json({
        is_24_7: row.is24_7,
        schedule: row.schedule ?? {},
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Call Forwarding ─────────────────────────────────────────────────────────

// GET /settings/workspaces/:workspaceId/call-forwarding
router.get(
  '/workspaces/:workspaceId/call-forwarding',
  requireAuth,
  requireWorkspaceMember(),
  async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId as string;

      const [row] = await db
        .select()
        .from(callForwarding)
        .where(eq(callForwarding.workspaceId, workspaceId))
        .limit(1);

      if (!row) {
        res.json({ enabled: false, forward_to_number: null, forward_mode: 'no_answer', ring_count: 4 });
        return;
      }

      res.json({
        enabled: row.enabled,
        forward_to_number: row.forwardToNumber ?? null,
        forward_mode: row.forwardMode,
        ring_count: row.ringCount,
      });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /settings/workspaces/:workspaceId/call-forwarding
router.put(
  '/workspaces/:workspaceId/call-forwarding',
  requireAuth,
  requireWorkspaceMember(),
  validateBody(callForwardingSchema),
  async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId as string;
      const body = req.body as z.infer<typeof callForwardingSchema>;

      // Check if a record already exists
      const [existing] = await db
        .select({ id: callForwarding.id })
        .from(callForwarding)
        .where(eq(callForwarding.workspaceId, workspaceId))
        .limit(1);

      const values: Record<string, unknown> = {
        enabled: body.enabled,
      };
      if (body.forward_to_number !== undefined) values.forwardToNumber = body.forward_to_number;
      if (body.forward_mode !== undefined) values.forwardMode = body.forward_mode;
      if (body.ring_count !== undefined) values.ringCount = body.ring_count;

      let row;
      if (existing) {
        [row] = await db
          .update(callForwarding)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(callForwarding.workspaceId, workspaceId))
          .returning();
      } else {
        [row] = await db
          .insert(callForwarding)
          .values({
            workspaceId,
            enabled: body.enabled,
            forwardToNumber: (body.forward_to_number as string | null) ?? null,
            forwardMode: body.forward_mode ?? 'no_answer',
            ringCount: body.ring_count ?? 4,
          })
          .returning();
      }

      res.json({
        enabled: row.enabled,
        forward_to_number: row.forwardToNumber ?? null,
        forward_mode: row.forwardMode,
        ring_count: row.ringCount,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Call Scope ──────────────────────────────────────────────────────────────

// GET /settings/workspaces/:workspaceId/call-scope
router.get(
  '/workspaces/:workspaceId/call-scope',
  requireAuth,
  requireWorkspaceMember(),
  async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId as string;

      const [row] = await db
        .select()
        .from(callScope)
        .where(eq(callScope.workspaceId, workspaceId))
        .limit(1);

      if (!row) {
        res.json({
          scope: 'everyone',
          ring_count: 4,
          ending_message: 'Thank you for calling. Goodbye!',
        });
        return;
      }

      res.json({
        scope: row.scope,
        ring_count: row.ringCount,
        ending_message: row.endingMessage,
      });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /settings/workspaces/:workspaceId/call-scope
router.put(
  '/workspaces/:workspaceId/call-scope',
  requireAuth,
  requireWorkspaceMember(),
  validateBody(callScopeSchema),
  async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId as string;
      const body = req.body as z.infer<typeof callScopeSchema>;

      // Check if a record already exists
      const [existing] = await db
        .select({ id: callScope.id })
        .from(callScope)
        .where(eq(callScope.workspaceId, workspaceId))
        .limit(1);

      let row;
      if (existing) {
        const updates: Record<string, unknown> = {
          scope: body.scope,
          updatedAt: new Date(),
        };
        if (body.ring_count !== undefined) updates.ringCount = body.ring_count;
        if (body.ending_message !== undefined) updates.endingMessage = body.ending_message;

        [row] = await db
          .update(callScope)
          .set(updates)
          .where(eq(callScope.workspaceId, workspaceId))
          .returning();
      } else {
        [row] = await db
          .insert(callScope)
          .values({
            workspaceId,
            scope: body.scope,
            ringCount: body.ring_count ?? 4,
            endingMessage: body.ending_message ?? 'Thank you for calling. Goodbye!',
          })
          .returning();
      }

      res.json({
        scope: row.scope,
        ring_count: row.ringCount,
        ending_message: row.endingMessage,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Device Tokens ───────────────────────────────────────────────────────────

// POST /settings/device-tokens
router.post(
  '/device-tokens',
  requireAuth,
  validateBody(deviceTokenSchema),
  async (req, res, next) => {
    try {
      const userId = req.user!.sub;
      const { expo_push_token, platform } = req.body as z.infer<typeof deviceTokenSchema>;

      // Check if this token already exists
      const [existing] = await db
        .select({ id: deviceTokens.id })
        .from(deviceTokens)
        .where(eq(deviceTokens.expoPushToken, expo_push_token))
        .limit(1);

      if (existing) {
        // Update user_id in case a different user is registering with same token
        await db
          .update(deviceTokens)
          .set({ userId, platform })
          .where(eq(deviceTokens.expoPushToken, expo_push_token));
      } else {
        await db
          .insert(deviceTokens)
          .values({
            userId,
            expoPushToken: expo_push_token,
            platform,
          });
      }

      res.status(201).json({ expo_push_token, platform });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /settings/device-tokens
router.delete(
  '/device-tokens',
  requireAuth,
  validateBody(deleteDeviceTokenSchema),
  async (req, res, next) => {
    try {
      const userId = req.user!.sub;
      const { expo_push_token } = req.body as z.infer<typeof deleteDeviceTokenSchema>;

      await db
        .delete(deviceTokens)
        .where(
          and(
            eq(deviceTokens.expoPushToken, expo_push_token),
            eq(deviceTokens.userId, userId)
          )
        );

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

export default router;
