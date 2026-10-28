# CLAUDE.md — `apps/client` (client portal)

Next.js 14 App Router + Tailwind. Used by hiring companies. **The PII boundary of
the platform lives here.** Read the root `CLAUDE.md` first.

## Run

```bash
npm run dev --workspace @starff/client     # → http://localhost:3003
```

Needs the API on :3001. `.env.local` (git-ignored) with `NEXT_PUBLIC_API_URL`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Structure

```
src/app/
  login/  forgot-password/  reset-password/
  dashboard/
    book/ bookings/ company/ help/ invoices/ locations/ messages/
    onboarding/ reports/ settings/ submissions/ timesheets/ workers/
src/lib/api.ts, src/lib/supabaseClient.ts
```

All data comes from `/client/*` endpoints, scoped server-side to the signed-in
contact's company.

## Redaction — the rule that matters

A client sees a candidate as **first name + reference only**. Never surname,
address, date of birth, ID or Right-to-Work documents, DBS detail, National
Insurance, bank details, or anything medical.

This holds in the worker profile popup, the submissions list, assigned-workers
views, timesheet rows, reports and any export. If a new view needs a field,
check it against that list before adding it — and if the API returns more than
the view needs, that's an API scoping bug worth fixing rather than hiding in the
UI.

## Rules

- A client sees only their own company's data. Scope by the signed-in contact,
  never by a path parameter alone.
- Login is a `ClientContact` linked to a `User` with the CLIENT role. Employer
  self-signup provisions the company via `POST /client/register-company`
  (idempotent).
- Posting a request (`dashboard/book/`) supports one-off **and** recurring or
  ongoing shifts — chosen weekdays over a date range. Booking then generates one
  Shift per occurrence.
- A request admin sends back for more info is edited and resubmitted from the
  portal; keep that path working when changing the booking form.
- On submitted candidates the client can accept, reject, or request an
  alternative. A client action is never the final booking — admin confirms.
- Timesheet approval here flips status everywhere (same database). Make the
  consequence visible in the UI.
