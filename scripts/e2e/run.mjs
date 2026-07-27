// End-to-end API tests for the Starff platform.
//
// Drives the running API with real role-scoped tokens, asserts against the DB,
// and cleans up. Requires the API running and a .env with SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, WORDPRESS_WEBHOOK_SECRET.
//
//   npm run test:e2e            (or: node --env-file=.env scripts/e2e/run.mjs)
import { p, req, webhook, makeUser, track, cleanup, log, check, allPassed } from './helpers.mjs';

const H = 3600e3;
const results = [];
async function flow(name, fn) {
  const created = track();
  log(`\n━━ ${name} ━━`);
  try { await fn(created); }
  catch (e) { check(`${name} threw: ${e.message}`, false); }
  finally { await cleanup(created); }
}

// ── Booking: one-off, fixed-range recurring, open-ended recurring + extend ──
async function booking(created) {
  const admin = await makeUser(created, 'ADMIN', 'adm');
  const client = await p.client.create({ data: { name: `E2E ${Date.now()}`, status: 'LEAD', registrationSource: 'MOBILE' } });
  created.clientIds.push(client.id);
  const [c1] = await p.candidate.findMany({ take: 1, select: { id: true } });

  const mkJob = (data) => p.job.create({ data: { clientId: client.id, title: 'E2E Booking', payRate: 13.5, chargeRate: 19.5, openings: 1, status: 'RECRUITING', ...data } });
  const bookApp = async (jobId) => {
    const app = await p.application.create({ data: { jobId, candidateId: c1.id, status: 'CLIENT_ACCEPTED' } });
    const r = await req(`/applications/${app.id}/book`, admin.bearer);
    return { app, r, body: await r.json() };
  };

  // one-off
  const oneJob = await mkJob({ startDate: new Date('2027-09-06T08:00:00'), endDate: new Date('2027-09-06T16:00:00') });
  created.jobIds.push(oneJob.id);
  const one = await bookApp(oneJob.id);
  check('one-off → 1 shift', one.r.status === 201 && one.body.shiftCount === 1);

  // fixed-range recurring (Mon/Wed/Fri over 2 weeks = 6)
  const fixJob = await mkJob({ recurrenceDays: [1, 3, 5], shiftStartTime: '08:00', shiftEndTime: '16:00', startDate: new Date('2027-03-01T00:00:00'), endDate: new Date('2027-03-14T23:59:00') });
  created.jobIds.push(fixJob.id);
  const fix = await bookApp(fixJob.id);
  check('fixed-range → 6 shifts', fix.r.status === 201 && fix.body.shiftCount === 6);
  const ext = await req(`/applications/jobs/${fixJob.id}/extend-recurring`, admin.bearer);
  check('extend rejected for fixed-range', ext.status === 400);

  // open-ended recurring + extend
  const openJob = await mkJob({ recurrenceDays: [1, 3, 5], shiftStartTime: '08:00', shiftEndTime: '16:00', openEnded: true, startDate: new Date('2027-10-04T00:00:00') });
  created.jobIds.push(openJob.id);
  const open = await bookApp(openJob.id);
  check('open-ended → rolling horizon (>1 shift)', open.r.status === 201 && open.body.shiftCount > 1);
  const extended = await req(`/applications/jobs/${openJob.id}/extend-recurring`, admin.bearer).then((r) => r.json());
  check('extend rolls the schedule forward', extended.shiftsCreated > 0);
}

