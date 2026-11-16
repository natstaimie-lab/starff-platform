// End-to-end API tests for the Starff platform.
//
// Drives the running API with real role-scoped tokens, asserts against the DB,
// and cleans up. Requires the API running and a .env with SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, WORDPRESS_WEBHOOK_SECRET.
//
//   npm run test:e2e            (or: node --env-file=.env scripts/e2e/run.mjs)
import { p, req, webhook, makeUser, makeWorker, track, cleanup, log, check, allPassed, API } from './helpers.mjs';

const H = 3600e3;
const results = [];
// E2E_ONLY="CRM" runs only the flows whose name contains that text.
const ONLY = process.env.E2E_ONLY?.toLowerCase();
async function flow(name, fn) {
  if (ONLY && !name.toLowerCase().includes(ONLY)) return;
  const created = track();
  log(`\n━━ ${name} ━━`);
  try { await fn(created); }
  catch (e) { check(`${name} threw: ${e.message}`, false); }
  finally { await cleanup(created); }
}

// ── Full journey: client books → admin approves/invites → worker accepts → booked →
//    worker acknowledges, checks in/out, submits timesheet → client approves.
//    Uses only the real endpoints each role hits (no DB shortcuts for state changes).
async function fullJourney(created) {
  const admin = await makeUser(created, 'ADMIN', 'adm');
  const clientUser = await makeUser(created, 'CLIENT', 'cli');
  const candUser = await makeUser(created, 'CANDIDATE', 'cand');
  const company = await p.client.create({ data: { name: `E2E Journey ${Date.now()}`, status: 'ACTIVE', registrationSource: 'MOBILE', billingEmail: clientUser.email } });
  created.clientIds.push(company.id);
  await p.clientContact.create({ data: { clientId: company.id, userId: clientUser.id, email: clientUser.email, firstName: 'E2E', lastName: 'Client', isPrimary: true } });
  const cand = await p.candidate.create({ data: { userId: candUser.id, firstName: 'E2E', lastName: 'Journeyworker', status: 'COMPLIANT', rightToWorkType: 'British Citizen' } });
  created.candidateIds.push(cand.id);

  // 1. Client posts a one-off shift request (a past date, so it can be worked + timesheeted now)
  const start = new Date(Date.now() - 10 * H); start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 8 * H);
  const post = await req('/client/jobs', clientUser.bearer, 'POST', { title: 'E2E Journey Warehouse Operative', payRate: 13.5, chargeRate: 19.5, openings: 1, startDate: start.toISOString(), endDate: end.toISOString(), sector: 'warehouse' });
  const job = await post.json();
  if (job?.id) created.jobIds.push(job.id);
  check('1. client posts request → SUBMITTED', post.status === 201 && job.status === 'SUBMITTED');
  const clientJobs = await req('/client/jobs', clientUser.bearer, 'GET').then((r) => r.json());
  check('   client sees it in their jobs list', Array.isArray(clientJobs) && clientJobs.some((j) => j.id === job.id));

  // 2. Admin approves
  const appr = await req(`/jobs/${job.id}/approve`, admin.bearer, 'POST', {});
  check('2. admin approves → RECRUITING', appr.status === 201 && (await p.job.findUnique({ where: { id: job.id }, select: { status: true } })).status === 'RECRUITING');

  // 3. Admin invites the worker; worker sees + accepts the offer
  const inv = await req(`/jobs/${job.id}/invite`, admin.bearer, 'POST', { candidateIds: [cand.id] });
  check('3. admin invites worker', inv.status === 201);
  const invites = await req('/me/invitations', candUser.bearer, 'GET').then((r) => r.json());
  const invite = Array.isArray(invites) ? invites.find((i) => i.job?.title === 'E2E Journey Warehouse Operative' && i.status === 'INVITED') : null;
  check('   worker sees the offer', !!invite);
  const resp = await req(`/me/invitations/${invite?.id}/respond`, candUser.bearer, 'POST', { response: 'INTERESTED' });
  check('4. worker accepts → INTERESTED', resp.status === 201);

  // 5. Admin submits to client; client accepts the (redacted) worker
  const sub = await req(`/jobs/${job.id}/submit-to-client`, admin.bearer, 'POST', { applicationIds: [invite?.id] });
  check('5. admin submits worker to client', sub.status === 201);
  const subs = await req('/client/submissions', clientUser.bearer, 'GET').then((r) => r.json());
  const mine = Array.isArray(subs) ? subs.find((s) => s.id === invite?.id) : null;
  check('   client sees worker, surname redacted', !!mine && !JSON.stringify(mine).includes(cand.lastName));
  const dec = await req(`/client/submissions/${invite?.id}/decision`, clientUser.bearer, 'POST', { decision: 'ACCEPT' });
  check('6. client accepts worker', dec.status === 201);

  // 7. Admin confirms booking → shift created
  const bookR = await req(`/applications/${invite?.id}/book`, admin.bearer);
  const booked = await bookR.json();
  check('7. admin books → 1 shift', bookR.status === 201 && booked.shiftCount === 1);
  const shiftId = booked.shiftId;

  // 8. Worker acknowledges, checks in, checks out
  const ack = await req(`/me/shifts/${shiftId}/acknowledge`, candUser.bearer);
  check('8. worker acknowledges → CONFIRMED', ack.status === 201 && (await p.shift.findUnique({ where: { id: shiftId }, select: { status: true } })).status === 'CONFIRMED');
  const early = await req(`/me/timesheets/${shiftId}`, candUser.bearer);
  check('   guard: timesheet blocked before shift is worked (4xx)', early.status >= 400 && early.status < 500);
  await p.timesheet.deleteMany({ where: { shiftId } }); // undo if the guard is missing, so the rest of the run is clean
  const ci = await req(`/me/shifts/${shiftId}/check-in`, candUser.bearer);
  const co = await req(`/me/shifts/${shiftId}/check-out`, candUser.bearer);
  check('9. check-in → check-out → COMPLETED', ci.status === 201 && co.status === 201 && (await p.shift.findUnique({ where: { id: shiftId }, select: { status: true } })).status === 'COMPLETED');

  // 10. Worker submits timesheet; client approves
  const ts = await req(`/me/timesheets/${shiftId}`, candUser.bearer);
  const tsRow = await p.timesheet.findUnique({ where: { shiftId }, select: { id: true, status: true, hoursWorked: true } });
  check('10. worker submits timesheet → SUBMITTED', ts.status === 201 && tsRow?.status === 'SUBMITTED' && Number(tsRow.hoursWorked) > 0);
  const pending = await req('/client/timesheets', clientUser.bearer, 'GET').then((r) => r.json());
  check('    client sees it to approve', Array.isArray(pending) && pending.some((t) => t.id === tsRow?.id));
  const ap = await req(`/client/timesheets/${tsRow?.id}/approve`, clientUser.bearer, 'PATCH');
  check('11. client approves → APPROVED', ap.status === 200 && (await p.timesheet.findUnique({ where: { id: tsRow.id }, select: { status: true } })).status === 'APPROVED');

  // Integrity guard: an approved timesheet must not be reset by the worker re-submitting
  await req(`/me/timesheets/${shiftId}`, candUser.bearer);
  check('    guard: approved timesheet stays APPROVED after worker re-submit', (await p.timesheet.findUnique({ where: { id: tsRow.id }, select: { status: true } })).status === 'APPROVED');
}

