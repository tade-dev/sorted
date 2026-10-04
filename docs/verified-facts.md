# Verified facts

Confirmed against live systems, not assumed. Re-verify if something fails in a
way that contradicts this.

## Deployment

- **API (live):** https://sorted-api-a4zo.onrender.com
- Render service `sorted-api`, free plan, blueprint-managed from `api/render.yaml`
- Verified 2026-10-04: `/v1/health` → `{"ok":true,"version":"1.0.0","paypalEnv":"sandbox","webhookFailures":0}` in 0.74s
- Verified in production: unknown route returns the spec error shape; `/v1/session/bootstrap`
  returns 401 UNAUTHENTICATED with no token and with a bad token, never 500, and
  never echoes the auth provider's message
- **Free plan sleeps after 15 min.** Upgrade to `starter` before week 4 — webhook
  delivery and the hourly nudge sweep both break on a sleeping service.
- `NODE_ENV=production` makes `npm ci` skip devDependencies, so the build command
  must keep `--include=dev` or `tsc` is missing.

## Firebase

- Project: **`sorted-7b9b7`** (account `tadedev22@gmail.com`)
- Firestore: NOT YET PROVISIONED — the Firestore API is disabled on the project
- Anonymous auth: NOT YET ENABLED
- Rules written and proven against the emulator (8 tests); not yet deployed live
- **Emulator needs JDK 21+.** firebase-tools 15+ refuses older Java and reads
  `java` from PATH, not `JAVA_HOME`. Use `npm run emulators` (wraps
  `scripts/emulators.sh`, which finds a 21+ JDK via `/usr/libexec/java_home`).
- The emulator deliberately runs against `--project demo-sorted`, never the real
  project: the suite wipes the `sellers` collection between tests.

## PayPal

- Sandbox business/buyer accounts: TBC
- Webhook id: not yet created (needs the live URL above)

## OpenAI

- API key: held by the operator, in `api/.env`
- `OPENAI_VISION_MODEL`: NOT YET PINNED — currently the placeholder `pending`

## Still unverified

- Whether `region: frankfurt` in `api/render.yaml` actually applied, or Render
  defaulted the free plan to a US region
- Whether `samples/seed-catalogue.json` resolves on Render, where `rootDir: api`
  but the seed path points at the repo root. Surfaces as a 500 on
  `/v1/session/bootstrap` if wrong.
