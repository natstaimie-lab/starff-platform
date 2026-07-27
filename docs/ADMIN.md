# Admin dashboard — build plan

**Who uses it:** you and your recruiters. **Stack:** Next.js + Tailwind (`apps/admin`).
This is built **first** (after the API core) because you are the first real user.

## Screens (build in this order)

1. **Login** → Supabase Auth, ADMIN/RECRUITER only.
2. **Dashboard home** → counts: open shifts, unfilled jobs, pending timesheets, new enquiries.
3. **Enquiries** → list of WordPress form submissions; "Convert to Candidate/Client".
4. **Candidates** → list + filters (status, skill) → candidate detail:
   profile, documents (verify/reject), skills, availability, shift history.
5. **Clients** → list → client detail: contacts, sites, jobs, invoices.
6. **Jobs** → create/edit a job (client, site, rates, skills, openings).
7. **Shift scheduler** → create shifts on a job, assign a candidate, confirm/cancel.
8. **Timesheets** → approve/reject submitted timesheets.
9. **Invoices** → generate from approved timesheets (build in a later stage).

## Running it locally

Two servers must be running (each in its own terminal, from the repo root):

```bash
npm run dev --workspace @starff/api     # API  → http://localhost:3001
npm run dev --workspace @starff/admin   # Admin → http://localhost:3000
```

## Creating your first admin login (one time)

The dashboard uses Supabase for login. Admins don't self-register, so seed the first one:

1. **Create the login:** Supabase dashboard → **Authentication → Users → Add user**.
   Enter your email + a password, tick **Auto Confirm User**, click Create.
2. **Give it admin rights:** from the repo root run:
   ```bash
   npm run promote-admin -- you@starff.co.uk
   ```
3. Go to **http://localhost:3000**, log in — you'll land on the dashboard.

Repeat step 1–2 for each staff member (or later, build a "team" screen in-app).

## Test checklist

- [ ] Log in as admin; non-admins are blocked.
- [ ] Create a candidate; it appears in the list and in the DB.
- [ ] Upload a document, mark it VERIFIED; candidate status can move to COMPLIANT.
- [ ] Create a client → job → shift → assign a candidate.
- [ ] Approve a submitted timesheet.