// ── Booking: one-off, fixed-range recurring, open-ended recurring + extend ──
async function booking(created) {
  const admin = await makeUser(created, 'ADMIN', 'adm');
  const client = await p.client.create({ data: { name: `E2E ${Date.now()}`, status: 'LEAD', registrationSource: 'MOBILE' } });
  created.clientIds.push(client.id);
  const c1 = await makeWorker(created, 'bk');

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

  // compliance gate: uncleared worker / no right-to-work evidence can't be booked
  const gateJob = await mkJob({ startDate: new Date('2027-09-07T08:00:00'), endDate: new Date('2027-09-07T16:00:00') });
  created.jobIds.push(gateJob.id);
  const newbie = await makeWorker(created, 'new', { status: 'NEW' });
  const noRtw = await makeWorker(created, 'nortw', { rightToWorkType: null });
  for (const [label, w] of [['NEW status', newbie], ['no right-to-work', noRtw]]) {
    const a = await p.application.create({ data: { jobId: gateJob.id, candidateId: w.id, status: 'CLIENT_ACCEPTED' } });
    const r = await req(`/applications/${a.id}/book`, admin.bearer);
    check(`gate: ${label} → booking refused (400)`, r.status === 400);
  }

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
  const c1 = await makeWorker(created, 'r1'); const c2 = await makeWorker(created, 'r2');
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
  const c1 = await makeWorker(created, 's1'); const c2 = await makeWorker(created, 's2');
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
  const pendingForClient = await req('/client/timesheets', clientUser.bearer, 'GET').then((r) => r.json());
  const clientTs = pendingForClient.find((t) => t.id === ts1.id);
  check('client timesheet has first name + reference, no surname', !!clientTs?.candidate?.reference && !('lastName' in clientTs.candidate) && !JSON.stringify(clientTs).includes(cand.lastName));
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
  check('list endpoint needs login (401)', (await fetch(`${API}/enquiries`)).status === 401);
  const conv = await req(`/enquiries/${regBody.id}/convert`, admin.bearer, 'POST');
  const convBody = await conv.json();
  if (convBody.kind === 'candidate') {
    const c = await p.candidate.findUnique({ where: { id: convBody.id }, select: { userId: true } });
    created.candidateIds.push(convBody.id);
    if (c?.userId) created.userIds.push(c.userId);
  }
  check('convert → candidate + enquiry CONVERTED', conv.status === 201 && convBody.kind === 'candidate' && (await p.enquiry.findUnique({ where: { id: regBody.id }, select: { status: true } })).status === 'CONVERTED');
}

