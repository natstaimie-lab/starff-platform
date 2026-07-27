# Starff Platform

The connected software platform for **Starff**, a temporary recruitment agency.

The public marketing website (`starff.co.uk`, WordPress + Elementor) **stays as-is**.
This repository is the *product* behind it: **one backend, one database, one API**
that powers the Admin dashboard, Candidate portal, Client portal, and Mobile app.

```
                        ┌─────────────────────────────┐
                        │        ONE SHARED API        │
                        │        (NestJS, /apps/api)   │
                        └──────────────┬──────────────┘
                                       │
                        ┌──────────────▼──────────────┐
                        │   ONE SHARED DATABASE        │
                        │   PostgreSQL (Supabase)      │
                        └─────────────────────────────┘
        ▲            ▲            ▲            ▲            ▲
        │            │            │            │            │
   Admin        Candidate      Client       Mobile     WordPress
  dashboard      portal        portal        app         forms
 (Next.js)      (Next.js)     (Next.js)     (Expo)    (starff.co.uk)
```

---

## The controlled hybrid recruitment workflow

Starff admin stays the decision-maker at every gate. A job moves through a
controlled pipeline, fully audited, with candidates and clients each seeing only
what they need:

```
Client submits job ─▶ SUBMITTED ─▶ Admin review ─▶ APPROVED / RECRUITING
   (reject / request-info ↺)                              │
                              Matching: recommendations + scores + reasons
                                                          │  admin invites
Candidates ◀── INVITED ─────────────────────────────────┘
   ├─ INTERESTED ─▶ admin submits ─▶ SUBMITTED_TO_CLIENT ─▶ Client decision
   │                                    CLIENT_ACCEPTED ◀───────┤
   │                        (rejected / alternative ↺ re-invite)│
   └────────────── Admin confirms ─▶ BOOKED (Shift created, availability blocked)
                                       │ → PARTIALLY_FILLED / FILLED
                    cancel / no-show ─▶ REPLACED ↺ (history kept, re-recruit)
```

Principles: admin-in-control, everything audited, protected characteristics never
scored, and client-facing profiles are **PII-redacted** (first name + reference only,
never surname, address, ID/RTW docs, NI/bank, or medical).

## What's built

**Admin dashboard** (`apps/admin`)
- Live KPIs, activity trend, and compliance ring — all from the database
- A clickable **6-stage recruitment pipeline** funnel; each stage deep-links to the filtered bookings list
- Job review & approval, edit/amend, request-more-info
- Candidate **recommendations** with match scores, human-readable reasons, and missing-requirement flags (deterministic scorer; optional AI re-rank when `ANTHROPIC_API_KEY` is set)
- Invite → response → submit-to-client → confirm-booking → replacement flow
- **Reliability monitoring** (concern levels, never auto-suspends) and operational alerts
- Timesheet approvals, compliance overview

**Candidate portal** (`apps/candidate`) & **Mobile app** (`apps/mobile`)
- Register, upload compliance documents, set weekly availability
- Shift offers with respond (interested / unavailable / decline)
- **My Bookings** with full shift detail — address (with maps link), reporting instructions, PPE, uniform, breaks
- Check-in / check-out, "running late", timesheets
- Compliance card reconciled to the admin's authoritative clearance status

**Client portal** (`apps/client`)
- Post a staffing request (one-off **or recurring/ongoing** shifts)
- **Respond & edit** a request that admin sent back for more info
- Review submitted candidates (redacted) → accept / reject / request alternative
- **Assigned workers** with a per-worker profile popup (redacted profile + timesheet/attendance summary)
- Approve timesheets, view invoices

**Recurring / ongoing shifts** — a job can repeat on chosen weekdays over a date range;
booking a worker generates **one Shift per occurrence**, each with its own check-in,
timesheet, and attendance tracking.

## Tech stack

One language end-to-end (**TypeScript**).

| Layer | Choice |
|-------|--------|
| Database | PostgreSQL on **Supabase** |
| Auth | **Supabase Auth** (JWT, roles) |
| File storage | Supabase Storage (private buckets for RTW / DBS / CVs) |
| ORM / schema | **Prisma** (`database/prisma/schema.prisma`) |
| API | **NestJS** (`apps/api`), versioned at `/api/v1`, role-guarded |
| Web portals | **Next.js** (Admin, Candidate, Client) |
| Mobile app | **Expo / React Native** |
| Monorepo | **npm workspaces** |

## Repo layout

```
starff-platform/
├── apps/
│   ├── api/         NestJS — the one shared API  (:3001, /api/v1)
│   ├── admin/       Next.js — admin dashboard    (:3000)
│   ├── candidate/   Next.js — candidate portal   (:3002)
│   ├── client/      Next.js — client portal      (:3003)
│   └── mobile/      Expo — mobile app            (Metro :8081)
├── packages/        shared UI tokens + TypeScript types
├── database/prisma/ schema.prisma  ← the database
├── scripts/         seed / storage / admin helpers
└── docs/            build plans & setup guides
```

---

## Getting started

### Prerequisites
- **Node.js** 20+
- A **Supabase** project (free tier is fine) — gives you the Postgres database, Auth, and Storage

### 1. Install
```bash
npm install
```

### 2. Configure environment
Copy the example env files where they exist, and create the web-app ones:
```bash
cp .env.example .env                        # root: DB + Supabase server keys
cp apps/mobile/.env.example apps/mobile/.env
```
Then create a `.env.local` in **each** web app (`apps/admin`, `apps/candidate`, `apps/client`) with:
```
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```
- Root `.env` holds `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and service keys.

> `.env*` files are git-ignored and must never be committed.

### 3. Set up the database
```bash
npm run db:push        # apply the Prisma schema to your database
npm run db:generate    # generate the Prisma client
npm run seed           # optional: demo clients, candidates, jobs
npm run promote-admin -- you@example.com   # give your login the ADMIN role
```

### 4. Run
Each app runs from its own workspace:
```bash
npm run dev --workspace @starff/api          # API      → http://localhost:3001
npm run dev --workspace @starff/admin        # Admin    → http://localhost:3000
npm run dev --workspace @starff/candidate    # Candidate→ http://localhost:3002
npm run dev --workspace @starff/client       # Client   → http://localhost:3003
npm run dev --workspace @starff/mobile       # Mobile   → Expo (Metro :8081)
```
Sign in at each portal with a Supabase Auth user that has the matching role.

## Handy scripts

| Command | What it does |
|---------|--------------|
| `npm run db:push` | Sync `schema.prisma` to the database (non-destructive) |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:studio` | Open Prisma Studio to browse data |
| `npm run seed` | Seed demo data |
| `npm run promote-admin -- <email>` | Grant a user the ADMIN role |

## Notes

- On the Supabase **free tier**, a project auto-pauses after ~7 days idle — if logins
  suddenly fail everywhere, resume the project from the Supabase dashboard.
- The API and its optional-AI features run fine **without** an `ANTHROPIC_API_KEY`;
  matching falls back to the deterministic scorer.
