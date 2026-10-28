# CLAUDE.md — `apps/mobile` (Expo app)

Expo + React Native + TypeScript. **Another client of the existing platform** —
same Supabase Auth, same NestJS API, same database as the portals. No separate
backend, no parallel auth. Read the root `CLAUDE.md` first.

Serves both audiences: candidate tabs and employer tabs, chosen by role.

## Not a workspace

`apps/mobile` is intentionally excluded from the root `workspaces` array — it
runs React 19 / RN 0.86 and can't share the portals' React 18. Install and run
from inside this folder; it has its own `node_modules` and `package-lock.json`.

```bash
cd apps/mobile
cp .env.example .env
npm install
npx expo install --fix      # reconcile native versions to the Expo SDK
npx expo start              # scan with Expo Go, or press i / a
npm run typecheck           # tsc --noEmit
```

The shared API must be running: `npm run dev --workspace @starff/api` from the
repo root. **A physical device can't reach `localhost`** — set
`EXPO_PUBLIC_API_URL` to the machine's LAN IP, or tunnel
(`cloudflared tunnel --url http://localhost:3001`).

## Structure

```
App.tsx                providers: GestureHandler → SafeArea → Auth → Nav
src/config/env.ts      environment-based config; never holds secrets
src/theme/             design tokens, logos
src/lib/
  supabase.ts          the ONE Supabase client
  secureStore.ts       AES-encrypted session at rest
  api.ts               central client: Bearer, refresh-on-401, idempotency, timeout
  endpoints.ts         typed wrappers over EXISTING routes only
  types.ts             shapes mirroring Prisma
  useApi.ts            loading / error / refresh hook
src/auth/AuthContext.tsx   session, role resolution, sign in/up/out, biometric
src/navigation/        RootNavigator + CandidateTabs + EmployerTabs
src/screens/           auth/, candidate/, employer/, shared/, Splash
src/notifications/     PushRegistrar
```

## Rules

- **Every call goes through `src/lib/api.ts`.** It attaches the Bearer token,
  silently refreshes once on 401 then signs out cleanly, applies a timeout, and
  adds an `Idempotency-Key` to mutations. Don't call `fetch` or Supabase REST
  directly.
- **`endpoints.ts` wraps routes that already exist.** If a screen needs something
  the API doesn't serve, that's a backend change in `apps/api` — ask before
  making it, and keep it additive.
- **The device never contacts the database.** HTTPS to the shared API only.
- Only `EXPO_PUBLIC_*` vars reach the client, and only the public anon key and
  the API URL. No service keys, ever.
- Tokens live in the OS secure store (AES-CTR key in Keychain/Keystore,
  ciphertext in AsyncStorage). No passwords, tokens, bank or compliance data in
  unsecured storage.
- Environments come from which `.env` the build uses:
  `EXPO_PUBLIC_APP_ENV` = `development | staging | production`.
- `PUT /me/availability` expects `{ days }`, not `{ slots }`.
- Push needs an EAS projectId for real delivery; it degrades cleanly in Expo Go.
  Don't make features depend on push being live.

## Testing

Integration tests run against **staging only** — never the live database. The
production check pattern is read-only, or self-cleaning with `[TEST]`-tagged rows
deleted by exact id in a `finally` block. `docs/MOBILE-TESTING.md` records the
last full pass and the cross-surface checks worth repeating.

Cross-surface sync is inherent (one database), but verify per action: a change in
the app must show up in the admin dashboard and the matching portal.