// ── CRM leads: create from enquiry (idempotent), log activity, change stage,
//    linked client nudged LEAD → PROSPECT, LOST needs a reason, staff-only.
async function leads(created) {
  const admin = await makeUser(created, 'ADMIN', 'adm');
  const clientUser = await makeUser(created, 'CLIENT', 'cli');
  const stamp = Date.now();

  const enq = await webhook({ type: 'POST_A_JOB', name: 'Lead Tester', company: `E2E Lead Co ${stamp}`, email: `lead-${stamp}@example.com`, phone: '07700900456', message: 'Need 5 pickers' });
  const enqBody = await enq.json();
  if (enqBody.id) created.enquiryIds.push(enqBody.id);

  check('leads need login (401)', (await fetch(`${API}/leads`)).status === 401);
  check('clients cannot use leads (403)', (await req('/leads', clientUser.bearer, 'GET')).status === 403);

  const c1 = await req('/leads', admin.bearer, 'POST', { enquiryId: enqBody.id });
  const lead = await c1.json();
  if (lead?.id) created.leadIds.push(lead.id);
  check('create lead from enquiry → filled in, source ENQUIRY, stage NEW', c1.status === 201 && lead.companyName === `E2E Lead Co ${stamp}` && lead.contactEmail === `lead-${stamp}@example.com` && lead.source === 'ENQUIRY' && lead.stage === 'NEW');
  const c2 = await req('/leads', admin.bearer, 'POST', { enquiryId: enqBody.id }).then((r) => r.json());
  check('same enquiry again → returns existing lead', c2.id === lead.id && c2.existing === true);

  const act = await req(`/leads/${lead.id}/activities`, admin.bearer, 'POST', { type: 'CALL', outcome: 'Wants a quote', body: 'Spoke to ops manager', nextActionAt: new Date(Date.now() + 86400e3).toISOString() });
  check('log activity (call) → 201, outbound by default', act.status === 201 && (await act.json()).direction === 'outbound');
  check('empty activity refused (400)', (await req(`/leads/${lead.id}/activities`, admin.bearer, 'POST', { type: 'NOTE' })).status === 400);

  const st = await req(`/leads/${lead.id}/stage`, admin.bearer, 'PATCH', { stage: 'CONTACTED', note: 'First call done' });
  const stBody = await st.json();
  check('change stage → CONTACTED with STAGE_CHANGE activity', st.status === 200 && stBody.stage === 'CONTACTED' && stBody.activities.some((a) => a.type === 'STAGE_CHANGE' && a.meta?.to === 'CONTACTED'));
  const rtc = await req(`/leads/${lead.id}/stage`, admin.bearer, 'PATCH', { stage: 'READY_TO_CLOSE' });
  check('change stage → READY_TO_CLOSE (board column)', rtc.status === 200 && (await rtc.json()).stage === 'READY_TO_CLOSE');
  check('LOST without reason refused (400)', (await req(`/leads/${lead.id}/stage`, admin.bearer, 'PATCH', { stage: 'LOST' })).status === 400);
  check('stage change audited', !!(await p.auditLog.findFirst({ where: { entity: 'Lead', entityId: lead.id, action: 'lead.stage_changed' } })));

  // Linked client at LEAD → PROSPECT once contacted; never ACTIVE from a lead.
  const company = await p.client.create({ data: { name: `E2E Lead Client ${stamp}`, status: 'LEAD' } });
  created.clientIds.push(company.id);
  const cl = await req('/leads', admin.bearer, 'POST', { clientId: company.id }).then((r) => r.json());
  if (cl?.id) created.leadIds.push(cl.id);
  check('create lead from client → source CLIENT, linked', cl.source === 'CLIENT' && cl.clientId === company.id);
  await req(`/leads/${cl.id}/stage`, admin.bearer, 'PATCH', { stage: 'QUALIFIED' });
  check('linked client LEAD → PROSPECT', (await p.client.findUnique({ where: { id: company.id }, select: { status: true } })).status === 'PROSPECT');
  await req(`/leads/${cl.id}/stage`, admin.bearer, 'PATCH', { stage: 'WON' });
  check('WON does not make client ACTIVE', (await p.client.findUnique({ where: { id: company.id }, select: { status: true } })).status === 'PROSPECT');

  // Quote made for the lead: linked, listed on the lead, and logged in its activity.
  const qr = await req('/quotes', admin.bearer, 'POST', { leadId: lead.id, prospectName: lead.companyName, contactEmail: lead.contactEmail, lines: [{ description: 'E2E picker', payRate: 13, hoursPerShift: 8 }] });
  const quote = await qr.json();
  if (quote?.id) created.quoteIds.push(quote.id);
  check('create quote for lead → linked', qr.status === 201 && quote.leadId === lead.id && quote.lead?.companyName === lead.companyName);
  const withQ = await req(`/leads/${lead.id}`, admin.bearer, 'GET').then((r) => r.json());
  check('lead shows the quote + "drafted" activity', withQ.quotes?.some((q) => q.id === quote.id) && withQ.activities?.some((a) => a.subject === `Quote ${quote.number} drafted`));
  const qe = await req(`/quotes/${quote.id}`, admin.bearer, 'PATCH', { prospectName: lead.companyName, lines: [{ description: 'E2E picker', payRate: 14, hoursPerShift: 8 }] });
  check('editing without leadId keeps the link', qe.status === 200 && (await qe.json()).leadId === lead.id);
  check('quote for unknown lead refused (400)', (await req('/quotes', admin.bearer, 'POST', { leadId: 'nope', prospectName: 'X', lines: [{ description: 'x', payRate: 13, hoursPerShift: 8 }] })).status === 400);

  // Today list: overdue / due today / no follow-up buckets, and clearing the date.
  const inToday = async (id) => { const t = await req('/leads/today', admin.bearer, 'GET').then((r) => r.json()); return ['overdue', 'today', 'upcoming', 'later', 'none'].find((k) => t[k]?.some((l) => l.id === id)); };
  await req(`/leads/${lead.id}`, admin.bearer, 'PATCH', { nextActionAt: new Date(Date.now() - 3 * 86400e3).toISOString().slice(0, 10) });
  check('Today list: past date → overdue', (await inToday(lead.id)) === 'overdue');
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
  await req(`/leads/${lead.id}`, admin.bearer, 'PATCH', { nextActionAt: todayStr });
  check('Today list: today\'s date → today', (await inToday(lead.id)) === 'today');
  const tl = await req('/leads/today', admin.bearer, 'GET').then((r) => r.json());
  check('Today list rows carry the last activity', tl.today.find((l) => l.id === lead.id)?.lastActivity?.subject != null);
  await req(`/leads/${lead.id}`, admin.bearer, 'PATCH', { clearNextAction: true });
  check('clear follow-up → "no follow-up set"', (await inToday(lead.id)) === 'none');

  // Convert to client: accepted quote → agreed rates, portal login, lead Won.
  check('convert refuses a staff email as the client login (409)', (await req(`/leads/${lead.id}/convert`, admin.bearer, 'POST', { contactFirstName: 'E2E', contactLastName: 'Clash', contactEmail: admin.email, sendInvite: false })).status === 409);
  await req(`/quotes/${quote.id}/status`, admin.bearer, 'PATCH', { status: 'ACCEPTED' });
  const loginEmail = `e2e-convert-${stamp}@starff.test`;
  const cv = await req(`/leads/${lead.id}/convert`, admin.bearer, 'POST', { contactFirstName: 'Lead', contactLastName: 'Tester', contactEmail: loginEmail, sendInvite: false });
  const cvb = await cv.json();
  if (cvb.clientId) created.clientIds.push(cvb.clientId);
  if (cvb.contactUserId) created.authUsers.push(cvb.contactUserId);
  check('convert → 200, new client, 1 agreed rate from the accepted quote', cv.status === 200 && cvb.clientCreated === true && cvb.ratesCopied === 1 && cvb.quoteNumber === quote.number);
  const newClient = cvb.clientId ? await p.client.findUnique({ where: { id: cvb.clientId }, include: { contacts: true, agreedRates: true } }) : null;
  check('client is Prospect with the contact login', newClient?.status === 'PROSPECT' && newClient.contacts.some((c) => c.email === loginEmail && c.userId === cvb.contactUserId));
  check('agreed rate matches the quote line', newClient?.agreedRates.length === 1 && Number(newClient.agreedRates[0].payRate) === 14 && newClient.agreedRates[0].quoteId === quote.id);
  const wonLead = await p.lead.findUnique({ where: { id: lead.id }, include: { activities: true } });
  check('lead is Won, linked, with a "Converted to client" note', wonLead.stage === 'WON' && wonLead.clientId === cvb.clientId && wonLead.activities.some((a) => a.subject === 'Converted to client'));
  check('quote now belongs to the client', (await p.quote.findUnique({ where: { id: quote.id }, select: { clientId: true } })).clientId === cvb.clientId);
  check('converting again is refused (409)', (await req(`/leads/${lead.id}/convert`, admin.bearer, 'POST', {})).status === 409);
  const cprof = cvb.clientId ? await req(`/clients/${cvb.clientId}`, admin.bearer, 'GET').then((r) => r.json()) : {};
  check('client profile lists the agreed rates', cprof.agreedRates?.length === 1);

  // Duplicate check on convert: same company name (tidied) or an email already on a client.
  const mkLead = async (body) => { const l = await req('/leads', admin.bearer, 'POST', body).then((r) => r.json()); if (l?.id) created.leadIds.push(l.id); return l; };
  const dupe = await mkLead({ companyName: `e2e lead co ${stamp} limited`, contactName: 'Dee Upe', contactEmail: `e2e-dupe-${stamp}@starff.test` });
  const chk = await req(`/leads/${dupe.id}/convert-check`, admin.bearer, 'GET').then((r) => r.json());
  check('convert-check finds the existing client by company name', chk.matches?.some((m) => m.clientId === cvb.clientId && m.reasons.includes('company')));
  const blocked = await req(`/leads/${dupe.id}/convert`, admin.bearer, 'POST', { sendInvite: false });
  const blockedBody = await blocked.json();
  check('convert without a choice is stopped (409 POSSIBLE_DUPLICATE)', blocked.status === 409 && blockedBody.code === 'POSSIBLE_DUPLICATE' && blockedBody.matches?.some((m) => m.clientId === cvb.clientId));
  check('nothing was created by the stopped convert', (await p.client.count({ where: { name: `e2e lead co ${stamp} limited` } })) === 0);
  const linkExisting = await req(`/leads/${dupe.id}/convert`, admin.bearer, 'POST', { clientId: cvb.clientId, sendInvite: false });
  const leb = await linkExisting.json();
  if (leb.contactUserId) created.authUsers.push(leb.contactUserId);
  check('choose existing client → linked, no new client', linkExisting.status === 200 && leb.clientCreated === false && leb.clientId === cvb.clientId
    && (await p.lead.findUnique({ where: { id: dupe.id }, select: { clientId: true, stage: true } })).clientId === cvb.clientId);
  const dupe2 = await mkLead({ companyName: `E2E Lead Co ${stamp}`, contactName: 'New Co', contactEmail: `e2e-dupe2-${stamp}@starff.test` });
  const forceNew = await req(`/leads/${dupe2.id}/convert`, admin.bearer, 'POST', { createNew: true, sendInvite: false });
  const fnb = await forceNew.json();
  if (fnb.clientId) created.clientIds.push(fnb.clientId);
  if (fnb.contactUserId) created.authUsers.push(fnb.contactUserId);
  const fnAudit = await p.auditLog.findFirst({ where: { entity: 'Lead', entityId: dupe2.id, action: 'lead.converted' } });
  check('"it\'s a new client" → creates one and records the override', forceNew.status === 200 && fnb.clientCreated === true && fnb.clientId !== cvb.clientId && Array.isArray(fnAudit?.meta?.duplicateOverride));
  const byEmail = await mkLead({ companyName: `Totally Different ${stamp}`, contactName: 'Lead Tester', contactEmail: loginEmail });
  const chk2 = await req(`/leads/${byEmail.id}/convert-check`, admin.bearer, 'GET').then((r) => r.json());
  check('convert-check finds the client by login email', chk2.matches?.[0]?.clientId === cvb.clientId && chk2.matches[0].reasons.includes('email'));

  const list = await req(`/leads?q=${encodeURIComponent(`E2E Lead Co ${stamp}`)}`, admin.bearer, 'GET').then((r) => r.json());
  check('list + search finds the lead', Array.isArray(list) && list.some((l) => l.id === lead.id));
  const sum = await req('/leads/summary', admin.bearer, 'GET').then((r) => r.json());
  check('summary has stage counts', typeof sum?.counts?.CONTACTED === 'number');
}

