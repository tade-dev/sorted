# Sorted — Design Spec

> From DM to paid. Sorted.

**Date:** 2026-10-02
**Entrant:** solo, UK-based
**Event:** PayPal AI Hackathon (Devpost) — submission window Oct 1 2026 09:00 PT → **Nov 12 2026 14:00 PT / 22:00 UK**
**Internal deadline:** submit Tue 10 Nov, contingency Wed 11 Nov.

---

## 0. Intent and locked decisions

### What we are building

An app for UK small sellers who take orders through Instagram, TikTok and WhatsApp DMs. The seller shares a DM screenshot into Sorted; a vision model turns it into a structured order; the backend creates a real PayPal order and returns a buyer approval link; the seller pastes a ready-written reply with the link back into the chat; PayPal webhooks and an automatic capture flip the order to **Paid** live on screen.

### Success criteria

A judge opens the hosted web URL, feeds in a sample DM, gets a real PayPal sandbox checkout link, pays as the sandbox buyer, and watches the order flip to Paid without reloading. Everything else supports that moment.

### Decisions locked before design (from brief review, 2026-10-02)

| Decision | Choice | Why |
|---|---|---|
| Share sheet scope | **Android + web first**, iOS Share Extension as a week-5 stretch | Judges use the web build. Android share intent is a manifest entry. The iOS extension is the brief's own "fiddliest native piece" and must be cuttable. |
| AI agency | **Assistive core + one genuinely autonomous loop** | Seller confirms orders (trust, and it demos better). The nudge worker decides who to chase, picks a channel and writes the copy unprompted. One honest agentic claim beats a vague one. |
| Auth | **Instant demo seller, anonymous auth, no login** | Zero friction for judges. The `seller` model still exists for the multi-tenant future-work story. Anonymous uid scopes each judge's data so they do not collide. |
| LLM | **OpenAI** | User's choice. Vision + strict structured outputs. |
| Sponsor tools | **Render (incl. Workflows) + APIMatic only** | Both are zero-scope. AG Grid and Bryntum would need a second React frontend and would cost the buffer week. |
| PayPal surface | **Orders v2 core + Invoicing for nudges** | Orders v2 for the paste-into-DM link (no buyer email needed). Unpaid orders escalate to a PayPal invoice so `send_invoice_reminder` sends a real reminder instead of copy-paste text. Two PayPal products, genuinely used. |

### Corrections to the original brief

1. **Week 6 is not free buffer.** Starting 2 Oct, six weeks lands on 12 Nov, which *is* the deadline. Week 5 is the real buffer; week 6 is submission week ending Wed 11 Nov.
2. **The prize list was incomplete.** Actual pool is $67,500 and also includes **Most Creative ($5k)** and **Best Demo Delivery ($5k)**.
3. **PayPal ships two different "AI toolkits"**, which the brief conflates:
   - `paypal/AI-Toolkit` — a **Claude Code / Codex plugin** for build time (`/plugin install paypal@claude-plugins-official`). Provides a PayPal best-practices skill, `/paypal:doctor`, `/paypal:explain-error`, and an MCP server against the sandbox. Ships nothing.
   - `@paypal/agent-toolkit` — the **npm runtime library**. Exposes PayPal APIs as LLM tool definitions for the Vercel AI SDK, OpenAI Agents SDK, LangChain and MCP. Node 18+, sandbox via `configuration.context.sandbox: true`. This is what ships.
4. **PayPal can send the nudges itself.** The Invoicing tools include `send_invoice_reminder`, `cancel_invoice_auto_reminder` and `create_conditional_rules_for_invoice` (early-payment discount, automatic cancellation date).

---

## 1. Repo structure and license

**License: MIT.** Devpost requires a license file detectable in the repo's About section. MIT is the most recognisable permissive licence and GitHub auto-detects it from a root `LICENSE`. Apache-2.0's patent grant buys nothing here.

Flat monorepo. No npm workspaces, because Flutter cannot participate in them and the indirection would only confuse judges.

