import { Router } from 'express';
import { z } from 'zod';
import type { Firestore } from 'firebase-admin/firestore';
import { ApiError } from '../lib/errors.js';
import { requireSeller, type TokenVerifier } from '../lib/auth.js';
import { bootstrapSeller } from '../domain/seed.js';

const bodySchema = z.object({ demo: z.boolean().default(true) });

export function sessionRouter(deps: { db: Firestore; verify: TokenVerifier }): Router {
  const router = Router();

  router.post('/session/bootstrap', requireSeller(deps.verify), async (req, res, next) => {
    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      next(new ApiError(400, 'VALIDATION_FAILED', 'Invalid request body.', parsed.error.format()));
      return;
    }
    try {
      const result = await bootstrapSeller(deps.db, req.sellerId!, parsed.data);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