// ── CRM Phase 4a: employer enquiries become leads automatically; the AI
//    salesperson drafts a follow-up (never sends); sending is guarded.
async function aiSales(created) {
  const admin = await makeUser(created, 'ADMIN', 'adm');
  const stamp = Date.now();

  const job = await webhook({ type: 'POST_A_JOB', name: 'Auto Lead', company: `E2E Auto Co ${stamp}`, email: `auto-${stamp}@example.com`, message: 'Need 3 pickers in Barking from Monday' }).then((r) => r.json());
  if (job.id) created.enquiryIds.push(job.id);
  const auto = await p.lead.findUnique({ where: { enquiryId: job.id }, include: { activities: true } });
  if (auto?.id) created.leadIds.push(auto.id);
  check('Post a job enquiry → lead created automatically (NEW, ENQUIRY, due now)', !!auto && auto.stage === 'NEW' && auto.source === 'ENQUIRY'
    && auto.companyName === `E2E Auto Co ${stamp}` && !!auto.nextActionAt && auto.nextActionAt.getTime() <= Date.now());
  check('auto lead has the "created automatically" note', auto?.activities.some((a) => a.type === 'NOTE' && /automatically/.test(a.subject ?? '')));
  const again = await req('/leads', admin.bearer, 'POST', { enquiryId: job.id }).then((r) => r.json());
  check('pressing "Lead" afterwards returns the same lead', again.id === auto?.id && again.existing === true);

  const worker = await webhook({ type: 'CONTACT', name: 'Just A Worker', email: `worker-${stamp}@example.com`, message: 'Any shifts?' }).then((r) => r.json());
  if (worker.id) created.enquiryIds.push(worker.id);
  check('Contact form with no company → no lead', (await p.lead.count({ where: { enquiryId: worker.id } })) === 0);
  const firm = await webhook({ type: 'CONTACT', name: 'Ops Person', company: `E2E Contact Co ${stamp}`, email: `ops-${stamp}@example.com`, message: 'Do you do cleaners?' }).then((r) => r.json());
  if (firm.id) created.enquiryIds.push(firm.id);
  check('Contact form with a company → lead', (await p.lead.count({ where: { enquiryId: firm.id } })) === 1);
  const spam = await webhook({ type: 'POST_A_JOB', name: 'Spammer', company: 'Casino Co', email: `s-${stamp}@example.com`, message: 'best casino bonus' }).then((r) => r.json());
  if (spam.id) created.enquiryIds.push(spam.id);
  check('spam enquiry → no lead', (await p.lead.count({ where: { enquiryId: spam.id } })) === 0);

  // Sending is guarded (no real email is sent by this test).
  const noEmail = await req('/leads', admin.bearer, 'POST', { companyName: `E2E No Email ${stamp}` }).then((r) => r.json());
  if (noEmail.id) created.leadIds.push(noEmail.id);
  check('send email to a lead with no address → 400', (await req(`/leads/${noEmail.id}/email`, admin.bearer, 'POST', { subject: 'Hi', body: 'Hello' })).status === 400);
  await req(`/leads/${auto.id}/stage`, admin.bearer, 'PATCH', { stage: 'LOST', reason: 'Asked to unsubscribe' });
  check('send email to an unsubscribed lead → 400', (await req(`/leads/${auto.id}/email`, admin.bearer, 'POST', { subject: 'Hi', body: 'Hello' })).status === 400);
  check('AI draft for an unsubscribed lead → 400', (await req(`/leads/${auto.id}/ai-draft`, admin.bearer, 'POST', {})).status === 400);

  // The AI draft itself (needs ANTHROPIC_API_KEY on the API; one real model call).
  const firmLead = await p.lead.findUnique({ where: { enquiryId: firm.id } });
  if (firmLead?.id) created.leadIds.push(firmLead.id);
  const before = await p.leadActivity.count({ where: { leadId: firmLead.id } });
  const dr = await req(`/leads/${firmLead.id}/ai-draft`, admin.bearer, 'POST', { instructions: 'They asked about cleaners.' });
  const draft = await dr.json();
  if (draft.configured === false) {
    log('   (AI draft skipped: ANTHROPIC_API_KEY not set on the API)');
  } else {
    check('AI draft → subject, body, call script, follow-up days', dr.status === 200 && !!draft.subject && draft.body?.length > 40 && !!draft.callScript && draft.nextFollowUpDays >= 1 && draft.nextFollowUpDays <= 14);
    log(`   draft subject: ${draft.subject}`);
    if (process.env.E2E_SHOW_DRAFT) log(`   draft body:\n${draft.body}\n   call script:\n${draft.callScript}\n   reasoning: ${draft.reasoning}\n   warnings: ${JSON.stringify(draft.warnings)}`);
    check('AI draft states no prices', !/£\s?\d/.test(`${draft.subject}\n${draft.body}`));
    check('drafting saves nothing on the lead', (await p.leadActivity.count({ where: { leadId: firmLead.id } })) === before);
    check('drafting is audited', !!(await p.auditLog.findFirst({ where: { entity: 'Lead', entityId: firmLead.id, action: 'lead.ai_drafted' } })));
  }
}

