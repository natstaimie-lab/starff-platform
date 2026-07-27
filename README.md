# Starff Platform

The connected software platform for **Starff**, a temporary recruitment agency.

The public marketing website (`starff.co.uk`, WordPress + Elementor) **stays as-is**.
This repository is the *product* behind it: one backend, one database, one API that
powers the Admin dashboard, Candidate portal, Client portal, Mobile app, and the
WordPress forms.

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

## 1. Build plan — designs → working software

Six stages, smallest useful thing first. Each stage ends with something you can test.

| Stage | What you build | Why it's first / why here |
|-------|----------------|---------------------------|
| **0. Foundation** *(this stage)* | Repo structure, database schema, accounts | Nothing works without a place to store data. |
| **1. Database + API core** | Run the DB, generate the API, auth + roles, a few core endpoints | Every screen reads/writes through this. Build it once. |
| **2. Admin dashboard** | The screen *you* use: candidates, clients, jobs, shifts, timesheets | You are the first user. If admin works, the data model is right. |
| **3. Candidate portal** | Register, upload documents, see & accept shifts, submit timesheets | Highest-volume users. Feeds admin with real data. |
| **4. Client portal** | Post jobs, view booked workers, approve timesheets, see invoices | Turns clients into self-service; approvals unblock invoicing. |
| **5. WordPress integration** | Existing forms POST into the API as Enquiries/Applications | Connects the live site to the platform without rebuilding it. |
| **6. Mobile app** | Candidate-focused: shifts, clock in/out, timesheets, push | Last, because it reuses the same API the portals proved out. |

**Golden rule:** the API is built once and never duplicated. Every portal and the app
are just *different screens over the same API*.

## 2. Tech stack

One language end-to-end (**TypeScript**) so you only ever learn one.

| Layer | Choice | Why (for a beginner) |
|-------|--------|----------------------|
| Language | **TypeScript** | One language for backend, web, and mobile. |
| Database | **PostgreSQL on Supabase** | Managed — no server to run. Free tier to start. |
| Auth | **Supabase Auth** | Login, passwords, password reset, roles — built in. Don't build your own. |
| File storage | **Supabase Storage** | Private buckets for RTW / DBS / CVs. Exactly what compliance docs need. |
| ORM / schema | **Prisma** | Define tables in one file (`schema.prisma`), get type-safe DB access. |
| API | **NestJS** (`apps/api`) | Opinionated structure with guardrails — good when you're learning. |
| Web portals | **Next.js + Tailwind CSS** | Admin, Candidate, Client. React-based, huge community. |
| Mobile app | **Expo (React Native)** | Reuses your React knowledge; one codebase for iOS + Android. |
| Shared code | `packages/ui`, `packages/types` | Brand tokens + shared TypeScript types used everywhere. |
| Monorepo | **npm workspaces** | All apps in one repo, share code, one `git` history. |

> These are recommendations, not locks. The big one you *can't* cheaply reverse later
> is Supabase vs. a fully-custom backend — we're choosing Supabase because it removes
> the most work (auth + storage + hosted DB) while you're learning. Everything else
> can change per-app.

## 3. Database tables

Full schema lives in [`database/prisma/schema.prisma`](database/prisma/schema.prisma).
Summary of the tables:

- **User** — mirrors the login account; holds role (ADMIN / RECRUITER / CANDIDATE / CLIENT)
- **Candidate** — temp worker profile · **CandidateDocument** (RTW/DBS/CV) · **Availability**
- **Skill** + **CandidateSkill** / **JobSkill** — shared skills taxonomy
- **Client** — hiring company · **ClientContact** (portal login) · **ClientSite** (locations)
- **Job** — a vacancy/assignment with pay & charge rates
- **Application** — a candidate applying to a job
- **Shift** — the core unit of temp work (date, times, assigned candidate)
- **Timesheet** — hours worked → submitted → approved → invoiced/paid
- **Invoice** + **InvoiceLine** — billing the client
- **Enquiry** — raw submissions from the WordPress forms
- **Notification** · **AuditLog** — messages to users, and a record of who did what

