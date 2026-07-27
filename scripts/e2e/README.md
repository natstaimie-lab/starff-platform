# End-to-end API tests

These exercise the **real running API** over HTTP with real Supabase-auth tokens
for each role (admin / recruiter / client / candidate), assert the results
against the database, and clean up everything they create. They are the
regression suite for the controlled recruitment workflow.

## Running

1. Start the API (and make sure the Supabase project is active):
   ```bash
   npm run dev --workspace @starff/api
   ```
2. In another terminal, from the repo root:
   ```bash
   npm run test:e2e
   ```
   (equivalently: `node --env-file=.env scripts/e2e/run.mjs`)

Exit code is `0` when every check passes, `1` otherwise.

## Requirements (from the root `.env`)

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` — the suite
  mints temporary auth users via the service role, then signs in as them.
- `WORDPRESS_WEBHOOK_SECRET` — for the public enquiry webhook test.
- `API_PORT` (optional, defaults to 3001).

## What's covered

| Flow | Asserts |
|------|---------|
| **Booking** | one-off → 1 shift; fixed-range recurring → bounded shift set; open-ended → rolling horizon; `extend-recurring` rolls open-ended forward and is rejected for fixed-range |
| **Replacement** | book → replace (shift kept as `CANCELLED` history, application `REPLACED`, vacancy re-opens) → book an alternative into the freed slot |
| **Client submissions** | admin submit-to-client → client sees **PII-redacted** candidates → accept/reject → decision locked once booked (403) |
| **Invitation → response** | admin invite → candidate sees it → responds INTERESTED; bogus id → 404 |
| **Timesheet** | candidate submit (hours auto-computed) → client approve → admin reject; bogus shift → 404 |
| **Operational alerts** | all six derived signals fire: running late, reported absent, not acknowledged, no check-in, timesheet outstanding, doc expiring |
| **Reliability** | incident → HIGH concern → candidate appeal (disputed stops counting → WATCH) → admin resolve; never auto-suspends |
| **WordPress webhook** | shared-secret gate (missing/wrong → 401), accepts with secret → NEW enquiry, list is login-only, convert → Candidate + `CONVERTED` |

## Safety

Every test is isolated: it creates its own temp company / job / candidate /
shifts / auth users, and deletes them (and the Supabase auth users) in a
`finally` block via `cleanup()` in [`helpers.mjs`](helpers.mjs). No secrets are
hard-coded — everything comes from `.env`.
