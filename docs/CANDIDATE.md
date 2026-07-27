# Candidate portal — build plan

**Who uses it:** temp workers. **Stack:** Next.js + Tailwind (`apps/candidate`).
Built after Admin, because Admin proves the data model and this feeds it real data.

## Screens (build in this order)

1. **Register / Login** → Supabase Auth, creates a CANDIDATE user + Candidate profile.
2. **Onboarding / Profile** → personal details, address, skills, availability.
3. **Documents** → upload Right-to-Work, DBS, CV, certificates (to Supabase Storage).
   Show status (Pending / Verified / Rejected / Expired).
4. **Available shifts** → shifts matching my skills/availability → "Apply" / "Accept".
5. **My shifts** → upcoming + past, with location and pay rate.
6. **Timesheets** → for completed shifts: enter clock in/out + break → submit.
7. **Notifications** → shift offers, timesheet approvals.

## Test checklist

- [ ] Register a new candidate; the account appears in Admin.
- [ ] Upload a document; it appears in Admin for verification.
- [ ] See an OPEN shift and accept it; status changes to ASSIGNED in Admin.
- [ ] Submit a timesheet; it appears in Admin as SUBMITTED.
