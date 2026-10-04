import { Router } from 'express';
import type { Env } from '../env.js';

let webhookFailures = 0;
export const recordWebhookFailure = () => {
  webhookFailures += 1;
};

/**
 * Non-secret config a deployed instance is actually running.
 *
 * Only values that are already public go in here: the model name is not a
 * secret and the Firebase project id ships in the committed
 * firebase_options.dart. Client ids, secrets, API keys and the internal token
 * never appear. `placeholders` lists variables still set to the literal
 * "pending" convention from .env.example, which is how you tell a
 * half-configured deployment from a finished one without dashboard access.
 */
function configSummary(env: Env) {
  const placeholders = (
    [
      ['PAYPAL_WEBHOOK_ID', env.PAYPAL_WEBHOOK_ID],
      ['OPENAI_VISION_MODEL', env.OPENAI_VISION_MODEL],
      ['FIREBASE_PROJECT_ID', env.FIREBASE_PROJECT_ID],
    ] as const
  )
    .filter(([, value]) => value === 'pending' || value.startsWith('demo-'))
    .map(([name]) => name);

  return {
    visionModel: env.OPENAI_VISION_MODEL,
    firebaseProject: env.FIREBASE_PROJECT_ID,
    placeholders,
  };
}

export function healthRouter(env: Env): Router {
  const router = Router();
  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      version: process.env.npm_package_version ?? '0.0.0',
      paypalEnv: env.PAYPAL_ENV,
      webhookFailures,
      config: configSummary(env),
    });
  });
  return router;
}
