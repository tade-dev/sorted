# Catalogue From Photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A seller photographs their stock, a vision model extracts products with prices and variants, the seller fixes anything wrong, and the confirmed products land in Firestore and appear live in the app.

**Architecture:** One seam for all AI calls — `generateStructured()` in `api/src/ai/client.ts` — so the five features differ only by schema and prompt. Extraction never writes: `POST /v1/catalogue/extract` returns candidates the seller confirms, and `POST /v1/catalogue/products` saves them. The Flutter app reads Firestore directly through a `StreamProvider` and writes only through the API, exactly as Plan 1 established.

**Tech Stack:** Node 22 + TypeScript, Express 5, Zod 4, OpenAI `gpt-5.5` (pinned), Vitest + Supertest, Firebase Admin; Flutter 3.47.2, Riverpod, GoRouter, freezed, dio.

**Spec:** `docs/superpowers/specs/2026-10-02-sorted-design.md` — §3 (endpoints 3-6), §5.1 (catalogue extraction), §6 (screens), §13 (design reconciliation).

**Design:** `docs/design/screens/Snap.dc.html`, `Review.dc.html`, `Catalogue.dc.html` are the visual source of truth. `docs/design/DESIGN.md` has the tokens, already encoded as `SortedColors` / `SortedShape`.

**Prior art to reuse, not reinvent:** Plan 1 built `money.ts` (all GBP arithmetic), `ApiError`/`errorHandler` (the one error shape), `requireSeller` (auth), `SortedColors`/`SortedShape`/`sortedTheme()` (design tokens), and `bootstrapSeller` (the seeded catalogue). Read those before writing anything.

## Global Constraints

- **Money is always an integer in minor units (pence) plus `currency: 'GBP'`.** No floats. All arithmetic through `api/src/domain/money.ts`.
- **Prices and totals are never produced by an LLM as final values.** The model proposes; `money.ts` computes; the seller confirms.
- Every API route is mounted under `/v1`.
- Every error response is exactly `{ "error": { "code": "...", "message": "...", "details"?: {} } }`.
- All client Firestore writes are denied. Writes go through the API's Admin SDK only.
- Timestamps are Firestore `Timestamp` at rest, ISO-8601 over the API.
- The vision model id comes from `env.OPENAI_VISION_MODEL` (currently `gpt-5.5`). **Never hardcode a model id in source.**
- UK English in all user-facing copy. The string "PayPal" must not appear in the product name, logo or app title.
- Flutter 3.47.2 / Dart `^3.13.2`; Node `>=18`.
- No widget hardcodes a hex value — colours come from `SortedColors.of(context)`, shape from `SortedShape`.
- Run the emulator with `npm run emulators` (it finds a JDK 21+); it deliberately targets `demo-sorted`, never the live project.

## Review Focus

Five failure modes the spec implies but does not spell out. Each gets a test in the task that owns the code.

1. **A photo with no readable price.** `Review.dc.html` shows exactly this ("Couldn't read a price. Add one to save."), so extraction must return `basePriceMinor: null` plus an ambiguity, and saving must refuse a product whose price is still null rather than writing a £0 item a buyer could order. *(Tasks 3 and 10)*
2. **A photo that is not stock at all** — a selfie, a receipt, an empty worktop. The model will happily invent products. Extraction must be able to return zero candidates, and the UI must say so rather than showing an empty confirm screen. *(Tasks 3 and 10)*
3. **Oversized or non-image uploads.** Phone photos run 3-12MB and the spec caps at 5 images of 8MB. A 9MB file, a PDF renamed `.jpg`, or six files must each give a clean `400 VALIDATION_FAILED`, not a crash or a truncated upload. *(Task 3)*
4. **Variant label collisions.** Known from week 1 and now actually reachable, because the model generates labels: "Box of 6" and "box of 6" both slugify to `box-of-6`, silently merging two variants into one id and one price. *(Task 4)*
5. **Saving the same product twice.** A seller re-snaps a cake already in the catalogue, or double-taps "Add 3 products". Without a guard the catalogue fills with duplicates, which then makes week 3's DM matching ambiguous — the same failure the concurrent-bootstrap bug caused. *(Task 4)*

---

## File Structure

| File | Responsibility |
|---|---|
| `api/src/ai/schemas.ts` | All five Zod schemas plus the shared `Ambiguity`. The single source of truth for AI output shapes. |
| `api/src/ai/client.ts` | `generateStructured()` — the one seam every AI call goes through. Model, retry and validation live here. |
| `api/src/ai/extract_catalogue.ts` | Prompt and post-processing for photos → product candidates. |
| `api/src/routes/catalogue.ts` | `POST /extract`, `POST /products`, `PATCH /products/:id`, `DELETE /products/:id`. |
| `api/src/domain/products.ts` | Writing products: slug uniqueness, duplicate detection, Firestore shape. |
| `app/lib/models/*.dart` | freezed models: `Product`, `Variant`, `ProductCandidate`, `Ambiguity`. |
| `app/lib/data/firestore_refs.dart` | Typed collection refs with converters. |
| `app/lib/data/catalogue_repository.dart` | Firestore reads (streams) + API writes. |
| `app/lib/core/api_client.dart` | dio wrapper that attaches the Firebase ID token. |
| `app/lib/providers/catalogue_providers.dart` | `StreamProvider` over products; extraction controller. |
| `app/lib/router.dart` | GoRouter with the bottom-nav shell. |
| `app/lib/widgets/*.dart` | `PrimaryButton`, `StatusChip`, `SelectableChip`, `WarningCard`, `ProductTile`. |
| `app/lib/features/catalogue/*.dart` | `CatalogueScreen`, `SnapScreen`, `ReviewScreen`. |

---

### Task 1: The five Zod schemas

Schema-first. Every later task imports from here, and week 3's DM parser depends on `dmOrderSchema` existing now so the shapes cannot drift.

**Files:**
- Create: `api/src/ai/schemas.ts`
- Test: `api/test/schemas.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, all from `src/ai/schemas.ts`:
  - `ambiguitySchema`, `type Ambiguity`
  - `productCandidateSchema`, `type ProductCandidate`
  - `catalogueExtractionSchema`, `type CatalogueExtraction`
  - `dmOrderSchema`, `type DmOrder`
  - `replyDraftSchema`, `type ReplyDraft`
  - `nudgeDraftSchema`, `type NudgeDraft`
  - `dailySummarySchema`, `type DailySummary`

- [ ] **Step 1: Write the failing test**

Create `api/test/schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ambiguitySchema,
  catalogueExtractionSchema,
  dailySummarySchema,
  dmOrderSchema,
  nudgeDraftSchema,
  replyDraftSchema,
} from '../src/ai/schemas.js';

describe('ambiguitySchema', () => {
  it('accepts a seller-facing question with options', () => {
    const parsed = ambiguitySchema.parse({
      field: 'lineItems[0].variantIds',
      kind: 'missing',
      question: 'What size did Jess want?',
      options: ['8 inch', '10 inch'],
      blocking: true,
    });
    expect(parsed.question).toBe('What size did Jess want?');
  });

  it('defaults options to an empty list and blocking to true', () => {
    const parsed = ambiguitySchema.parse({
      field: 'fulfilment.date',
      kind: 'unclear',
      question: 'Which Saturday?',
    });
    expect(parsed.options).toEqual([]);
    expect(parsed.blocking).toBe(true);
  });

  it('rejects an unknown kind', () => {
    expect(() =>
      ambiguitySchema.parse({ field: 'x', kind: 'vibes', question: 'eh?' }),
    ).toThrow();
  });
});

describe('catalogueExtractionSchema', () => {
  it('accepts a product with a null price and an ambiguity', () => {
    // Review.dc.html shows exactly this: "Couldn't read a price. Add one to save."
    const parsed = catalogueExtractionSchema.parse({
      candidates: [
        {
          name: 'Cinnamon buns',
          description: 'Soft cinnamon buns with a vanilla glaze.',
          basePriceMinor: null,
          variants: [{ axis: 'size', label: 'Box of 4', priceDeltaMinor: 0 }],
          confidence: 0.4,
          ambiguities: [
            {
              field: 'basePriceMinor',
              kind: 'missing',
              question: 'What do you charge for a box of 4?',
            },
          ],
        },
      ],
    });
    expect(parsed.candidates[0]!.basePriceMinor).toBeNull();
  });

  it('accepts zero candidates, for a photo that is not stock', () => {
    expect(catalogueExtractionSchema.parse({ candidates: [] }).candidates).toEqual([]);
  });

  it('rejects a fractional price, because money is integer pence', () => {
    expect(() =>
      catalogueExtractionSchema.parse({
        candidates: [
          { name: 'x', description: 'y', basePriceMinor: 32.5, variants: [], confidence: 1, ambiguities: [] },
        ],
      }),
    ).toThrow();
  });

  it('rejects a negative price', () => {
    expect(() =>
      catalogueExtractionSchema.parse({
        candidates: [
          { name: 'x', description: 'y', basePriceMinor: -1, variants: [], confidence: 1, ambiguities: [] },
        ],
      }),
    ).toThrow();
  });

  it('rejects confidence outside 0..1', () => {
    expect(() =>
      catalogueExtractionSchema.parse({
        candidates: [
          { name: 'x', description: 'y', basePriceMinor: 100, variants: [], confidence: 1.5, ambiguities: [] },
        ],
      }),
    ).toThrow();
  });

  it('allows a negative variant delta, which is a legitimate discount', () => {
    const parsed = catalogueExtractionSchema.parse({
      candidates: [
        {
          name: 'Lemon drizzle cake',
          description: 'Zesty lemon sponge.',
          basePriceMinor: 3200,
          variants: [{ axis: 'size', label: '6 inch', priceDeltaMinor: -800 }],
          confidence: 0.9,
          ambiguities: [],
        },
      ],
    });
    expect(parsed.candidates[0]!.variants[0]!.priceDeltaMinor).toBe(-800);
  });
});

describe('dmOrderSchema', () => {
  it('accepts the canonical Jess order', () => {
    const parsed = dmOrderSchema.parse({
      buyerName: 'Jess M',
      buyerHandle: 'jess.mcr',
      buyerEmail: null,
      channel: 'instagram',
      lineItems: [
        { nameRaw: 'lemon drizzle cake, the 10 inch one', qty: 1, variantLabels: ['10 inch'] },
        { nameRaw: 'brownie box of 6', qty: 1, variantLabels: ['Box of 6'] },
      ],
      fulfilment: { mode: 'collection', date: '2026-10-10', notes: "for her mum's birthday" },
      depositRequestedMinor: null,
      ambiguities: [],
      overallConfidence: 0.95,
    });
    expect(parsed.lineItems).toHaveLength(2);
  });

  it('rejects a quantity below 1', () => {
    expect(() =>
      dmOrderSchema.parse({
        buyerName: null, buyerHandle: null, buyerEmail: null, channel: 'unknown',
        lineItems: [{ nameRaw: 'cake', qty: 0, variantLabels: [] }],
        fulfilment: { mode: 'unknown', date: null, notes: null },
        depositRequestedMinor: null, ambiguities: [], overallConfidence: 0.5,
      }),
    ).toThrow();
  });

  it('rejects a fulfilment date that is not an ISO date', () => {
    expect(() =>
      dmOrderSchema.parse({
        buyerName: null, buyerHandle: null, buyerEmail: null, channel: 'unknown',
        lineItems: [{ nameRaw: 'cake', qty: 1, variantLabels: [] }],
        fulfilment: { mode: 'collection', date: 'next Saturday', notes: null },
        depositRequestedMinor: null, ambiguities: [], overallConfidence: 0.5,
      }),
    ).toThrow();
  });
});

