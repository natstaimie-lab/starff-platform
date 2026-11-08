// Create ONE demo candidate login + ONE demo client login, connected through
// ONE demo job — for walkthroughs of the candidate and client portals.
//
//   npm run demo:setup
//   npm run demo:setup -- --stage booked
//   npm run demo:setup -- --password 'S0mething!' --candidate-email a@x.com --client-email b@y.com
//   npm run demo:setup -- --remove          # delete exactly the demo rows (by id)
//
// Stages (where the demo application sits in the admin-gated pipeline):
//   invited    admin has invited the candidate      → candidate sees a shift offer
//   submitted  admin put the candidate to the client → client sees them in Submissions
//              (default)                              candidate sees "with client"
//   booked     admin booked the placement            → both see an upcoming shift
//
// Non-destructive: never clears tables. Every row it makes is tagged [DEMO] and
// looked up by the demo users' ids, so re-running tops up rather than duplicating.
// Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, DATABASE_URL in .env.
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;

// ── args ──
const argv = process.argv.slice(2);
const flags = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const key = argv[i].slice(2);
  const next = argv[i + 1];
  if (next === undefined || next.startsWith('--')) flags[key] = true;
  else { flags[key] = next; i++; }
}
const CANDIDATE_EMAIL = flags['candidate-email'] || 'demo.candidate@example.com';
const CLIENT_EMAIL = flags['client-email'] || 'demo.client@example.com';
const PASSWORD = flags.password || 'StarffDemo1!';
const STAGE = (flags.stage || 'submitted').toLowerCase();
const REMOVE = !!flags.remove;

const COMPANY = '[DEMO] Midlands Distribution Ltd';
const SITE = '[DEMO] Birmingham Warehouse';
const JOB_TITLE = '[DEMO] Warehouse Operative';

if (!['invited', 'submitted', 'booked'].includes(STAGE)) {
  console.error('--stage must be one of: invited | submitted | booked');
  process.exit(1);
}
if (!SUPABASE_URL || !SERVICE || !ANON) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const adminHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

async function findAuthUserByEmail(email) {
  for (let page = 1; page <= 20; page++) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: adminHeaders }).then((x) => x.json());
    const users = r.users || [];
    const hit = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (users.length < 200) return null;
  }
  return null;
}

/** Create (or reuse + reset password on) a pre-confirmed Supabase auth user. */
async function ensureAuthUser(email, firstName, lastName) {
  const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true, user_metadata: { firstName, lastName, demo: true } }),
  }).then((r) => r.json());
  if (created.id) return created.id;
  const existing = await findAuthUserByEmail(email);
  if (!existing) throw new Error(`Could not create or find auth user ${email}: ${JSON.stringify(created)}`);
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${existing.id}`, {
    method: 'PUT', headers: adminHeaders, body: JSON.stringify({ password: PASSWORD, email_confirm: true }),
  });
  return existing.id;
}

/** Upsert the platform User row — refusing to repurpose an admin/staff account. */
async function ensureUser(id, email, role, firstName, lastName) {
  const existing = await p.user.findUnique({ where: { id } });
  if (existing && existing.role !== role) {
    throw new Error(`${email} already exists with role ${existing.role} — pick a different demo email`);
  }
  await p.user.upsert({
    where: { id },
    create: { id, email, role, firstName, lastName, isActive: true },
    update: { firstName, lastName, isActive: true },
  });
}

async function canLogIn(email) {
  const tok = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  }).then((r) => r.json());
  return !!tok.access_token;
}

const nextWeekday = (daysAhead, hour) => {
  const d = new Date(Date.now() + daysAhead * 86400000);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d;
};

async function remove() {
  const candAuth = await findAuthUserByEmail(CANDIDATE_EMAIL);
  const clientAuth = await findAuthUserByEmail(CLIENT_EMAIL);
  const contact = clientAuth ? await p.clientContact.findUnique({ where: { userId: clientAuth.id } }) : null;
  const client = contact ? await p.client.findUnique({ where: { id: contact.clientId } }) : null;
  const candidate = candAuth ? await p.candidate.findUnique({ where: { userId: candAuth.id } }) : null;

  // Only delete rows that are unmistakably ours.
  if (client && client.name === COMPANY) {
    const jobs = await p.job.findMany({ where: { clientId: client.id, title: JOB_TITLE }, select: { id: true } });
    for (const j of jobs) {
      const shifts = await p.shift.findMany({ where: { jobId: j.id }, select: { id: true } });
      for (const s of shifts) {
        await p.timesheet.deleteMany({ where: { shiftId: s.id } });
        await p.shift.delete({ where: { id: s.id } });
      }
      await p.job.delete({ where: { id: j.id } }); // cascades its applications / skills
    }
    await p.client.delete({ where: { id: client.id } }); // cascades contacts / sites
    console.log('🗑  removed demo client, site, job, applications, shifts');
  }
  for (const [auth, label] of [[candAuth, 'candidate'], [clientAuth, 'client']]) {
    if (!auth || !auth.user_metadata?.demo) continue;
    if (label === 'candidate' && candidate) await p.candidate.delete({ where: { id: candidate.id } });
    await p.user.deleteMany({ where: { id: auth.id } });
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${auth.id}`, { method: 'DELETE', headers: adminHeaders });
    console.log(`🗑  removed demo ${label} login ${auth.email}`);
  }
}

