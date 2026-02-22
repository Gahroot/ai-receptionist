import express, { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, workspaceMemberships } from '../db/schema.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { AppError } from '../lib/errors.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(1),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(1),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
});

// ─── POST /auth/register ─────────────────────────────────────────────────────

router.post(
  '/auth/register',
  validateBody(registerSchema),
  async (req, res, next) => {
    try {
      const { email, password, full_name } = req.body as z.infer<typeof registerSchema>;

      // Check for existing user
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existing.length > 0) {
        throw new AppError(409, 'A user with this email already exists');
      }

      const passwordHash = await hashPassword(password);

      const [user] = await db
        .insert(users)
        .values({ email, passwordHash, fullName: full_name })
        .returning({
          id: users.id,
          email: users.email,
          full_name: users.fullName,
        });

      res.status(201).json(user);
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /auth/login (OAuth2 form-urlencoded) ──────────────────────────────

router.post(
  '/auth/login',
  express.urlencoded({ extended: false }),
  async (req, res, next) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        throw new AppError(422, 'username and password are required');
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, username))
        .limit(1);

      if (!user) {
        throw new AppError(401, 'Invalid email or password');
      }

      if (!user.isActive) {
        throw new AppError(403, 'Account is deactivated');
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        throw new AppError(401, 'Invalid email or password');
      }

      const payload = { sub: user.id, email: user.email };
      const [access_token, refresh_token] = await Promise.all([
        signAccessToken(payload),
        signRefreshToken(payload),
      ]);

      res.json({ access_token, refresh_token });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /auth/refresh ──────────────────────────────────────────────────────

router.post(
  '/auth/refresh',
  validateBody(refreshSchema),
  async (req, res, next) => {
    try {
      const { refresh_token } = req.body as z.infer<typeof refreshSchema>;

      const decoded = await verifyRefreshToken(refresh_token).catch(() => {
        throw new AppError(401, 'Invalid or expired refresh token');
      });

      // Verify user still exists and is active
      const [user] = await db
        .select({ id: users.id, email: users.email, isActive: users.isActive })
        .from(users)
        .where(eq(users.id, decoded.sub))
        .limit(1);

      if (!user || !user.isActive) {
        throw new AppError(401, 'User not found or deactivated');
      }

      const payload = { sub: user.id, email: user.email };
      const [access_token, new_refresh_token] = await Promise.all([
        signAccessToken(payload),
        signRefreshToken(payload),
      ]);

      res.json({ access_token, refresh_token: new_refresh_token });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /auth/me ────────────────────────────────────────────────────────────

router.get('/auth/me', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.sub;

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        full_name: users.fullName,
        is_active: users.isActive,
        created_at: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new AppError(404, 'User not found');
    }

    // Look up the user's default workspace
    const [membership] = await db
      .select({ workspaceId: workspaceMemberships.workspaceId })
      .from(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.userId, userId),
          eq(workspaceMemberships.isDefault, true)
        )
      )
      .limit(1);

    res.json({
      ...user,
      default_workspace_id: membership?.workspaceId ?? null,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/change-password ──────────────────────────────────────────────

router.post(
  '/auth/change-password',
  requireAuth,
  validateBody(changePasswordSchema),
  async (req, res, next) => {
    try {
      const userId = req.user!.sub;
      const { current_password, new_password } = req.body as z.infer<
        typeof changePasswordSchema
      >;

      const [user] = await db
        .select({ id: users.id, passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new AppError(404, 'User not found');
      }

      const valid = await verifyPassword(current_password, user.passwordHash);
      if (!valid) {
        throw new AppError(401, 'Current password is incorrect');
      }

      const newHash = await hashPassword(new_password);
      await db
        .update(users)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(users.id, userId));

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

export default router;
