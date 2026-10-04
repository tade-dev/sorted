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

  it('reports the non-secret config a deployment is actually running', async () => {
    // Without this there is no way to tell from outside which model or
    // Firebase project a deployed instance picked up, short of dashboard
    // access. Both values are already public: the model name is not a secret
    // and the project id ships in the committed firebase_options.dart.
    const res = await request(createApp(deps)).get('/v1/health');
    expect(res.body.config.visionModel).toBe('m');
    expect(res.body.config.firebaseProject).toBe('p');
  });

  it('flags which variables are still placeholders', async () => {
    const pendingEnv = loadEnv({
      NODE_ENV: 'test',
      PAYPAL_CLIENT_ID: 'id',
      PAYPAL_CLIENT_SECRET: 'secret',
      PAYPAL_WEBHOOK_ID: 'pending',
      OPENAI_API_KEY: 'sk',
      OPENAI_VISION_MODEL: 'pending',
      FIREBASE_PROJECT_ID: 'p',
      INTERNAL_TOKEN: 't',
    });
    const res = await request(createApp({ ...deps, env: pendingEnv })).get('/v1/health');
    expect(res.body.config.placeholders).toEqual([
      'PAYPAL_WEBHOOK_ID',
      'OPENAI_VISION_MODEL',
    ]);
  });

  it('never exposes a secret through health', async () => {
    const res = await request(createApp(deps)).get('/v1/health');
    const body = JSON.stringify(res.body);
    for (const secret of ['id', 'secret', 'sk', 't']) {
      expect(body).not.toContain(`"${secret}"`);
    }
    expect(body).not.toMatch(/CLIENT_SECRET|API_KEY|INTERNAL_TOKEN/);
  });
});
