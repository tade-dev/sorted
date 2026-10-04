import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requireSeller, type TokenVerifier } from '../src/lib/auth.js';
import { errorHandler } from '../src/lib/errors.js';

const verifier: TokenVerifier = async (token) => {
  if (token === 'good-token') return { uid: 'seller-a' };
  throw new Error('Firebase ID token has expired');
};

function appWith(verify: TokenVerifier) {
  const app = express();
  app.get('/whoami', requireSeller(verify), (req, res) => {
    res.json({ sellerId: req.sellerId });
  });
  app.use(errorHandler);
  return app;
}

describe('requireSeller', () => {
  it('sets sellerId from a valid token', async () => {
    const res = await request(appWith(verifier))
      .get('/whoami')
      .set('Authorization', 'Bearer good-token');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sellerId: 'seller-a' });
  });

  it('401s when the Authorization header is missing', async () => {
    const res = await request(appWith(verifier)).get('/whoami');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('401s when the scheme is not Bearer', async () => {
    const res = await request(appWith(verifier))
      .get('/whoami')
      .set('Authorization', 'Basic good-token');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('401s on a Bearer header with no token', async () => {
    const res = await request(appWith(verifier))
      .get('/whoami')
      .set('Authorization', 'Bearer ');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('401s rather than 500s when the verifier rejects an expired token', async () => {
    const res = await request(appWith(verifier))
      .get('/whoami')
      .set('Authorization', 'Bearer expired-token');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('does not leak the verifier error message to the client', async () => {
    const res = await request(appWith(verifier))
      .get('/whoami')
      .set('Authorization', 'Bearer expired-token');
    expect(JSON.stringify(res.body)).not.toContain('Firebase');
  });
});
