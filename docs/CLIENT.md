# Client portal — build plan

**Who uses it:** hiring companies. **Stack:** Next.js + Tailwind (`apps/client`).
Built after Candidate. Client approvals unblock invoicing.

## Screens (build in this order)

1. **Login** → Supabase Auth, CLIENT role (a ClientContact linked to a User).
2. **Dashboard** → open jobs, workers on shift today, timesheets awaiting approval.
3. **Post a job** → title, site, dates, pay/charge rate, skills, openings.
4. **My jobs** → list + status; see applicants/assigned workers per job.
5. **Booked workers** → who's coming, when, to which site.
6. **Approve timesheets** → approve/reject hours submitted by candidates.
7. **Invoices** → view invoices and status (built in a later stage).

## Test checklist

- [ ] Log in as a client; only your own company's data is visible.
- [ ] Post a job; it appears in Admin.
- [ ] Approve a timesheet; status changes to APPROVED everywhere.
