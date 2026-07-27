// Promote an existing Supabase auth user to ADMIN in the Starff database.
//
// Usage (from the repo root):
//   1. Create the login first in Supabase → Authentication → Users → Add user
//      (set an email + password, tick "Auto Confirm User").
//   2. Run:  npm run promote-admin -- you@starff.co.uk
//
// This finds that auth user and creates/updates their row in our User table
// with role = ADMIN. It never sets or sees the password.

import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';

const email = process.argv[2];
if (!email) {
  console.error('Usage: npm run promote-admin -- you@starff.co.uk');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Find the auth user by email (scan the first pages of users).
let match = null;
for (let page = 1; page <= 10 && !match; page++) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
  if (error) {
    console.error('Could not list users:', error.message);
    process.exit(1);
  }
  match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (data.users.length < 200) break;
}

if (!match) {
  console.error(
    `No Supabase auth user found with email "${email}".\n` +
      'Create it first: Supabase dashboard → Authentication → Users → Add user.',
  );
  process.exit(1);
}

const prisma = new PrismaClient();
await prisma.user.upsert({
  where: { id: match.id },
  update: { role: 'ADMIN', email },
  create: { id: match.id, email, role: 'ADMIN', firstName: 'Admin' },
});
await prisma.$disconnect();

console.log(`✅ ${email} is now an ADMIN (user id ${match.id}). You can log in to the dashboard.`);