describe('the three drafting schemas', () => {
  it('replyDraftSchema caps the reply length', () => {
    expect(() => replyDraftSchema.parse({ reply: 'x'.repeat(1001) })).toThrow();
    expect(replyDraftSchema.parse({ reply: 'Here you go!' }).reply).toBe('Here you go!');
  });

  it('nudgeDraftSchema lets the agent decline to chase', () => {
    const parsed = nudgeDraftSchema.parse({
      text: '', recommendChannel: 'manual_copy', shouldSkip: true,
      skipReason: 'Buyer already said they would pay on collection.',
    });
    expect(parsed.shouldSkip).toBe(true);
  });

  it('dailySummarySchema caps highlights at three', () => {
    expect(() =>
      dailySummarySchema.parse({ highlights: ['a', 'b', 'c', 'd'] }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd api && npx vitest run test/schemas.test.ts
```

Expected: FAIL — cannot resolve `../src/ai/schemas.js`.

- [ ] **Step 3: Write `api/src/ai/schemas.ts`**

```ts
import { z } from 'zod';

/** Integer pence, never negative. Mirrors money.ts's Minor. */
const minor = z.number().int().nonnegative();
/** Signed integer pence: a variant may legitimately reduce the price. */
const signedMinor = z.number().int();

export const ambiguitySchema = z.object({
  field: z.string().min(1),
  kind: z.enum([
    'missing',
    'unclear',
    'unknown_product',
    'price_conflict',
    'qty_unclear',
  ]),
  /** Seller-facing, answerable in one tap. Never model-speak. */
  question: z.string().min(1).max(160),
  options: z.array(z.string()).default([]),
  blocking: z.boolean().default(true),
});
export type Ambiguity = z.infer<typeof ambiguitySchema>;

const variantSchema = z.object({
  axis: z.enum(['size', 'colour', 'flavour', 'other']),
  label: z.string().min(1).max(40),
  priceDeltaMinor: signedMinor,
});

export const productCandidateSchema = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(240),
  /** null when no price was readable — the seller supplies it before saving. */
  basePriceMinor: minor.nullable(),
  variants: z.array(variantSchema).max(12),
  confidence: z.number().min(0).max(1),
  ambiguities: z.array(ambiguitySchema).default([]),
});
export type ProductCandidate = z.infer<typeof productCandidateSchema>;

export const catalogueExtractionSchema = z.object({
  candidates: z.array(productCandidateSchema).max(20),
});
export type CatalogueExtraction = z.infer<typeof catalogueExtractionSchema>;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)');

export const dmOrderSchema = z.object({
  buyerName: z.string().max(80).nullable(),
  buyerHandle: z.string().max(80).nullable(),
  buyerEmail: z.string().email().nullable(),
  channel: z.enum(['instagram', 'tiktok', 'whatsapp', 'other', 'unknown']),
  lineItems: z
    .array(
      z.object({
        /** The buyer's own words, quoted. */
        nameRaw: z.string().min(1).max(200),
        qty: z.number().int().min(1).max(999),
        variantLabels: z.array(z.string().max(40)).default([]),
      }),
    )
    .max(30),
  fulfilment: z.object({
    mode: z.enum(['collection', 'delivery', 'unknown']),
    date: isoDate.nullable(),
    notes: z.string().max(300).nullable(),
  }),
  depositRequestedMinor: minor.nullable(),
  ambiguities: z.array(ambiguitySchema).default([]),
  overallConfidence: z.number().min(0).max(1),
});
export type DmOrder = z.infer<typeof dmOrderSchema>;

export const replyDraftSchema = z.object({
  reply: z.string().min(1).max(1000),
});
export type ReplyDraft = z.infer<typeof replyDraftSchema>;

export const nudgeDraftSchema = z.object({
  text: z.string().max(500),
  recommendChannel: z.enum(['paypal_invoice', 'manual_copy']),
  /** An agent that knows when not to chase is more credible than one that always fires. */
  shouldSkip: z.boolean(),
  skipReason: z.string().max(200).nullable(),
});
export type NudgeDraft = z.infer<typeof nudgeDraftSchema>;

export const dailySummarySchema = z.object({
  highlights: z.array(z.string().max(70)).max(3),
});
export type DailySummary = z.infer<typeof dailySummarySchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd api && npx vitest run test/schemas.test.ts
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/bstar/Documents/development/apps/flutter/sorted
git add api/src/ai/schemas.ts api/test/schemas.test.ts
git commit -m "feat(api): add the five AI output schemas

Schema-first, so week 3's DM parser and week 5's nudge agent cannot
drift from what the routes validate. A null basePriceMinor plus an
ambiguity is the designed path for a photo with no readable price."
```

---

### Task 2: `generateStructured` — the one AI seam

Every AI feature goes through this function, so the model id, retry policy, and schema validation live in exactly one place. Whether the transport is the Vercel AI SDK or a direct call is an implementation detail behind it.

**Files:**
- Create: `api/src/ai/client.ts`
- Test: `api/test/ai-client.test.ts`, `api/test/ai-client.live.test.ts`

**Interfaces:**
- Consumes: `Env` from `src/env.ts`; schemas from `src/ai/schemas.ts`; `ApiError` from `src/lib/errors.ts`.
- Produces, from `src/ai/client.ts`:
  - `type StructuredCall<T> = { schemaName: string; schema: z.ZodType<T>; jsonSchema: Record<string, unknown>; system: string; text?: string; images?: string[]; temperature?: number }`
  - `type ChatTransport = (body: unknown) => Promise<{ content: string; usage?: { prompt: number; completion: number } }>`
  - `makeOpenAiTransport(env: Env): ChatTransport`
  - `generateStructured<T>(call: StructuredCall<T>, transport: ChatTransport, model: string): Promise<T>`
  - `toDataUri(buffer: Buffer, mime: string): string`

`generateStructured` takes an injected transport so unit tests never touch the network, and one live test exercises the real thing.

- [ ] **Step 1: Write the failing unit test**

Create `api/test/ai-client.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { generateStructured, toDataUri, type ChatTransport } from '../src/ai/client.js';

const schema = z.object({ name: z.string(), price: z.number().int() });
const jsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'price'],
  properties: { name: { type: 'string' }, price: { type: 'integer' } },
};
const call = { schemaName: 'thing', schema, jsonSchema, system: 'extract a thing' };

describe('generateStructured', () => {
  it('returns the parsed object on a valid response', async () => {
    const transport: ChatTransport = async () => ({
      content: JSON.stringify({ name: 'cake', price: 3200 }),
    });
    expect(await generateStructured(call, transport, 'test-model')).toEqual({
      name: 'cake',
      price: 3200,
    });
  });

  it('retries once with the validation error appended, then succeeds', async () => {
    const transport = vi
      .fn<ChatTransport>()
      .mockResolvedValueOnce({ content: JSON.stringify({ name: 'cake' }) })
      .mockResolvedValueOnce({ content: JSON.stringify({ name: 'cake', price: 3200 }) });

    const result = await generateStructured(call, transport, 'test-model');

    expect(result.price).toBe(3200);
    expect(transport).toHaveBeenCalledTimes(2);
    // The retry must actually tell the model what was wrong, or it is just a
    // second roll of the dice.
    const retryBody = JSON.stringify(transport.mock.calls[1]![0]);
    expect(retryBody).toContain('price');
  });

  it('gives up after one retry with AI_PARSE_FAILED, never a third call', async () => {
    const transport = vi
      .fn<ChatTransport>()
      .mockResolvedValue({ content: JSON.stringify({ name: 'cake' }) });

    await expect(generateStructured(call, transport, 'test-model')).rejects.toMatchObject({
      code: 'AI_PARSE_FAILED',
    });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('fails with AI_PARSE_FAILED when the model returns prose, not JSON', async () => {
    const transport: ChatTransport = async () => ({ content: 'Sure! Here you go:' });
    await expect(generateStructured(call, transport, 'test-model')).rejects.toMatchObject({
      code: 'AI_PARSE_FAILED',
    });
  });

  it('sends the model id it was given, never a hardcoded one', async () => {
    const transport = vi
      .fn<ChatTransport>()
      .mockResolvedValue({ content: JSON.stringify({ name: 'c', price: 1 }) });
    await generateStructured(call, transport, 'some-future-model');
    expect((transport.mock.calls[0]![0] as { model: string }).model).toBe(
      'some-future-model',
    );
  });

  it('attaches images as content parts when given', async () => {
    const transport = vi
      .fn<ChatTransport>()
      .mockResolvedValue({ content: JSON.stringify({ name: 'c', price: 1 }) });
    await generateStructured(
      { ...call, images: ['data:image/png;base64,AAAA'] },
      transport,
      'test-model',
    );
    expect(JSON.stringify(transport.mock.calls[0]![0])).toContain('image_url');
  });
});

describe('toDataUri', () => {
  it('builds a data URI the chat API accepts', () => {
    expect(toDataUri(Buffer.from('hi'), 'image/png')).toBe(
      'data:image/png;base64,aGk=',
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd api && npx vitest run test/ai-client.test.ts
```

Expected: FAIL — cannot resolve `../src/ai/client.js`.

- [ ] **Step 3: Write `api/src/ai/client.ts`**

```ts
import type { z } from 'zod';
import type { Env } from '../env.js';
import { ApiError } from '../lib/errors.js';

export type StructuredCall<T> = {
  schemaName: string;
  schema: z.ZodType<T>;
  /** Strict JSON Schema for the API. Kept beside the Zod schema deliberately:
   *  the API enforces shape, Zod enforces our invariants, and the two failing
   *  differently is information, not duplication. */
  jsonSchema: Record<string, unknown>;
  system: string;
  text?: string;
  images?: string[];
  temperature?: number;
};

export type ChatTransport = (body: unknown) => Promise<{
  content: string;
  usage?: { prompt: number; completion: number };
}>;

export function toDataUri(buffer: Buffer, mime: string): string {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

export function makeOpenAiTransport(env: Env): ChatTransport {
  return async (body) => {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as {
      error?: { message: string };
      choices?: { message: { content: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    if (json.error) {
      throw new ApiError(502, 'AI_PARSE_FAILED', `The AI service failed: ${json.error.message}`);
    }
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new ApiError(502, 'AI_PARSE_FAILED', 'The AI service returned no content.');
    }
    return {
      content,
      ...(json.usage
        ? { usage: { prompt: json.usage.prompt_tokens, completion: json.usage.completion_tokens } }
        : {}),
    };
  };
}

function buildBody<T>(
  call: StructuredCall<T>,
  model: string,
  correction?: string,
): unknown {
  const parts: unknown[] = [];
  if (call.text) parts.push({ type: 'text', text: call.text });
  for (const url of call.images ?? []) parts.push({ type: 'image_url', image_url: { url } });
  if (parts.length === 0) parts.push({ type: 'text', text: '(no input)' });

  const system = correction
    ? `${call.system}\n\nYour previous reply did not validate: ${correction}\nReturn JSON that fixes exactly that.`
    : call.system;

  return {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: parts },
    ],
    ...(call.temperature === undefined ? {} : { temperature: call.temperature }),
    response_format: {
      type: 'json_schema',
      json_schema: { name: call.schemaName, strict: true, schema: call.jsonSchema },
    },
  };
}

/**
 * One attempt, then one corrective retry, then give up.
 *
 * The retry feeds the validation error back so the second attempt is informed
 * rather than a second roll of the dice. Two failures mean the seller enters
 * it by hand; they are never blocked by the model.
 */
export async function generateStructured<T>(
  call: StructuredCall<T>,
  transport: ChatTransport,
  model: string,
): Promise<T> {
  let lastError = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    const { content } = await transport(
      buildBody(call, model, attempt === 0 ? undefined : lastError),
    );

    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      lastError = 'the reply was not valid JSON';
      continue;
    }

    const parsed = call.schema.safeParse(raw);
    if (parsed.success) return parsed.data;

    lastError = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
  }

  throw new ApiError(
    502,
    'AI_PARSE_FAILED',
    'Sorted could not read that reliably. Please enter it by hand.',
    { lastError },
  );
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

```bash
cd api && npx vitest run test/ai-client.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Write the live test**

This one calls the real API. It skips itself when no key is present, so CI and judges are never blocked by it.

Create `api/test/ai-client.live.test.ts`:

```ts
import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { generateStructured, makeOpenAiTransport, toDataUri } from '../src/ai/client.js';
import { loadEnv } from '../src/env.js';

const envFile = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const key = envFile.match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim();
const model = envFile.match(/^OPENAI_VISION_MODEL=(.+)$/m)?.[1]?.trim();
const ready = Boolean(key) && Boolean(model) && model !== 'pending';

describe.skipIf(!ready)('generateStructured against the real model', () => {
  const env = loadEnv({
    NODE_ENV: 'test',
    PAYPAL_CLIENT_ID: 'x', PAYPAL_CLIENT_SECRET: 'x', PAYPAL_WEBHOOK_ID: 'x',
    OPENAI_API_KEY: key!, OPENAI_VISION_MODEL: model!,
    FIREBASE_PROJECT_ID: 'x', INTERNAL_TOKEN: 'x',
  });

  const schema = z.object({
    buyerName: z.string().nullable(),
    items: z.array(z.object({ nameRaw: z.string(), qty: z.number().int() })),
  });

  it('reads the canonical Jess screenshot into schema-valid JSON', async () => {
    const img = toDataUri(
      readFileSync('../samples/dm-screenshots/01.png'),
      'image/png',
    );

    const result = await generateStructured(
      {
        schemaName: 'probe',
        schema,
        jsonSchema: {
          type: 'object', additionalProperties: false,
          required: ['buyerName', 'items'],
          properties: {
            buyerName: { type: ['string', 'null'] },
            items: {
              type: 'array',
              items: {
                type: 'object', additionalProperties: false,
                required: ['nameRaw', 'qty'],
                properties: { nameRaw: { type: 'string' }, qty: { type: 'integer' } },
              },
            },
          },
        },
        system:
          'Extract what the buyer ordered from this chat screenshot. Quote their own words in nameRaw. "box of 6" describes one box, not a quantity of six.',
        images: [img],
      },
      makeOpenAiTransport(env),
      env.OPENAI_VISION_MODEL,
    );

    expect(result.buyerName).toMatch(/Jess/);
    expect(result.items).toHaveLength(2);
    // The gpt-4.1-mini failure this pinning was chosen to avoid: reading
    // "brownie box of 6" as qty 6 would bill GBP 84 instead of GBP 14.
    for (const item of result.items) expect(item.qty).toBe(1);
  }, 60_000);
});
```

- [ ] **Step 6: Run the live test**

```bash
cd api && npx vitest run test/ai-client.live.test.ts
```

Expected: PASS, 1 test (or `skipped` if `.env` has no key). If the quantity assertion fails, the pinned model has regressed — re-run the comparison in `docs/verified-facts.md` before changing the assertion.

- [ ] **Step 7: Commit**

```bash
cd /Users/bstar/Documents/development/apps/flutter/sorted
git add api/src/ai/client.ts api/test/ai-client.test.ts api/test/ai-client.live.test.ts
git commit -m "feat(api): add generateStructured, the single AI seam

Every AI feature goes through one function, so the model id, the
corrective retry and schema validation live in one place. The transport
is injected, so unit tests never hit the network; one live test, skipped
without a key, pins the quantity behaviour that drove the model choice."
```

---

### Task 3: Photos to product candidates

Covers Review Focus items 1, 2 and 3.

**Files:**
- Create: `api/src/ai/extract_catalogue.ts`, `api/src/routes/catalogue.ts`
- Modify: `api/src/app.ts` (mount the router)
- Test: `api/test/extract-catalogue.test.ts`, `api/test/catalogue-route.test.ts`

**Interfaces:**
- Consumes: `catalogueExtractionSchema`, `CatalogueExtraction`, `ProductCandidate` from `src/ai/schemas.ts`; `generateStructured`, `ChatTransport`, `toDataUri` from `src/ai/client.ts`; `requireSeller`, `TokenVerifier` from `src/lib/auth.ts`; `ApiError` from `src/lib/errors.ts`.
- Produces:
  - `CATALOGUE_JSON_SCHEMA: Record<string, unknown>` and `CATALOGUE_SYSTEM: string` from `src/ai/extract_catalogue.ts`
  - `extractCatalogue(images: {buffer: Buffer; mime: string}[], transport: ChatTransport, model: string): Promise<CatalogueExtraction>`
  - `catalogueRouter(deps: { db: Firestore; verify: TokenVerifier; transport: ChatTransport; model: string }): Router` from `src/routes/catalogue.ts`

- [ ] **Step 1: Install the multipart parser**

```bash
cd api && npm install multer && npm install -D @types/multer
```

- [ ] **Step 2: Write the failing extraction test**

Create `api/test/extract-catalogue.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { extractCatalogue, CATALOGUE_SYSTEM } from '../src/ai/extract_catalogue.js';
import type { ChatTransport } from '../src/ai/client.js';

const img = { buffer: Buffer.from('fake'), mime: 'image/png' };

function transportReturning(payload: unknown): ChatTransport {
  return async () => ({ content: JSON.stringify(payload) });
}

describe('extractCatalogue', () => {
  it('returns candidates the model found', async () => {
    const result = await extractCatalogue(
      [img],
      transportReturning({
        candidates: [
          {
            name: 'Lemon drizzle cake', description: 'Zesty lemon sponge.',
            basePriceMinor: 3200,
            variants: [
              { axis: 'size', label: '8 inch', priceDeltaMinor: 0 },
              { axis: 'size', label: '10 inch', priceDeltaMinor: 1000 },
            ],
            confidence: 0.9, ambiguities: [],
          },
        ],
      }),
      'test-model',
    );
    expect(result.candidates[0]!.name).toBe('Lemon drizzle cake');
    expect(result.candidates[0]!.variants).toHaveLength(2);
  });

  it('keeps a null price and its ambiguity rather than inventing a number', async () => {
    const result = await extractCatalogue(
      [img],
      transportReturning({
        candidates: [
          {
            name: 'Cinnamon buns', description: 'Soft buns.', basePriceMinor: null,
            variants: [{ axis: 'size', label: 'Box of 4', priceDeltaMinor: 0 }],
            confidence: 0.4,
            ambiguities: [
              { field: 'basePriceMinor', kind: 'missing', question: 'What do you charge for a box of 4?' },
            ],
          },
        ],
      }),
      'test-model',
    );
    expect(result.candidates[0]!.basePriceMinor).toBeNull();
    expect(result.candidates[0]!.ambiguities[0]!.kind).toBe('missing');
  });

  it('returns zero candidates for a photo that is not stock', async () => {
    const result = await extractCatalogue([img], transportReturning({ candidates: [] }), 'm');
    expect(result.candidates).toEqual([]);
  });

  it('sends one image part per photo', async () => {
    const transport = vi.fn<ChatTransport>().mockResolvedValue({
      content: JSON.stringify({ candidates: [] }),
    });
    await extractCatalogue([img, img, img], transport, 'm');
    const body = JSON.stringify(transport.mock.calls[0]![0]);
    expect(body.split('image_url').length - 1).toBe(3);
  });

  it('instructs the model never to invent a price', () => {
    expect(CATALOGUE_SYSTEM).toMatch(/never invent/i);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

```bash
cd api && npx vitest run test/extract-catalogue.test.ts
```

Expected: FAIL — cannot resolve `../src/ai/extract_catalogue.js`.

- [ ] **Step 4: Write `api/src/ai/extract_catalogue.ts`**

```ts
import {
  catalogueExtractionSchema,
  type CatalogueExtraction,
} from './schemas.js';
import { generateStructured, toDataUri, type ChatTransport } from './client.js';

export const CATALOGUE_SYSTEM = [
  'You extract product listings for a UK small seller\'s catalogue from photos of their stock.',
  'Prices are GBP, returned as integer pence (a GBP 32.00 cake is 3200).',
  'State only what you can see or read in the image.',
  'If no price is visible for a product, set basePriceMinor to null and add an ambiguity asking the seller for it.',
  'Never invent prices, sizes or flavours. A guess that looks right is worse than a question.',
  'Variants are the choices a buyer makes: size, colour, flavour. priceDeltaMinor is the difference from the base price, and may be negative.',
  'If the photo shows no sellable products at all, return an empty candidates array.',
  'Write descriptions in UK English, under 240 characters, as the seller would.',
].join(' ');

export const CATALOGUE_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['candidates'],
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'description', 'basePriceMinor', 'variants', 'confidence', 'ambiguities'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          basePriceMinor: { type: ['integer', 'null'] },
          variants: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['axis', 'label', 'priceDeltaMinor'],
              properties: {
                axis: { type: 'string', enum: ['size', 'colour', 'flavour', 'other'] },
                label: { type: 'string' },
                priceDeltaMinor: { type: 'integer' },
              },
            },
          },
          confidence: { type: 'number' },
          ambiguities: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['field', 'kind', 'question', 'options', 'blocking'],
              properties: {
                field: { type: 'string' },
                kind: {
                  type: 'string',
                  enum: ['missing', 'unclear', 'unknown_product', 'price_conflict', 'qty_unclear'],
                },
                question: { type: 'string' },
                options: { type: 'array', items: { type: 'string' } },
                blocking: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  },
};

export async function extractCatalogue(
  images: { buffer: Buffer; mime: string }[],
  transport: ChatTransport,
  model: string,
): Promise<CatalogueExtraction> {
  return generateStructured(
    {
      schemaName: 'catalogue_extraction',
      schema: catalogueExtractionSchema,
      jsonSchema: CATALOGUE_JSON_SCHEMA,
      system: CATALOGUE_SYSTEM,
      images: images.map((i) => toDataUri(i.buffer, i.mime)),
      temperature: 0.2,
    },
    transport,
    model,
  );
}
```

- [ ] **Step 5: Run it to verify it passes**

```bash
cd api && npx vitest run test/extract-catalogue.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 6: Write the failing route test**

Create `api/test/catalogue-route.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/env.js';
import type { ChatTransport } from '../src/ai/client.js';

const env = loadEnv({
  NODE_ENV: 'test',
  PAYPAL_CLIENT_ID: 'x', PAYPAL_CLIENT_SECRET: 'x', PAYPAL_WEBHOOK_ID: 'x',
  OPENAI_API_KEY: 'x', OPENAI_VISION_MODEL: 'test-model',
  FIREBASE_PROJECT_ID: 'p', INTERNAL_TOKEN: 't',
});

const transport: ChatTransport = async () => ({
  content: JSON.stringify({
    candidates: [
      {
        name: 'Lemon drizzle cake', description: 'Zesty.', basePriceMinor: 3200,
        variants: [{ axis: 'size', label: '8 inch', priceDeltaMinor: 0 }],
        confidence: 0.9, ambiguities: [],
      },
    ],
  }),
});

const deps = {
  env,
  db: {} as never,
  verify: async (t: string) => {
    if (t === 'good') return { uid: 'seller-a' };
    throw new Error('no');
  },
  transport,
};

const png = Buffer.from('89504e470d0a1a0a', 'hex');

describe('POST /v1/catalogue/extract', () => {
  it('returns candidates for an authenticated seller', async () => {
    const res = await request(createApp(deps))
      .post('/v1/catalogue/extract')
      .set('Authorization', 'Bearer good')
      .attach('images', png, { filename: 'cake.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.candidates[0].name).toBe('Lemon drizzle cake');
    // Extraction must not write; the seller confirms first.
    expect(res.body.candidates[0].tempId).toBeTypeOf('string');
  });

  it('401s without a token', async () => {
    const res = await request(createApp(deps))
      .post('/v1/catalogue/extract')
      .attach('images', png, { filename: 'c.png', contentType: 'image/png' });
    expect(res.status).toBe(401);
  });

  it('400s when no image is attached', async () => {
    const res = await request(createApp(deps))
      .post('/v1/catalogue/extract')
      .set('Authorization', 'Bearer good');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('400s on a sixth image rather than silently dropping it', async () => {
    const req = request(createApp(deps))
      .post('/v1/catalogue/extract')
      .set('Authorization', 'Bearer good');
    for (let i = 0; i < 6; i++) {
      req.attach('images', png, { filename: `c${i}.png`, contentType: 'image/png' });
    }
    const res = await req;
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('400s on a file over 8MB rather than truncating it', async () => {
    const big = Buffer.alloc(9 * 1024 * 1024, 1);
    const res = await request(createApp(deps))
      .post('/v1/catalogue/extract')
      .set('Authorization', 'Bearer good')
      .attach('images', big, { filename: 'huge.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('400s on a non-image masquerading as one', async () => {
    const res = await request(createApp(deps))
      .post('/v1/catalogue/extract')
      .set('Authorization', 'Bearer good')
      .attach('images', Buffer.from('%PDF-1.4'), {
        filename: 'notes.pdf', contentType: 'application/pdf',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('passes an empty candidate list through for a photo of nothing', async () => {
    const empty: ChatTransport = async () => ({ content: JSON.stringify({ candidates: [] }) });
    const res = await request(createApp({ ...deps, transport: empty }))
      .post('/v1/catalogue/extract')
      .set('Authorization', 'Bearer good')
      .attach('images', png, { filename: 'floor.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.candidates).toEqual([]);
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

```bash
cd api && npx vitest run test/catalogue-route.test.ts
```

Expected: FAIL — `createApp` does not accept `transport`, and the route does not exist.

- [ ] **Step 8: Write `api/src/routes/catalogue.ts`**

```ts
import { Router } from 'express';
import multer, { MulterError } from 'multer';
import type { Firestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../lib/errors.js';
import { requireSeller, type TokenVerifier } from '../lib/auth.js';
import type { ChatTransport } from '../ai/client.js';
import { extractCatalogue } from '../ai/extract_catalogue.js';

const MAX_IMAGES = 5;
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: MAX_IMAGES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      cb(new ApiError(400, 'VALIDATION_FAILED', `${file.mimetype} is not an image Sorted can read.`));
      return;
    }
    cb(null, true);
  },
}).array('images', MAX_IMAGES);

export type CatalogueDeps = {
  db: Firestore;
  verify: TokenVerifier;
  transport: ChatTransport;
  model: string;
};

export function catalogueRouter(deps: CatalogueDeps): Router {
  const router = Router();

  router.post(
    '/catalogue/extract',
    requireSeller(deps.verify),
    (req, res, next) => {
      upload(req, res, (err: unknown) => {
        if (err instanceof MulterError) {
          // Multer's own messages are terse; translate the two a seller can hit.
          const message =
            err.code === 'LIMIT_FILE_SIZE'
              ? 'Each photo must be 8MB or smaller.'
              : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
                ? `Send at most ${MAX_IMAGES} photos at a time.`
                : 'That upload could not be read.';
          next(new ApiError(400, 'VALIDATION_FAILED', message));
          return;
        }
        if (err) { next(err); return; }
        next();
      });
    },
    async (req, res, next) => {
      const files = (req.files ?? []) as Express.Multer.File[];
      if (files.length === 0) {
        next(new ApiError(400, 'VALIDATION_FAILED', 'Attach at least one photo.'));
        return;
      }
      try {
        const extraction = await extractCatalogue(
          files.map((f) => ({ buffer: f.buffer, mime: f.mimetype })),
          deps.transport,
          deps.model,
        );
        // tempId lets the app track a candidate across edits before it has a
        // Firestore id. Nothing is written here: the seller confirms first.
        res.json({
          candidates: extraction.candidates.map((c) => ({ ...c, tempId: randomUUID() })),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
```

- [ ] **Step 9: Mount it in `api/src/app.ts`**

Add `transport` to `AppDeps` and mount the router:

```ts
import type { ChatTransport } from './ai/client.js';
import { catalogueRouter } from './routes/catalogue.js';

export type AppDeps = {
  env: Env;
  db: Firestore;
  verify: TokenVerifier;
  transport: ChatTransport;
};
```

and inside `createApp`, after the session router:

```ts
  app.use(
    '/v1',
    catalogueRouter({
      db: deps.db,
      verify: deps.verify,
      transport: deps.transport,
      model: deps.env.OPENAI_VISION_MODEL,
    }),
  );
```

- [ ] **Step 10: Update `api/src/index.ts` and the two existing route tests for the new dep**

In `index.ts`, build the transport and pass it:

```ts
import { makeOpenAiTransport } from './ai/client.js';

createApp({ env, db, verify: adminTokenVerifier(auth), transport: makeOpenAiTransport(env) })
```

In `api/test/health.test.ts` and `api/test/session.test.ts`, add a stub transport to the `deps` object:

```ts
  transport: async () => ({ content: '{}' }),
```

- [ ] **Step 11: Run the whole suite**

```bash
cd api && npm run emulators &   # if not already running
cd api && npm test && npm run typecheck
```

Expected: all suites pass, no type errors.

- [ ] **Step 12: Commit**

```bash
cd /Users/bstar/Documents/development/apps/flutter/sorted
git add api/src api/test api/package.json api/package-lock.json
git commit -m "feat(api): extract product candidates from stock photos

POST /v1/catalogue/extract takes up to five images and returns
candidates for the seller to confirm. It deliberately writes nothing.

A photo with no readable price yields basePriceMinor: null plus an
ambiguity rather than a guess, a photo of nothing yields an empty list,
and oversized, too-many or non-image uploads each give a clean 400
instead of a crash or a silent truncation."
```

---

### Task 4: Saving confirmed products

Covers Review Focus items 4 and 5.

**Files:**
- Create: `api/src/domain/products.ts`
- Modify: `api/src/routes/catalogue.ts`
- Test: `api/test/products.test.ts`

**Interfaces:**
- Consumes: `parseGbp`, `applyDelta`, `assertMinor` from `src/domain/money.ts`; `slugify` from `src/domain/seed.ts`.
- Produces, from `src/domain/products.ts`:
  - `type ProductInput = { name: string; description: string; basePriceMinor: number; depositMinor: number | null; variants: { axis: string; label: string; priceDeltaMinor: number }[] }`
  - `productInputSchema: z.ZodType<ProductInput>`
  - `variantInputSchema`
  - `uniqueSlugs(labels: string[]): string[]`
  - `saveProducts(db: Firestore, sellerId: string, inputs: ProductInput[]): Promise<{ created: string[]; skippedDuplicates: string[] }>`

- [ ] **Step 1: Write the failing test**

Create `api/test/products.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { productInputSchema, saveProducts, uniqueSlugs } from '../src/domain/products.js';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.METADATA_SERVER_DETECTION = 'none';

let db: Firestore;
beforeAll(() => {
  if (getApps().length === 0) initializeApp({ projectId: 'sorted-products-test' });
  db = getFirestore();
});
beforeEach(async () => {
  const s = await db.collection('sellers').listDocuments();
  await Promise.all(s.map((d) => db.recursiveDelete(d)));
});

const cake = {
  name: 'Lemon drizzle cake',
  description: 'Zesty lemon sponge.',
  basePriceMinor: 3200,
  depositMinor: null,
  variants: [
    { axis: 'size', label: '8 inch', priceDeltaMinor: 0 },
    { axis: 'size', label: '10 inch', priceDeltaMinor: 1000 },
  ],
};

describe('uniqueSlugs', () => {
  it('slugifies distinct labels', () => {
    expect(uniqueSlugs(['8 inch', 'Box of 6'])).toEqual(['8-inch', 'box-of-6']);
  });

  it('disambiguates labels that would collide', () => {
    // The model generates these labels, so "Box of 6" and "box of 6" both
    // arriving is realistic. Sharing one id would silently merge two variants
    // and lose a price.
    expect(uniqueSlugs(['Box of 6', 'box of 6', 'BOX OF 6'])).toEqual([
      'box-of-6',
      'box-of-6-2',
      'box-of-6-3',
    ]);
  });

  it('never returns an empty slug', () => {
    expect(uniqueSlugs(['!!!', '???'])).toEqual(['variant-1', 'variant-2']);
  });
});

describe('productInputSchema', () => {
  it('rejects a product with no price, which the UI must resolve first', () => {
    expect(() => productInputSchema.parse({ ...cake, basePriceMinor: null })).toThrow();
  });

  it('rejects a variant delta that would make the price negative', () => {
    expect(() =>
      productInputSchema.parse({
        ...cake,
        basePriceMinor: 500,
        variants: [{ axis: 'size', label: 'tiny', priceDeltaMinor: -600 }],
      }),
    ).toThrow();
  });

  it('accepts a zero price, because a freebie is a real listing', () => {
    expect(() => productInputSchema.parse({ ...cake, basePriceMinor: 0 })).not.toThrow();
  });
});

describe('saveProducts', () => {
  it('writes products and returns their ids', async () => {
    const { created } = await saveProducts(db, 'seller-a', [cake]);
    expect(created).toHaveLength(1);
    const snap = await db.collection('sellers/seller-a/products').get();
    expect(snap.size).toBe(1);
    expect(snap.docs[0]!.data().basePriceMinor).toBe(3200);
    expect(snap.docs[0]!.data().source).toBe('ai_extracted');
  });

  it('gives colliding variant labels distinct ids', async () => {
    await saveProducts(db, 'seller-a', [
      {
        ...cake,
        variants: [
          { axis: 'size', label: 'Box of 6', priceDeltaMinor: 0 },
          { axis: 'size', label: 'box of 6', priceDeltaMinor: 500 },
        ],
      },
    ]);
    const snap = await db.collection('sellers/seller-a/products').get();
    const ids = snap.docs[0]!.data().variants.map((v: { id: string }) => v.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('skips a product whose name already exists rather than duplicating it', async () => {
    // A seller re-snapping a cake they already have, or double-tapping Save.
    await saveProducts(db, 'seller-a', [cake]);
    const second = await saveProducts(db, 'seller-a', [cake]);

    expect(second.created).toHaveLength(0);
    expect(second.skippedDuplicates).toEqual(['Lemon drizzle cake']);
    const snap = await db.collection('sellers/seller-a/products').get();
    expect(snap.size).toBe(1);
  });

  it('matches duplicates case-insensitively and ignoring surrounding space', async () => {
    await saveProducts(db, 'seller-a', [cake]);
    const second = await saveProducts(db, 'seller-a', [
      { ...cake, name: '  LEMON DRIZZLE CAKE ' },
    ]);
    expect(second.created).toHaveLength(0);
  });

  it('does not treat a soft-deleted product as a duplicate', async () => {
    const { created } = await saveProducts(db, 'seller-a', [cake]);
    await db.doc(`sellers/seller-a/products/${created[0]}`).update({ active: false });

    const second = await saveProducts(db, 'seller-a', [cake]);
    expect(second.created).toHaveLength(1);
  });

  it('writes several products in one call', async () => {
    const { created } = await saveProducts(db, 'seller-a', [
      cake,
      { ...cake, name: 'Brownie box', basePriceMinor: 1400 },
    ]);
    expect(created).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd api && npx vitest run test/products.test.ts
```

Expected: FAIL — cannot resolve `../src/domain/products.js`.

- [ ] **Step 3: Write `api/src/domain/products.ts`**

```ts
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { applyDelta } from './money.js';
import { slugify } from './seed.js';

export const variantInputSchema = z.object({
  axis: z.enum(['size', 'colour', 'flavour', 'other']),
  label: z.string().min(1).max(40),
  priceDeltaMinor: z.number().int(),
});

export const productInputSchema = z
  .object({
    name: z.string().min(1).max(60),
    description: z.string().max(240).default(''),
    /** Not nullable here. A candidate may have a null price; a saved product
     *  may not, or a buyer could order a GBP 0 item. The UI resolves it first. */
    basePriceMinor: z.number().int().nonnegative(),
    depositMinor: z.number().int().nonnegative().nullable().default(null),
    variants: z.array(variantInputSchema).max(12).default([]),
  })
  .superRefine((product, ctx) => {
    for (const [i, variant] of product.variants.entries()) {
      try {
        applyDelta(product.basePriceMinor, variant.priceDeltaMinor);
      } catch {
        ctx.addIssue({
          code: 'custom',
          path: ['variants', i, 'priceDeltaMinor'],
          message: `"${variant.label}" would make the price negative`,
        });
      }
    }
  });

export type ProductInput = z.infer<typeof productInputSchema>;

/**
 * Stable slugs that stay distinct.
 *
 * The model generates variant labels, so "Box of 6" and "box of 6" both
 * arriving is realistic. Sharing one id would merge two variants and lose a
 * price, so colliding slugs get a numeric suffix.
 */
export function uniqueSlugs(labels: string[]): string[] {
  const seen = new Map<string, number>();
  return labels.map((label, index) => {
    const base = slugify(label) || `variant-${index + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  });
}

const normalise = (name: string) => name.trim().toLowerCase();

export async function saveProducts(
  db: Firestore,
  sellerId: string,
  inputs: ProductInput[],
): Promise<{ created: string[]; skippedDuplicates: string[] }> {
  const collection = db.collection(`sellers/${sellerId}/products`);

  const existing = await collection.where('active', '==', true).get();
  const taken = new Set(existing.docs.map((d) => normalise(d.data().name as string)));

  const created: string[] = [];
  const skippedDuplicates: string[] = [];
  const batch = db.batch();

  for (const input of inputs) {
    const key = normalise(input.name);
    if (taken.has(key)) {
      skippedDuplicates.push(input.name);
      continue;
    }
    taken.add(key);

    const ref = collection.doc();
    const slugs = uniqueSlugs(input.variants.map((v) => v.label));

    batch.set(ref, {
      id: ref.id,
      name: input.name.trim(),
      description: input.description,
      basePriceMinor: input.basePriceMinor,
      depositMinor: input.depositMinor,
      currency: 'GBP',
      photoUrl: null,
      variants: input.variants.map((v, i) => ({
        id: slugs[i]!,
        axis: v.axis,
        label: v.label,
        priceDeltaMinor: v.priceDeltaMinor,
        active: true,
      })),
      active: true,
      source: 'ai_extracted',
      aiConfidence: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    created.push(ref.id);
  }

  if (created.length > 0) await batch.commit();
  return { created, skippedDuplicates };
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
cd api && npx vitest run test/products.test.ts
```

Expected: PASS, 12 tests. The emulator must be running.

- [ ] **Step 5: Add the three CRUD routes to `api/src/routes/catalogue.ts`**

Add these imports and routes inside `catalogueRouter`, after the extract route:

```ts
import { z } from 'zod';
import { productInputSchema, saveProducts } from '../domain/products.js';

const saveBodySchema = z.object({ products: z.array(productInputSchema).min(1).max(20) });
const patchBodySchema = productInputSchema.partial();
```

```ts
  router.post('/catalogue/products', requireSeller(deps.verify), async (req, res, next) => {
    const parsed = saveBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      next(new ApiError(400, 'VALIDATION_FAILED', 'Those products could not be saved.', parsed.error.format()));
      return;
    }
    try {
      res.json(await saveProducts(deps.db, req.sellerId!, parsed.data.products));
    } catch (err) { next(err); }
  });

  router.patch('/catalogue/products/:productId', requireSeller(deps.verify), async (req, res, next) => {
    const parsed = patchBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      next(new ApiError(400, 'VALIDATION_FAILED', 'That change is not valid.', parsed.error.format()));
      return;
    }
    const ref = deps.db.doc(`sellers/${req.sellerId}/products/${req.params.productId}`);
    try {
      const snap = await ref.get();
      if (!snap.exists) { next(new ApiError(404, 'NOT_FOUND', 'No such product.')); return; }
      await ref.update({ ...parsed.data, updatedAt: FieldValue.serverTimestamp() });
      res.json({ product: (await ref.get()).data() });
    } catch (err) { next(err); }
  });

  router.delete('/catalogue/products/:productId', requireSeller(deps.verify), async (req, res, next) => {
    const ref = deps.db.doc(`sellers/${req.sellerId}/products/${req.params.productId}`);
    try {
      const snap = await ref.get();
      if (!snap.exists) { next(new ApiError(404, 'NOT_FOUND', 'No such product.')); return; }
      // Soft delete: week 3 orders reference products by id, and a hard delete
      // would orphan a line item on an order already sent to a buyer.
      await ref.update({ active: false, updatedAt: FieldValue.serverTimestamp() });
      res.json({ ok: true });
    } catch (err) { next(err); }
  });
```

Add `import { FieldValue } from 'firebase-admin/firestore';` at the top.

- [ ] **Step 6: Write the failing route test for save, patch and delete**

The three routes are production code and need their own tests. Create
`api/test/products-route.test.ts`:

```ts
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
  PAYPAL_CLIENT_ID: 'x', PAYPAL_CLIENT_SECRET: 'x', PAYPAL_WEBHOOK_ID: 'x',
  OPENAI_API_KEY: 'x', OPENAI_VISION_MODEL: 'test-model',
  FIREBASE_PROJECT_ID: 'sorted-products-route-test', INTERNAL_TOKEN: 't',
});

let db: Firestore;
beforeAll(() => {
  if (getApps().length === 0) {
    initializeApp({ projectId: 'sorted-products-route-test' });
  }
  db = getFirestore();
});
beforeEach(async () => {
  const s = await db.collection('sellers').listDocuments();
  await Promise.all(s.map((d) => db.recursiveDelete(d)));
});

function app() {
  return createApp({
    env,
    db,
    verify: async (t: string) => {
      if (t === 'good') return { uid: 'seller-a' };
      throw new Error('no');
    },
    transport: async () => ({ content: '{}' }),
  });
}

const body = {
  products: [
    {
      name: 'Lemon drizzle cake', description: 'Zesty.',
      basePriceMinor: 3200, depositMinor: null,
      variants: [{ axis: 'size', label: '8 inch', priceDeltaMinor: 0 }],
    },
  ],
};

async function create() {
  const res = await request(app())
    .post('/v1/catalogue/products')
    .set('Authorization', 'Bearer good')
    .send(body);
  return res.body.created[0] as string;
}

describe('POST /v1/catalogue/products', () => {
  it('creates a product and returns its id', async () => {
    const res = await request(app())
      .post('/v1/catalogue/products')
      .set('Authorization', 'Bearer good')
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body.created).toHaveLength(1);
    expect(res.body.skippedDuplicates).toEqual([]);
  });

  it('401s without a token', async () => {
    const res = await request(app()).post('/v1/catalogue/products').send(body);
    expect(res.status).toBe(401);
  });

  it('400s on a product with a null price', async () => {
    const res = await request(app())
      .post('/v1/catalogue/products')
      .set('Authorization', 'Bearer good')
      .send({ products: [{ ...body.products[0], basePriceMinor: null }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('400s on an empty products array', async () => {
    const res = await request(app())
      .post('/v1/catalogue/products')
      .set('Authorization', 'Bearer good')
      .send({ products: [] });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /v1/catalogue/products/:productId', () => {
  it('updates a field and returns the product', async () => {
    const id = await create();
    const res = await request(app())
      .patch(`/v1/catalogue/products/${id}`)
      .set('Authorization', 'Bearer good')
      .send({ basePriceMinor: 3500 });
    expect(res.status).toBe(200);
    expect(res.body.product.basePriceMinor).toBe(3500);
  });

  it('404s for a product that does not exist', async () => {
    const res = await request(app())
      .patch('/v1/catalogue/products/nope')
      .set('Authorization', 'Bearer good')
      .send({ basePriceMinor: 100 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('400s on a change that would make a variant price negative', async () => {
    const id = await create();
    const res = await request(app())
      .patch(`/v1/catalogue/products/${id}`)
      .set('Authorization', 'Bearer good')
      .send({
        basePriceMinor: 100,
        variants: [{ axis: 'size', label: 'big', priceDeltaMinor: -500 }],
      });
    expect(res.status).toBe(400);
  });

  it('401s without a token', async () => {
    const id = await create();
    const res = await request(app())
      .patch(`/v1/catalogue/products/${id}`)
      .send({ basePriceMinor: 1 });
    expect(res.status).toBe(401);
  });
});

describe('DELETE /v1/catalogue/products/:productId', () => {
  it('soft deletes rather than removing the document', async () => {
    // Week 3 orders reference products by id. A hard delete would orphan a
    // line item on an order already sent to a buyer.
    const id = await create();
    const res = await request(app())
      .delete(`/v1/catalogue/products/${id}`)
      .set('Authorization', 'Bearer good');

    expect(res.status).toBe(200);
    const doc = await db.doc(`sellers/seller-a/products/${id}`).get();
    expect(doc.exists).toBe(true);
    expect(doc.data()!.active).toBe(false);
  });

  it('404s for a product that does not exist', async () => {
    const res = await request(app())
      .delete('/v1/catalogue/products/nope')
      .set('Authorization', 'Bearer good');
    expect(res.status).toBe(404);
  });

  it('401s without a token', async () => {
    const id = await create();
    const res = await request(app()).delete(`/v1/catalogue/products/${id}`);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 7: Run it and fix what it catches**

```bash
cd api && npx vitest run test/products-route.test.ts
```

Expected: PASS, 11 tests. If the negative-variant PATCH test fails with a 200,
`patchBodySchema` is `productInputSchema.partial()`, and `.partial()` on a
schema with a `.superRefine` drops the refinement. Replace it with a schema
that re-runs the check:

```ts
const patchBodySchema = z
  .object({
    name: z.string().min(1).max(60).optional(),
    description: z.string().max(240).optional(),
    basePriceMinor: z.number().int().nonnegative().optional(),
    depositMinor: z.number().int().nonnegative().nullable().optional(),
    variants: z.array(variantInputSchema).max(12).optional(),
  })
  .superRefine((patch, ctx) => {
    if (patch.basePriceMinor === undefined || patch.variants === undefined) return;
    for (const [i, variant] of patch.variants.entries()) {
      try {
        applyDelta(patch.basePriceMinor, variant.priceDeltaMinor);
      } catch {
        ctx.addIssue({
          code: 'custom',
          path: ['variants', i, 'priceDeltaMinor'],
          message: `"${variant.label}" would make the price negative`,
        });
      }
    }
  });
```

This needs `variantInputSchema` and `applyDelta` exported from
`src/domain/products.ts`; add `variantInputSchema` to its exports.

- [ ] **Step 8: Run the whole suite and typecheck**

```bash
cd api && npm test && npm run typecheck
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
cd /Users/bstar/Documents/development/apps/flutter/sorted
git add api/src api/test
git commit -m "feat(api): save confirmed products, with duplicate and slug guards

Colliding variant labels get distinct ids, since the model generates
them and \"Box of 6\" / \"box of 6\" both arriving is realistic; sharing
one id would merge two variants and lose a price.

Re-saving a product whose name already exists is skipped rather than
duplicated, because a duplicated catalogue makes week 3's DM matching
ambiguous. Deletes are soft, so an order already sent to a buyer cannot
be orphaned."
```

---

### Task 5: Flutter models

**Files:**
- Create: `app/lib/models/variant.dart`, `app/lib/models/product.dart`, `app/lib/models/ambiguity.dart`, `app/lib/models/product_candidate.dart`
- Test: `app/test/models_test.dart`

**Interfaces:**
- Consumes: nothing.
- Produces: `Variant`, `Product`, `Ambiguity`, `ProductCandidate` — all freezed classes with `fromJson`/`toJson`. `Product` additionally exposes `int get fromPriceMinor` (the cheapest variant's effective price) and `bool get hasVariants`.

- [ ] **Step 1: Write the failing test**

Create `app/test/models_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:sorted/models/product.dart';
import 'package:sorted/models/variant.dart';

Product cake({List<Variant>? variants, int base = 3200, int? deposit}) => Product(
      id: 'p1',
      name: 'Lemon drizzle cake',
      description: 'Zesty.',
      basePriceMinor: base,
      depositMinor: deposit,
      currency: 'GBP',
      photoUrl: null,
      variants: variants ??
          const [
            Variant(id: '8-inch', axis: 'size', label: '8 inch', priceDeltaMinor: 0),
            Variant(id: '10-inch', axis: 'size', label: '10 inch', priceDeltaMinor: 1000),
          ],
      active: true,
      source: 'ai_extracted',
    );

void main() {
  group('Product', () {
    test('round-trips through JSON', () {
      final p = cake();
      expect(Product.fromJson(p.toJson()), p);
    });

    test('fromPriceMinor is the cheapest variant, which is what the list shows', () {
      // Catalogue.dc.html renders "from £32" for the lemon drizzle.
      expect(cake().fromPriceMinor, 3200);
    });

    test('fromPriceMinor accounts for a negative delta', () {
      final p = cake(variants: const [
        Variant(id: '6-inch', axis: 'size', label: '6 inch', priceDeltaMinor: -800),
        Variant(id: '8-inch', axis: 'size', label: '8 inch', priceDeltaMinor: 0),
      ]);
      expect(p.fromPriceMinor, 2400);
    });

    test('fromPriceMinor falls back to the base price with no variants', () {
      expect(cake(variants: const []).fromPriceMinor, 3200);
    });

    test('ignores inactive variants when pricing', () {
      final p = cake(variants: const [
        Variant(id: 'a', axis: 'size', label: 'cheap', priceDeltaMinor: -1000, active: false),
        Variant(id: 'b', axis: 'size', label: 'normal', priceDeltaMinor: 0),
      ]);
      expect(p.fromPriceMinor, 3200);
    });

    test('hasVariants is false for a single-variant product', () {
      // Catalogue.dc.html shows "Red velvet cake · 8 inch · £36", an exact
      // price rather than "from", when there is nothing to choose between.
      final p = cake(variants: const [
        Variant(id: '8-inch', axis: 'size', label: '8 inch', priceDeltaMinor: 0),
      ]);
      expect(p.hasVariants, isFalse);
    });

    test('hasVariants is true with a real choice', () {
      expect(cake().hasVariants, isTrue);
    });

    test('keeps a product-level deposit', () {
      expect(cake(deposit: 2000).depositMinor, 2000);
    });

    test('tolerates a missing depositMinor in stored JSON', () {
      final json = cake().toJson()..remove('depositMinor');
      expect(Product.fromJson(json).depositMinor, isNull);
    });
  });
}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd app && flutter test test/models_test.dart
```

Expected: FAIL — `package:sorted/models/product.dart` does not exist.

- [ ] **Step 3: Write `app/lib/models/variant.dart`**

```dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'variant.freezed.dart';
part 'variant.g.dart';

@freezed
abstract class Variant with _$Variant {
  const factory Variant({
    required String id,
    required String axis,
    required String label,
    required int priceDeltaMinor,
    @Default(true) bool active,
  }) = _Variant;

  factory Variant.fromJson(Map<String, dynamic> json) => _$VariantFromJson(json);
}
```

- [ ] **Step 4: Write `app/lib/models/product.dart`**

```dart
import 'package:freezed_annotation/freezed_annotation.dart';

import 'variant.dart';

part 'product.freezed.dart';
part 'product.g.dart';

@freezed
abstract class Product with _$Product {
  const Product._();

  const factory Product({
    required String id,
    required String name,
    @Default('') String description,
    required int basePriceMinor,
    int? depositMinor,
    @Default('GBP') String currency,
    String? photoUrl,
    @Default(<Variant>[]) List<Variant> variants,
    @Default(true) bool active,
    @Default('manual') String source,
  }) = _Product;

  factory Product.fromJson(Map<String, dynamic> json) => _$ProductFromJson(json);

  List<Variant> get _live => variants.where((v) => v.active).toList();

  /// The cheapest price a buyer could pay. Catalogue.dc.html shows this as
  /// "from £32" when there is a choice, and as an exact price when there is not.
  int get fromPriceMinor {
    if (_live.isEmpty) return basePriceMinor;
    final deltas = _live.map((v) => v.priceDeltaMinor).reduce((a, b) => a < b ? a : b);
    final lowest = basePriceMinor + deltas;
    return lowest < 0 ? 0 : lowest;
  }

  /// True only when the buyer has something to choose between.
  bool get hasVariants => _live.length > 1;
}
```

- [ ] **Step 5: Write `app/lib/models/ambiguity.dart` and `app/lib/models/product_candidate.dart`**

```dart
// app/lib/models/ambiguity.dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'ambiguity.freezed.dart';
part 'ambiguity.g.dart';

@freezed
abstract class Ambiguity with _$Ambiguity {
  const factory Ambiguity({
    required String field,
    required String kind,
    required String question,
    @Default(<String>[]) List<String> options,
    @Default(true) bool blocking,
  }) = _Ambiguity;

  factory Ambiguity.fromJson(Map<String, dynamic> json) => _$AmbiguityFromJson(json);
}
```

```dart
// app/lib/models/product_candidate.dart
import 'package:freezed_annotation/freezed_annotation.dart';

import 'ambiguity.dart';
import 'variant.dart';

part 'product_candidate.freezed.dart';
part 'product_candidate.g.dart';

@freezed
abstract class ProductCandidate with _$ProductCandidate {
  const ProductCandidate._();

  const factory ProductCandidate({
    required String tempId,
    required String name,
    @Default('') String description,
    /// Null when no price was readable. Review.dc.html shows this as
    /// "Couldn't read a price. Add one to save."
    int? basePriceMinor,
    @Default(<Variant>[]) List<Variant> variants,
    @Default(0.0) double confidence,
    @Default(<Ambiguity>[]) List<Ambiguity> ambiguities,
  }) = _ProductCandidate;

  factory ProductCandidate.fromJson(Map<String, dynamic> json) =>
      _$ProductCandidateFromJson(json);

  /// A candidate cannot be saved until it has a price.
  bool get needsPrice => basePriceMinor == null;
}
```

- [ ] **Step 6: Generate the freezed code**

```bash
cd app && dart run build_runner build --delete-conflicting-outputs
```

Expected: eight generated files (`*.freezed.dart`, `*.g.dart`) and no errors.

- [ ] **Step 7: Run the test to verify it passes**

```bash
cd app && flutter test test/models_test.dart && flutter analyze
```

Expected: PASS, 9 tests, `No issues found!`.

- [ ] **Step 8: Commit**

```bash
cd /Users/bstar/Documents/development/apps/flutter/sorted
git add app
git commit -m "feat(app): add catalogue models

Product exposes fromPriceMinor and hasVariants so the list can render
'from £32' when there is a choice and an exact price when there is not,
matching Catalogue.dc.html. Inactive variants are excluded from pricing.
ProductCandidate.needsPrice drives the Review screen's save guard."
```

---

### Task 6: API client, repository and providers

**Files:**
- Create: `app/lib/core/api_client.dart`, `app/lib/data/firestore_refs.dart`, `app/lib/data/catalogue_repository.dart`, `app/lib/providers/catalogue_providers.dart`
- Test: `app/test/catalogue_repository_test.dart`

**Interfaces:**
- Consumes: `Product`, `ProductCandidate` from `models/`.
- Produces:
  - `ApiClient` with `Future<Map<String, dynamic>> postJson(String path, Object body)` and `Future<Map<String, dynamic>> postImages(String path, List<({List<int> bytes, String filename})> files)`
  - `productsRef(String sellerId)` from `data/firestore_refs.dart`
  - `CatalogueRepository` with `Stream<List<Product>> watchProducts(String sellerId)`, `Future<List<ProductCandidate>> extract(List<...> files)`, `Future<({List<String> created, List<String> skippedDuplicates})> save(List<ProductCandidate>)`
  - `sellerIdProvider` relocated to `providers/seller_provider.dart`
  - `apiClientProvider`, `catalogueRepositoryProvider`, `productsProvider` (a `StreamProvider<List<Product>>`), `extractionControllerProvider`

- [ ] **Step 1: Write `app/lib/core/api_client.dart`**

```dart
import 'package:dio/dio.dart';
import 'package:firebase_auth/firebase_auth.dart';

/// Every write goes through the API; the app never writes Firestore directly.
/// Attaches the current anonymous user's ID token to each request.
class ApiClient {
  ApiClient({required String baseUrl, FirebaseAuth? auth, Dio? dio})
      : _auth = auth ?? FirebaseAuth.instance,
        _dio = dio ?? Dio(BaseOptions(baseUrl: baseUrl));

  final FirebaseAuth _auth;
  final Dio _dio;

  Future<Options> _authed() async {
    final token = await _auth.currentUser?.getIdToken();
    return Options(headers: {if (token != null) 'Authorization': 'Bearer $token'});
  }

  Future<Map<String, dynamic>> postJson(String path, Object body) async {
    final res = await _dio.post<Map<String, dynamic>>(
      path,
      data: body,
      options: await _authed(),
    );
    return res.data ?? <String, dynamic>{};
  }

  Future<Map<String, dynamic>> postImages(
    String path,
    List<({List<int> bytes, String filename})> files,
  ) async {
    final form = FormData();
    for (final f in files) {
      form.files.add(
        MapEntry('images', MultipartFile.fromBytes(f.bytes, filename: f.filename)),
      );
    }
    final res = await _dio.post<Map<String, dynamic>>(
      path,
      data: form,
      options: await _authed(),
    );
    return res.data ?? <String, dynamic>{};
  }
}
```

- [ ] **Step 2: Write `app/lib/data/firestore_refs.dart`**

```dart
import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/product.dart';

/// Typed, read-only access. Writes are denied by the security rules and go
/// through the API instead.
CollectionReference<Product> productsRef(String sellerId) => FirebaseFirestore
    .instance
    .collection('sellers/$sellerId/products')
    .withConverter<Product>(
      fromFirestore: (snap, _) => Product.fromJson({...snap.data()!, 'id': snap.id}),
      toFirestore: (_, __) =>
          throw UnsupportedError('Clients never write products; use the API.'),
    );
```

- [ ] **Step 3: Write the failing repository test**

Create `app/test/catalogue_repository_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:sorted/data/catalogue_repository.dart';
import 'package:sorted/models/ambiguity.dart';
import 'package:sorted/models/product_candidate.dart';
import 'package:sorted/models/variant.dart';

class _FakeApi implements CatalogueApi {
  Object? lastBody;
  Map<String, dynamic> extractResponse = {'candidates': []};
  Map<String, dynamic> saveResponse = {'created': <String>[], 'skippedDuplicates': <String>[]};

  @override
  Future<Map<String, dynamic>> extract(List<({List<int> bytes, String filename})> f) async =>
      extractResponse;

  @override
  Future<Map<String, dynamic>> saveProducts(Object body) async {
    lastBody = body;
    return saveResponse;
  }
}

void main() {
  late _FakeApi api;
  late CatalogueRepository repo;

  setUp(() {
    api = _FakeApi();
    repo = CatalogueRepository(api: api);
  });

  test('parses candidates from the extract response', () async {
    api.extractResponse = {
      'candidates': [
        {
          'tempId': 't1', 'name': 'Lemon drizzle cake', 'description': 'Zesty.',
          'basePriceMinor': 3200,
          'variants': [
            {'id': '8-inch', 'axis': 'size', 'label': '8 inch', 'priceDeltaMinor': 0},
          ],
          'confidence': 0.9, 'ambiguities': <Map<String, dynamic>>[],
        },
      ],
    };
    final out = await repo.extract([]);
    expect(out.single.name, 'Lemon drizzle cake');
    expect(out.single.needsPrice, isFalse);
  });

  test('a candidate with a null price reports needsPrice', () async {
    api.extractResponse = {
      'candidates': [
        {
          'tempId': 't2', 'name': 'Cinnamon buns', 'description': '',
          'basePriceMinor': null, 'variants': <Map<String, dynamic>>[],
          'confidence': 0.4,
          'ambiguities': [
            {'field': 'basePriceMinor', 'kind': 'missing', 'question': 'Price?'},
          ],
        },
      ],
    };
    final out = await repo.extract([]);
    expect(out.single.needsPrice, isTrue);
    expect(out.single.ambiguities.single.question, 'Price?');
  });

  test('refuses to save a candidate that still has no price', () async {
    final candidate = ProductCandidate(tempId: 't', name: 'Buns', basePriceMinor: null);
    expect(() => repo.save([candidate]), throwsA(isA<ArgumentError>()));
  });

  test('sends only the fields the API accepts', () async {
    await repo.save([
      const ProductCandidate(
        tempId: 't', name: 'Buns', description: 'Soft.', basePriceMinor: 1200,
        variants: [Variant(id: 'box-of-4', axis: 'size', label: 'Box of 4', priceDeltaMinor: 0)],
        confidence: 0.9, ambiguities: <Ambiguity>[],
      ),
    ]);
    final body = api.lastBody! as Map<String, dynamic>;
    final product = (body['products'] as List).single as Map<String, dynamic>;
    expect(product.keys, containsAll(['name', 'basePriceMinor', 'variants']));
    // tempId, confidence and ambiguities are app-side only.
    expect(product.containsKey('tempId'), isFalse);
    expect(product.containsKey('confidence'), isFalse);
    expect(product.containsKey('ambiguities'), isFalse);
  });

  test('reports duplicates the API skipped', () async {
    api.saveResponse = {'created': <String>[], 'skippedDuplicates': ['Buns']};
    final result = await repo.save([
      const ProductCandidate(tempId: 't', name: 'Buns', basePriceMinor: 1200),
    ]);
    expect(result.skippedDuplicates, ['Buns']);
  });
}
```

- [ ] **Step 4: Run it to verify it fails**

```bash
cd app && flutter test test/catalogue_repository_test.dart
```

Expected: FAIL — `catalogue_repository.dart` does not exist.

- [ ] **Step 5: Write `app/lib/data/catalogue_repository.dart`**

```dart
import 'package:cloud_firestore/cloud_firestore.dart';

import '../core/api_client.dart';
import '../models/product.dart';
import '../models/product_candidate.dart';
import 'firestore_refs.dart';

/// The API surface the repository needs, named so tests can fake it without
/// a Dio instance or a live token.
abstract class CatalogueApi {
  Future<Map<String, dynamic>> extract(List<({List<int> bytes, String filename})> files);
  Future<Map<String, dynamic>> saveProducts(Object body);
}

class HttpCatalogueApi implements CatalogueApi {
  HttpCatalogueApi(this._client);
  final ApiClient _client;

  @override
  Future<Map<String, dynamic>> extract(List<({List<int> bytes, String filename})> files) =>
      _client.postImages('/v1/catalogue/extract', files);

  @override
  Future<Map<String, dynamic>> saveProducts(Object body) =>
      _client.postJson('/v1/catalogue/products', body);
}

class CatalogueRepository {
  CatalogueRepository({required CatalogueApi api}) : _api = api;
  final CatalogueApi _api;

  /// Reads come straight from Firestore so the list updates live.
  Stream<List<Product>> watchProducts(String sellerId) => productsRef(sellerId)
      .where('active', isEqualTo: true)
      .orderBy('name')
      .snapshots()
      .map((snap) => snap.docs.map((d) => d.data()).toList());

  Future<List<ProductCandidate>> extract(
    List<({List<int> bytes, String filename})> files,
  ) async {
    final json = await _api.extract(files);
    return (json['candidates'] as List<dynamic>)
        .map((c) => ProductCandidate.fromJson(c as Map<String, dynamic>))
        .toList();
  }

  Future<({List<String> created, List<String> skippedDuplicates})> save(
    List<ProductCandidate> candidates,
  ) async {
    for (final c in candidates) {
      if (c.needsPrice) {
        throw ArgumentError('"${c.name}" has no price yet and cannot be saved.');
      }
    }

    final json = await _api.saveProducts({
      'products': [
        for (final c in candidates)
          {
            'name': c.name,
            'description': c.description,
            'basePriceMinor': c.basePriceMinor,
            'depositMinor': null,
            'variants': [
              for (final v in c.variants)
                {'axis': v.axis, 'label': v.label, 'priceDeltaMinor': v.priceDeltaMinor},
            ],
          },
      ],
    });

    return (
      created: (json['created'] as List<dynamic>).cast<String>(),
      skippedDuplicates: (json['skippedDuplicates'] as List<dynamic>? ?? []).cast<String>(),
    );
  }
}
```

- [ ] **Step 6: Write `app/lib/providers/catalogue_providers.dart`**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api_client.dart';
import '../core/env.dart';
import '../data/catalogue_repository.dart';
import '../models/product.dart';
import '../models/product_candidate.dart';
import 'seller_provider.dart';

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient(baseUrl: apiBaseUrl));

final catalogueRepositoryProvider = Provider<CatalogueRepository>(
  (ref) => CatalogueRepository(api: HttpCatalogueApi(ref.watch(apiClientProvider))),
);

/// The live product list. A Firestore listener, so a product saved through the
/// API appears here without the app asking again.
final productsProvider = StreamProvider<List<Product>>((ref) {
  final sellerId = ref.watch(sellerIdProvider).valueOrNull;
  if (sellerId == null) return const Stream<List<Product>>.empty();
  return ref.watch(catalogueRepositoryProvider).watchProducts(sellerId);
});

/// Candidates awaiting the seller's confirmation. Null until a snap happens.
class ExtractionController extends Notifier<List<ProductCandidate>?> {
  @override
  List<ProductCandidate>? build() => null;

  Future<void> extract(List<({List<int> bytes, String filename})> files) async {
    state = null;
    state = await ref.read(catalogueRepositoryProvider).extract(files);
  }

  void setPrice(String tempId, int priceMinor) {
    state = [
      for (final c in state ?? <ProductCandidate>[])
        if (c.tempId == tempId) c.copyWith(basePriceMinor: priceMinor) else c,
    ];
  }

  void discard(String tempId) {
    state = [for (final c in state ?? <ProductCandidate>[]) if (c.tempId != tempId) c];
  }

  void clear() => state = null;
}

final extractionControllerProvider =
    NotifierProvider<ExtractionController, List<ProductCandidate>?>(
  ExtractionController.new,
);
```

- [ ] **Step 7: Move `sellerIdProvider` out of `main.dart`**

Plan 1 put it in `main.dart`. Leaving it there would make this import cycle:
`main.dart` → `router.dart` → screens → `catalogue_providers.dart` → `main.dart`.

Create `app/lib/providers/seller_provider.dart` with the provider moved verbatim:

```dart
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Signs the seller in anonymously, which is what "instant demo seller, no
/// login" means in practice: a judge opens the hosted build and is already a
/// seller, with their own uid scoping their data away from every other judge.
final sellerIdProvider = FutureProvider<String>((ref) async {
  final auth = FirebaseAuth.instance;
  final existing = auth.currentUser;
  if (existing != null) return existing.uid;
  final credential = await auth.signInAnonymously();
  return credential.user!.uid;
});
```

Delete the provider and its now-unused `firebase_auth` import from `main.dart`.

- [ ] **Step 8: Write `app/lib/core/env.dart`**

```dart
/// Set at build time:
///   flutter run --dart-define=API_BASE_URL=http://localhost:3000
/// The default is the deployed service, so a judge opening the hosted build
/// needs no flags.
const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://sorted-api-a4zo.onrender.com',
);
```

- [ ] **Step 9: Run the tests and analyse**

```bash
cd app && flutter test && flutter analyze
```

Expected: all pass, `No issues found!`.

- [ ] **Step 10: Commit**

```bash
cd /Users/bstar/Documents/development/apps/flutter/sorted
git add app
git commit -m "feat(app): catalogue repository, API client and providers

Reads stream from Firestore so a product saved through the API appears
without the app asking again; writes go through the API with the
anonymous user's ID token attached. The repository refuses to save a
candidate that still has no price, so the Review screen's guard cannot
be bypassed by a caller."
```

---

### Task 7: App shell — router, bottom nav and the shared widgets

**Files:**
- Create: `app/lib/router.dart`, `app/lib/widgets/primary_button.dart`, `app/lib/widgets/selectable_chip.dart`, `app/lib/widgets/warning_card.dart`, `app/lib/widgets/product_tile.dart`, `app/lib/widgets/sorted_scaffold.dart`
- Modify: `app/lib/main.dart`
- Test: `app/test/widgets_test.dart`

**Interfaces:**
- Consumes: `SortedColors`, `SortedShape` from `core/theme/`.
- Produces: `PrimaryButton`, `SelectableChip`, `WarningCard`, `ProductTile`, `SortedScaffold`, and `appRouter` (a `GoRouter`) with routes `/`, `/catalogue`, `/catalogue/snap`, `/catalogue/review`.

- [ ] **Step 1: Write the failing widget test**

Create `app/test/widgets_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sorted/core/theme/sorted_colors.dart';
import 'package:sorted/core/theme/sorted_shape.dart';
import 'package:sorted/core/theme/sorted_theme.dart';
import 'package:sorted/models/product.dart';
import 'package:sorted/models/variant.dart';
import 'package:sorted/widgets/primary_button.dart';
import 'package:sorted/widgets/product_tile.dart';
import 'package:sorted/widgets/warning_card.dart';

Widget host(Widget child) =>
    MaterialApp(theme: sortedTheme(), home: Scaffold(body: child));

void main() {
  testWidgets('PrimaryButton is at least the design height', (tester) async {
    await tester.pumpWidget(host(PrimaryButton(label: 'Save', onPressed: () {})));
    final size = tester.getSize(find.byType(FilledButton));
    expect(size.height, greaterThanOrEqualTo(SortedShape.primaryButtonHeight));
  });

  testWidgets('PrimaryButton disabled when onPressed is null', (tester) async {
    await tester.pumpWidget(host(const PrimaryButton(label: 'Save', onPressed: null)));
    expect(tester.widget<FilledButton>(find.byType(FilledButton)).enabled, isFalse);
  });

  testWidgets('WarningCard uses the warning tokens, not arbitrary colours', (tester) async {
    await tester.pumpWidget(host(const WarningCard(message: "Couldn't read a price.")));
    final box = tester.widget<Container>(find.byType(Container).first);
    final decoration = box.decoration! as BoxDecoration;
    expect(decoration.color, SortedColors.light.warningTint);
    expect(find.text("Couldn't read a price."), findsOneWidget);
  });

  testWidgets('ProductTile shows "from" only when there is a choice', (tester) async {
    const twoSizes = Product(
      id: 'p1', name: 'Lemon drizzle cake', basePriceMinor: 3200,
      variants: [
        Variant(id: 'a', axis: 'size', label: '8 inch', priceDeltaMinor: 0),
        Variant(id: 'b', axis: 'size', label: '10 inch', priceDeltaMinor: 1000),
      ],
    );
    await tester.pumpWidget(host(const ProductTile(product: twoSizes)));
    expect(find.text('from £32.00'), findsOneWidget);
    expect(find.textContaining('8 inch'), findsOneWidget);
  });

  testWidgets('ProductTile shows an exact price for a single variant', (tester) async {
    const oneSize = Product(
      id: 'p2', name: 'Red velvet cake', basePriceMinor: 3600,
      variants: [Variant(id: 'a', axis: 'size', label: '8 inch', priceDeltaMinor: 0)],
    );
    await tester.pumpWidget(host(const ProductTile(product: oneSize)));
    expect(find.text('£36.00'), findsOneWidget);
    expect(find.text('from £36.00'), findsNothing);
  });

  testWidgets('ProductTile surfaces a deposit', (tester) async {
    const withDeposit = Product(
      id: 'p3', name: 'Custom celebration cake', basePriceMinor: 5500, depositMinor: 2000,
    );
    await tester.pumpWidget(host(const ProductTile(product: withDeposit)));
    expect(find.textContaining('£20.00 deposit'), findsOneWidget);
  });
}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd app && flutter test test/widgets_test.dart
```

Expected: FAIL — the widget files do not exist.

- [ ] **Step 3: Write a Dart money formatter the widgets share**

Create `app/lib/core/money.dart`. The backend owns arithmetic; the app only formats.

```dart
/// Formats integer pence as the design writes it: £1,234.56.
/// Arithmetic belongs to the backend; this only renders.
String formatGbp(int minor) {
  final negative = minor < 0;
  final abs = minor.abs();
  final pounds = (abs ~/ 100).toString();
  final pence = (abs % 100).toString().padLeft(2, '0');
  final grouped = pounds.replaceAllMapped(
    RegExp(r'\B(?=(\d{3})+(?!\d))'),
    (_) => ',',
  );
  return '${negative ? '-' : ''}£$grouped.$pence';
}
```

- [ ] **Step 4: Write the four widgets**

```dart
// app/lib/widgets/primary_button.dart
import 'package:flutter/material.dart';

import '../core/theme/sorted_shape.dart';

class PrimaryButton extends StatelessWidget {
  const PrimaryButton({super.key, required this.label, required this.onPressed, this.icon});

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: SortedShape.primaryButtonHeight,
      child: FilledButton(
        onPressed: onPressed,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (icon != null) ...[Icon(icon, size: SortedShape.iconSize), const SizedBox(width: 8)],
            Text(label),
          ],
        ),
      ),
    );
  }
}
```

```dart
// app/lib/widgets/selectable_chip.dart
import 'package:flutter/material.dart';

import '../core/theme/sorted_colors.dart';
import '../core/theme/sorted_shape.dart';

class SelectableChip extends StatelessWidget {
  const SelectableChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = SortedColors.of(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(SortedShape.pillRadius),
      child: Container(
        height: SortedShape.selectableChipHeight,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? c.ink : c.surface,
          border: Border.all(color: selected ? c.ink : c.line),
          borderRadius: BorderRadius.circular(SortedShape.pillRadius),
        ),
        child: Text(
          label,
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
                color: selected ? Colors.white : c.ink,
              ),
        ),
      ),
    );
  }
}
```

```dart
// app/lib/widgets/warning_card.dart
import 'package:flutter/material.dart';

import '../core/theme/sorted_colors.dart';
import '../core/theme/sorted_shape.dart';

/// Used wherever the AI needs the seller to decide something.
class WarningCard extends StatelessWidget {
  const WarningCard({super.key, required this.message, this.child});

  final String message;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    final c = SortedColors.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: c.warningTint,
        border: Border.all(color: c.warningBorder),
        borderRadius: BorderRadius.circular(SortedShape.cardRadius),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.error_outline, size: SortedShape.iconSize, color: c.warningText),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  message,
                  style: Theme.of(context)
                      .textTheme
                      .bodyMedium
                      ?.copyWith(color: c.warningText),
                ),
              ),
            ],
          ),
          if (child != null) ...[const SizedBox(height: 12), child!],
        ],
      ),
    );
  }
}
```

```dart
// app/lib/widgets/product_tile.dart
import 'package:flutter/material.dart';

import '../core/money.dart';
import '../core/theme/sorted_colors.dart';
import '../core/theme/sorted_shape.dart';
import '../models/product.dart';

class ProductTile extends StatelessWidget {
  const ProductTile({super.key, required this.product, this.onTap});

  final Product product;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = SortedColors.of(context);
    final text = Theme.of(context).textTheme;

    final labels = product.variants.where((v) => v.active).map((v) => v.label).join(', ');
    final price = product.hasVariants
        ? 'from ${formatGbp(product.fromPriceMinor)}'
        : formatGbp(product.fromPriceMinor);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(SortedShape.cardRadius),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: c.primaryTint,
                borderRadius: BorderRadius.circular(SortedShape.productTileRadius),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(product.name, style: text.labelLarge?.copyWith(color: c.ink)),
                  if (labels.isNotEmpty)
                    Text(labels, style: text.bodySmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                  if (product.depositMinor != null)
                    Text(
                      '${formatGbp(product.depositMinor!)} deposit to book',
                      style: text.bodySmall?.copyWith(color: c.muted),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Text(price, style: text.labelMedium?.copyWith(color: c.ink)),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 5: Run the widget test to verify it passes**

```bash
cd app && flutter test test/widgets_test.dart
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Write `app/lib/router.dart` and the nav shell**

```dart
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'core/theme/sorted_colors.dart';
import 'features/catalogue/catalogue_screen.dart';
import 'features/catalogue/review_screen.dart';
import 'features/catalogue/snap_screen.dart';
import 'features/home/home_screen.dart';

final appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    ShellRoute(
      builder: (context, state, child) => _NavShell(child: child),
      routes: [
        GoRoute(path: '/', builder: (_, __) => const HomeScreen()),
        GoRoute(path: '/catalogue', builder: (_, __) => const CatalogueScreen()),
      ],
    ),
    GoRoute(path: '/catalogue/snap', builder: (_, __) => const SnapScreen()),
    GoRoute(path: '/catalogue/review', builder: (_, __) => const ReviewScreen()),
  ],
);

/// Home, Orders, a raised centre action, Catalogue, Settings — the five slots
/// from DESIGN.md. Orders and Settings land in later plans; their tabs are
/// present but inert so the bar does not change shape later.
class _NavShell extends StatelessWidget {
  const _NavShell({required this.child});
  final Widget child;

  static const _tabs = ['/', '/orders', '/catalogue', '/settings'];

  @override
  Widget build(BuildContext context) {
    final c = SortedColors.of(context);
    final location = GoRouterState.of(context).uri.path;
    final index = _tabs.indexWhere((t) => t == location);

    return Scaffold(
      body: child,
      floatingActionButton: FloatingActionButton(
        backgroundColor: c.primary,
        foregroundColor: Colors.white,
        onPressed: () => context.push('/catalogue/snap'),
        child: const Icon(Icons.add),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
      bottomNavigationBar: NavigationBar(
        selectedIndex: index < 0 ? 0 : index,
        onDestinationSelected: (i) {
          final target = _tabs[i];
          // Orders and Settings arrive in later plans.
          if (target == '/' || target == '/catalogue') context.go(target);
        },
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.receipt_long_outlined), label: 'Orders'),
          NavigationDestination(icon: Icon(Icons.grid_view_outlined), label: 'Catalogue'),
          NavigationDestination(icon: Icon(Icons.settings_outlined), label: 'Settings'),
        ],
      ),
    );
  }
}
```

- [ ] **Step 7: Write a placeholder `app/lib/features/home/home_screen.dart`**

Home is Plan 4's screen; this keeps the shell navigable now.

```dart
import 'package:flutter/material.dart';

import '../../core/theme/sorted_shape.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(SortedShape.screenPadding),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Sorted', style: text.headlineLarge),
            const SizedBox(height: 8),
            Text('From DM to paid. Sorted.', style: text.bodyLarge),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 8: Point `main.dart` at the router**

Replace the `MaterialApp` in `SortedApp` with `MaterialApp.router`, keeping `sellerIdProvider` and the Firebase bootstrap exactly as they are:

```dart
    return MaterialApp.router(
      title: 'Sorted',
      theme: sortedTheme(),
      routerConfig: appRouter,
    );
```

Remove the `_SignInGate`, `_ThemePlaceholder` and `_StatusChip` placeholder widgets and their now-unused imports. `sellerIdProvider` has already moved to `providers/seller_provider.dart` in Task 6 Step 7, so `main.dart` keeps only `main()` and `SortedApp`.

- [ ] **Step 9: Analyse and run everything**

```bash
cd app && flutter analyze && flutter test
```

Expected: `No issues found!`, all tests pass.

- [ ] **Step 10: Commit**

```bash
cd /Users/bstar/Documents/development/apps/flutter/sorted
git add app
git commit -m "feat(app): add the nav shell, router and shared widgets

Five-slot bottom bar with the raised centre action from DESIGN.md.
Orders and Settings tabs are present but inert so the bar does not
change shape when those screens land.

ProductTile renders 'from £32.00' only when the buyer has a real choice
and an exact price otherwise, matching Catalogue.dc.html, and surfaces a
product-level deposit."
```

---

### Task 8: The Catalogue screen

**Files:**
- Create: `app/lib/features/catalogue/catalogue_screen.dart`
- Test: `app/test/catalogue_screen_test.dart`

**Interfaces:**
- Consumes: `productsProvider`, `ProductTile`, `PrimaryButton`, `formatGbp`.
- Produces: `CatalogueScreen`.

- [ ] **Step 1: Write the failing test**

Create `app/test/catalogue_screen_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sorted/core/theme/sorted_theme.dart';
import 'package:sorted/features/catalogue/catalogue_screen.dart';
import 'package:sorted/models/product.dart';
import 'package:sorted/models/variant.dart';
import 'package:sorted/providers/catalogue_providers.dart';

const _cake = Product(
  id: 'p1', name: 'Lemon drizzle cake', basePriceMinor: 3200,
  variants: [
    Variant(id: 'a', axis: 'size', label: '8 inch', priceDeltaMinor: 0),
    Variant(id: 'b', axis: 'size', label: '10 inch', priceDeltaMinor: 1000),
  ],
);

Widget host(AsyncValue<List<Product>> value) => ProviderScope(
      overrides: [productsProvider.overrideWith((ref) => Stream.value(value.valueOrNull ?? []))],
      child: MaterialApp(theme: sortedTheme(), home: const CatalogueScreen()),
    );

void main() {
  testWidgets('lists products and counts them', (tester) async {
    await tester.pumpWidget(host(const AsyncValue.data([_cake])));
    await tester.pumpAndSettle();
    expect(find.text('Lemon drizzle cake'), findsOneWidget);
    expect(find.text('1 product'), findsOneWidget);
  });

  testWidgets('pluralises the count', (tester) async {
    await tester.pumpWidget(host(const AsyncValue.data([
      _cake,
      Product(id: 'p2', name: 'Brownie box', basePriceMinor: 1400),
    ])));
    await tester.pumpAndSettle();
    expect(find.text('2 products'), findsOneWidget);
  });

  testWidgets('offers a way in when the catalogue is empty', (tester) async {
    // A judge opening a fresh account must not meet a blank screen.
    await tester.pumpWidget(host(const AsyncValue.data([])));
    await tester.pumpAndSettle();
    expect(find.textContaining('Snap'), findsWidgets);
    expect(find.textContaining('nothing here yet'), findsOneWidget);
  });
}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd app && flutter test test/catalogue_screen_test.dart
```

Expected: FAIL — `catalogue_screen.dart` does not exist.

- [ ] **Step 3: Write `app/lib/features/catalogue/catalogue_screen.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/sorted_colors.dart';
import '../../core/theme/sorted_shape.dart';
import '../../providers/catalogue_providers.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/product_tile.dart';

class CatalogueScreen extends ConsumerWidget {
  const CatalogueScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = SortedColors.of(context);
    final text = Theme.of(context).textTheme;
    final products = ref.watch(productsProvider);

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: SortedShape.screenPadding),
        child: products.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(
            child: Text('Could not load your catalogue.\n$e', textAlign: TextAlign.center),
          ),
          data: (items) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Catalogue', style: text.headlineMedium),
                      Text(
                        '${items.length} ${items.length == 1 ? 'product' : 'products'}',
                        style: text.bodySmall,
                      ),
                    ],
                  ),
                  TextButton.icon(
                    onPressed: () => context.push('/catalogue/snap'),
                    icon: const Icon(Icons.camera_alt_outlined, size: SortedShape.iconSize),
                    label: const Text('Snap more'),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              if (items.isEmpty)
                Expanded(
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text("There's nothing here yet.", style: text.bodyLarge),
                        const SizedBox(height: 4),
                        Text(
                          'Photograph your stock and Sorted will read the prices.',
                          style: text.bodySmall,
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 20),
                        PrimaryButton(
                          label: 'Snap your stock',
                          icon: Icons.camera_alt_outlined,
                          onPressed: () => context.push('/catalogue/snap'),
                        ),
                      ],
                    ),
                  ),
                )
              else
                Expanded(
                  child: ListView.separated(
                    itemCount: items.length,
                    separatorBuilder: (_, __) => Divider(color: c.line, height: 1),
                    itemBuilder: (_, i) => ProductTile(product: items[i]),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd app && flutter test test/catalogue_screen_test.dart
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/bstar/Documents/development/apps/flutter/sorted
git add app
git commit -m "feat(app): add the Catalogue screen

Live list from the Firestore stream, with the product count and 'Snap
more' from Catalogue.dc.html. The empty state offers a way in rather
than a blank screen, which is what a judge opening a fresh account sees."
```

---

### Task 9: The Snap screen

`Snap.dc.html` shows a live "Found …" overlay. Real-time detection would mean a vision call per frame, so this plan captures photos and extracts once on Done. The overlay becomes the photo counter plus the hint copy from the design.

**Files:**
- Create: `app/lib/features/catalogue/snap_screen.dart`
- Test: `app/test/snap_screen_test.dart`

**Interfaces:**
- Consumes: `extractionControllerProvider`, `PrimaryButton`.
- Produces: `SnapScreen`, and `imagePickerProvider` (a `Provider<ImagePickerPort>`) so tests inject fake photos.

- [ ] **Step 1: Add the image picker dependency**

```bash
cd app && flutter pub add image_picker
```

- [ ] **Step 2: Write the failing test**

Create `app/test/snap_screen_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sorted/core/theme/sorted_theme.dart';
import 'package:sorted/features/catalogue/snap_screen.dart';

class _FakePicker implements ImagePickerPort {
  _FakePicker(this.returns);
  final List<({List<int> bytes, String filename})> returns;
  int calls = 0;

  @override
  Future<List<({List<int> bytes, String filename})>> pick({required bool fromCamera}) async {
    calls++;
    return returns;
  }
}

Widget host(_FakePicker picker) => ProviderScope(
      overrides: [imagePickerProvider.overrideWithValue(picker)],
      child: MaterialApp(theme: sortedTheme(), home: const SnapScreen()),
    );

void main() {
  testWidgets('Done is disabled until at least one photo is taken', (tester) async {
    await tester.pumpWidget(host(_FakePicker([])));
    final done = tester.widget<FilledButton>(find.byType(FilledButton));
    expect(done.enabled, isFalse);
  });

  testWidgets('counts the photos taken', (tester) async {
    final picker = _FakePicker([(bytes: [1, 2, 3], filename: 'a.png')]);
    await tester.pumpWidget(host(picker));
    await tester.tap(find.byKey(const Key('snap-shutter')));
    await tester.pump();
    expect(find.text('1 photo'), findsOneWidget);
  });

  testWidgets('pluralises the counter', (tester) async {
    final picker = _FakePicker([
      (bytes: [1], filename: 'a.png'),
      (bytes: [2], filename: 'b.png'),
    ]);
    await tester.pumpWidget(host(picker));
    await tester.tap(find.byKey(const Key('snap-shutter')));
    await tester.pump();
    expect(find.text('2 photos'), findsOneWidget);
  });

  testWidgets('refuses a sixth photo, matching the API limit', (tester) async {
    final picker = _FakePicker(
      List.generate(6, (i) => (bytes: [i], filename: '$i.png')),
    );
    await tester.pumpWidget(host(picker));
    await tester.tap(find.byKey(const Key('snap-shutter')));
    await tester.pump();
    expect(find.text('5 photos'), findsOneWidget);
    expect(find.textContaining('five photos'), findsOneWidget);
  });

  testWidgets('shows the design hint copy', (tester) async {
    await tester.pumpWidget(host(_FakePicker([])));
    expect(find.textContaining('Keep price tags in shot'), findsOneWidget);
  });
}
```

- [ ] **Step 3: Run it to verify it fails**

```bash
cd app && flutter test test/snap_screen_test.dart
```

Expected: FAIL — `snap_screen.dart` does not exist.

- [ ] **Step 4: Write `app/lib/features/catalogue/snap_screen.dart`**

```dart
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/theme/sorted_colors.dart';
import '../../core/theme/sorted_shape.dart';
import '../../providers/catalogue_providers.dart';
import '../../widgets/primary_button.dart';

/// Named so tests can inject photos without a camera.
abstract class ImagePickerPort {
  Future<List<({List<int> bytes, String filename})>> pick({required bool fromCamera});
}

class _PlatformPicker implements ImagePickerPort {
  final _picker = ImagePicker();

  @override
  Future<List<({List<int> bytes, String filename})>> pick({required bool fromCamera}) async {
    // The web build has no camera worth using, so it always picks files.
    final useCamera = fromCamera && !kIsWeb;
    final files = useCamera
        ? [await _picker.pickImage(source: ImageSource.camera)]
        : await _picker.pickMultiImage();

    final out = <({List<int> bytes, String filename})>[];
    for (final f in files) {
      if (f == null) continue;
      out.add((bytes: await f.readAsBytes(), filename: f.name));
    }
    return out;
  }
}

final imagePickerProvider = Provider<ImagePickerPort>((ref) => _PlatformPicker());

const _maxPhotos = 5;

class SnapScreen extends ConsumerStatefulWidget {
  const SnapScreen({super.key});

  @override
  ConsumerState<SnapScreen> createState() => _SnapScreenState();
}

class _SnapScreenState extends ConsumerState<SnapScreen> {
  final _photos = <({List<int> bytes, String filename})>[];
  String? _notice;
  bool _busy = false;

  Future<void> _snap({required bool fromCamera}) async {
    final picked = await ref.read(imagePickerProvider).pick(fromCamera: fromCamera);
    if (!mounted) return;
    setState(() {
      final room = _maxPhotos - _photos.length;
      _photos.addAll(picked.take(room));
      _notice = picked.length > room
          ? 'Sorted reads five photos at a time. Snap the rest after this batch.'
          : null;
    });
  }

  Future<void> _done() async {
    setState(() => _busy = true);
    try {
      await ref.read(extractionControllerProvider.notifier).extract(_photos);
      if (mounted) context.go('/catalogue/review');
    } catch (e) {
      if (mounted) setState(() { _busy = false; _notice = '$e'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = SortedColors.of(context);
    final text = Theme.of(context).textTheme;

    return Scaffold(
      backgroundColor: c.darkBg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(SortedShape.screenPadding),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Snap your stock',
                    style: text.headlineMedium?.copyWith(color: Colors.white),
                  ),
                  IconButton(
                    onPressed: () => context.pop(),
                    icon: Icon(Icons.close, color: c.onDarkMuted),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Expanded(
                child: Container(
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: c.darkSurface,
                    borderRadius: BorderRadius.circular(SortedShape.cardRadiusLarge),
                  ),
                  child: Center(
                    child: Text(
                      _photos.isEmpty
                          ? 'No photos yet'
                          : '${_photos.length} ${_photos.length == 1 ? 'photo' : 'photos'}',
                      style: text.titleLarge?.copyWith(color: c.highlight),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              Text(
                'Snap one product or the whole table. Keep price tags in shot and Sorted reads them too.',
                style: text.bodySmall?.copyWith(color: c.onDarkMuted),
              ),
              if (_notice != null) ...[
                const SizedBox(height: 8),
                Text(_notice!, style: text.bodySmall?.copyWith(color: c.highlight)),
              ],
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _busy ? null : () => _snap(fromCamera: false),
                      icon: const Icon(Icons.photo_library_outlined),
                      label: const Text('Upload'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      key: const Key('snap-shutter'),
                      onPressed: _busy ? null : () => _snap(fromCamera: true),
                      icon: const Icon(Icons.camera_alt_outlined),
                      label: const Text('Snap'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              PrimaryButton(
                label: _busy ? 'Reading your photos…' : 'Done',
                onPressed: _photos.isEmpty || _busy ? null : _done,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd app && flutter test test/snap_screen_test.dart && flutter analyze
```

Expected: PASS, 5 tests, `No issues found!`.

- [ ] **Step 6: Commit**

```bash
cd /Users/bstar/Documents/development/apps/flutter/sorted
git add app
git commit -m "feat(app): add the Snap screen

Capture up to five photos then extract once, rather than the live
per-frame detection Snap.dc.html implies, which would mean a vision call
per frame. The picker is behind an injected port so tests supply photos
without a camera, and the web build falls back to file upload.

The five-photo cap matches the API's limit and says so rather than
silently dropping the sixth."
```

---

### Task 10: The Review screen

The screen the whole plan exists for: the seller confirms what the AI read. Covers Review Focus items 1 and 2.

**Files:**
- Create: `app/lib/features/catalogue/review_screen.dart`
- Test: `app/test/review_screen_test.dart`

**Interfaces:**
- Consumes: `extractionControllerProvider`, `catalogueRepositoryProvider`, `WarningCard`, `PrimaryButton`, `formatGbp`.
- Produces: `ReviewScreen`.

- [ ] **Step 1: Write the failing test**

Create `app/test/review_screen_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sorted/core/theme/sorted_theme.dart';
import 'package:sorted/data/catalogue_repository.dart';
import 'package:sorted/features/catalogue/review_screen.dart';
import 'package:sorted/models/ambiguity.dart';
import 'package:sorted/models/product_candidate.dart';
import 'package:sorted/models/variant.dart';
import 'package:sorted/providers/catalogue_providers.dart';

const _priced = ProductCandidate(
  tempId: 't1', name: 'Lemon drizzle cake', description: 'Zesty.',
  basePriceMinor: 3200,
  variants: [
    Variant(id: 'a', axis: 'size', label: '8 inch', priceDeltaMinor: 0),
    Variant(id: 'b', axis: 'size', label: '10 inch', priceDeltaMinor: 1000),
  ],
  confidence: 0.9,
);

const _unpriced = ProductCandidate(
  tempId: 't2', name: 'Cinnamon buns', basePriceMinor: null,
  variants: [Variant(id: 'c', axis: 'size', label: 'Box of 4', priceDeltaMinor: 0)],
  confidence: 0.4,
  ambiguities: [
    Ambiguity(field: 'basePriceMinor', kind: 'missing', question: "Couldn't read a price. Add one to save."),
  ],
);

class _FakeApi implements CatalogueApi {
  Object? saved;
  @override
  Future<Map<String, dynamic>> extract(List<({List<int> bytes, String filename})> f) async =>
      {'candidates': []};
  @override
  Future<Map<String, dynamic>> saveProducts(Object body) async {
    saved = body;
    return {'created': ['p1'], 'skippedDuplicates': <String>[]};
  }
}

Widget host(List<ProductCandidate>? candidates, {_FakeApi? api}) => ProviderScope(
      overrides: [
        extractionControllerProvider.overrideWith(() => _StubController(candidates)),
        if (api != null)
          catalogueRepositoryProvider.overrideWithValue(CatalogueRepository(api: api)),
      ],
      child: MaterialApp(theme: sortedTheme(), home: const ReviewScreen()),
    );

class _StubController extends ExtractionController {
  _StubController(this._initial);
  final List<ProductCandidate>? _initial;
  @override
  List<ProductCandidate>? build() => _initial;
}

void main() {
  testWidgets('shows how many products were found', (tester) async {
    await tester.pumpWidget(host(const [_priced, _unpriced]));
    await tester.pumpAndSettle();
    expect(find.textContaining('Sorted found 2 products'), findsOneWidget);
  });

  testWidgets('flags the product with no price', (tester) async {
    await tester.pumpWidget(host(const [_unpriced]));
    await tester.pumpAndSettle();
    expect(find.textContaining("Couldn't read a price"), findsOneWidget);
  });

  testWidgets('save is disabled while any product still lacks a price', (tester) async {
    // Saving here would write a £0 product a buyer could order.
    await tester.pumpWidget(host(const [_priced, _unpriced]));
    await tester.pumpAndSettle();
    final button = tester.widget<FilledButton>(find.byType(FilledButton));
    expect(button.enabled, isFalse);
  });

  testWidgets('save becomes available once every price is filled in', (tester) async {
    await tester.pumpWidget(host(const [_priced]));
    await tester.pumpAndSettle();
    final button = tester.widget<FilledButton>(find.byType(FilledButton));
    expect(button.enabled, isTrue);
    expect(find.text('Add 1 product'), findsOneWidget);
  });

  testWidgets('typing a price clears the block', (tester) async {
    await tester.pumpWidget(host(const [_unpriced]));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, '12.00');
    await tester.pump();
    final button = tester.widget<FilledButton>(find.byType(FilledButton));
    expect(button.enabled, isTrue);
  });

  testWidgets('says so plainly when the photo had nothing in it', (tester) async {
    // A selfie or an empty worktop must not show a blank confirm screen.
    await tester.pumpWidget(host(const []));
    await tester.pumpAndSettle();
    expect(find.textContaining("couldn't find any products"), findsOneWidget);
  });

  testWidgets('saving sends the candidates to the API', (tester) async {
    final api = _FakeApi();
    await tester.pumpWidget(host(const [_priced], api: api));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle();
    expect(api.saved, isNotNull);
  });
}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd app && flutter test test/review_screen_test.dart
```

Expected: FAIL — `review_screen.dart` does not exist.

- [ ] **Step 3: Write `app/lib/features/catalogue/review_screen.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/money.dart';
import '../../core/theme/sorted_colors.dart';
import '../../core/theme/sorted_shape.dart';
import '../../models/product_candidate.dart';
import '../../providers/catalogue_providers.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/warning_card.dart';

class ReviewScreen extends ConsumerWidget {
  const ReviewScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final text = Theme.of(context).textTheme;
    final candidates = ref.watch(extractionControllerProvider);

    if (candidates == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (candidates.isEmpty) {
      return Scaffold(
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(SortedShape.screenPadding),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text('Nothing to add', style: text.headlineMedium),
                const SizedBox(height: 8),
                Text(
                  "Sorted couldn't find any products in those photos. Try again with the items in frame and any price tags visible.",
                  style: text.bodyMedium,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 20),
                PrimaryButton(
                  label: 'Snap again',
                  onPressed: () => context.go('/catalogue/snap'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final blocked = candidates.any((c) => c.needsPrice);
    final count = candidates.length;

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(SortedShape.screenPadding),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('From your photos', style: text.bodySmall),
              Text('Check your products', style: text.headlineMedium),
              const SizedBox(height: 6),
              Text(
                'Sorted found $count ${count == 1 ? 'product' : 'products'}. Fix anything that looks off before they go into your catalogue.',
                style: text.bodyMedium,
              ),
              const SizedBox(height: 16),
              Expanded(
                child: ListView.separated(
                  itemCount: candidates.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 12),
                  itemBuilder: (_, i) => _CandidateCard(candidate: candidates[i]),
                ),
              ),
              const SizedBox(height: 10),
              PrimaryButton(
                label: 'Add $count ${count == 1 ? 'product' : 'products'}',
                onPressed: blocked
                    ? null
                    : () async {
                        await ref.read(catalogueRepositoryProvider).save(candidates);
                        ref.read(extractionControllerProvider.notifier).clear();
                        if (context.mounted) context.go('/catalogue');
                      },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CandidateCard extends ConsumerWidget {
  const _CandidateCard({required this.candidate});
  final ProductCandidate candidate;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = SortedColors.of(context);
    final text = Theme.of(context).textTheme;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: c.surface,
        border: Border.all(color: c.line),
        borderRadius: BorderRadius.circular(SortedShape.cardRadius),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(candidate.name, style: text.titleLarge),
          const SizedBox(height: 8),
          if (candidate.needsPrice)
            WarningCard(
              message: candidate.ambiguities.isNotEmpty
                  ? candidate.ambiguities.first.question
                  : "Couldn't read a price. Add one to save.",
              child: TextField(
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(prefixText: '£ ', hintText: '0.00'),
                onChanged: (raw) {
                  final pounds = double.tryParse(raw.replaceAll(',', ''));
                  if (pounds == null || pounds < 0) return;
                  ref
                      .read(extractionControllerProvider.notifier)
                      .setPrice(candidate.tempId, (pounds * 100).round());
                },
              ),
            )
          else
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: [
                for (final v in candidate.variants)
                  Chip(
                    label: Text(
                      '${v.label}  ${formatGbp(candidate.basePriceMinor! + v.priceDeltaMinor)}',
                    ),
                  ),
                if (candidate.variants.isEmpty)
                  Chip(label: Text(formatGbp(candidate.basePriceMinor!))),
              ],
            ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd app && flutter test test/review_screen_test.dart
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Run everything and build web**

```bash
cd app && flutter analyze && flutter test && flutter build web --release
cd ../api && npm test && npm run typecheck
```

Expected: analyze clean, all Flutter and Node tests pass, web build succeeds.

- [ ] **Step 6: Commit**

```bash
cd /Users/bstar/Documents/development/apps/flutter/sorted
git add app
git commit -m "feat(app): add the Review screen

The confirm step the whole catalogue flow exists for. A product the
model could not price shows the warning card and a price field, and
saving stays disabled until every price is filled in — saving one would
write a £0 product a buyer could order.

A photo with nothing sellable in it says so and offers another go,
rather than showing an empty confirm screen."
```

---

## Plan complete

**What exists at the end of Plan 2:** a seller can photograph stock, see what the model read, fix a missing price, discard what is wrong, and save products that appear live in the catalogue. The five AI schemas and the one AI seam are in place, so week 3's DM parser is a new prompt and schema rather than new plumbing.

**Test count:** roughly 160. Node: existing 99 plus `schemas` 13, `ai-client` 7 (+1 live, skipped without a key), `extract-catalogue` 5, `catalogue-route` 7, `products` 12, `products-route` 11. Flutter: existing 7 plus `models` 9, `catalogue_repository` 5, `widgets` 6, `catalogue_screen` 3, `snap_screen` 5, `review_screen` 7.

**Deliberate scope calls:**
- **No image storage.** `photoUrl` stays null and product tiles use the `primaryTint` block from DESIGN.md, which is what `Catalogue.dc.html` shows. Firebase Storage would add setup for no visible gain this week.
- **No live camera detection.** `Snap.dc.html`'s "Found Lemon drizzle cake" overlay implies a vision call per frame. Capture-then-extract gives the same result for a fraction of the cost and latency.
- **Orders and Settings tabs are inert.** Present so the nav bar does not change shape when Plans 4 and 5 land.

**Next:** Plan 3 — share a DM, get an order. The core flow, and the one the demo video is built around.