async function create() {
  // 1. Candidate login + compliant profile (no sensitive fields populated).
  const candUserId = await ensureAuthUser(CANDIDATE_EMAIL, 'Demo', 'Candidate');
  await ensureUser(candUserId, CANDIDATE_EMAIL, 'CANDIDATE', 'Demo', 'Candidate');
  const candidate = await p.candidate.upsert({
    where: { userId: candUserId },
    create: {
      userId: candUserId, firstName: 'Demo', lastName: 'Candidate', status: 'COMPLIANT', available: true,
      headline: 'Warehouse Operative, 3 yrs', city: 'Birmingham', registrationSource: 'ADMIN',
      preferredSectors: ['Warehouse & Logistics'], shiftPreference: 'Days', submittedAt: new Date(),
    },
    update: { firstName: 'Demo', lastName: 'Candidate', status: 'COMPLIANT', available: true },
  });

  // 2. Client login + active client company with a site.
  const clientUserId = await ensureAuthUser(CLIENT_EMAIL, 'Demo', 'Client');
  await ensureUser(clientUserId, CLIENT_EMAIL, 'CLIENT', 'Demo', 'Client');
  let contact = await p.clientContact.findUnique({ where: { userId: clientUserId } });
  let client;
  if (contact) {
    client = await p.client.update({ where: { id: contact.clientId }, data: { status: 'ACTIVE' } });
  } else {
    client = await p.client.create({
      data: {
        name: COMPANY, industry: 'Logistics', city: 'Birmingham', postcode: 'B6 7EU', status: 'ACTIVE',
        billingEmail: CLIENT_EMAIL, paymentTerms: 30, registrationSource: 'ADMIN',
        agreementAccepted: true, agreementAcceptedAt: new Date(), signatureName: 'Demo Client', signedAt: new Date(),
        notes: 'Demo account for portal walkthroughs — safe to remove with `npm run demo:setup -- --remove`.',
      },
    });
    contact = await p.clientContact.create({
      data: { clientId: client.id, userId: clientUserId, email: CLIENT_EMAIL, firstName: 'Demo', lastName: 'Client', jobTitle: 'Operations Manager', isPrimary: true },
    });
  }
  let site = await p.clientSite.findFirst({ where: { clientId: client.id, name: SITE } });
  if (!site) site = await p.clientSite.create({ data: { clientId: client.id, name: SITE, city: 'Birmingham', postcode: 'B6 7EU' } });

  // 3. The demo job, owned by the demo client.
  const jobStatus = { invited: 'OFFERS_SENT', submitted: 'CANDIDATES_SUBMITTED', booked: 'FILLED' }[STAGE];
  const startAt = nextWeekday(3, 8);
  const endAt = new Date(startAt); endAt.setHours(16, 0, 0, 0);
  const jobData = {
    status: jobStatus, siteId: site.id, openings: 1, payRate: 13.5, chargeRate: 19.5,
    startDate: startAt, endDate: endAt, shiftStartTime: '08:00', shiftEndTime: '16:00',
    description: 'Picking, packing and loading in a busy distribution centre. Demo job.',
    sector: 'Warehouse & Logistics', ppe: 'Safety boots, hi-vis (provided)', breakInfo: '30 min unpaid',
    reportingInstructions: 'Report to Gate 2 reception and ask for the shift lead.', bookingUrgency: 'Standard',
    submittedAt: new Date(), approvedAt: new Date(),
  };
  let job = await p.job.findFirst({ where: { clientId: client.id, title: JOB_TITLE } });
  job = job
    ? await p.job.update({ where: { id: job.id }, data: jobData })
    : await p.job.create({ data: { clientId: client.id, title: JOB_TITLE, ...jobData } });

  // 4. Connect the candidate to the job at the chosen pipeline stage.
  const now = new Date();
  const appData = {
    source: 'admin', matchScore: 88,
    matchReasons: ['Lives within 5 miles of site', 'Warehouse experience', 'Available weekdays'],
    invitedAt: now, responseDeadline: new Date(Date.now() + 2 * 86400000),
    status: 'INVITED', respondedAt: null, submittedToClientAt: null, adminSummary: null, bookedAt: null,
  };
  if (STAGE !== 'invited') Object.assign(appData, {
    status: 'SUBMITTED_TO_CLIENT', respondedAt: now, candidateResponseNote: 'Available and happy to take this.',
    submittedToClientAt: now, adminSummary: 'Reliable warehouse operative with 3 years’ picking and packing experience. Fully compliant.',
  });
  let app = await p.application.upsert({
    where: { jobId_candidateId: { jobId: job.id, candidateId: candidate.id } },
    create: { jobId: job.id, candidateId: candidate.id, ...appData },
    update: appData,
  });

  // 5. Booked stage: one ASSIGNED shift for the candidate, linked from the application.
  let shift = await p.shift.findFirst({ where: { jobId: job.id } });
  if (STAGE === 'booked') {
    if (!shift) {
      shift = await p.shift.create({
        data: { jobId: job.id, siteId: site.id, candidateId: candidate.id, status: 'ASSIGNED', startAt, endAt, breakMinutes: 30, payRate: job.payRate, chargeRate: job.chargeRate, notes: '[DEMO]' },
      });
    }
    app = await p.application.update({
      where: { id: app.id },
      data: { status: 'BOOKED', clientDecidedAt: now, bookedAt: now, shiftId: shift.id },
    });
  } else if (shift) {
    // Moving back to an earlier stage: drop the demo shift so state stays consistent.
    await p.timesheet.deleteMany({ where: { shiftId: shift.id } });
    await p.shift.delete({ where: { id: shift.id } });
    await p.application.update({ where: { id: app.id }, data: { shiftId: null } });
  }

  const [candOk, clientOk] = await Promise.all([canLogIn(CANDIDATE_EMAIL), canLogIn(CLIENT_EMAIL)]);
  const tick = (ok) => (ok ? '✅ login works' : '⚠️ could not sign in — check Supabase auth settings');
  console.log(`\n✅ Demo setup ready — stage: ${STAGE}`);
  console.log('   ─────────────────────────────────────────────');
  console.log(`   Candidate  ${CANDIDATE_EMAIL} / ${PASSWORD}   ${tick(candOk)}`);
  console.log('              https://my.starff.co.uk  (local :3002)');
  console.log(`   Client     ${CLIENT_EMAIL} / ${PASSWORD}   ${tick(clientOk)}`);
  console.log('              https://client.starff.co.uk  (local :3003)');
  console.log(`   Job        ${JOB_TITLE} @ ${COMPANY}  [${job.status}]  id ${job.id}`);
  console.log(`   Application ${app.status}  id ${app.id}${shift && STAGE === 'booked' ? `   Shift ${shift.id}` : ''}`);
  console.log('   ─────────────────────────────────────────────');
}

try {
  await (REMOVE ? remove() : create());
} catch (e) {
  console.error('❌', e.message || e);
  process.exitCode = 1;
} finally {
  await p.$disconnect();
}
