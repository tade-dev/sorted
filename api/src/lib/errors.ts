import type { ErrorRequestHandler } from 'express';

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'NOT_FOUND'
  | 'AI_PARSE_FAILED'
  | 'PAYPAL_UNAVAILABLE'
  | 'ORDER_STATE_INVALID'
  | 'INTERNAL';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Mounted last. Renders the single error shape from the design spec. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }
  console.error('unhandled error', err);
  res.status(500).json({
    error: { code: 'INTERNAL', message: 'Something went wrong.' },
  });
};
