# Starff API (NestJS)

The one shared API. Every portal, the mobile app, and the WordPress forms talk to it.

## Run it

From the repo root, once your `.env` is filled in and the database exists:

```bash
npm install            # installs everything (first time)
npm run db:generate    # generates the Prisma client from the schema
npm run dev --workspace @starff/api   # start the API in watch mode
```

Then open **http://localhost:3001/api/docs** — the interactive API documentation.
Every endpoint is listed there and you can try it with the "Authorize" button
(paste a Supabase access token).

## What's built (Stage 1)

- **Auth** — every route requires a valid Supabase login token, except routes marked
  `@Public()`. `@Roles('ADMIN', ...)` restricts routes by role.
- **Candidates** — `POST /api/v1/candidates` (create profile), `GET /candidates`
  (staff list), `GET /candidates/me`, `GET /candidates/:id`, `PATCH /candidates/:id`.
- **Enquiries** — `POST /api/v1/enquiries` (public webhook for WordPress forms,
  protected by the `X-Webhook-Secret` header), `GET /enquiries` (staff list).

## Folder map

```
src/
  main.ts            app bootstrap, /api/v1 prefix, Swagger docs
  app.module.ts      wires all modules together
  prisma/            the shared database connection
  auth/              guards (login + roles) and decorators
  candidates/        first feature module (controller + service + DTOs)
  enquiries/         WordPress webhook + admin list
```

## Adding the next feature (pattern to copy)

Clients, Jobs, Shifts, Timesheets each follow the exact same shape as `candidates/`:
a module, a controller (the URLs), a service (the logic), and DTOs (input validation).
Copy that folder, rename, and adjust.
