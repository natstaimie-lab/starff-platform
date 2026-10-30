import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Self-service account closure. Required by Apple (5.1.1(v)) and Google Play:
 * a user who can create an account in the app must be able to start deleting it
 * from inside the app — not via an email or a website.
 *
 * We can't hard-delete on request: right-to-work and payroll records carry
 * statutory retention periods, and admin is the decision-maker for every
 * destructive action. So a request immediately **deactivates** the account
 * (the auth guard then blocks all access) and flags it; an admin completes the
 * erasure of anything not legally retained.
 */
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private displayName(u: { firstName: string | null; lastName: string | null; email: string }) {
    return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email;
  }

  /** A candidate or client asks to delete their account. Idempotent. */
  async requestDeletion(userId: string, reason?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Account not found');

    // Already requested and not yet handled — don't re-notify, just confirm.
    if (user.deletionRequestedAt && !user.deletionHandledAt) {
      return { ok: true, requestedAt: user.deletionRequestedAt, alreadyRequested: true };
    }

    const now = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        deletionRequestedAt: now,
        deletionHandledAt: null,
        deletionReason: reason?.trim()?.slice(0, 1000) || null,
        isActive: false, // locks the account out immediately (auth guard enforces)
      },
    });

    await this.audit.log({
      actorId: userId,
      action: 'account.deletion.requested',
      entity: 'User',
      entityId: userId,
      meta: { role: user.role, reason: reason?.slice(0, 1000) ?? null },
    });

    // Tell every active admin/recruiter so erasure can be processed.
    try {
      const staff = await this.prisma.user.findMany({
        where: { role: { in: [Role.ADMIN, Role.RECRUITER] }, isActive: true },
        select: { id: true, email: true },
      });
      const who = this.displayName(user);
      const audience = user.role === Role.CLIENT ? 'employer' : 'worker';
      const subject = `Account deletion requested — ${who}`;
      const body = `${who} (${audience}) has requested deletion of their account from the app. Their access is now disabled. Review and complete erasure in Admin → Account deletions, keeping any records under statutory retention.`;
      await Promise.all(
        staff.map((s) =>
          this.notifications
            .send({ to: s.email, userId: s.id, kind: 'ACCOUNT_DELETION_REQUEST', subject, body })
            .catch(() => {}),
        ),
      );
    } catch {
      /* best-effort — never blocks the user's request */
    }

    return { ok: true, requestedAt: now, alreadyRequested: false };
  }

  /** Admin: list accounts awaiting deletion (requested, not yet handled). */
  async listRequests() {
    const users = await this.prisma.user.findMany({
      where: { deletionRequestedAt: { not: null }, deletionHandledAt: null },
      orderBy: { deletionRequestedAt: 'asc' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        phone: true,
        deletionRequestedAt: true,
        deletionReason: true,
      },
    });
    return users.map((u) => ({
      userId: u.id,
      name: this.displayName(u),
      email: u.email,
      phone: u.phone,
      role: u.role,
      requestedAt: u.deletionRequestedAt,
      reason: u.deletionReason,
    }));
  }

  /** Admin: restore an account, cancelling the deletion request. */
  async cancel(actorId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Account not found');
    await this.prisma.user.update({
      where: { id: userId },
      data: { deletionRequestedAt: null, deletionReason: null, deletionHandledAt: null, isActive: true },
    });
    await this.audit.log({
      actorId,
      action: 'account.deletion.cancelled',
      entity: 'User',
      entityId: userId,
      meta: { role: user.role },
    });
    return { ok: true };
  }

  /**
   * Admin: mark a deletion request handled once erasure has been carried out
   * (offline, honouring retention). The account stays deactivated; this just
   * records completion and clears it from the pending list.
   */
  async markHandled(actorId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Account not found');
    await this.prisma.user.update({
      where: { id: userId },
      data: { deletionHandledAt: new Date(), isActive: false },
    });
    await this.audit.log({
      actorId,
      action: 'account.deletion.completed',
      entity: 'User',
      entityId: userId,
      meta: { role: user.role },
    });
    return { ok: true };
  }
}
