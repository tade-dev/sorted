import { z } from 'zod';

const required = (name: string) => z.string().min(1, `${name} must not be empty`);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  PAYPAL_CLIENT_ID: required('PAYPAL_CLIENT_ID'),
  PAYPAL_CLIENT_SECRET: required('PAYPAL_CLIENT_SECRET'),
  PAYPAL_WEBHOOK_ID: required('PAYPAL_WEBHOOK_ID'),
  OPENAI_API_KEY: required('OPENAI_API_KEY'),
  OPENAI_VISION_MODEL: required('OPENAI_VISION_MODEL'),
  FIREBASE_PROJECT_ID: required('FIREBASE_PROJECT_ID'),
  INTERNAL_TOKEN: required('INTERNAL_TOKEN'),
});

export type Env = z.infer<typeof schema> & {
  /** Sandbox only, per the design spec. There is no live mode. */
  readonly PAYPAL_ENV: 'sandbox';
  readonly PAYPAL_API_BASE: 'https://api-m.sandbox.paypal.com';
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${detail}`);
  }
  return {
    ...parsed.data,
    PAYPAL_ENV: 'sandbox',
    PAYPAL_API_BASE: 'https://api-m.sandbox.paypal.com',
  };
}
