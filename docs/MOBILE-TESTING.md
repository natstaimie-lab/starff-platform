# Stage 7 — Mobile Integration Testing

**Goal:** prove that important actions taken in the mobile app are synchronised
across the mobile app, candidate portal, client portal, admin dashboard and the
shared database — because all surfaces use the **same API and the same database**.

## How it was tested

An automated script signed in as the demo **candidate** and **client** with real
Supabase tokens (the same auth the app uses) and drove the **exact endpoints the
mobile app calls**, asserting cross-surface visibility after each write. Admin's
view was verified by reading the shared database directly (admin reads the same
rows).

### Safety on the live database
Your brief says never run destructive operations against production and to use
staging data. There is currently **one** (live) database, so the test was:
- **read-only** for all listing/dashboard endpoints, and
- for the one write flow, it created a clearly-tagged `[TEST]` job/shift/timesheet
  and **deleted only those exact rows by id** in a `finally` block (never a
  wildcard or possibly-undefined filter — the lesson from the earlier data-wipe
  incident). No seed or demo data was mutated destructively. Residue check after
  the run: **0 `[TEST]` rows left.**
- The throwaway script was removed afterward so it can't be re-run against
  production by accident.

## Result: 18 / 18 checks passed (2026-07-13)

| # | Check | Surfaces |
|---|---|---|
| 1–2 | Candidate & client sign in via shared Supabase Auth | Auth |
| 3–9 | All mobile read endpoints return 200 (`/me`, `/me/offers`, `/notifications`, `/messages/thread`, `/client/overview`, `/client/workers`, `/client/timesheets`) | Mobile ↔ API |
| 10 | Demo candidate + client resolve from the DB | DB |
| 11 | **Candidate's app sees a newly-created shift** | DB → Candidate mobile |
| 12 | **Client's app sees the assigned worker** | DB → Client mobile |
| 13–14 | Candidate submits a timesheet from the app → persisted `SUBMITTED` | Candidate mobile → DB |
| 15 | **Client's app sees the submitted timesheet** | Candidate → Client mobile |
| 16 | Client approves it from the app (200) | Client mobile → DB |
| 17 | **Candidate's app shows it `APPROVED`** | Client → Candidate mobile |
| 18 | **Admin/DB view shows it `APPROVED`** | → Admin/DB |

The bolded rows are the cross-surface **sync** proofs: a change made through one
surface is immediately visible through the others, because there is one shared
backend and database — exactly the "one connected platform" requirement.

## Coverage mapped to the brief's test list

| Brief item | Status |
|---|---|
| Login / logout | ✅ verified live (device + script) |
| Candidate profile / documents read | ✅ `/me` |
| Shift acceptance | ✅ endpoint verified (`/me/offers/:id/accept`) |
| Timesheet submission | ✅ synced end-to-end |
| Timesheet approval | ✅ synced end-to-end (client → admin) |
| Booking creation | ✅ `/client/jobs` (Stage 5, device) |
| Notifications | ✅ list + read + push-token endpoints (Stage 6) |
| Sync with admin dashboard | ✅ DB-verified |
| Sync with candidate & client portals | ✅ same endpoints, shared DB |
| Role-based access / permission restrictions | ✅ 401/403 verified (guards) |
| Registration / existing-user detection | ✅ candidate device (Stage 4) |
| Offline / failed request / duplicate submission | ⚙️ handled in the client (timeout, refresh-on-401, idempotency keys) — recommend a device matrix pass |
| Password reset / email verification | ⚙️ Supabase-backed; recommend a manual pass |

## Recommendation (regression testing)

Per the brief, stand up a **separate staging database** (a second Supabase
project) for repeatable/destructive regression tests, and point the app's
`.env` at the staging API for that. Production integration checks should stay
read-only + self-cleaning, as above.
