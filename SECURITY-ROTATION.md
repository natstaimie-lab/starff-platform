# Starff — Secret Rotation Runbook (Railway security incident, 21 Oct 2026)

Railway disclosed a platform security incident and advised revoking all
environment variables stored on Railway. This is the step-by-step to rotate
every Starff secret safely. **Deployments on Railway are paused**, so the live
API cannot pick up new values until Railway restores builds — that shapes the
order below.

Generated values are already staged in **`.env.rotation.staging`** (git-ignored,
local only). As you rotate the service-managed ones, paste each new value into
that same file so you have one place to copy from.

---

## The trigger rule

- **If Railway emails you saying your account WAS affected** → do **Phase 2
  (database + service key) immediately**, accepting downtime. The exposure of
  full database access outweighs a few hours offline.
- **Otherwise** → do Phase 1 now, keep everything else staged, and run Phase 2
  the moment Railway restores builds (near-zero downtime).

---

## Phase 1 — Do now (safe: only degrades, never full outage)

The live API keeps its old values in memory until it can redeploy, so rotating
these now just pauses that one feature until build-restore. Worth doing to shrink
the exposure.

### 1a. Resend API key
1. resend.com → **API Keys** → create a new key → copy it into `.env.rotation.staging` (`RESEND_API_KEY=`).
2. **Delete the old key.**
3. Effect until redeploy: outbound emails (activation, reminders) pause. Sign-ups still work.

### 1b. Anthropic API key (optional feature)
1. console.anthropic.com → **API keys** → create new, copy to staging, revoke old.
2. Effect: AI features fall back to the deterministic path (already handled).

### 1c. Google Routes API key
1. Google Cloud Console → **APIs & Services → Credentials** → regenerate the key, copy to staging, and **add an HTTP-referrer/IP restriction** so a leaked key is useless off your servers.
2. Effect: journey-time estimates fall back to approximations until redeploy.

---

## Phase 2 — Database + auth (the crown jewels) — at build-restore, or NOW if affected

> ⚠️ Rotating these **breaks the live API** (it loses database/auth access) until
> Railway restores builds and you redeploy. Best run *as* builds come back, so
> rotate → update Railway → redeploy happens in one pass.

### 2a. Database password
1. Supabase → your project → **Settings → Database → Reset database password**.
2. Copy the **new connection string** into `.env.rotation.staging` (`DATABASE_URL=`), keeping the `?pgbouncer`/port settings you use for the API.
3. Also update your **local `.env`** so scripts keep working.

### 2b. Supabase API keys + JWT secret
1. Supabase → **Settings → API**.
2. Rotate the keys — note this **regenerates `anon` + `service_role` and logs all users out** (they sign in again; fine for us).
3. Copy new `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, and `SUPABASE_JWT_SECRET` into staging.
4. The new **anon key is public-safe** and must also be updated in the Vercel portals + mobile env (`NEXT_PUBLIC_SUPABASE_ANON_KEY` / `EXPO_PUBLIC_...`).

### 2c. ENCRYPTION_KEY  (⚠️ 2 workers have encrypted NI + bank)
- A new value is already staged. **Do not apply it until those 2 records are handled**, or they become unreadable.
- Option A (clean): Claude runs a re-encryption script at rotation time (old key → new key) — needs both keys present.
- Option B (simple): ask those 2 workers to re-enter NI + bank (they're mid-onboarding anyway).

### 2d. WordPress webhook secret
1. New value already staged (`WORDPRESS_WEBHOOK_SECRET`).
2. Must be updated in **both** places at the same time: Railway variables **and** the WordPress site's registration/enquiry webhook config — or website sign-ups will be rejected.

---

## Phase 3 — Apply + redeploy (once Railway builds are back)

1. In **Railway → Variables**, replace every rotated value from `.env.rotation.staging`.
2. **Redeploy** the API service.
3. Update **Vercel** (admin/candidate/client) env with the new anon key + API URL if changed; redeploy each.
4. Update **mobile** `.env` (anon key) for the next build.
5. Update the **WordPress** webhook secret.

## Phase 4 — Verify

- `POST /registration/reminders/run` → 401 (API up on new build).
- Log into the admin portal (you'll be asked to sign in again after the JWT rotation).
- Create a test sign-up → confirm it lands + you get the alert.
- Re-run the read-only DB audit (no rogue staff accounts).
- Delete `.env.rotation.staging` once everything is confirmed live.

---

## Clean-up
- Delete `.env.rotation.staging` after Phase 4.
- Keep an eye out for the Railway "affected accounts" email.
- Review Supabase logs (Auth + Postgres) for unfamiliar activity in the incident window.
