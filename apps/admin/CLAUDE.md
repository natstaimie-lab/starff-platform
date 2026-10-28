# CLAUDE.md — `apps/admin` (admin dashboard)

Next.js 14 App Router + Tailwind. Used by Starff staff (ADMIN, RECRUITER). This
is the control surface for the whole platform — admin approves, invites, submits
and confirms at every gate. Read the root `CLAUDE.md` first.

## Run

```bash
npm run dev --workspace @starff/admin     # → http://localhost:3000
```

Needs the API running on :3001. `.env.local` (git-ignored):

```
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

Admins don't self-register. Create the user in Supabase → Authentication → Users
(tick Auto Confirm), then `npm run promote-admin -- you@starff.co.uk` from the
repo root.

## Structure

```
src/app/
  login/  forgot-password/  reset-password/
  dashboard/
    ai/ bookings/ candidates/ clients/ compliance/ enquiries/ invoices/
    messages/ payroll/ settings/ shifts/ staff/ timesheets/ workers/
src/components/     shared UI
src/lib/api.ts      apiFetch — attaches the Supabase token, refreshes once on 401
src/lib/supabaseClient.ts
src/lib/useRole.ts  role resolution for gating UI
design-reference/   AdminDashboard.dc.html — visual source of truth
```

Every route under `dashboard/` is staff-only. Guard on the server where you can;
`useRole` gates UI, it is not a security boundary — the API is.

## Rules

- Call the API through `apiFetch` from `src/lib/api.ts`. Don't call `fetch`
  directly and don't create a second Supabase client.
- Admin sees **unredacted** candidate data — this is the one surface that does.
  Never copy an admin component into the client portal without stripping PII.
- Nothing here should auto-decide. Invite, submit-to-client, confirm-booking and
  replacement are all explicit admin actions, and each one should be auditable.
- Reliability monitoring reports concern levels; it **never** auto-suspends a
  worker.
- Recommendations show the match score, the human-readable reasons, and the
  missing requirements. Don't surface a bare number without its reasons.

## Pipeline

The dashboard funnel mirrors the job lifecycle — `SUBMITTED` → `APPROVED` /
`RECRUITING` → `INVITED` → `INTERESTED` → `SUBMITTED_TO_CLIENT` →
`CLIENT_ACCEPTED` → `BOOKED` → `PARTIALLY_FILLED` / `FILLED`, with `REPLACED` on
cancel or no-show (history kept, re-recruit). Each stage deep-links to the
filtered bookings list. Keep new stage names consistent with the Prisma enums
rather than inventing display-only states.

Enquiries arriving from the WordPress forms land in `dashboard/enquiries/` and
are converted to a Candidate or Client from there.
