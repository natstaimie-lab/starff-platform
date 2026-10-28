# CLAUDE.md — `apps/api` (the shared API)

NestJS. The **only** thing that talks to the database. Every other surface —
admin, candidate portal, client portal, mobile app, the WordPress webhook — goes
through here. Read the root `CLAUDE.md` first for the platform-wide rules.

## Run

```bash
npm run dev --workspace @starff/api     # watch mode → http://localhost:3001
npm run build --workspace @starff/api
```

Port: `PORT` → `API_PORT` → `3001`. Global prefix `api`, URI versioning with
default `1`, so every route is `/api/v1/...`. Swagger UI at `/api/docs`.

## Structure

`src/<feature>/` with the standard Nest triple — `*.module.ts`,
`*.controller.ts`, `*.service.ts`, plus `dto/` where there is input to validate.
Register new modules in `src/app.module.ts`.

Features: `auth`, `candidates`, `clients`, `client-portal`, `me`, `jobs`,
`shifts`, `applications`, `timesheets`, `invoices`, `matching`, `reliability`,
`ratings`, `notifications`, `messages`, `enquiries`, `registration`, `staff`,
`stats`, `ai`, `audit`, `prisma`.

Which controller serves whom:

- `me/` — the signed-in **candidate's own** data (`/me`, `/me/offers`,
  `/me/availability`, `/me/timesheets/:shiftId`, `/me/documents`, `/me/jobs`).
- `client-portal/` — the signed-in **client's own** data (`/client/overview`,
  `/client/jobs`, `/client/workers`, `/client/timesheets`, `/client/invoices`,
  `/client/locations`).
- `candidates/`, `clients/`, `jobs/`, `shifts/`, `staff/`, `stats/` — admin and
  recruiter surfaces.

Put a new candidate-facing route in `me/` and a new client-facing one in
`client-portal/`, scoped to the caller. Don't widen an admin controller.

## Auth and guards

`auth/supabase-auth.guard.ts` verifies the Supabase JWT via JWKS (ES256) and
loads the `User` row so the role is authoritative from the database, not the
token claims. Decorators: `@Public()`, `@Roles(...)`, `@CurrentUser()`,
`@MfaExempt()`.

- Default is authenticated. Only mark something `@Public()` when it genuinely
  must be — currently candidate self-registration and the WordPress webhook.
- `@Roles()` with no arguments means "any signed-in user", used for
  self-provisioning (`POST /client/register-company`) where the caller doesn't
  have the role yet. Don't use it as a shortcut to skip authorisation.
- **Always scope by the caller.** A client must never be able to read another
  client's jobs by guessing an id; a candidate must never read another
  candidate's record. Filter by `@CurrentUser()`, not by a path param alone.

## Data access

Prisma only, via `PrismaService`. `src/prisma/field-crypto.ts` is middleware that
transparently encrypts/decrypts `Candidate.nationalInsurance` and bank fields
(AES-256-GCM, `ENCRYPTION_KEY`). Legacy plaintext migrates on next write — never
bypass the middleware with raw SQL on those columns.

Schema lives at `database/prisma/schema.prisma`. After changing it, run
`npm run db:push` and `npm run db:generate` from the repo root. Additive changes
only.

Route every controlled-workflow action through `AuditService.log()` — dotted
action name, entity, entity id, and structured `meta`. It is best-effort and never
throws, so it can't roll back the business action. Anything that changes a
person's status, a booking, a rate or a compliance decision gets an entry; the
platform's promise is that everything is audited.

## Request handling

- `ValidationPipe` runs globally with `whitelist: true, transform: true` — every
  request body needs a DTO with `class-validator` decorators, or its fields are
  stripped.
- `helmet` is on; CSP is deliberately disabled (JSON API, and it breaks Swagger).
- `trust proxy` is set to 1 for Railway, so rate limiting keys on the real client
  IP.
- CORS allow-lists the deployed portal origins, `starff.co.uk` and localhost
  3000–3003; extra origins come from `CORS_ORIGINS` (CSV). Requests with no
  `Origin` (mobile, server-to-server) are always allowed. See `src/main.ts`.

## Optional integrations

All of these must degrade cleanly when unset — the API has to boot and serve
without them:

- `ANTHROPIC_API_KEY` — `ai/` and the matching re-rank. Without it, matching uses
  the deterministic scorer in `matching/`.
- Resend — notification emails no-op without a key.
- Expo push — `notifications/` sends a push per notification; without an EAS
  projectId it degrades in Expo Go.
- `WORDPRESS_WEBHOOK_SECRET` — `enquiries/` rejects a wrong or missing
  `X-Webhook-Secret` with 401.

## Matching

`matching/` is deterministic first: scores, human-readable reasons, and
missing-requirement flags. AI re-ranking is optional and additive. **Protected
characteristics are never inputs to a score.** `match-weights.*` holds the
tunable weights.