```
sorted/
├── LICENSE                      # MIT
├── README.md                    # judge-facing: hosted URL, run steps, sandbox creds
├── .gitignore
├── docs/
│   ├── superpowers/specs/2026-10-02-sorted-design.md
│   ├── architecture.md          # diagram + data flow
│   └── tools-used.md            # maintained as we build → Devpost "tools used" answer
├── samples/
│   ├── dm-screenshots/          # 8 fictional DM conversations (png)
│   └── seed-catalogue.json      # baker persona catalogue
├── app/                         # Flutter (iOS / Android / web)
│   ├── pubspec.yaml
│   ├── lib/
│   │   ├── main.dart
│   │   ├── app.dart                     # MaterialApp.router, theme
│   │   ├── router.dart                  # GoRouter config
│   │   ├── core/
│   │   │   ├── env.dart                 # API base URL via --dart-define
│   │   │   ├── firebase_options.dart    # flutterfire configure output
│   │   │   ├── api_client.dart          # dio wrapper, attaches ID token
│   │   │   ├── result.dart              # sealed Result<T>
│   │   │   └── theme/
│   │   ├── models/                      # freezed + json_serializable
│   │   │   ├── seller.dart product.dart variant.dart
│   │   │   ├── order.dart line_item.dart payment_event.dart
│   │   │   └── ambiguity.dart summary.dart
│   │   ├── data/
│   │   │   ├── firestore_refs.dart      # typed collection refs with converters
│   │   │   ├── catalogue_repository.dart
│   │   │   ├── orders_repository.dart
│   │   │   └── share_repository.dart    # receive_sharing_intent + web fallback
│   │   ├── providers/
│   │   │   ├── seller_provider.dart
│   │   │   ├── catalogue_providers.dart # StreamProvider
│   │   │   ├── orders_providers.dart    # StreamProvider + summary
│   │   │   └── draft_controller.dart    # AsyncNotifier
│   │   └── features/
│   │       ├── home/        home_screen.dart summary_card.dart
│   │       ├── intake/      intake_screen.dart sample_picker.dart
│   │       ├── draft/       draft_review_screen.dart ambiguity_chip.dart link_ready_screen.dart
│   │       ├── orders/      orders_screen.dart order_detail_screen.dart status_pill.dart
│   │       └── catalogue/   catalogue_screen.dart item_review_screen.dart
│   ├── android/ ios/ web/
│   └── test/
└── api/                         # Node 22 + TypeScript
    ├── package.json
    ├── tsconfig.json
    ├── render.yaml              # Render blueprint: web service + workflow
    ├── src/
    │   ├── index.ts             # express app, route mounting, health
    │   ├── env.ts               # zod-validated process.env
    │   ├── firebase.ts          # admin init
    │   ├── routes/
    │   │   ├── session.ts catalogue.ts orders.ts webhooks.ts summary.ts internal.ts
    │   ├── ai/
    │   │   ├── client.ts                # ai-sdk openai provider
    │   │   ├── schemas.ts               # zod: all five schemas, shared with routes
    │   │   ├── extract_catalogue.ts
    │   │   ├── parse_dm.ts
    │   │   ├── draft_reply.ts
    │   │   ├── draft_nudge.ts
    │   │   └── daily_summary.ts
    │   ├── paypal/
    │   │   ├── toolkit.ts               # @paypal/agent-toolkit config
    │   │   ├── orders.ts                # create + capture + get
    │   │   ├── invoices.ts              # escalation + reminder
    │   │   └── webhook_verify.ts
    │   ├── domain/
    │   │   ├── match_catalogue.ts       # line item → product/variant
    │   │   ├── order_state.ts           # transition guards
    │   │   └── money.ts                 # GBP minor units
    │   ├── workers/
    │   │   ├── nudge_agent.ts           # Render Workflow: the autonomous loop
    │   │   └── reconcile.ts             # Render Workflow: webhook safety net
    │   └── lib/ logger.ts errors.ts idempotency.ts
    ├── scripts/ seed.ts
    └── test/
```

The existing Flutter scaffold at the repo root moves into `app/` in week 1. Web is **not currently enabled** (no `web/` directory), so `flutter create --platforms=web .` must be run inside `app/`.

---

## 2. Data models

**Money is always an integer in minor units (pence) plus `currency: 'GBP'`.** No floats anywhere. One `money.ts` owns all arithmetic and formatting.

**Timestamps** are Firestore `Timestamp` at rest, ISO-8601 strings over the API.

**IDs** are Firestore auto-ids except `paymentEvents` (PayPal event id) and `summaries` (`YYYY-MM-DD`).

### `sellers/{sellerId}`

| Field | Type | Notes |
|---|---|---|
| `id` | string | equals the Firebase Auth uid (anonymous) |
| `displayName` | string | "Ola's Bakehouse" |
| `personaTone` | string | a sample of the seller's own writing, fed to reply drafting |
| `currency` | `'GBP'` | literal |
| `timezone` | string | `'Europe/London'` |
| `demoSeeded` | bool | true once the baker catalogue is seeded |
| `createdAt` | Timestamp | |

### `sellers/{sellerId}/products/{productId}`

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `name` | string | ≤60 chars |
| `description` | string | ≤240 chars |
| `basePriceMinor` | int \| null | null when the photo showed no price |
| `currency` | `'GBP'` | |
| `photoUrl` | string \| null | Firebase Storage |
| `variants` | `Variant[]` | embedded, not a subcollection: small and always read together |
| `active` | bool | soft delete |
| `source` | `'ai_extracted' \| 'manual'` | |
| `aiConfidence` | double \| null | 0..1 |
| `createdAt` / `updatedAt` | Timestamp | |

**`Variant`** (embedded): `id` string (stable slug), `axis` `'size'|'colour'|'flavour'|'other'`, `label` string ("8 inch"), `priceDeltaMinor` int (may be negative), `active` bool.

### `sellers/{sellerId}/orders/{orderId}`

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `status` | `'draft'\|'link_sent'\|'paid'\|'cancelled'\|'expired'` | |
| `buyerName` | string \| null | |
| `buyerHandle` | string \| null | |
| `buyerEmail` | string \| null | only if the DM revealed it; required for invoice escalation |
| `channel` | `'instagram'\|'tiktok'\|'whatsapp'\|'other'\|'unknown'` | |
| `lineItems` | `LineItem[]` | embedded |
| `subtotalMinor` | int | computed server-side |
| `depositMinor` | int \| null | |
| `amountDueMinor` | int | what PayPal charges: deposit if set, else subtotal |
| `currency` | `'GBP'` | |
| `fulfilment` | `{ mode: 'collection'\|'delivery'\|'unknown', date: string\|null, notes: string\|null }` | `date` is an ISO date |
| `ambiguities` | `Ambiguity[]` | |
| `paypalOrderId` | string \| null | |
| `approvalUrl` | string \| null | |
| `paypalCaptureId` | string \| null | |
| `paypalInvoiceId` | string \| null | set when escalated for nudging |
| `draftedReply` | string \| null | |
| `nudge` | `{ count: int, lastSentAt: Timestamp\|null, lastText: string\|null, channel: 'paypal_invoice'\|'manual_copy'\|null }` | |
| `sourceKind` | `'screenshot'\|'text'` | |
| `sourceRef` | string \| null | Storage path of the shared screenshot, for audit |
| `extractionModel` | string | model id used, for the write-up |
| `createdAt` / `updatedAt` | Timestamp | |
| `linkSentAt` / `paidAt` / `expiresAt` | Timestamp \| null | |

