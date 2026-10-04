import type { RequestHandler } from 'express';
import { ApiError } from './errors.js';

export type TokenVerifier = (token: string) => Promise<{ uid: string }>;

declare global {
  namespace Express {
    interface Request {
      sellerId?: string;
    }
  }
}

export function requireSeller(verify: TokenVerifier): RequestHandler {
  return async (req, _res, next) => {
    const header = req.get('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token?.trim()) {
      next(new ApiError(401, 'UNAUTHENTICATED', 'A bearer token is required.'));
      return;
    }
    try {
      const { uid } = await verify(token.trim());
      req.sellerId = uid;
      next();
    } catch {
      // Deliberately opaque: never echo the provider's message back.
      next(new ApiError(401, 'UNAUTHENTICATED', 'Your session has expired.'));
    }
  };
}