// ── Replacement: book → replace (shift kept as history, vacancy re-opens) → re-book ──
async function replacement(created) {
  const admin = await makeUser(created, 'ADMIN', 'adm');
  const client = await p.client.create({ data: { name: `E2E ${Date.now()}`, status: 'LEAD', registrationSource: 'MOBILE' } });
  created.clientIds.push(client.id);
  const [c1, c2] = await p.candidate.findMany({ take: 2, select: { id: true } });
  const job = await p.job.create({ data: { clientId: client.id, title: 'E2E Replace', payRate: 13.5, chargeRate: 19.5, openings: 1, status: 'RECRUITING', startDate: new Date('2027-11-01T08:00:00'), endDate: new Date('2027-11-01T16:00:00') } });
  created.jobIds.push(job.id);
  const a1 = await p.application.create({ data: { jobId: job.id, candidateId: c1.id, status: 'CLIENT_ACCEPTED' } });
  const a2 = await p.application.create({ data: { jobId: job.id, candidateId: c2.id, status: 'CLIENT_ACCEPTED' } });

  const booked = await req(`/applications/${a1.id}/book`, admin.bearer).then((r) => r.json());
  const rep = await req(`/applications/${a1.id}/replace`, admin.bearer, 'POST', { reason: 'Called in sick' });
  const shift = await p.shift.findUnique({ where: { id: booked.shiftId }, select: { status: true } });
  const app1 = await p.application.findUnique({ where: { id: a1.id }, select: { status: true } });
  const jobAfter = await p.job.findUnique({ where: { id: job.id }, select: { status: true } });
  check('replace → 201', rep.status === 201);
  check('shift kept as CANCELLED history', shift?.status === 'CANCELLED');
  check('application → REPLACED', app1.status === 'REPLACED');
  check('vacancy re-opened → RECRUITING', jobAfter.status === 'RECRUITING');
  const rebook = await req(`/applications/${a2.id}/book`, admin.bearer);
  check('alternative booked into freed slot', rebook.status === 201);
}

// ── Client submissions decision: admin submits → client accepts/rejects; locked after booking ──
async function submissions(created) {
  const admin = await makeUser(created, 'ADMIN', 'adm');
  const clientUser = await makeUser(created, 'CLIENT', 'cli');
  const company = await p.client.create({ data: { name: `E2E ${Date.now()}`, status: 'LEAD', registrationSource: 'MOBILE', billingEmail: clientUser.email } });
  created.clientIds.push(company.id);
  await p.clientContact.create({ data: { clientId: company.id, userId: clientUser.id, email: clientUser.email, firstName: 'E2E', lastName: 'Client', isPrimary: true } });
  const job = await p.job.create({ data: { clientId: company.id, title: 'E2E Subs', payRate: 13.5, chargeRate: 19.5, openings: 2, status: 'RECRUITING', startDate: new Date('2027-12-06T08:00:00'), endDate: new Date('2027-12-06T16:00:00') } });
  created.jobIds.push(job.id);
  const [c1, c2] = await p.candidate.findMany({ take: 2, select: { id: true, lastName: true } });
  const app1 = await p.application.create({ data: { jobId: job.id, candidateId: c1.id, status: 'INTERESTED' } });
  const app2 = await p.application.create({ data: { jobId: job.id, candidateId: c2.id, status: 'INTERESTED' } });

  const sub = await req(`/jobs/${job.id}/submit-to-client`, admin.bearer, 'POST', { applicationIds: [app1.id, app2.id] });
  check('submit-to-client → 2 submitted', (await sub.json()).submitted === 2);
  const list = await req('/client/submissions', clientUser.bearer, 'GET').then((r) => r.json());
  const mine = list.filter((s) => s.id === app1.id || s.id === app2.id);
  check('client sees 2 redacted submissions (no surname)', mine.length === 2 && !JSON.stringify(mine).includes(c1.lastName) && !JSON.stringify(mine).includes(c2.lastName));
  const acc = await req(`/client/submissions/${app1.id}/decision`, clientUser.bearer, 'POST', { decision: 'ACCEPT' });
  check('client ACCEPT → CLIENT_ACCEPTED', acc.status === 201 && (await p.application.findUnique({ where: { id: app1.id }, select: { status: true } })).status === 'CLIENT_ACCEPTED');
  await req(`/applications/${app1.id}/book`, admin.bearer);
  const locked = await req(`/client/submissions/${app1.id}/decision`, clientUser.bearer, 'POST', { decision: 'REJECT' });
  check('decision locked after booking (403)', locked.status === 403);
}