**`LineItem`** (embedded): `id` string, `productId` string\|null (null = unmatched), `variantIds` string[], `nameRaw` string (the buyer's own words, e.g. "choc cake 8 inch"), `nameResolved` string\|null, `qty` int ≥1, `unitPriceMinor` int, `lineTotalMinor` int, `matchConfidence` double 0..1, `matchMethod` `'exact'|'fuzzy'|'ai'|'unmatched'`.

**`Ambiguity`** (embedded): `field` string (dot path, e.g. `lineItems[0].variantIds`), `kind` `'missing'|'unclear'|'unknown_product'|'price_conflict'|'qty_unclear'`, `question` string (seller-facing: "What size did Amara want?"), `options` string[] (may be empty), `blocking` bool, `resolved` bool.

### `sellers/{sellerId}/orders/{orderId}/paymentEvents/{eventId}`

| Field | Type | Notes |
|---|---|---|
| `id` | string | **the PayPal webhook event id** — this is the idempotency key |
| `eventType` | string | `CHECKOUT.ORDER.APPROVED` etc |
| `paypalResourceId` | string | |
| `amountMinor` | int \| null | |
| `raw` | map | trimmed webhook body |
| `signatureVerified` | bool | |
| `receivedAt` / `processedAt` | Timestamp \| null | |
| `processingError` | string \| null | |

### `sellers/{sellerId}/summaries/{YYYY-MM-DD}`

`date` string, `paidCount` / `waitingCount` / `draftCount` int, `paidTotalMinor` int, `highlights` string[] (≤3, AI-written), `generatedAt` Timestamp.

### `webhookEvents/{eventId}` (root collection)

Global idempotency ledger, written before the seller is known: `id`, `eventType`, `receivedAt`, `handled` bool, `sellerId` string\|null, `orderId` string\|null.

### Firestore security rules

Clients may **read** `sellers/{uid}/**` where `uid == request.auth.uid`. **All client writes are denied**, and the root `webhookEvents` collection is denied for both read and write. Every write goes through the Admin SDK in the backend, which bypasses rules. All three cases get an emulator test in week 1.

---

## 3. Backend API

Base: `https://sorted-api.onrender.com/v1`
Auth: `Authorization: Bearer <Firebase ID token>`. Middleware verifies with the Admin SDK and sets `req.sellerId`.
Errors: `{ "error": { "code": "...", "message": "...", "details": {} } }`. Codes: `VALIDATION_FAILED`, `AI_PARSE_FAILED`, `PAYPAL_UNAVAILABLE`, `ORDER_STATE_INVALID`, `NOT_FOUND`, `UNAUTHENTICATED`.
Idempotency: `Idempotency-Key` header honoured on every POST that creates a money object.

| # | Endpoint | Request | Response |
|---|---|---|---|
| 1 | `GET /health` | — | `{ ok, version, paypalEnv: 'sandbox', webhookFailures: int }` |
| 2 | `POST /session/bootstrap` | `{ demo: boolean }` | `{ seller: Seller, seededProducts: int }` |
| 3 | `POST /catalogue/extract` | multipart `images[]` (1–5, jpeg/png, ≤8MB each) | `{ candidates: ProductCandidate[] }` |
| 4 | `POST /catalogue/products` | `{ products: ProductInput[] }` | `{ created: string[] }` |
| 5 | `PATCH /catalogue/products/:productId` | partial `ProductInput` | `{ product: Product }` |
| 6 | `DELETE /catalogue/products/:productId` | — | `{ ok: true }` (soft: `active=false`) |
| 7 | `POST /orders/draft` | multipart `image`, **or** `{ text, channel? }` | `{ order: Order }` |
| 8 | `POST /orders/:orderId/resolve` | `{ lineItems?, fulfilment?, buyerName?, buyerHandle?, buyerEmail?, depositMinor?, resolvedAmbiguities?: string[] }` | `{ order: Order }` |
| 9 | `POST /orders/:orderId/confirm` | `{ depositMinor?: int\|null }` | `{ order: Order }` with `paypalOrderId`, `approvalUrl`, `draftedReply`, `status: 'link_sent'` |
| 10 | `POST /orders/:orderId/reply/regenerate` | `{ tone?: 'warm'\|'brief'\|'formal' }` | `{ draftedReply: string }` |
| 11 | `POST /orders/:orderId/cancel` | — | `{ order: Order }` |
| 12 | `GET /orders` | `?status=&limit=&cursor=` | `{ orders: Order[], nextCursor: string\|null }` |
| 13 | `POST /orders/:orderId/nudge` | — | `{ nudge: { text, channel, sentAt\|null } }` |
| 14 | `GET /summary/today` | — | `{ summary: Summary }` — regenerated when `generatedAt` is over 15 min old or an order changed status since |
| 15 | `POST /webhooks/paypal` | PayPal event body + 5 signature headers | `{ received: true }`, or `401` on invalid signature |
| 16 | `POST /internal/workflows/nudge-sweep` | header `X-Internal-Token` | `{ scanned, nudged, skipped }` |
| 17 | `POST /internal/workflows/reconcile` | header `X-Internal-Token` | `{ checked, promoted }` |

**`ProductCandidate`**: `{ tempId, name, description, basePriceMinor, currency, variants: Variant[], confidence, ambiguities: Ambiguity[] }`. Note that `/catalogue/extract` **does not write to Firestore** — the seller confirms first, which is the brief's 3.1 requirement.

`POST /orders/draft` is **synchronous** and takes 3–10s. The app shows staged progress rather than a spinner. Synchronous keeps state reasoning simple and the order doc is also written to Firestore so the listener is already live when the draft screen opens.

`GET /orders` exists for debugging and the Devpost write-up; the app normally reads Firestore directly.

---

## 4. PayPal integration sequence

Sandbox only. Client id and secret live in Render env. OAuth2 `client_credentials` token cached in memory with a 60s safety margin.

### Create (on confirm)

`POST /v2/checkout/orders` via `@paypal/agent-toolkit` `create_order`:

- `intent: "CAPTURE"`
- `purchase_units[0]`: `reference_id: orderId`, `amount: { currency_code: "GBP", value: "45.00" }`, `items[]`, **`custom_id: "{sellerId}:{orderId}"`**
- `application_context`: `brand_name`, `locale: "en-GB"`, `user_action: "PAY_NOW"`, `shipping_preference: "NO_SHIPPING"`, `return_url`, `cancel_url`

`custom_id` carrying `sellerId:orderId` means webhook handling never needs a lookup table. Store `paypalOrderId`, take the approval link from `links[]`, set `status: link_sent` and `expiresAt = now + 7 days`.

**Order lifecycle timings** (one place, so nothing drifts):

| Age since `linkSentAt` | What happens |
|---|---|
| 24h | first nudge eligible |
| 72h | second nudge eligible |
| 7 days (`expiresAt`) | `status → expired`, any open invoice auto-cancelled by its conditional rule |

### Buyer approves → `CHECKOUT.ORDER.APPROVED`

1. **Verify the signature.** Invalid → `401`, increment the failure counter surfaced on `/health`.
2. Write `webhookEvents/{event.id}`. If it already exists and `handled` is true, return `200` and stop. This is the idempotency gate.
3. Resolve seller and order from `resource.purchase_units[0].custom_id`.
4. **Capture:** `POST /v2/checkout/orders/{id}/capture` with header `PayPal-Request-Id: capture-{orderId}` for PayPal-side idempotency.
5. If the capture response already says `COMPLETED`, mark the order paid immediately. Do not wait for the second webhook.

### `PAYMENT.CAPTURE.COMPLETED`

Idempotency check, resolve the order, set `status: paid`, `paidAt`, `paypalCaptureId`, append a `paymentEvent`. The app's Firestore listener flips the card.

### Signature verification

`POST /v1/notifications/verify-webhook-signature` with the five headers (`paypal-transmission-id`, `paypal-transmission-time`, `paypal-cert-url`, `paypal-auth-algo`, `paypal-transmission-sig`), the configured `webhook_id`, and the **raw** request body. Expect `{ verification_status: "SUCCESS" }`.

**This must use the unparsed body.** Mount `express.raw({ type: 'application/json' })` on the webhook route only, before any global JSON parser. Getting this wrong is the single most common failure in this integration, so a fixture test with a captured real payload goes in during week 4.

### Subscribed events

`CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.REFUNDED`, plus `INVOICING.INVOICE.PAID` and `INVOICING.INVOICE.CANCELLED` for the nudge path.

**Week-1 verification task:** the exact event names the sandbox actually delivers must be confirmed in the PayPal Developer Dashboard webhook simulator and a real payload captured to a fixture file. Do not treat the list above as verified.

### Failure states

| State | Cause | Handling |
|---|---|---|
| Capture returns `INSTRUMENT_DECLINED` | buyer funding failed | order stays `link_sent`, event logged, app shows "payment declined — ask them to try again"; seller can regenerate the link |
| Capture `422 ORDER_ALREADY_CAPTURED` | duplicate webhook | treat as success, reconcile from `get_order` |
| **Webhook never arrives** | sandbox flakiness, cold start | **reconciliation sweep**: Render Workflow every 10 min calls `get_order` on every `link_sent` order older than 2 min and promotes any `COMPLETED`. This is what makes the demo reliable regardless of webhook delivery. |
| Invalid signature | misconfiguration or spoof | `401`, logged, counter on `/health` |
| PayPal `5xx` on create | outage | `PAYPAL_UNAVAILABLE`, order stays `draft`, app offers retry |
| Unpaid at 24h | buyer went quiet | nudge agent escalates (see timings above); at 7 days `status → expired` |

### The autonomous nudge loop

A Render Workflow runs hourly and calls `POST /internal/workflows/nudge-sweep`. It selects orders with `status: link_sent` that are past a nudge threshold (24h for the first, 72h for the second) and have `nudge.count < 2`. For each one, an agent (`generateText` with `maxSteps`, tools = PayPal agent-toolkit invoice tools + internal order tools) decides what to do:

- **Buyer email known** → `create_invoice` → `send_invoice` → `create_conditional_rules_for_invoice` (automatic cancellation at expiry). On a later pass, `send_invoice_reminder`. PayPal sends the reminder; Sorted does not.
- **No email** → draft text only, write it to `nudge.lastText`, surface it in the app for the seller to copy into the chat.

This is the one place where the AI acts rather than suggests: it picks the targets, picks the channel, and writes the copy without being asked.

---

## 5. AI pipeline

All five features produce a Zod-validated object via the Vercel AI SDK's `generateObject` (strict structured outputs). Temperature 0.2 for extraction, 0.7 for reply and nudge drafting.

The one exception to the single-call shape is the **nudge loop**, which wraps 5.4 in a `generateText` call with `maxSteps` and the PayPal invoice tools, so the agent can take action rather than only return text. 5.4 itself still returns a validated object.

**Shared guard rails:**
- Zod validates every response. On failure, retry once with the validation error appended to the prompt. On a second failure, return `AI_PARSE_FAILED` and fall back to manual entry. The seller is never blocked by the model.
- **Unknowns become `ambiguities`, never guesses.** This is the product's central honesty rule and the thing the demo video should prove.
- **Prices and totals never come from the LLM.** The model identifies *what* was ordered; `match_catalogue.ts` and `money.ts` compute what it costs.

### 5.1 Catalogue extraction (vision, 1–5 images)

System: *"You extract product listings for a UK small seller's catalogue from photos of their stock. Prices are GBP. State only what you can see or read in the image. If no price is visible, set basePriceMinor to null and add an ambiguity. Never invent prices, sizes or flavours."*

Schema: `{ candidates: [{ name, description, basePriceMinor: int|null, variants: [{ axis, label, priceDeltaMinor }], confidence, ambiguities: [Ambiguity] }] }`

### 5.2 DM → order (vision or text) — the core

The prompt includes the seller's catalogue as a compact list (`id`, `name`, price, variant labels) so the model can cite real ids.

System: *"Extract one order from this conversation. The seller is the party offering goods; the buyer is the other party. Quote the buyer's own words in nameRaw. If the buyer never stated a size, quantity or date, do not guess — add an ambiguity with a question the seller can answer in one tap."*

Schema: `{ buyerName, buyerHandle, channel, lineItems: [{ nameRaw, qty, productId|null, variantLabels: string[], unitPriceMinorHint: int|null }], fulfilment: { mode, date, notes }, depositRequestedMinor: int|null, ambiguities: [Ambiguity], overallConfidence }`

Then deterministic post-processing in `match_catalogue.ts`: exact match → normalised match → token-overlap fuzzy match with a 0.6 threshold. Below threshold is `unmatched` plus an `unknown_product` ambiguity. Prices are read from the catalogue, and totals recomputed server-side.

### 5.3 Reply drafting

Input: the seller's `personaTone` sample, the order summary, the approval link.

System: *"Write the reply the seller would send. UK English. Under 60 words. Warm, not corporate. Include the payment link exactly once, unmodified. No emoji unless the seller's sample uses them. Do not promise dates that are not in the order."*

Schema: `{ reply: string }`

### 5.4 Nudge drafting (inside the agent loop)

Input: order age, amount, buyer name, prior nudge count.

System: *"Draft a polite payment reminder. Never guilt or pressure. Under 45 words. If this is the second reminder, offer an out ('happy to hold it or cancel, just say')."*

Schema: `{ text: string, recommendChannel: 'paypal_invoice'|'manual_copy', shouldSkip: boolean, skipReason: string|null }`

`shouldSkip` lets the agent decline to chase, which matters: an agent that knows when not to act is more credible than one that always fires.

### 5.5 Daily summary

Counts and totals are computed in code and passed in. The model only writes prose.

System: *"Two or three short highlights for a seller's home screen. Use only the numbers given. No advice, no exclamation marks."*

Schema: `{ highlights: string[] }` (≤3, each ≤70 chars)

The figures on the card come from code, so the money on screen can never be hallucinated.

---

## 6. Flutter screens and navigation

GoRouter with a shell route and bottom navigation: **Home / Catalogue / Orders**.

| Route | Screen | Purpose |
|---|---|---|
| `/` | **Home** | Summary card ("3 paid, 1 waiting, £145 today" + AI highlights), a large "New order from a DM" button, the three most recent orders. |
| `/intake` | **Intake** | Paste text or pick/drop an image. The web fallback, and reachable on mobile. Includes a "try a sample DM" row loading from `samples/` so a judge is one tap from the core flow. |
| `/draft/:orderId` | **Draft review** | Line items with inline edit, **ambiguity chips at the top** ("What size? 6in / 8in / 10in"), fulfilment date picker, deposit toggle, total. Confirm is disabled while blocking ambiguities remain. |
| `/draft/:orderId/sent` | **Link ready** | The approval link, the drafted reply in an editable box, a large **Copy reply** button, Regenerate with tone chips, and "Open checkout" so judges can pay. |
| `/orders` | **Orders** | Grouped by status with live status pills. This is the screen the video holds on. |
| `/orders/:orderId` | **Order detail** | Payment-event timeline, nudge history, copy-nudge button. |
| `/catalogue` | **Catalogue** | Product grid, FAB → camera or multi-image picker. |
| `/catalogue/review` | **Catalogue review** | AI candidates as editable cards, swipe to discard, Save all. |

**Share flow.** `receive_sharing_intent` listens in `main.dart`. An incoming image or text pushes `/intake` pre-filled and fires the draft call immediately, landing on `/draft/:orderId`. On web the same screen is reached manually. Because the internal flow is identical, adding the iOS Share Extension later touches only `share_repository.dart` and the native target. All share plugin code is guarded with `kIsWeb` and conditional imports so it cannot break the web build.

**Loading.** The draft call takes 3–10s, so the draft screen shows a skeleton with the real stages ("reading the conversation", "matching your catalogue") instead of a spinner. Cheap to build and it reads well on video.

---

## 7. Tech choices and reasons

| Choice | Decision | Reason |
|---|---|---|
| **Database** | **Firebase — Firestore + Anonymous Auth** | Deciding factor: Supabase free projects **pause after a week of inactivity**, and judging happens after submission. Firestore's Spark plan does not pause. Beyond that: Flutter realtime listeners are best-in-class and the live Paid flip is the demo's money shot; anonymous auth is one line and matches instant-demo-seller; the Admin SDK covers the backend. Cost: no SQL for a genuinely relational model, acceptable at this scale. |
| **State management** | **Riverpod** | `StreamProvider` maps one-to-one onto Firestore snapshots, so the live-update feature is nearly free. Bloc's event/state ceremony costs days a solo builder does not have. |
| **AI access layer** | **Vercel AI SDK** (`ai` + `@ai-sdk/openai`), not the raw OpenAI SDK | `@paypal/agent-toolkit/ai-sdk` targets the AI SDK directly, so PayPal's tools drop into the nudge agent's tool list with no adapter. `generateObject` gives schema-validated structured output for the other four features. |
| **Validation** | **Zod**, shared between AI structured outputs and request bodies | One schema definition per shape, no drift. |
| **Data flow** | **Clients read Firestore directly; all writes go through the Node API** | Realtime comes free and stays reliable, while secrets, PayPal calls and every state transition stay server-side. The two rejected alternatives: client-writes (business logic leaks into security rules) and API-only with SSE (rebuilds realtime by hand, which is the one feature the video depends on). |
| **Hosting** | **Render, paid Starter instance** | Free tier spins down after 15 minutes, giving ~50s cold starts for judges *and* for webhook delivery. The $50 sponsor credits cover a paid instance for the whole event. |
| **Background work** | **Render Workflows** | Sponsor-eligible and genuinely the right tool for the hourly nudge sweep and the 10-minute reconciliation sweep. |
| **Build-time tooling** | **PayPal AI Toolkit plugin + APIMatic Context Plugin** | Both feed PayPal API context to the coding agent. APIMatic is also prize-eligible at zero product cost. |
| **Licence** | **MIT** | Recognisable, permissive, auto-detected by GitHub from a root `LICENSE`. |
| **Models** | Vision-capable OpenAI model, **id pinned in env** | Current model ids get verified in week 1 rather than hardcoded from memory, and env-pinning makes them swappable. |

---

## 8. Risks and unknowns, ranked by blocking severity

| # | Risk | Mitigation |
|---|---|---|
| 1 | **iOS Share Extension eats days** | Already descoped to a week-5 stretch. Android + web carry the demo. Cut without hesitation. |
| 2 | **PayPal sandbox webhook reliability** — the hardest dependency in the whole build | The 10-minute reconciliation sweep means the demo works with zero webhooks delivered. Verify event names in the Dashboard simulator in week 1. |
| 3 | **Render cold starts dropping webhooks** | Paid Starter via sponsor credits. Verify explicitly by delivering a webhook to a 20-minute-idle service. |
| 4 | **Raw-body signature verification** | Isolate the webhook route's body parsing. Write a fixture test against a captured real payload early in week 4. |
| 5 | **Vision accuracy on real DM screenshots** | Build the ambiguity path *first*, not last. A flagged unknown is a feature. Test against all 8 sample screenshots in week 3. |
| 6 | **OpenAI model id and structured-output behaviour** | Week-1 spike: confirm current vision-capable ids, run one structured-output call on a sample screenshot. Pin the id in env. |
| 7 | **GBP and deposit arithmetic** | Integer pence throughout, one `money.ts`, unit tested. The LLM never computes a total. |
| 8 | **Firestore rules locking out the backend or admitting client writes** | Emulator test both directions in week 1. |
| 9 | **Flutter web breaking on share/native plugins** | `kIsWeb` guards and conditional imports. Build web in week 1, not week 6. |
| 10 | **Submission crunch** | Hard internal deadline Wed 11 Nov, a full day before the wire. |

---

## 9. Task breakdown — six weeks, shift-sized chunks

Each bullet is intended to fit a 1–3 hour session.

### Week 1 (Oct 2–8) — Foundations and verification

- Move the Flutter scaffold into `app/`; run `flutter create --platforms=web .`
- Add MIT `LICENSE`, README skeleton, `.gitignore` review
- `git init`, create the public GitHub repo, first push
- Install `paypal@claude-plugins-official`; install the APIMatic Context Plugin
- PayPal sandbox: business account, buyer account, app credentials, register the webhook endpoint
- **Spike:** confirm the webhook event names the sandbox delivers; capture a real payload to a fixture
- **Spike:** confirm current OpenAI vision model id; run one structured-output call against a sample DM screenshot
- Scaffold `api/`: express + TS + Zod-validated env + `/health`
- Deploy `api/` to Render on a paid Starter instance; confirm no spin-down after 20 min idle
- Firebase project, Firestore, anonymous auth, `flutterfire configure`
- Write Firestore rules; emulator-test client read allowed and client write denied
- Attend the Oct 6 "Start building with PayPal" webinar and the Oct 7 APIMatic webinar
- Produce 8 fictional DM screenshots into `samples/dm-screenshots/`

### Week 2 (Oct 9–15) — Catalogue from photos

- `money.ts` plus unit tests
- `ai/schemas.ts`: all five Zod schemas, schema-first
- `ai/extract_catalogue.ts` and `POST /catalogue/extract`
- `POST /catalogue/products`, `PATCH`, `DELETE`
- Flutter: freezed models, Firestore converters, `catalogue_repository`, `StreamProvider`
- Catalogue screen and catalogue review screen
- `scripts/seed.ts` for the baker catalogue; `POST /session/bootstrap`

### Week 3 (Oct 16–22) — Share to order (the core; get it end to end)

- `ai/parse_dm.ts` plus `domain/match_catalogue.ts` with tests against all 8 sample screenshots
- `POST /orders/draft`, `POST /orders/:id/resolve`
- Draft review screen with ambiguity chips and inline editing
- `paypal/toolkit.ts` and `paypal/orders.ts` (create)
- `POST /orders/:id/confirm` returning a real approval link
- `ai/draft_reply.ts`, Link-ready screen, copy to clipboard, regenerate with tone
- **Gate: screenshot in → payable PayPal link out, working on the web build**

### Week 4 (Oct 23–29) — Orders that track themselves

- Webhook route with raw-body handling and signature verification, plus the fixture test
- Idempotent event storage (`webhookEvents` + `paymentEvents`)
- Capture call with `PayPal-Request-Id`; `domain/order_state.ts` transition guards
- `workers/reconcile.ts` + Render Workflow every 10 min
- Orders list and order detail with live status pills; **verify the Paid flip on screen**
- Android share intent via `receive_sharing_intent`
- Deposit support end to end

### Week 5 (Oct 30–Nov 5) — The agent, polish, buffer

- `workers/nudge_agent.ts`: hourly Render Workflow, invoice escalation, `send_invoice_reminder`
- `ai/draft_nudge.ts` and `POST /orders/:id/nudge`
- `ai/daily_summary.ts`, `GET /summary/today`, home summary card
- Edge cases: unmatched product, unclear quantity, cancelled, expired, declined capture
- UI polish pass: empty states, error states, loading stages
- **Stretch:** iOS Share Extension. Cut without hesitation if week 5 is already spent.

### Week 6 (Nov 6–11) — Ship

- Host the Flutter web build (Firebase Hosting or Render static)
- README: hosted URL on line one, local setup, sandbox buyer credentials, sample screenshots, architecture diagram
- `docs/tools-used.md` → the Devpost "tools used" answer
- Record and edit the demo video; upload to YouTube as public
- **Submit Tue 10 Nov.** Wed 11 Nov is contingency. The wire is Thu 12 Nov 22:00 UK.

---

## 10. Demo video outline (under 3 minutes)

| Time | Beat | Content |
|---|---|---|
| 0:00–0:20 | **Problem** | A real-looking DM thread on a phone. Voiceover: a Manchester home baker takes orders as messages, retypes them into notes, chases people for bank transfers. |
| 0:20–0:35 | **Who and why** | Name the audience: DM sellers — bakers, lash techs, small clothing brands. One line on why PayPal matters: buyer protection is what turns a stranger into a customer. |
| 0:35–1:05 | **Catalogue from photos** | Photograph two cakes; the AI returns names, prices and sizes; the seller taps save. Fast cuts. |
| 1:05–1:55 | **The core flow** | Share the DM screenshot into Sorted from the Android share sheet. Show the ambiguity chip ("buyer didn't say a size") and the seller tapping *8 inch* — **this is the beat that proves the AI isn't guessing**. Confirm → real PayPal checkout link → copy the drafted reply → paste into the chat. |
| 1:55–2:25 | **Paid, live** | Split screen: the buyer completes PayPal sandbox checkout on the left while the orders list flips from *Link sent* to *Paid* on the right, with no refresh. Hold on it. |
| 2:25–2:45 | **The agent** | An unpaid order: the nudge agent escalates it to a PayPal invoice and sends a reminder on its own. Then the daily summary card. |
| 2:45–3:00 | **Close** | One sentence on impact and what's next (per-seller PayPal onboarding, direct Instagram integration). Tagline: *from DM to paid*. |

**Criterion coverage.** *Technological implementation* — Orders v2, Invoicing, webhooks with signature verification, server-side capture, the agent toolkit, vision with structured output. *Design* — a complete product, not a test harness. *Potential impact* — a named audience and a named problem, with buyer protection as the specific mechanism. *Innovation* — the share sheet as the integration point, which sidesteps Meta API review entirely. *Presentation* — problem first, then the thing working end to end.

No third-party trademarks or copyrighted music. All DM conversations are fictional.

---

## 11. Judge experience checklist

- Hosted web URL on the first line of the README
- "Try a sample DM" button inside the app, loading from `samples/`
- Sandbox buyer email and password in the README
- Baker catalogue seeded on first load via `POST /session/bootstrap`
- `samples/dm-screenshots/` with 8 fictional conversations
- `docs/architecture.md` with a data-flow diagram
- Optional: public Postman collection of the Sorted API
- Optional: APK attached to a GitHub release

---

## 12. Non-goals

As the brief states: no WhatsApp or Instagram API integration (Meta business verification cannot happen in the timeline); single sandbox merchant, with per-seller PayPal onboarding as future work; UK only, GBP, UK English; no buyer-side app. The name "PayPal" appears nowhere in the product name or logo.

Added by this spec: no AG Grid or Bryntum dashboards (would need a second React frontend and cost the buffer week); no Elasticsearch (its 14-day trial deletes the project on expiry, and a 20-item catalogue does not need vector search); no multi-currency; no Zapier, KERNEL, Astropods or Channel3 integration.

---

## 13. Design system reconciliation (added 2026-10-04)

`docs/design/DESIGN.md` plus the fourteen screens in `docs/design/screens/` are now the **visual source of truth**. The screens are references to rebuild as Flutter widgets, not code to port. Where this spec and the design disagree on layout, copy or colour, the design wins. Where they disagree on behaviour, this section records the resolution.

### Decisions taken

| Question | Decision |
|---|---|
| Onboarding (`Main` → `Setup` → `Connect`) vs "instant demo seller" | **Keep all three, with Skip on each.** They carry the buyer-protection pitch and the "How Sorted works" explainer, which earn marks on Potential Impact. Anonymous auth still happens on launch, so Skip lands on a working seeded Home. |
| What "Connect PayPal" does | **No OAuth.** The button attaches the seller to the shared sandbox merchant and the small print says so honestly: this demo uses a shared sandbox merchant, and per-seller onboarding through PayPal Partner is next. Promising a sign-in that does not exist would cost more on Technological Implementation than the screen gains. |
| Fifth tab (`Settings`, no design file) | **Build a minimal Settings screen.** Shop name, the tone sample that feeds reply drafting, shared-sandbox-merchant info, and links to the repo and licence. The tone field is genuinely wired to the AI rather than decorative. |
| PayPal's palette (`#001C64`, `#0070E0`) | **Keep.** The rules forbid the name in the product name and logo, not the colours, and DESIGN.md already rules out the logo and imitation PayPal buttons. |

### Model and feature changes the design implies

1. **Product-level deposit.** `Catalogue.dc.html` shows "Custom celebration cake — £20 deposit to book, from £55". Add `depositMinor: int | null` to the product model as the default deposit for that item. The order's own `depositMinor` still wins when set.
2. **Order timeline is derived, not stored.** `Paid.dc.html` shows four entries: "Read from Jess's screenshot", "Checkout link sent", "Jess paid with PayPal", "Payment received". The first two come from `createdAt` and `linkSentAt`; the last two from `paymentEvents`. No new collection needed.
3. **Thank-you message is a sixth AI output.** `Paid.dc.html` has "Copy thank-you message". Implement as a `mode` parameter on reply drafting (5.3) rather than a separate prompt file.
4. **Nudge snooze.** `Nudge.dc.html` has "Remind me tomorrow". Add `nudge.snoozedUntil: Timestamp | null`; the hourly sweep skips orders whose snooze has not elapsed.
5. **Processing is its own screen.** `Reading.dc.html` replaces this spec's inline "staged skeleton" with a dedicated route showing a ticking checklist. Better than what §6 described; adopt it.

### Demo data

The screens' numbers only reproduce if the seeded catalogue matches them. The seller is **Ola's Bakehouse**; the seeded catalogue is exactly these five products:

| Product | Base | Variants | Notes |
|---|---|---|---|
| Lemon drizzle cake | £32.00 | 8 inch +£0, 10 inch +£10 | |
| Red velvet cake | £36.00 | 8 inch +£0 | |
| Brownie box | £14.00 | Box of 6 +£0, Box of 12 +£12 | |
| Cinnamon buns | £12.00 | Box of 4 +£0 | |
| Custom celebration cake | £55.00 | Vanilla +£0, Chocolate +£0, Red velvet +£4 | `depositMinor` £20.00 |

Demo buyers across the screens are Jess M (`jess.mcr`), Ade O, Priya K and Tom H. The canonical demo order is Jess: lemon drizzle 10 inch (£42) plus brownie box of 6 (£14) = **£56.00**, collection Sat 10 Oct 2pm. Keep all of it as seed data, never hardcoded in widgets.

### Screen distribution across the six plans

| Plan | Screens |
|---|---|
| 1 — Foundations | none; design tokens as `ThemeData` + `ThemeExtension` |
| 2 — Catalogue | `Snap`, `Review`, `Catalogue` (+ the shared components these need first) |
| 3 — Share to order | `Reading`, `Draft`, `Reply` |
| 4 — Orders | `Orders`, `Paid` (incl. the Sorted stamp animation) |
| 5 — Agent and polish | `Nudge`, `Main`, `Setup`, `Connect`, `Settings` |
| 6 — Ship | none |

Per DESIGN.md, build the shared widgets (PrimaryButton, StatusChip, SelectableChip, SegmentedControl, WarningCard, OrderSlip, SortedStamp, MessageBubble, TabBar) as each plan's screens first need them, rather than speculatively up front.
