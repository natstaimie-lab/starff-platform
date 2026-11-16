import { createHmac, timingSafeEqual } from 'crypto';

/** Svix-signed webhooks (what Resend uses) older or newer than this are refused. */
const TOLERANCE_SECONDS = 5 * 60;

/**
 * Verify a Resend (Svix) webhook: HMAC-SHA256 over "id.timestamp.rawBody"
 * with the base64 secret after "whsec_", compared against every "v1,<sig>"
 * in the svix-signature header. Exported for tests.
 */
export function verifySvix(secret: string, rawBody: string, headers: { id?: string; timestamp?: string; signature?: string }, now = Date.now()): boolean {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > TOLERANCE_SECONDS) return false;
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();
  return signature.split(' ').some((part) => {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) return false;
    const given = Buffer.from(sig, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