// ── CRM Phase 4b: AI approvals queue (no model calls, no real leads drafted, no email sent).
async function aiQueue(created) {
  const admin = await makeUser(created, 'ADMIN', 'adm');
  const clientUser = await makeUser(created, 'CLIENT', 'cli');
  const stamp = Date.now();
  const forDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
  const mk = async (name, extra = {}) => {
    const l = await p.lead.create({ data: { companyName: `E2E Queue ${name} ${stamp}`, contactEmail: `q-${name}-${stamp}@example.com`, source: 'MANUAL', nextActionAt: new Date(), ...extra } });
    created.leadIds.push(l.id);
    const d = await p.aiDraft.create({ data: { leadId: l.id, forDay, subject: `Hello ${name}`, body: 'Test body', nextFollowUpDays: 3, warnings: [] } });
    return { l, d };
  };

  check('queue needs login (401)', (await fetch(`${API}/ai-sales/drafts`)).status === 401);
  check('clients cannot see the queue (403)', (await req('/ai-sales/drafts', clientUser.bearer, 'GET')).status === 403);
  check('run needs login (401)', (await fetch(`${API}/ai-sales/run`, { method: 'POST' })).status === 401);

  const a = await mk('a');
  const b = await mk('b');
  const c = await mk('c');
  const list = await req('/ai-sales/drafts', admin.bearer, 'GET').then((r) => r.json());
  check('pending drafts listed with their lead', Array.isArray(list) && [a, b, c].every(({ d }) => list.some((x) => x.id === d.id && x.lead?.companyName)));
  const sum = await req('/ai-sales/summary', admin.bearer, 'GET').then((r) => r.json());
  check('summary counts pending', sum.pending >= 3 && typeof sum.dailyCap === 'number');
  check('one draft per lead per day (unique)', await p.aiDraft.create({ data: { leadId: a.l.id, forDay, subject: 'x', body: 'x' } }).then(() => false, () => true));

  const next = new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10);
  const sk = await req(`/ai-sales/drafts/${a.d.id}/skip`, admin.bearer, 'POST', { reason: 'Not now', nextActionAt: next });
  const aAfter = await p.lead.findUnique({ where: { id: a.l.id } });
  check('skip → SKIPPED and follow-up pushed', sk.status === 200 && (await p.aiDraft.findUnique({ where: { id: a.d.id } })).status === 'SKIPPED' && aAfter.nextActionAt.toISOString().slice(0, 10) === next);
  check('acting on a skipped draft → 409', (await req(`/ai-sales/drafts/${a.d.id}/send`, admin.bearer, 'POST', { subject: 's', body: 'b' })).status === 409);

  await req(`/leads/${b.l.id}/stage`, admin.bearer, 'PATCH', { stage: 'LOST', reason: 'Went elsewhere' });
  check('lead lost → its draft goes out of date', (await p.aiDraft.findUnique({ where: { id: b.d.id } })).status === 'STALE');
  await req(`/leads/${c.l.id}/archive`, admin.bearer, 'PATCH', { archived: true });
  check('lead archived → its draft goes out of date', (await p.aiDraft.findUnique({ where: { id: c.d.id } })).status === 'STALE');
  const list2 = await req('/ai-sales/drafts', admin.bearer, 'GET').then((r) => r.json());
  check('out-of-date drafts leave the queue', !list2.some((x) => [a.d.id, b.d.id, c.d.id].includes(x.id)));
  const doneList = await req('/ai-sales/drafts?status=done', admin.bearer, 'GET').then((r) => r.json());
  check('history shows skipped + out of date', [a.d.id, b.d.id, c.d.id].every((id) => doneList.some((x) => x.id === id)));

  const leadView = await req(`/leads/${a.l.id}`, admin.bearer, 'GET').then((r) => r.json());
  check('lead detail carries pending drafts (none after skip)', Array.isArray(leadView.aiDrafts) && leadView.aiDrafts.length === 0);
}

