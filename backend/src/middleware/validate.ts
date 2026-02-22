import type { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

/**
 * Express middleware factory that validates req.body against a Zod schema.
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(
          new AppError(422, 'Validation error', {
            issues: err.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          })
        );
      } else {
        next(err);
      }
    }
  };
}
