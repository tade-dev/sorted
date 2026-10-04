import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/env.js';

const env = loadEnv({
  NODE_ENV: 'test',
  PAYPAL_CLIENT_ID: 'id',
  PAYPAL_CLIENT_SECRET: 'secret',
  PAYPAL_WEBHOOK_ID: 'wh',
  OPENAI_API_KEY: 'sk',
  OPENAI_VISION_MODEL: 'm',
  FIREBASE_PROJECT_ID: 'p',
  INTERNAL_TOKEN: 't',
});

// /v1/health touches neither Firestore nor the verifier, so both are stubs.
const deps = {
  env,
  db: {} as never,
  verify: async () => ({ uid: 'seller-a' }),
};

describe('GET /v1/health', () => {
  it('reports ok and the sandbox environment', async () => {
    const res = await request(createApp(deps)).get('/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.paypalEnv).toBe('sandbox');
    expect(res.body.webhookFailures).toBe(0);
  });

  it('returns the spec error shape for an unknown route', async () => {
    const res = await request(createApp(deps)).get('/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route not found.' },
    });
  });
});
