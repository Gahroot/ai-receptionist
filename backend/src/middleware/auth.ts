import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, type TokenPayload } from '../lib/jwt.js';
import { AppError } from '../lib/errors.js';
import { db } from '../db/index.js';
import { workspaceMemberships } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';

// Extend Express Request with our user info
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError(401, 'Missing or invalid authorization header'));
  }

  const token = header.slice(7);
  try {
    const payload = await verifyAccessToken(token);
    req.user = payload;
    next();
  } catch {
    next(new AppError(401, 'Invalid or expired token'));
  }
}

/**
 * Middleware factory that verifies the user is a member of the workspace
 * specified by :workspaceId (or :wid) in req.params.
 */
export function requireWorkspaceMember(paramName = 'workspaceId') {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const workspaceId = req.params[paramName] as string;
    const userId = req.user?.sub;

    if (!workspaceId || !userId) {
      return next(new AppError(400, 'Missing workspace ID or user'));
    }

    const membership = await db
      .select()
      .from(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.userId, userId),
          eq(workspaceMemberships.workspaceId, workspaceId)
        )
      )
      .limit(1);

    if (membership.length === 0) {
      return next(new AppError(403, 'Not a member of this workspace'));
    }

    next();
  };
}
