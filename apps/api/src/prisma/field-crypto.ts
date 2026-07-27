import * as crypto from 'crypto';
import { Logger } from '@nestjs/common';

/**
 * Application-level field encryption for sensitive personal data (bank details,
 * National Insurance). Values are encrypted before they hit Postgres and
 * decrypted on read, transparently, via Prisma middleware — so plaintext never
 * lands in the database, backups or logs.
 *
 * Algorithm: AES-256-GCM (authenticated). Stored form:
 *   enc:v1:<base64 iv>:<base64 authTag>:<base64 ciphertext>
 *
 * Migration-safe: legacy plaintext rows (no `enc:v1:` prefix) are returned
 * as-is on read and get encrypted the next time they're written.
 */
const logger = new Logger('FieldCrypto');
const PREFIX = 'enc:v1:';
let warnedNoKey = false;

/** Which fields are encrypted, per Prisma model. */
export const ENCRYPTED_FIELDS: Record<string, string[]> = {
  Candidate: ['nationalInsurance', 'bankAccountName', 'bankSortCode', 'bankAccountNumber'],
};

function getKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    if (!warnedNoKey) {
      logger.warn(
        'ENCRYPTION_KEY is not set — sensitive fields are stored WITHOUT encryption. Set it before production.',
      );
      warnedNoKey = true;
    }
    return null;
  }
  // Derive a stable 32-byte key from any provided secret.
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptField(value: unknown): unknown {
  if (typeof value !== 'string' || value.length === 0) return value;
  if (value.startsWith(PREFIX)) return value; // already encrypted
  const key = getKey();
  if (!key) return value; // dev fallback: passthrough
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decryptField(value: unknown): unknown {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value; // legacy/plain
  const key = getKey();
  if (!key) return value;
  try {
    const [ivB, tagB, ctB] = value.slice(PREFIX.length).split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB, 'base64'));
    const pt = Buffer.concat([decipher.update(Buffer.from(ctB, 'base64')), decipher.final()]);
    return pt.toString('utf8');
  } catch (e) {
    logger.error(`decrypt failed: ${(e as Error).message}`);
    return value; // fail safe — don't crash reads
  }
}

/** Encrypt sensitive fields inside a Prisma write payload (handles `{set}` form). */
function encryptData(data: Record<string, unknown>, fields: string[]) {
  for (const f of fields) {
    const v = data[f];
    if (v == null) continue;
    if (typeof v === 'object' && v !== null && 'set' in (v as object)) {
      (v as { set: unknown }).set = encryptField((v as { set: unknown }).set);
    } else {
      data[f] = encryptField(v);
    }
  }
}

export function encryptWriteArgs(args: any, fields: string[]) {
  if (!args) return;
  if (args.data) {
    if (Array.isArray(args.data)) args.data.forEach((d: any) => encryptData(d, fields));
    else encryptData(args.data, fields);
  }
  if (args.create) encryptData(args.create, fields); // upsert
  if (args.update) encryptData(args.update, fields); // upsert
}

export function decryptResult(result: any, fields: string[]) {
  if (!result) return;
  const dec = (rec: any) => {
    if (rec && typeof rec === 'object') {
      for (const f of fields) if (f in rec) rec[f] = decryptField(rec[f]);
    }
  };
  if (Array.isArray(result)) result.forEach(dec);
  else dec(result);
}