// ── Invitation → response ──
async function invitations(created) {
  const admin = await makeUser(created, 'ADMIN', 'adm');
  const candUser = await makeUser(created, 'CANDIDATE', 'cand');
  const cand = await p.candidate.create({ data: { userId: candUser.id, firstName: 'E2E', lastName: 'Worker', status: 'ACTIVE' } });
  created.candidateIds.push(cand.id);
  const company = await p.client.create({ data: { name: `E2E ${Date.now()}`, status: 'LEAD', registrationSource: 'MOBILE' } });
  created.clientIds.push(company.id);
  const job = await p.job.create({ data: { clientId: company.id, title: 'E2E Invite', payRate: 13.5, chargeRate: 19.5, openings: 1, status: 'RECRUITING' } });
  created.jobIds.push(job.id);

  const inv = await req(`/jobs/${job.id}/invite`, admin.bearer, 'POST', { candidateIds: [cand.id] });
  const app = await p.application.findFirst({ where: { jobId: job.id, candidateId: cand.id }, select: { id: true, status: true } });
  check('invite → application INVITED', inv.status === 201 && app.status === 'INVITED');
  const list = await req('/me/invitations', candUser.bearer, 'GET').then((r) => r.json());
  check('candidate sees the invitation', list.some((i) => i.id === app.id));
  const resp = await req(`/me/invitations/${app.id}/respond`, candUser.bearer, 'POST', { response: 'INTERESTED', note: 'yes' });
  check('respond INTERESTED', resp.status === 201 && (await p.application.findUnique({ where: { id: app.id }, select: { status: true } })).status === 'INTERESTED');
  const bogus = await req('/me/invitations/nope/respond', candUser.bearer, 'POST', { response: 'INTERESTED' });
  check('bogus invitation → 404', bogus.status === 404);
}

// ── Timesheet: submit → client approve / admin reject ──
async function timesheets(created) {
  const admin = await makeUser(created, 'ADMIN', 'adm');
  const candUser = await makeUser(created, 'CANDIDATE', 'cand');
  const clientUser = await makeUser(created, 'CLIENT', 'cli');
  const cand = await p.candidate.create({ data: { userId: candUser.id, firstName: 'E2E', lastName: 'Worker', status: 'ACTIVE' } });
  created.candidateIds.push(cand.id);
  const company = await p.client.create({ data: { name: `E2E ${Date.now()}`, status: 'LEAD', registrationSource: 'MOBILE', billingEmail: clientUser.email } });
  created.clientIds.push(company.id);
  await p.clientContact.create({ data: { clientId: company.id, userId: clientUser.id, email: clientUser.email, firstName: 'E2E', lastName: 'Client', isPrimary: true } });
  const job = await p.job.create({ data: { clientId: company.id, title: 'E2E TS', payRate: 13.5, chargeRate: 19.5, openings: 1, status: 'FILLED' } });
  created.jobIds.push(job.id);
  const mk = (d) => p.shift.create({ data: { jobId: job.id, candidateId: cand.id, status: 'COMPLETED', startAt: new Date(`2027-07-0${d}T08:00:00`), endAt: new Date(`2027-07-0${d}T16:00:00`), breakMinutes: 30, payRate: 13.5, chargeRate: 19.5 } });
  const s1 = await mk(5); const s2 = await mk(6);

  const sub = await req(`/me/timesheets/${s1.id}`, candUser.bearer);
  await req(`/me/timesheets/${s2.id}`, candUser.bearer);
  const ts1 = await p.timesheet.findUnique({ where: { shiftId: s1.id }, select: { id: true, status: true, hoursWorked: true } });
  const ts2 = await p.timesheet.findUnique({ where: { shiftId: s2.id }, select: { id: true } });
  check('submit → SUBMITTED, 7.5h', sub.status === 201 && ts1.status === 'SUBMITTED' && Number(ts1.hoursWorked) === 7.5);
  const appr = await req(`/client/timesheets/${ts1.id}/approve`, clientUser.bearer, 'PATCH');
  check('client approve → APPROVED', appr.status === 200 && (await p.timesheet.findUnique({ where: { id: ts1.id }, select: { status: true } })).status === 'APPROVED');
  const rej = await req(`/timesheets/${ts2.id}/reject`, admin.bearer, 'PATCH', { reason: 'Hours off' });
  check('admin reject → REJECTED', rej.status === 200 && (await p.timesheet.findUnique({ where: { id: ts2.id }, select: { status: true } })).status === 'REJECTED');
  const bogus = await req('/me/timesheets/nope', candUser.bearer);
  check('bogus shift → 404', bogus.status === 404);
}

