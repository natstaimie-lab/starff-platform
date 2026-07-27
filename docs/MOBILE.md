# Starff Mobile App — Architecture, Integration & Build Plan

> The mobile app is **another secure client of the existing Starff platform**, not a
> new product. It uses the **same** Supabase Auth, the **same** NestJS API
> (`apps/api`), and the **same** PostgreSQL database as the website, admin
> dashboard, candidate portal and client portal. **No separate database, no
> duplicate backend, no parallel authentication system was created.**

Location: `apps/mobile/` (Expo + React Native + TypeScript). Design source of
truth: Claude Design project `1f8840d2-…` → *Starff Mobile App.dc.html* (imported
via the DesignSync MCP), built on the same `starff-branding-65a14597` design
system as the portals.

---

## Stage 1 — Existing-platform audit (what we connected to)

Everything below **already existed and is live**; the mobile app reuses it.

| Layer | What exists | Reused by mobile as-is |
|---|---|---|
| **Database** | 19 Prisma models on Supabase Postgres (`vtmafvssthoypwgcjtkm`, eu-west-1). User, Candidate (+EmploymentHistory, References, Documents, Availability), Client (+Contacts, Sites), Job, Application, Shift, Timesheet, Invoice, Enquiry, Notification, Conversation/Message, AuditLog. | ✅ untouched |
| **Auth** | Supabase Auth, **ES256/JWKS** JWTs. API guard verifies via JWKS + loads the `User` row for role. Roles: ADMIN, RECRUITER, CANDIDATE, CLIENT. | ✅ same project, same tokens |
| **API** | NestJS, `/api/v1`, Bearer auth, `@Public`/`@Roles`/`@CurrentUser`, Swagger at `/api/docs`. ~90 routes across candidates, me, registration, clients, client-portal, jobs, shifts, timesheets, invoices, stats, messages, notifications, staff, ai, enquiries. | ✅ mobile calls these |
| **Candidate data** | `GET /me` (profile+docs+availability+shifts+timesheets), `/me/offers`, `POST /me/offers/:id/accept`, `PUT /me/availability`, `POST /me/timesheets/:shiftId`, `POST /me/documents`, employment/references CRUD, `PUT /me/declarations`. | ✅ |
| **Client data** | `/client/overview|me|jobs|workers|timesheets|invoices|locations`, `POST /client/jobs`, `PATCH /client/timesheets/:id/approve`, profile/agreement/contacts. | ✅ |
| **Registration** | `POST /candidates` (**no role guard** — a new sign-up creates its own profile, idempotent). Webhook `POST /registration/candidate|client` (WordPress). Progress + submit + admin review. | ✅ candidate self-provision reused |
| **Storage** | Supabase Storage bucket `candidate-documents` (private, per-user RLS). | ✅ same bucket |
| **Messaging** | `GET/POST /messages/thread` (member ↔ Starff team). | ✅ |
| **Notifications** | `Notification` rows + Resend email (no-ops without key). | ⚠️ needs member-list endpoint + push (see gaps) |

**What must NOT change / stays untouched:** the Prisma schema, the auth guard, the
web portals, the WordPress site, existing IDs and relationships. The mobile app
added **zero** backend changes in this stage.

---

## Stage 2 — Integration map (mobile screen → existing endpoint)

Auth: every call carries the Supabase access token as `Authorization: Bearer …`.
Mutations send an `Idempotency-Key`.

### Candidate

| Screen / action | Method + endpoint | Role | Entity | Status |
|---|---|---|---|---|
| Register (worker) | Supabase `signUp` → `POST /candidates` | public→CANDIDATE | User, Candidate | ✅ wired |
| Sign in / out | Supabase `signInWithPassword` / `signOut` | — | — | ✅ wired |
| Password reset | Supabase `resetPasswordForEmail` | — | — | ✅ hook in place |
| Home dashboard | `GET /me` | CANDIDATE | Candidate(+docs/shifts/timesheets) | ✅ wired |
| Compliance checklist | derived from `GET /me` documents | CANDIDATE | CandidateDocument | ✅ wired |
| Matched roles / accept | `GET /me/offers`, `POST /me/offers/:id/accept` | CANDIDATE | Shift | ✅ wired |
| Timesheets list | `GET /me` timesheets | CANDIDATE | Timesheet | ✅ wired |
| Submit hours | `POST /me/timesheets/:shiftId` | CANDIDATE | Timesheet | 🔜 helper ready |
| Availability | `PUT /me/availability` | CANDIDATE | Availability | 🔜 helper ready |
| Documents upload | Supabase Storage → `POST /me/documents` | CANDIDATE | CandidateDocument | 🔜 helper ready |
| Onboarding (declarations, e-sign) | `PATCH /candidates/:id`, `PUT /me/declarations` | CANDIDATE | Candidate | 🔜 helper ready |
| Profile | `GET /me`, `PATCH /candidates/:id` | CANDIDATE | Candidate | ✅ read / 🔜 edit |
| Messages | `GET/POST /messages/thread` | CANDIDATE | Conversation/Message | 🔜 helper ready |
| AI assistant | — | — | — | ⛔ needs new endpoint |
| Payroll / payslips | earnings derivable from approved timesheets | CANDIDATE | Timesheet | 🔜 partial; PDF payslip = future |
| AI Travel Planner | device/maps + AI, no PII to backend | — | — | ⛔ design-only feature |

