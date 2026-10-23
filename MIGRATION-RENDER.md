# Starff API — Migrate off Railway to Render

Why: Railway's deploys have been frozen for 40+ hours during a security incident.
Moving the API to Render unblocks all deploys **and** lets us apply the rotated
secrets in one clean pass. Only the API moves — Supabase (database) and Vercel
(portals) are untouched.

Everything is already prepared: `render.yaml` (the blueprint), a `/api/v1/health`
endpoint for Render's health check, and `scripts/reencrypt-sensitive.mjs` for the
encryption-key rotation.

---

## Before you start, have ready
- The **GitHub** account that owns `natstaimie-lab/starff-platform`
- A **Render** account (sign up at render.com — free; the service itself is $7/mo)
- Your **`.env.rotation.staging`** file (the rotated secrets)
- **Supabase** and **IONOS** logins

---

## Step 1 — Rotate the database credentials (the clean wins)
We're redeploying fresh, so this is the moment.

1. **Supabase → Settings → Database → Reset database password.** Copy the new
   connection string into `.env.rotation.staging` → `DATABASE_URL=`. Keep the
   same host/port you use now (the pooled 5432).
2. (Encryption key is already generated in staging — Step 2 makes it safe to use.)

> The Supabase **service-role / JWT / anon** keys are a bigger, separate job
> (rotating them logs everyone out and needs the new anon key pushed to all 3
> Vercel portals + mobile). We'll do that as a **follow-up** — see "Later" below.
> For now we deploy with your **current** Supabase keys, which Railway's incident
> may have exposed but which we'll rotate right after you're stable on Render.

## Step 2 — Re-encrypt NI/bank for the new encryption key
Two workers have encrypted data; this moves it to the new key so nothing breaks.

```bash
cd /Users/starffltd/starff-platform
# OLD = your current ENCRYPTION_KEY (from .env); NEW = the one in .env.rotation.staging
DATABASE_URL="<new DATABASE_URL>" OLD_ENCRYPTION_KEY="<current>" NEW_ENCRYPTION_KEY="<new>" \
  node scripts/reencrypt-sensitive.mjs            # preview
# then, if it looks right:
DATABASE_URL="<new DATABASE_URL>" OLD_ENCRYPTION_KEY="<current>" NEW_ENCRYPTION_KEY="<new>" \
  node scripts/reencrypt-sensitive.mjs --confirm
```
(I'll run this with you — I can read the current ENCRYPTION_KEY from `.env` and
the new one from staging without printing them.)

## Step 3 — Create the Render service
1. Push the prep commit to GitHub (I'll do this).
2. Render dashboard → **New → Blueprint** → connect `natstaimie-lab/starff-platform`.
3. Render reads `render.yaml` and proposes the **starff-api** service.
4. It will prompt for every `sync: false` secret. Paste each from
   `.env.rotation.staging`:
   - `DATABASE_URL`, `ENCRYPTION_KEY`, `WORDPRESS_WEBHOOK_SECRET`,
     `GOOGLE_ROUTES_API_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` → **current values** for
     now (copy from Railway → Variables, which you can still read)
   - `REQUIRE_STAFF_MFA` → **copy the exact value from Railway** (so staff login
     behaves identically)
5. **Apply** → Render builds and deploys.

## Step 4 — Verify on the Render URL (before touching DNS)
Render gives you a URL like `https://starff-api.onrender.com`.
- Open `https://starff-api.onrender.com/api/v1/health` → should return `{ "ok": true }`.
- Tell me the URL and I'll smoke-test the key endpoints against it.

## Step 5 — Point your domain at Render
1. Render → the service → **Settings → Custom Domains → Add** `api.starff.co.uk`.
2. Render shows a **CNAME target** (like `starff-api.onrender.com`).
3. **IONOS → DNS** for `starff.co.uk` → edit the `api` record → change its CNAME
   from the Railway target to the **Render target**. Save.
4. Wait for DNS + Render to issue the SSL certificate (minutes to ~an hour).

## Step 6 — Verify live + cut over
- `https://api.starff.co.uk/api/v1/health` → `{ "ok": true }` (now served by Render).
- Log into the admin portal; create a test sign-up; confirm it lands + alerts.
- I'll run the full verification with you.

## Step 7 — Clean up
- Update your **local `.env`** with the new `DATABASE_URL` + `ENCRYPTION_KEY`.
- In **Railway**, delete the service's variables and pause/delete the service
  (those env vars are the ones the incident may have exposed).
- Delete `.env.rotation.staging` once everything's confirmed.

---

## Later (follow-up) — rotate the Supabase keys
Because this logs everyone out and changes the public anon key everywhere:
1. Supabase → rotate keys (regenerates `anon` + `service_role`, new JWT secret).
2. Update `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_JWT_SECRET` in Render → redeploy.
3. Update the **anon key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) in all 3 Vercel
   portals → redeploy; update mobile `EXPO_PUBLIC_...` for the next build; update
   `.github/workflows/supabase-keepalive.yml`.
We'll do this as its own coordinated step once you're happily running on Render.

---

### Alternative host
If you'd rather use **Fly.io** (regions in London/Amsterdam, closer to Supabase
Ireland) I can prep a `fly.toml` + Dockerfile instead — it's more CLI-driven but
a touch lower latency. Render is the simpler path and what this runbook assumes.