// ── Operational alerts (six derived signals) ──
async function alerts(created) {
  const admin = await makeUser(created, 'ADMIN', 'adm');
  const candUser = await makeUser(created, 'CANDIDATE', 'cand');
  const clientUser = await makeUser(created, 'CLIENT', 'cli');
  const cand = await p.candidate.create({ data: { userId: candUser.id, firstName: 'E2E', lastName: 'Alertee', status: 'ACTIVE' } });
  created.candidateIds.push(cand.id);
  const company = await p.client.create({ data: { name: `E2E ${Date.now()}`, status: 'LEAD', registrationSource: 'MOBILE', billingEmail: clientUser.email } });
  created.clientIds.push(company.id);
  await p.clientContact.create({ data: { clientId: company.id, userId: clientUser.id, email: clientUser.email, firstName: 'E2E', lastName: 'Client', isPrimary: true } });
  const job = await p.job.create({ data: { clientId: company.id, title: 'E2E Alerts', payRate: 13.5, chargeRate: 19.5, openings: 5, status: 'FILLED' } });
  created.jobIds.push(job.id);
  const now = Date.now();
  const sh = (extra) => p.shift.create({ data: { jobId: job.id, candidateId: cand.id, payRate: 13.5, chargeRate: 19.5, breakMinutes: 30, ...extra } });
  const late = await sh({ status: 'CONFIRMED', startAt: new Date(now - H), endAt: new Date(now + 7 * H) });
  const absent = await sh({ status: 'CONFIRMED', startAt: new Date(now - H), endAt: new Date(now + 7 * H) });
  await sh({ status: 'ASSIGNED', startAt: new Date(now + 24 * H), endAt: new Date(now + 32 * H) });
  await sh({ status: 'CONFIRMED', startAt: new Date(now - 2 * H), endAt: new Date(now + 6 * H) });
  await sh({ status: 'COMPLETED', startAt: new Date(now - 32 * H), endAt: new Date(now - 24 * H) });
  await p.candidateDocument.create({ data: { candidateId: cand.id, type: 'RIGHT_TO_WORK', status: 'VERIFIED', fileUrl: 'e2e://x', expiryDate: new Date(now + 10 * 24 * H) } });

  await req(`/me/shifts/${late.id}/report-late`, candUser.bearer);
  await req(`/client/shifts/${absent.id}/report-absent`, clientUser.bearer, 'POST', { note: 'no show' });
  const res = await req('/stats/alerts', admin.bearer, 'GET').then((r) => r.json());
  const types = new Set(res.alerts.filter((a) => a.candidateId === cand.id).map((a) => a.type));
  for (const t of ['RUNNING_LATE', 'REPORTED_ABSENT', 'NOT_ACKNOWLEDGED', 'NO_CHECK_IN', 'TIMESHEET_OUTSTANDING', 'DOC_EXPIRING']) {
    check(`alert fired: ${t}`, types.has(t));
  }
}

