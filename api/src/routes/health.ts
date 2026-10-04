import { Router } from 'express';
import type { Env } from '../env.js';

let webhookFailures = 0;
export const recordWebhookFailure = () => {
  webhookFailures += 1;
};

export function healthRouter(env: Env): Router {
  const router = Router();
  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      version: process.env.npm_package_version ?? '0.0.0',
      paypalEnv: env.PAYPAL_ENV,
      webhookFailures,
    });
  });
  return router;
}
