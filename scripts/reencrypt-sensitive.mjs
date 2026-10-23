/**
 * Re-encrypt the sensitive candidate fields from an OLD ENCRYPTION_KEY to a NEW
 * one — so ENCRYPTION_KEY can be rotated without losing the encrypted NI / bank
 * data. Runs raw SQL (bypasses the Prisma field-crypto middleware) so it can hold
 * both keys at once. Matches apps/api/src/prisma/field-crypto.ts exactly:
 *   AES-256-GCM, key = sha256(secret), stored as enc:v1:<ivB64>:<tagB64>:<ctB64>.
 *
 * DRY RUN by default. Pass --confirm to write.
 *
 * Env:  DATABASE_URL, OLD_ENCRYPTION_KEY, NEW_ENCRYPTION_KEY
 * Run:  DATABASE_URL=... OLD_ENCRYPTION_KEY=... NEW_ENCRYPTION_KEY=... \
 *         node scripts/reencrypt-sensitive.mjs            # preview
 *         ... node scripts/reencrypt-sensitive.mjs --confirm
 */
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const PREFIX = 'enc:v1:';
const FIELDS = ['nationalInsurance', 'bankAccountName', 'bankSortCode', 'bankAccountNumber'];
const CONFIRM = process.argv.includes('--confirm');

const keyOf = (s) => crypto.createHash('sha256').update(s).digest();
const OLD = process.env.OLD_ENCRYPTION_KEY;
const NEW = process.env.NEW_ENCRYPTION_KEY;

function decrypt(value, key) {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value; // plaintext/legacy
  const [ivB, tagB, ctB] = value.slice(PREFIX.length).split(':');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB, 'base64'));
  d.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ctB, 'base64')), d.final()]).toString('utf8');
}
function encrypt(value, key) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(String(value), 'utf8'), c.final()]);
  return `${PREFIX}${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
}

async function main() {
  if (!OLD || !NEW) throw new Error('Set OLD_ENCRYPTION_KEY and NEW_ENCRYPTION_KEY.');
  const oldKey = keyOf(OLD), newKey = keyOf(NEW);
  const prisma = new PrismaClient();
  try {
    const cols = FIELDS.map((f) => `"${f}"`).join(', ');
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, ${cols} FROM "Candidate" WHERE ${FIELDS.map((f) => `"${f}" IS NOT NULL`).join(' OR ')}`,
    );
    console.log(`${CONFIRM ? 'EXECUTING' : 'DRY RUN'} — ${rows.length} candidate(s) with sensitive data.\n`);

    let changed = 0;
    for (const row of rows) {
      const updates = {};
      for (const f of FIELDS) {
        const v = row[f];
        if (v == null) continue;
        let plain;
        try { plain = decrypt(v, oldKey); }
        catch { console.log(`  ! ${row.id}.${f}: could NOT decrypt with OLD key — skipping`); continue; }
        updates[f] = encrypt(plain, newKey);
      }
      const keys = Object.keys(updates);
      if (!keys.length) continue;
      console.log(`  ${row.id}: re-encrypting ${keys.join(', ')}`);
      if (CONFIRM) {
        const sets = keys.map((f, i) => `"${f}" = $${i + 2}`).join(', ');
        await prisma.$executeRawUnsafe(
          `UPDATE "Candidate" SET ${sets} WHERE id = $1`,
          row.id, ...keys.map((f) => updates[f]),
        );
      }
      changed++;
    }
    console.log(`\n${CONFIRM ? 'Re-encrypted' : 'Would re-encrypt'} ${changed} candidate(s).`);
    if (!CONFIRM) console.log('Re-run with --confirm to write.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; });