### Employer / client

| Screen / action | Method + endpoint | Role | Entity | Status |
|---|---|---|---|---|
| Register (employer) | Supabase `signUp` (role=employer) | public→CLIENT | User | ⚠️ needs company-provision endpoint |
| Sign in / out | Supabase | — | — | ✅ wired |
| Home dashboard | `GET /client/overview` | CLIENT | Client, Shift, Timesheet | ✅ wired |
| Post a role / Book staff | `POST /client/jobs` | CLIENT | Job | ✅ wired |
| Timesheet approvals | `GET /client/timesheets`, `PATCH /client/timesheets/:id/approve` | CLIENT | Timesheet | ✅ wired |
| Bookings | `GET /client/jobs` | CLIENT | Job/Shift | 🔜 helper ready |
| Workers / talent | `GET /client/workers` | CLIENT | Candidate | 🔜 helper ready |
| Invoices | `GET /client/invoices` | CLIENT | Invoice | 🔜 helper ready |
| Locations | `GET/POST/DELETE /client/locations` | CLIENT | ClientSite | 🔜 helper ready |
| Alerts | — | — | Notification | ⛔ needs member-list endpoint + push |

Legend: ✅ built & wired this stage · 🔜 endpoint exists, screen is next stage ·
⚠️ small backend addition required · ⛔ design-only or new endpoint required.

---

## Gaps — the *smallest* additive backend endpoints still needed

These are **new, additive, non-breaking** and follow the existing controller
pattern. **Not yet built** — they need your go-ahead because they touch `apps/api`.

1. ✅ **Employer self-provision — DONE.** `POST /client/register-company` (auth'd,
   `@Roles()` open so a brand-new employer with no CLIENT role can create their
   company; idempotent). The app calls it on employer sign-up.
2. ✅ **Member notifications — DONE (Stage 6).** `GET /notifications`,
   `PATCH /notifications/:id/read`, `POST /notifications/read-all`.
3. ✅ **Push registration — DONE (Stage 6).** `POST/DELETE /notifications/push-tokens`
   (Expo tokens in the new `PushToken` table); `NotificationsService` now sends an
   Expo push on every notification. *Real delivery needs an EAS projectId — set at
   Stage 8; degrades cleanly in Expo Go.*
4. ✅ **Candidate job browse / apply — DONE.** `GET /me/jobs` + `POST /me/jobs/:id/apply`
   (idempotent Application). Wired into the Roles screen ("Open roles" tab).
5. ✅ **Candidate AI assistant — DONE.** `POST /ai/me/ask` — grounded ONLY on the
   signed-in worker's own record; graceful when `ANTHROPIC_API_KEY` is unset.

All previously-flagged gaps are now closed. (Also fixed: the app was sending
`{slots}` to `PUT /me/availability`, which expects `{days}`.)

---

## Stage 3 — Foundation (built in this delivery)

```
apps/mobile/
  App.tsx                       providers: GestureHandler → SafeArea → Auth → Nav
  app.json                      Expo config: permissions, plugins, bundle ids
  .env.example                  EXPO_PUBLIC_* config (dev/staging/prod)
  src/
    config/env.ts               environment-based config (never holds secrets)
    theme/tokens.ts             design tokens (colours/radius/spacing/type)
    lib/
      secureStore.ts            LargeSecureStore: AES-encrypted session at rest
      supabase.ts               ONE Supabase client (shared project)
      api.ts                    central client: Bearer + refresh-on-401 + idempotency + timeout
      endpoints.ts              typed wrappers over EXISTING routes only
      types.ts                  shapes mirroring Prisma
      useApi.ts                 loading/error/refresh hook
    auth/AuthContext.tsx        session, role resolution, sign in/up/out, biometric
    components/                 Icon, ui (Button/Pill/Chip/Metric/Card/…), Screen, Placeholder
    navigation/                 RootNavigator + CandidateTabs + EmployerTabs (role-based)
    screens/                    Splash, auth (Login/Register/Unsupported), candidate*, employer*
```