// ── CRM Phase 4c: employer replies. Needs RESEND_INBOUND_WEBHOOK_SECRET set the same on
//    the API and here. Replies are inserted as stored rows and processed via retry, so no
//    Resend fetch is needed; the "interested" reply makes one real AI call.
async function aiReplies(created) {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (!secret) { log('   (skipped: RESEND_INBOUND_WEBHOOK_SECRET not set)'); return; }
  const { createHmac } = await import('node:crypto');
  const admin = await makeUser(created, 'ADMIN', 'adm');
  const stamp = Date.now();
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const post = (body, { good = true, ts = Math.floor(Date.now() / 1000) } = {}) => {
    const raw = JSON.stringify(body); const id = `msg_${stamp}_${Math.random().toString(36).slice(2)}`;
    const sig = good ? createHmac('sha256', key).update(`${id}.${ts}.${raw}`).digest('base64') : 'bad';
    return fetch(`${API}/inbound/resend`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'svix-id': id, 'svix-timestamp': String(ts), 'svix-signature': `v1,${sig}` }, body: raw });
  };
  const inboundIds = [];
  const done = async () => { if (inboundIds.length) await p.inboundEmail.deleteMany({ where: { id: { in: inboundIds } } }); };
  try {
    check('webhook: bad signature → 401', (await post({ type: 'email.received', data: { email_id: `e2e-bad-${stamp}` } }, { good: false })).status === 401);
    check('webhook: old timestamp → 401', (await post({ type: 'email.received', data: { email_id: `e2e-old-${stamp}` } }, { ts: Math.floor(Date.now() / 1000) - 3600 })).status === 401);
    check('webhook: other event types ignored (200)', (await post({ type: 'email.sent', data: {} })).status === 200);
    const ev = { type: 'email.received', data: { email_id: `e2e-${stamp}`, from: `Nobody <nobody-${stamp}@example.com>`, to: ['replies@example.com'], subject: 'Re: test' } };
    const r1 = await post(ev);
    const b1 = await r1.json();
    if (b1.id) inboundIds.push(b1.id);
    check('webhook: signed email.received → stored (200)', r1.status === 200 && !!b1.id);
    const r2 = await post(ev).then((r) => r.json());
    check('webhook: same email again → not stored twice', r2.duplicate === true && (await p.inboundEmail.count({ where: { resendEmailId: `e2e-${stamp}` } })) === 1);

    const lead = await p.lead.create({ data: { companyName: `E2E Reply Co ${stamp}`, contactName: 'Sam Reply', contactRole: 'Warehouse Manager', contactEmail: `reply-${stamp}@example.com`, sector: 'Warehouse & Logistics', city: 'Dagenham', source: 'OUTBOUND', stage: 'CONTACTED' } });
    created.leadIds.push(lead.id);
    await p.leadActivity.create({ data: { leadId: lead.id, type: 'EMAIL', direction: 'outbound', subject: 'Warehouse cover this peak', body: 'Hi Sam, we supply vetted warehouse temps in Dagenham...', occurredAt: new Date(Date.now() - 864e5) } });
    const stored = async (text, extra = {}) => {
      const row = await p.inboundEmail.create({ data: { resendEmailId: `e2e-${stamp}-${Math.random()}`, fromEmail: lead.contactEmail, fromName: 'Sam Reply', subject: 'Re: Warehouse cover this peak', text, ...extra } });
      inboundIds.push(row.id);
      const res = await req(`/inbound/${row.id}/retry`, admin.bearer, 'POST', {});
      return { row, res, after: await p.inboundEmail.findUnique({ where: { id: row.id } }) };
    };

    const yes = await stored('Yes, we could use 4 pickers from 1 Dec, nights. Can you send prices?');
    check('reply: matched to the lead, logged as inbound email', yes.res.status === 200 && yes.after.status === 'MATCHED' && yes.after.leadId === lead.id
      && (await p.leadActivity.count({ where: { leadId: lead.id, type: 'EMAIL', direction: 'inbound' } })) === 1);
    if (process.env.ANTHROPIC_API_KEY) {
      const draft = await p.aiDraft.findFirst({ where: { leadId: lead.id, kind: 'REPLY', inboundEmailId: yes.row.id } });
      check('reply: AI tags it interested/question + suggests a stage + drafts an answer', !!draft && ['interested', 'question'].includes(draft.intent) && !!draft.suggestedStage && draft.body.length > 30);
      log(`   intent=${draft?.intent} stage=${draft?.suggestedStage} subject=${draft?.subject}`);
      check('reply: answer quotes no prices', !/£\s?\d/.test(draft?.body ?? ''));
      const q = await req('/ai-sales/drafts', admin.bearer, 'GET').then((r) => r.json());
      check('reply draft is in AI approvals with their email', q.some((x) => x.id === draft?.id && x.theirEmail?.text?.includes('4 pickers')));
      const fu = await req(`/ai-sales/drafts/${draft.id}/skip`, admin.bearer, 'POST', { applyStage: true });
      check('file it with "move stage" → lead moves to the suggested stage', fu.status === 200 && (await p.lead.findUnique({ where: { id: lead.id } })).stage === draft.suggestedStage);
    } else log('   (AI parts skipped: ANTHROPIC_API_KEY not set)');

    const unsub = await stored('Please remove me from your list.');
    const l2 = await p.lead.findUnique({ where: { id: lead.id } });
    check('unsubscribe reply → lead marked do-not-email, no draft', unsub.after.status === 'UNSUBSCRIBED' && !!l2.unsubscribedAt
      && (await p.aiDraft.count({ where: { inboundEmailId: unsub.row.id } })) === 0);
    check('unsubscribed: sending is refused (400)', (await req(`/leads/${lead.id}/email`, admin.bearer, 'POST', { subject: 'Hi', body: 'Hello' })).status === 400);
    check('unsubscribed: AI draft is refused (400)', (await req(`/leads/${lead.id}/ai-draft`, admin.bearer, 'POST', {})).status === 400);
    check('unsubscribed: no pending drafts left', (await p.aiDraft.count({ where: { leadId: lead.id, status: 'PENDING' } })) === 0);
    const re = await req(`/leads/${lead.id}/unsubscribe`, admin.bearer, 'PATCH', { unsubscribed: false });
    check('staff can allow emails again', re.status === 200 && (await re.json()).unsubscribedAt === null);

    const unknown = await p.inboundEmail.create({ data: { resendEmailId: `e2e-u-${stamp}`, fromEmail: `stranger-${stamp}@example.com`, subject: 'Hello', text: 'Who is this?' } });
    inboundIds.push(unknown.id);
    await req(`/inbound/${unknown.id}/retry`, admin.bearer, 'POST', {});
    const un = await req('/inbound/unhandled', admin.bearer, 'GET').then((r) => r.json());
    check('reply from an unknown address → listed to check', un.some((x) => x.id === unknown.id && x.status === 'UNMATCHED'));
    check('dismiss it', (await req(`/inbound/${unknown.id}/dismiss`, admin.bearer, 'POST', {})).status === 200 && (await p.inboundEmail.findUnique({ where: { id: unknown.id } })).status === 'IGNORED');
  } finally { await done(); }
}

// ── Run everything ──
try {
  await flow('Full journey: client books → worker accepts → timesheet approved', fullJourney);
  await flow('Booking (one-off / fixed / open-ended)', booking);
  await flow('Replacement loop', replacement);
  await flow('Client submissions decision', submissions);
  await flow('Invitation → response', invitations);
  await flow('Timesheet approval', timesheets);
  await flow('Operational alerts', alerts);
  await flow('Reliability appeal', reliability);
  await flow('WordPress enquiry webhook', enquiry);
  await flow('CRM leads + activity log', leads);
  await flow('CRM AI salesperson (auto leads + AI draft)', aiSales);
  await flow('CRM AI approvals queue', aiQueue);
  await flow('CRM AI replies (inbound)', aiReplies);
  log(`\n${allPassed() ? '✅ ALL E2E FLOWS PASSED' : '❌ SOME CHECKS FAILED'}`);
} finally {
  await p.$disconnect();
}
process.exit(allPassed() ? 0 : 1);
