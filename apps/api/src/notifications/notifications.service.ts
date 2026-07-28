import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The registration/onboarding notification triggers. Each maps to one email +
 * one in-app Notification row. Passwords are NEVER sent — activation always goes
 * through Supabase Auth's own secure invite/magic-link flow.
 */
export type NotifyKind =
  | 'REGISTRATION_RECEIVED'
  | 'ACTIVATION'
  | 'CONTINUE_REGISTRATION'
  | 'REGISTRATION_REMINDER'
  | 'INFO_REQUESTED'
  | 'DOCUMENT_REPLACEMENT'
  | 'REGISTRATION_SUBMITTED'
  | 'REGISTRATION_APPROVED'
  | 'REGISTRATION_REJECTED'
  | 'ACCOUNT_ACTIVATED'
  // ── controlled hybrid recruitment workflow ──
  | 'JOB_SUBMITTED'
  | 'JOB_APPROVED'
  | 'JOB_REJECTED'
  | 'JOB_INFO_REQUESTED'
  | 'JOB_INVITATION'
  | 'CANDIDATE_RESPONSE'
  | 'CANDIDATE_SUBMITTED_TO_CLIENT'
  | 'CLIENT_ACCEPTED'
  | 'CLIENT_REJECTED'
  | 'ALTERNATIVE_REQUESTED'
  | 'PLACEMENT_CONFIRMED'
  | 'SHIFT_CHANGED'
  | 'REPLACEMENT_REQUIRED'
  | 'REPLACEMENT_CONFIRMED'
  | 'RELIABILITY_REVIEW'
  | 'INVOICE_SENT'
  | 'INVOICE_DISPUTED';

interface NotifyInput {
  to: string;
  kind: NotifyKind;
  subject: string;
  body: string;
  actionUrl?: string;
  actionLabel?: string;
  /** if we know the platform user, also drop an in-app notification */
  userId?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Best-effort: records an in-app notification and sends a transactional email
   * via Resend. Neither failure throws — a registration must never be rolled
   * back just because an email bounced (see the error-handling plan). Returns a
   * small status object the caller can log.
   */
  async send(input: NotifyInput): Promise<{ inApp: boolean; emailed: boolean; error?: string }> {
    let inApp = false;

    // 1. In-app notification (only if we have a platform user id)
    if (input.userId) {
      try {
        await this.prisma.notification.create({
          data: {
            userId: input.userId,
            type: input.kind.toLowerCase(),
            title: input.subject,
            body: input.body,
            link: input.actionUrl,
          },
        });
        inApp = true;
      } catch (e) {
        this.logger.warn(`in-app notification failed for ${input.kind}: ${(e as Error).message}`);
      }

      // 1b. Push to the user's mobile devices (best-effort, never throws).
      void this.sendPush(
        input.userId,
        input.subject,
        input.body,
        input.actionUrl ? { link: input.actionUrl } : undefined,
      );
    }

    // 2. Email via Resend — no-ops cleanly when the key isn't configured yet.
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      this.logger.log(`[email skipped: RESEND_API_KEY not set] ${input.kind} → ${input.to}`);
      return { inApp, emailed: false };
    }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.MAIL_FROM ?? 'Starff <noreply@starff.co.uk>',
          to: input.to,
          subject: input.subject,
          html: this.render(input),
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Resend ${res.status} ${detail}`.trim());
      }
      return { inApp, emailed: true };
    } catch (e) {
      // Log and swallow — the caller decides whether to queue a retry.
      this.logger.error(`email send failed for ${input.kind} → ${input.to}: ${(e as Error).message}`);
      return { inApp, emailed: false, error: (e as Error).message };
    }
  }

  // ── Member-facing helpers (mobile app + portals) ──────────────────────────

  /** The current user's notifications, newest first. */
  listForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markRead(userId: string, id: string) {
    // updateMany scopes by userId so a user can only read their own rows.
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async registerPushToken(userId: string, token: string, platform?: string) {
    await this.prisma.pushToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
    });
    return { ok: true };
  }

  async removePushToken(userId: string, token: string) {
    await this.prisma.pushToken.deleteMany({ where: { userId, token } });
    return { ok: true };
  }

  /** Best-effort Expo push to all of a user's registered devices. Never throws. */
  async sendPush(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const tokens = await this.prisma.pushToken.findMany({
        where: { userId },
        select: { token: true },
      });
      if (tokens.length === 0) return;
      const messages = tokens.map((t) => ({
        to: t.token,
        title,
        body,
        sound: 'default',
        ...(data ? { data } : {}),
      }));
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      });
      if (!res.ok) {
        this.logger.warn(`Expo push ${res.status}: ${await res.text().catch(() => '')}`);
      }
    } catch (e) {
      this.logger.warn(`push send failed for user ${userId}: ${(e as Error).message}`);
    }
  }

  private render(input: NotifyInput): string {
    const button = input.actionUrl
      ? `<p style="margin:24px 0"><a href="${input.actionUrl}" style="background:#F47A20;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">${input.actionLabel ?? 'Continue'}</a></p>`
      : '';
    return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0B1F3A;line-height:1.6;max-width:520px;margin:0 auto;padding:24px">
      <h2 style="color:#0B1F3A;margin:0 0 8px">${input.subject}</h2>
      <p style="color:#4A5A70">${input.body}</p>
      ${button}
      <hr style="border:none;border-top:1px solid #E3E8F0;margin:28px 0" />
      <p style="font-size:12px;color:#7B8AA0">Starff · temporary recruitment. If you didn't expect this email you can ignore it.</p>
    </body></html>`;
  }
}
