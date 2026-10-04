import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/env.js';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.METADATA_SERVER_DETECTION = 'none';

const env = loadEnv({
  NODE_ENV: 'test',
  PAYPAL_CLIENT_ID: 'id',
  PAYPAL_CLIENT_SECRET: 'secret',
  PAYPAL_WEBHOOK_ID: 'wh',
  OPENAI_API_KEY: 'sk',
  OPENAI_VISION_MODEL: 'm',
  FIREBASE_PROJECT_ID: 'sorted-session-test',
  INTERNAL_TOKEN: 't',
});

let db: Firestore;

beforeAll(() => {
  if (getApps().length === 0) {
    initializeApp({ projectId: 'sorted-session-test' });
  }
  db = getFirestore();
});

beforeEach(async () => {
  const sellers = await db.collection('sellers').listDocuments();
  await Promise.all(sellers.map((s) => db.recursiveDelete(s)));
});

function app() {
  return createApp({
    env,
    db,
    verify: async (token) => {
      if (token === 'good-token') return { uid: 'seller-a' };
      throw new Error('rejected');
    },
  });
}

describe('POST /v1/session/bootstrap', () => {
  it('seeds the demo catalogue for an authenticated seller', async () => {
    const res = await request(app())
      .post('/v1/session/bootstrap')
      .set('Authorization', 'Bearer good-token')
      .send({ demo: true });

    expect(res.status).toBe(200);
    expect(res.body.seller.displayName).toBe("Ola's Bakehouse");
    expect(res.body.seller.currency).toBe('GBP');
    expect(res.body.seededProducts).toBe(5);
  });

  it('defaults demo to true when the body is empty', async () => {
    const res = await request(app())
      .post('/v1/session/bootstrap')
      .set('Authorization', 'Bearer good-token')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.seededProducts).toBe(5);
  });

  it('401s without a bearer token rather than seeding anonymously', async () => {
    const res = await request(app()).post('/v1/session/bootstrap').send({ demo: true });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    const products = await db.collection('sellers/seller-a/products').get();
    expect(products.size).toBe(0);
  });

  it('401s on a token the verifier rejects', async () => {
    const res = await request(app())
      .post('/v1/session/bootstrap')
      .set('Authorization', 'Bearer bad-token')
      .send({ demo: true });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('400s with VALIDATION_FAILED when demo is not a boolean', async () => {
    const res = await request(app())
      .post('/v1/session/bootstrap')
      .set('Authorization', 'Bearer good-token')
      .send({ demo: 'yes please' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('is idempotent across two calls, as a judge reloading the page would be', async () => {
    const first = await request(app())
      .post('/v1/session/bootstrap')
      .set('Authorization', 'Bearer good-token')
      .send({ demo: true });
    const second = await request(app())
      .post('/v1/session/bootstrap')
      .set('Authorization', 'Bearer good-token')
      .send({ demo: true });

    expect(first.body.seededProducts).toBe(5);
    expect(second.body.seededProducts).toBe(0);
    const products = await db.collection('sellers/seller-a/products').get();
    expect(products.size).toBe(5);
  });
});
