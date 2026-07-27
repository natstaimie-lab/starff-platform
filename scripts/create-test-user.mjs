// Create a ready-to-use TEST login (pre-confirmed, no email step) for live testing.
//
//   npm run create-test-user -- worker  alice@test.com
//   npm run create-test-user -- worker  alice@test.com Passw0rd! --name "Alice Stone" --status COMPLIANT
//   npm run create-test-user -- client  bob@acme.com  Passw0rd! --name "Bob Lee" --company "Acme Ltd"
//
// Types: worker | candidate  → candidate portal (:3002)
//        client | employer   → client portal    (:3003)
//
// Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env. Idempotent-ish:
// re-running with the same email tops up the profile rather than erroring.
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;

// ── parse args ──
const argv = process.argv.slice(2);
const positional = [];
const flags = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { flags[argv[i].slice(2)] = argv[i + 1]; i++; }
  else positional.push(argv[i]);
}
const [typeRaw, email, passwordArg] = positional;
const type = (typeRaw || '').toLowerCase();
const isWorker = ['worker', 'candidate'].includes(type);
const isClient = ['client', 'employer'].includes(type);

if (!isWorker && !isClient || !email) {
  console.error('Usage: npm run create-test-user -- <worker|client> <email> [password] [--name "First Last"] [--company "Co"] [--status STATUS]');
  process.exit(1);
}
const password = passwordArg || flags.password || 'Test1234!';
const [firstName = 'Test', ...restName] = (flags.name || (isWorker ? 'Test Worker' : 'Test Client')).split(' ');
const lastName = restName.join(' ') || 'User';

async function findAuthUserByEmail(e) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }).then((x) => x.json());
  return (r.users || []).find((u) => u.email?.toLowerCase() === e.toLowerCase());
}

try {
  // 1. Auth user — pre-confirmed so it can log in immediately.
  let auth = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { firstName, lastName } }),
  }).then((r) => r.json());
  if (!auth.id) {
    // Likely already exists — reuse it and reset the password so login is known.
    const existing = await findAuthUserByEmail(email);
    if (!existing) throw new Error('Could not create or find auth user: ' + JSON.stringify(auth));
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${existing.id}`, {
      method: 'PUT', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, email_confirm: true }),
    });
    auth = existing;
    console.log('ℹ️  auth user already existed — reused and password reset');
  }
  const userId = auth.id;
  const role = isWorker ? 'CANDIDATE' : 'CLIENT';

  // 2. Platform User row.
  await p.user.upsert({ where: { id: userId }, create: { id: userId, email, role, firstName, lastName, isActive: true }, update: { role, firstName, lastName, isActive: true } });

  // 3. Profile.
  if (isWorker) {
    const status = flags.status || 'ACTIVE';
    await p.candidate.upsert({ where: { userId }, create: { userId, firstName, lastName, status }, update: { firstName, lastName, status } });
    console.log(`\n✅ WORKER (candidate) ready — status ${status}`);
  } else {
    const companyName = flags.company || `${firstName}'s Company`;
    const existingContact = await p.clientContact.findUnique({ where: { userId }, include: { client: true } });
    if (existingContact) {
      await p.client.update({ where: { id: existingContact.clientId }, data: { name: companyName } });
    } else {
      const client = await p.client.create({ data: { name: companyName, status: 'ACTIVE', registrationSource: 'MOBILE', billingEmail: email } });
      await p.clientContact.create({ data: { clientId: client.id, userId, email, firstName, lastName, isPrimary: true } });
    }
    console.log(`\n✅ CLIENT (employer) ready — company "${companyName}"`);
  }

  // 4. Confirm the login actually works.
  const tok = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  }).then((r) => r.json());
  const loginOk = !!tok.access_token;

  const portal = isWorker ? 'http://localhost:3002/login' : 'http://localhost:3003/login';
  console.log('   ────────────────────────────────');
  console.log(`   Portal:   ${portal}`);
  console.log(`   Email:    ${email}`);
  console.log(`   Password: ${password}`);
  console.log(`   Login check: ${loginOk ? '✅ works' : '⚠️ could not sign in — check Supabase email-confirm setting'}`);
  console.log('   ────────────────────────────────');
} finally {
  await p.$disconnect();
}