**Security posture:** tokens live in the OS secure store, encrypted (AES-CTR key in
Keychain/Keystore, ciphertext in AsyncStorage). No passwords, tokens, bank or
compliance data are written to unsecured storage. All traffic is HTTPS to the
shared API; the DB is never contacted from the device. 401s trigger one silent
refresh then a clean sign-out.

---

## Environments

`EXPO_PUBLIC_APP_ENV` = `development | staging | production`, selected by which
`.env` file the build uses. Only `EXPO_PUBLIC_*` vars reach the client, and only
the **public** Supabase anon key + API URL ever go there.

- **development** → local API (`http://<LAN-IP>:3001/api/v1`) or a tunnel.
- **staging** → deployed staging API + Supabase (use a **separate** DB for
  destructive tests).
- **production** → deployed production API + the live Supabase project.

---

## Setup & run (first time)

```bash
cd apps/mobile
cp .env.example .env
#  → set EXPO_PUBLIC_SUPABASE_ANON_KEY (Supabase dashboard → Project → API)
#  → set EXPO_PUBLIC_API_URL to your machine's LAN IP, not localhost, for a phone

npm install
npx expo install --fix         # reconcile native versions to the Expo SDK

# make sure the shared API is running and reachable (from repo root)
npm run dev --workspace @starff/api      # serves :3001

npx expo start                 # scan the QR with Expo Go, or press i / a
npm run typecheck              # tsc --noEmit
```

> Physical devices can't reach `localhost`. Use your LAN IP or
> `cloudflared tunnel --url http://localhost:3001`.

---

## Testing plan

- **Unit/component:** `jest-expo` for the API client (refresh-on-401, idempotency),
  role resolution, and pure UI components.
- **Integration (staging DB only — never production):** register → `/me` → offers →
  accept; employer `POST /client/jobs` → appears in admin; timesheet submit →
  client approve → admin/payroll sees it. Reuse the portal verification approach
  but point it at a **separate test database**.
- **Cross-surface sync:** a change in the app must appear in the admin dashboard
  and the relevant portal (same DB, so this is inherent — verify per action).
- **Offline/edge:** airplane mode (timeout + offline messaging), duplicate submit
  (idempotency), expired session (silent refresh then clean sign-out).

---

## Deployment (Stage 8 outline)

EAS Build for iOS + Android (`eas build`), app signing via EAS credentials,
per-environment `.env`, store metadata + privacy disclosures (camera, photos,
Face ID usage strings already in `app.json`), release notes, and a rollback plan
(previous EAS build / OTA update channel).

---

## Build sequence (remaining stages)

- **Stage 4 — Candidate app:** wire the remaining screens using helpers that
  already exist (submit hours, availability, document capture+upload, onboarding
  sections + e-signature, profile edit, messages, payroll view).
- **Stage 5 — Client app:** bookings, workers, invoices, locations, company
  setup; add the employer self-provision endpoint (gap #1).
- **Stage 6 — Device functions:** Expo push (gap #3), camera/document capture,
  biometric polish, permissions.
- **Stage 7 — Integration testing** against staging.
- **Stage 8 — Production prep:** EAS builds, store assets, disclosures, rollback.

---

## Change log — modifications to the existing platform

| Date | Change | Reversible? |
|---|---|---|
| 2026-07-11 | Added `apps/mobile/` (Expo app foundation + wired dashboards). **No** changes to API, schema, portals, or WordPress. | Yes — delete the folder |
| 2026-07-13 | Removed `apps/mobile` from root `workspaces` (isolated install; React 19/RN 0.81 can't share the portals' React 18). | Yes — re-add to workspaces |
| 2026-07-13 | **Additive** schema: new `PushToken` table + `User.pushTokens` relation (`db push`). No existing columns/data touched. | Yes — drop table |
| 2026-07-13 | Added `NotificationsController` (member notifications + push-token register) and Expo push send in `NotificationsService`. Additive, follows existing patterns. | Yes — remove controller |
| 2026-07-13 | Added `POST /client/register-company` (employer self-signup), `GET /me/jobs` + `POST /me/jobs/:id/apply` (candidate apply), `POST /ai/me/ask` (worker AI). All additive routes; no schema change. | Yes — remove routes |
| 2026-07-14 | Added `GET /client/invoices/:id` (client invoice detail, scoped). Additive route. | Yes — remove route |
| 2026-07-14 | **Field-level encryption** (AES-256-GCM) for `Candidate.nationalInsurance` + bank fields, via Prisma middleware (`prisma/field-crypto.ts`). Transparent encrypt-on-write / decrypt-on-read; legacy plaintext migrates on next write. Needs `ENCRYPTION_KEY` in `.env`. | Yes — remove middleware (data stays; decrypts as long as key kept) |

**Confirmation:** No separate database, duplicate backend, or parallel auth system
was created. The mobile app authenticates against the existing Supabase project
and reads/writes exclusively through the existing NestJS API.
