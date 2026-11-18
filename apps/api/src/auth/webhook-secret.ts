import { timingSafeEqual } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';

/**
 * Checks the shared `X-Webhook-Secret` header sent by the WordPress site / app.
 *
 * Fails closed: if WORDPRESS_WEBHOOK_SECRET is not configured, every request is
 * rejected (previously a missing env var made `undefined === undefined` pass).
 * Compares in constant time so the secret can't be guessed byte-by-byte.
 */
export function assertWebhookSecret(provided?: string): void {
  const expected = process.env.WORDPRESS_WEBHOOK_SECRET;
  if (!expected || !provided) {
    throw new UnauthorizedException('Bad webhook secret');
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new UnauthorizedException('Bad webhook secret');
  }
}
