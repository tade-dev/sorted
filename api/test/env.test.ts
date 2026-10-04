import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/env.js';

const valid = {
  NODE_ENV: 'test',
  PORT: '3000',
  PAYPAL_CLIENT_ID: 'sb-client-id',
  PAYPAL_CLIENT_SECRET: 'sb-secret',
  PAYPAL_WEBHOOK_ID: 'wh-id',
  OPENAI_API_KEY: 'sk-test',
  OPENAI_VISION_MODEL: 'gpt-test-vision',
  FIREBASE_PROJECT_ID: 'sorted-test',
  INTERNAL_TOKEN: 'internal-secret',
};

describe('loadEnv', () => {
  it('parses a complete environment', () => {
    const env = loadEnv(valid);
    expect(env.PORT).toBe(3000);
    expect(env.PAYPAL_ENV).toBe('sandbox');
  });

  it('defaults PORT to 3000 when absent', () => {
    const { PORT, ...rest } = valid;
    expect(loadEnv(rest).PORT).toBe(3000);
  });

  it('rejects a missing secret', () => {
    const { PAYPAL_CLIENT_SECRET, ...rest } = valid;
    expect(() => loadEnv(rest)).toThrow(/PAYPAL_CLIENT_SECRET/);
  });

  it('rejects an empty secret rather than deploying with blank config', () => {
    expect(() => loadEnv({ ...valid, PAYPAL_CLIENT_SECRET: '' })).toThrow(
      /PAYPAL_CLIENT_SECRET/,
    );
  });

  it('rejects an empty OpenAI key', () => {
    expect(() => loadEnv({ ...valid, OPENAI_API_KEY: '' })).toThrow(/OPENAI_API_KEY/);
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => loadEnv({ ...valid, PORT: 'eighty' })).toThrow(/PORT/);
  });

  it('always reports the sandbox PayPal environment', () => {
    expect(loadEnv(valid).PAYPAL_ENV).toBe('sandbox');
  });
});
