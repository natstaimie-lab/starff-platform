# CLAUDE.md — `apps/candidate` (candidate portal)

Next.js 14 App Router + Tailwind. Used by temp workers. Web counterpart of the
candidate side of `apps/mobile` — the two hit the same `/me` endpoints and should
stay behaviourally consistent. Read the root `CLAUDE.md` first.

## Run

```bash
npm run dev --workspace @starff/candidate     # → http://localhost:3002
```

Needs the API on :3001. `.env.local` (git-ignored) with `NEXT_PUBLIC_API_URL`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Structure

```
src/app/
  register/  login/  forgot-password/  reset-password/
  dashboard/
    availability/ bookings/ compliance/ declarations/ documents/ help/
    messages/ offers/ onboarding/ payments/ profile/ settings/ timesheets/
    work-history/
src/lib/api.ts          apiFetch — token + refresh-on-401
src/lib/compliance.ts   compliance state derived from the candidate's documents
src/lib/supabaseClient.ts
```

## Rules

- A candidate sees **only their own** record. Every call goes to `/me/*`; never
  fetch by an arbitrary candidate id.
- Registration is self-service: Supabase `signUp` then `POST /candidates`, which
  is idempotent and deliberately has no role guard. Re-running it must not
  create a second profile.
- Documents (Right to Work, DBS, CV, certificates) upload to the private
  Supabase Storage bucket `candidate-documents`, then `POST /me/documents`.
  Never put a document URL somewhere public — use signed URLs.
- **Compliance status is read-only here.** Admin's verification decision is
  authoritative; `compliance.ts` reconciles the display to it. The portal must
  never let a candidate mark their own document verified.
- Availability is sent to `PUT /me/availability` as `{ days }` — not `{ slots }`.
  This has bitten the mobile app before.
- Offers: `GET /me/offers`, `POST /me/offers/:id/accept`. Responding interested
  is not a booking — admin still confirms.
- A booked recurring job produces one Shift per occurrence, each with its own
  check-in, timesheet and attendance. Don't collapse them in the UI.
- Shift detail shows address (with maps link), reporting instructions, PPE,
  uniform and breaks. Keep those fields when reworking the view.