## 4. Backend / API structure

NestJS organised by **feature module** — one folder per area, each with a controller
(the URLs), a service (the logic), and DTOs (the input shapes):

```
apps/api/src/
  auth/          login, roles, guards (uses Supabase JWTs)
  users/
  candidates/    + documents/ (upload to Supabase Storage)
  clients/       + contacts, sites
  jobs/          + applications
  shifts/        assign, confirm, cancel
  timesheets/    submit, approve, reject
  invoices/
  enquiries/     public endpoint the WordPress forms POST to
  notifications/
  prisma/        the shared DB client
  common/        guards, decorators, error handling
```

API is **versioned** (`/api/v1/...`) and every route is protected by a role guard
except the public `enquiries` webhook and the auth routes.

## 5–8. Portal & app build plans

Each portal is the same recipe: log in → land on a dashboard → a few list screens →
detail/edit screens. Detailed step lists live in [`docs/`](docs/):

- **Admin** ([docs/ADMIN.md](docs/ADMIN.md)) — candidates, clients, jobs, shift scheduler, timesheet approvals, invoices
- **Candidate portal** ([docs/CANDIDATE.md](docs/CANDIDATE.md)) — register, documents, available shifts, my shifts, timesheets, profile
- **Client portal** ([docs/CLIENT.md](docs/CLIENT.md)) — post a job, my jobs, booked workers, approve timesheets, invoices
- **Mobile app** ([docs/MOBILE.md](docs/MOBILE.md)) — candidate shifts, clock in/out, timesheets, push notifications

## 9. WordPress integration

The live site is **not** rebuilt. Instead:

1. The three Contact Form 7 forms (Contact / Post-a-Job / Register) get a **webhook**
   that POSTs each submission to `POST /api/v1/enquiries`.
2. The API stores them as **Enquiry** rows → they appear in the Admin dashboard.
3. "Register" enquiries can be promoted to real **Candidate** accounts from Admin.
4. Later: a "Login to portal" button on the site links to the Candidate/Client portals.

See [docs/WORDPRESS.md](docs/WORDPRESS.md).

## 10. Beginner setup

Step-by-step in [docs/SETUP.md](docs/SETUP.md). High level:
install Node → create a Supabase project → set `.env` → run the database migration →
start the API → start one portal.

## 11. What to build first

**Stage 1 only:** the database + the API core + auth. Then a minimal Admin dashboard
that lists candidates and lets you add one. Prove the whole loop end-to-end with *one*
feature before widening.

## 12. What NOT to build yet

Invoicing automation, payroll/RTI, the mobile app, in-app messaging, AI matching,
analytics dashboards, multi-currency, and SMS. They're in the schema so you don't have
to migrate later — but **don't build screens for them until Stages 2–4 work.**

## 13. How to test each stage

- **DB:** open Supabase Table Editor / Prisma Studio — do the tables exist?
- **API:** hit each endpoint from its built-in Swagger docs (`/api/docs`).
- **Portals:** click the real flow as a real user (register → upload → accept shift).
- **WordPress:** submit the live form → confirm an Enquiry row appears.
- **Each stage** gets a short manual test checklist in its `docs/` file before moving on.

---

## Repo layout

```
starff-platform/
├── apps/
│   ├── api/         NestJS — the one shared API
│   ├── admin/       Next.js — admin dashboard
│   ├── candidate/   Next.js — candidate portal
│   ├── client/      Next.js — client portal
│   └── mobile/      Expo — mobile app
├── packages/
│   ├── ui/          shared brand tokens + components
│   └── types/       shared TypeScript types
├── database/
│   └── prisma/      schema.prisma  ← the database
└── docs/            build plans & setup guides
```

Brand tokens (navy `#0F172A`, electric blue `#2563EB`, safety orange `#F97316`) live in
`packages/ui` so every app looks like the WordPress site.
