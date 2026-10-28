# CLAUDE.md — Starff Platform

Monorepo for **Starff**, a UK temporary recruitment agency. One backend, one
database, one API powering four clients. The marketing site (`starff.co.uk`,
WordPress + Elementor) is **not** in this repo and is not rebuilt.

Per-app instructions live in `apps/*/CLAUDE.md` — read the one for the app you
are touching. This file covers only what is true across the whole repo.

## Non-negotiables

- **One backend.** Never add a second database, a parallel auth system, or an
  app-specific backend. Every client goes through `apps/api` (`/api/v1`) and the
  shared Supabase Postgres project.
- **Admin is the decision-maker.** Candidates are invited, submitted and booked
  by admin. No flow may auto-book, auto-suspend, or bypass an admin gate.
- **Client-facing candidate data is PII-redacted.** Clients see first name +
  reference only — never surname, address, ID/RTW documents, NI, bank details or
  anything medical.
- **Protected characteristics are never scored** in matching.
- **`.env*` files are git-ignored and must never be committed.** Never print a
  service key, database URL or secret into chat, a commit, or a file.
- **There is one live database.** Treat it as production: no destructive
  operations, no wildcard deletes. Test writes must be tagged and deleted by
  exact id in a `finally` block. See `docs/MOBILE-TESTING.md` for the pattern.
- **Schema changes are additive.** Adding a table or nullable column is fine;
  renaming or dropping existing columns is not, without being asked.

## Layout

```
apps/api/         NestJS — the one shared API      :3001  /api/v1  docs at /api/docs
apps/admin/       Next.js — admin dashboard        :3000
apps/candidate/   Next.js — candidate portal       :3002
apps/client/      Next.js — client portal          :3003
apps/mobile/      Expo/React Native — mobile app   Metro :8081  (NOT an npm workspace)
packages/ui/      shared design tokens
packages/types/   shared TypeScript types
database/prisma/  schema.prisma — the single source of truth for the data model
scripts/          seed / storage / admin helpers, plus scripts/e2e
docs/             build plans and setup guides (background, not instructions)
```

`apps/mobile` is deliberately **outside** the root `workspaces` array — it runs
React 19 / RN 0.86 and cannot share the portals' React 18. Install inside
`apps/mobile` itself.

## Commands

Run from the repo root:

```bash
npm install
npm run db:push                     # apply schema.prisma (non-destructive)
npm run db:generate                 # regenerate the Prisma client
npm run db:studio                   # browse data
npm run seed                        # demo clients, candidates, jobs
npm run promote-admin -- <email>    # grant a user the ADMIN role
npm run test:e2e                    # scripts/e2e/run.mjs

npm run dev --workspace @starff/api          # :3001
npm run dev --workspace @starff/admin        # :3000
npm run dev --workspace @starff/candidate    # :3002
npm run dev --workspace @starff/client       # :3003
```

Mobile runs from `apps/mobile` (`npx expo start`), not via a workspace flag.

Nothing in this repo has a lint or unit-test script wired up. Typecheck what you
can: the portals via `npx tsc --noEmit` in the app folder, mobile via
`npm run typecheck`.

## Stack

TypeScript end to end. PostgreSQL + Auth + Storage on **Supabase**; **Prisma**
for schema and queries; **NestJS** for the API; **Next.js 14 App Router** +
Tailwind for the three portals; **Expo** for mobile; npm workspaces.

Roles are `ADMIN`, `RECRUITER`, `CANDIDATE`, `CLIENT`, carried in Supabase Auth
JWTs (ES256/JWKS) and resolved against the `User` row by the API guard.

## Conventions

- Every client authenticates with Supabase and sends
  `Authorization: Bearer <access_token>` to the API. Each app has its own
  `lib/api.ts` wrapper that attaches the token and retries once on 401 after a
  session refresh — use it, don't call `fetch` directly.
- Mutations from mobile send an `Idempotency-Key`.
- Env vars reaching a browser or device must be public-safe: `NEXT_PUBLIC_*` for
  the portals, `EXPO_PUBLIC_*` for mobile — anon key and API URL only, never a
  service key.
- The API is the only thing that talks to the database. Portals and the app
  never hold a `DATABASE_URL`.

## Deployment

API deploys to Railway via `nixpacks.toml` (builds **only** `apps/api`). The
three portals deploy to Vercel (`starff-platform-{admin,candidate,client}.vercel.app`);
those origins plus `starff.co.uk` are allow-listed in the API's CORS config in
`apps/api/src/main.ts` — a new deployed origin must be added there or via
`CORS_ORIGINS`.

Supabase free tier auto-pauses after ~7 days idle; `.github/workflows/supabase-keepalive.yml`
pings it. If every login fails at once, check whether the project is paused.

## Gotchas

- Use the **direct 5432** Supabase connection string for `db:push`, not the
  pooled 6543 one.
- `ANTHROPIC_API_KEY` is optional everywhere — matching falls back to the
  deterministic scorer and AI features degrade cleanly. Don't make them required.
- `ENCRYPTION_KEY` is required: `Candidate.nationalInsurance` and bank fields are
  encrypted at rest by Prisma middleware (`apps/api/src/prisma/field-crypto.ts`).
- A physical phone can't reach `localhost` — use the machine's LAN IP or a tunnel.