// ── Reliability: incident → appeal (stops counting) → admin resolve; never auto-suspends ──
async function reliability(created) {
  const admin = await makeUser(created, 'ADMIN', 'adm');
  const candUser = await makeUser(created, 'CANDIDATE', 'cand');
  const cand = await p.candidate.create({ data: { userId: candUser.id, firstName: 'E2E', lastName: 'Reliable', status: 'ACTIVE' } });
  created.candidateIds.push(cand.id);

  const incA = await req(`/candidates/${cand.id}/reliability/incidents`, admin.bearer, 'POST', { type: 'NO_SHOW', reason: 'Did not attend', scoreImpact: 15, status: 'CONFIRMED' }).then((r) => r.json());
  await req(`/candidates/${cand.id}/reliability/incidents`, admin.bearer, 'POST', { type: 'LATENESS', reason: 'Late', scoreImpact: 8, status: 'CONFIRMED' });
  const incId = incA.id ?? (await p.reliabilityIncident.findFirst({ where: { candidateId: cand.id, type: 'NO_SHOW' }, select: { id: true } })).id;

  const r1 = await req('/me/reliability', candUser.bearer, 'GET').then((r) => r.json());
  check('two incidents → HIGH concern', r1.level === 'HIGH');
  const ap = await req(`/me/reliability/incidents/${incId}/appeal`, candUser.bearer, 'POST', { note: 'was in hospital' });
  const r2 = await req('/me/reliability', candUser.bearer, 'GET').then((r) => r.json());
  check('appeal → disputed stops counting → WATCH', ap.status === 201 && r2.level === 'WATCH');
  const patch = await req(`/reliability/incidents/${incId}`, admin.bearer, 'PATCH', { status: 'REMOVED' });
  check('admin resolves appeal (REMOVED)', patch.status === 200);
  check('never auto-suspended (status ACTIVE)', (await p.candidate.findUnique({ where: { id: cand.id }, select: { status: true } })).status === 'ACTIVE');
}

// ── WordPress enquiry webhook (shared secret) → convert to candidate ──
async function enquiry(created) {
  const admin = await makeUser(created, 'ADMIN', 'adm');
  check('webhook rejects missing secret', (await webhook({ type: 'CONTACT', name: 'x' }, null)).status === 401);
  const reg = await webhook({ type: 'CANDIDATE_REGISTER', name: 'Test Applicant', email: `applicant-${Date.now()}@example.com`, phone: '07700900123' });
  const regBody = await reg.json();
  if (regBody.id) created.enquiryIds.push(regBody.id);
  check('webhook accepts correct secret → NEW enquiry', reg.status === 201 && (await p.enquiry.findUnique({ where: { id: regBody.id }, select: { status: true } })).status === 'NEW');
  check('list endpoint needs login (401)', (await fetch(`${process.env.API_PORT ? '' : ''}${'http://localhost:' + (process.env.API_PORT || 3001) + '/api/v1'}/enquiries`)).status === 401);
  const conv = await req(`/enquiries/${regBody.id}/convert`, admin.bearer, 'POST');
  const convBody = await conv.json();
  if (convBody.kind === 'candidate') {
    const c = await p.candidate.findUnique({ where: { id: convBody.id }, select: { userId: true } });
    created.candidateIds.push(convBody.id);
    if (c?.userId) created.userIds.push(c.userId);
  }
  check('convert → candidate + enquiry CONVERTED', conv.status === 201 && convBody.kind === 'candidate' && (await p.enquiry.findUnique({ where: { id: regBody.id }, select: { status: true } })).status === 'CONVERTED');
}

// ── Run everything ──
try {
  await flow('Booking (one-off / fixed / open-ended)', booking);
  await flow('Replacement loop', replacement);
  await flow('Client submissions decision', submissions);
  await flow('Invitation → response', invitations);
  await flow('Timesheet approval', timesheets);
  await flow('Operational alerts', alerts);
  await flow('Reliability appeal', reliability);
  await flow('WordPress enquiry webhook', enquiry);
  log(`\n${allPassed() ? '✅ ALL E2E FLOWS PASSED' : '❌ SOME CHECKS FAILED'}`);
} finally {
  await p.$disconnect();
}
process.exit(allPassed() ? 0 : 1);
