import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ApplicationStatus, JobStatus, ShiftStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';

/** Statuses from which an admin may confirm a booking. */
const BOOKABLE: ApplicationStatus[] = ['CLIENT_ACCEPTED', 'SUBMITTED_TO_CLIENT', 'INTERESTED'];

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Final gated placement. Admin confirms a candidate → creates the Shift,
   * guards against double-booking and over-filling, marks the application BOOKED
   * and advances the job to PARTIALLY_FILLED / FILLED. Sends confirmations.
   */
  async book(applicationId: string, actorId?: string) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        job: { include: { site: true } },
        candidate: { include: { user: { select: { id: true, email: true } } } },
      },
    });
    if (!app) throw new NotFoundException('Application not found');
    if (app.shiftId) throw new BadRequestException('This candidate is already booked for this job');
    if (!BOOKABLE.includes(app.status)) {
      throw new BadRequestException('Only interested / client-accepted candidates can be booked');
    }
    const job = app.job;
    if (!job.startDate || !job.endDate) {
      throw new BadRequestException('Set the shift start and finish time on the job before booking');
    }
    const recurring = job.recurrenceDays.length > 0;
    if (recurring && (!job.shiftStartTime || !job.shiftEndTime)) {
      throw new BadRequestException('Set the daily start and finish time on the recurring job before booking');
    }

    // Openings guard — count distinct workers already booked (one BOOKED
    // application per worker, whether the job is one-off or recurring).
    const bookedCount = await this.prisma.application.count({
      where: { jobId: job.id, status: 'BOOKED' },
    });
    if (bookedCount >= job.openings) {
      throw new BadRequestException('All openings for this job are already filled');
    }

    // Expand the pattern into concrete occurrences (a single one for one-off jobs).
    const occurrences = this.buildOccurrences({
      startDate: job.startDate, endDate: job.endDate,
      recurrenceDays: job.recurrenceDays, shiftStartTime: job.shiftStartTime, shiftEndTime: job.shiftEndTime,
    });
    if (occurrences.length === 0) {
      throw new BadRequestException('This recurring pattern produces no shifts in the selected date range');
    }

    // Double-booking guard — reject if ANY occurrence overlaps an existing
    // active shift for this candidate; name the first clashing date.
    for (const o of occurrences) {
      const clash = await this.prisma.shift.findFirst({
        where: {
          candidateId: app.candidateId,
          status: { notIn: [ShiftStatus.CANCELLED, ShiftStatus.NO_SHOW] },
          startAt: { lt: o.endAt },
          endAt: { gt: o.startAt },
        },
      });
      if (clash) {
        throw new ConflictException(`Candidate is already booked for an overlapping shift on ${o.startAt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`);
      }
    }

    const breakMinutes = this.parseBreak(job.breakInfo);

    // Create every occurrence as a Shift (each blocks that window and carries its
    // own check-in / timesheet / attendance). One transaction, chronological.
    const created = await this.prisma.$transaction(
      occurrences.map((o) => this.prisma.shift.create({
        data: {
          jobId: job.id,
          siteId: job.siteId ?? undefined,
          candidateId: app.candidateId,
          status: ShiftStatus.ASSIGNED,
          startAt: o.startAt,
          endAt: o.endAt,
          breakMinutes,
          payRate: job.payRate,
          chargeRate: job.chargeRate,
          notes: job.siteInstructions ?? undefined,
        },
      })),
    );
    const firstShift = created[0]; // earliest — occurrences are built in order

    await this.prisma.application.update({
      where: { id: applicationId },
      data: { status: 'BOOKED', bookedAt: new Date(), bookedById: actorId ?? undefined, shiftId: firstShift.id },
    });

    // Advance the job: filled when every opening is booked.
    const nowBooked = bookedCount + 1;
    const jobStatus = nowBooked >= job.openings ? JobStatus.FILLED : JobStatus.PARTIALLY_FILLED;
    await this.prisma.job.update({ where: { id: job.id }, data: { status: jobStatus } });

    await this.audit.log({
      actorId, action: 'application.booked', entity: 'Application', entityId: applicationId,
      meta: { jobId: job.id, candidateId: app.candidateId, shiftId: firstShift.id, shiftCount: created.length, recurring, jobStatus },
    });

    await this.sendConfirmations(app, job, firstShift, created.length);
    return { shiftId: firstShift.id, shiftCount: created.length, jobStatus, booked: nowBooked, openings: job.openings };
  }

  /** Expand a job into concrete shift occurrences. One-off jobs (no recurrence
   *  days) yield a single shift from the raw start/end datetimes. Recurring jobs
   *  yield one occurrence per matching weekday between startDate and endDate at
   *  the daily shift times. */
  private buildOccurrences(job: {
    startDate: Date; endDate: Date; recurrenceDays: number[];
    shiftStartTime: string | null; shiftEndTime: string | null;
  }): { startAt: Date; endAt: Date }[] {
    if (!job.recurrenceDays || job.recurrenceDays.length === 0) {
      return [{ startAt: job.startDate, endAt: job.endDate }];
    }
    const [sh, sm] = (job.shiftStartTime ?? '09:00').split(':').map(Number);
    const [eh, em] = (job.shiftEndTime ?? '17:00').split(':').map(Number);
    const days = new Set(job.recurrenceDays);
    const out: { startAt: Date; endAt: Date }[] = [];
    const cur = new Date(job.startDate.getFullYear(), job.startDate.getMonth(), job.startDate.getDate());
    const last = new Date(job.endDate.getFullYear(), job.endDate.getMonth(), job.endDate.getDate());
    let guard = 0;
    while (cur <= last && guard++ < 400) {
      if (days.has(cur.getDay())) {
        const startAt = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), sh || 0, sm || 0);
        let endAt = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), eh || 0, em || 0);
        if (endAt <= startAt) endAt = new Date(endAt.getTime() + 24 * 3600 * 1000); // overnight shift
        out.push({ startAt, endAt });
      }
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  /**
   * Replace a booked worker (they cancelled, failed compliance, became
   * unavailable or were removed). Cancels the shift (history is preserved — the
   * row is kept as CANCELLED, never deleted), marks the application REPLACED,
   * re-opens the vacancy so admin can source an alternative, and notifies.
   */
  async replace(applicationId: string, reason: string | undefined, actorId?: string) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        job: true,
        candidate: { include: { user: { select: { id: true, email: true } } } },
      },
    });
    if (!app) throw new NotFoundException('Application not found');
    if (app.status !== 'BOOKED' || !app.shiftId) {
      throw new BadRequestException('Only a confirmed booking can be replaced');
    }
    const job = app.job;

    // Cancel the shift — kept as history, never deleted.
    await this.prisma.shift.update({
      where: { id: app.shiftId },
      data: { status: ShiftStatus.CANCELLED, notes: reason ? `Replacement required: ${reason}` : 'Replacement required' },
    });
    await this.prisma.application.update({
      where: { id: applicationId },
      data: { status: 'REPLACED', candidateResponseNote: reason ?? app.candidateResponseNote },
    });

    // Re-open the vacancy.
    const activeBooked = await this.prisma.shift.count({
      where: { jobId: job.id, candidateId: { not: null }, status: { not: ShiftStatus.CANCELLED } },
    });
    const jobStatus = activeBooked > 0 ? JobStatus.PARTIALLY_FILLED : JobStatus.RECRUITING;
    await this.prisma.job.update({ where: { id: job.id }, data: { status: jobStatus } });

    await this.audit.log({
      actorId, action: 'application.replaced', entity: 'Application', entityId: applicationId,
      meta: { jobId: job.id, candidateId: app.candidateId, shiftId: app.shiftId, reason: reason ?? null },
    });

    // Notify the removed candidate (their shift is cancelled)…
    await this.notifications.send({
      to: app.candidate.user.email,
      kind: 'SHIFT_CHANGED',
      subject: `Your ${job.title} shift has been cancelled`,
      body: `Your booking for ${job.title}${job.startDate ? ` on ${job.startDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}` : ''} has been cancelled.${reason ? ` Reason: ${reason}` : ''}`,
      userId: app.candidate.user.id,
    });
    // …and the client (a replacement is being arranged).
    const contact = await this.prisma.clientContact.findFirst({
      where: { client: { jobs: { some: { id: job.id } } } },
      orderBy: { isPrimary: 'desc' },
    });
    if (contact) {
      await this.notifications.send({
        to: contact.email,
        kind: 'REPLACEMENT_REQUIRED',
        subject: `Arranging a replacement for ${job.title}`,
        body: `A worker on your ${job.title} shift is no longer available. Starff is sourcing a replacement and will confirm shortly.`,
        userId: contact.userId ?? undefined,
      });
    }
    return { status: 'REPLACED', jobStatus };
  }

  /** Admin withdraws an offer that hasn't been booked yet. */
  async withdrawOffer(applicationId: string, actorId?: string) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { job: { select: { title: true } }, candidate: { include: { user: { select: { id: true, email: true } } } } },
    });
    if (!app) throw new NotFoundException('Application not found');
    const withdrawable: string[] = ['INVITED', 'INTERESTED', 'UNAVAILABLE', 'INFO_REQUESTED', 'SUBMITTED_TO_CLIENT'];
    if (!withdrawable.includes(app.status)) {
      throw new BadRequestException('This offer can no longer be withdrawn');
    }
    await this.prisma.application.update({ where: { id: applicationId }, data: { status: 'WITHDRAWN' } });
    await this.audit.log({ actorId, action: 'offer.withdrawn', entity: 'Application', entityId: applicationId, meta: { jobId: app.jobId, candidateId: app.candidateId } });
    await this.notifications.send({
      to: app.candidate.user.email,
      kind: 'SHIFT_CHANGED',
      subject: `Update on the ${app.job.title} offer`,
      body: `The ${app.job.title} offer is no longer available. Thanks for your interest — we'll be in touch with other opportunities.`,
      userId: app.candidate.user.id,
    });
    return { status: 'WITHDRAWN' };
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private parseBreak(breakInfo?: string | null): number {
    if (!breakInfo) return 0;
    const m = breakInfo.match(/\d+/);
    return m ? Math.min(parseInt(m[0], 10), 480) : 0;
  }

  private async sendConfirmations(
    app: { candidate: { firstName: string; user: { id: string; email: string } } },
    job: { id: string; title: string; startDate: Date | null; endDate: Date | null; payRate: any; ppe?: string | null; reportingContact?: string | null; reportingInstructions?: string | null; site?: { name: string; city?: string | null } | null; client?: unknown },
    shift: { startAt: Date; endAt: Date },
    shiftCount = 1,
  ) {
    const when = shift.startAt.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const finish = shift.endAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const loc = job.site?.name ?? job.site?.city ?? 'the site';
    const recurring = shiftCount > 1;
    const whenLine = recurring ? `First shift: ${when}–${finish} (${shiftCount} shifts in total)` : `When: ${when}–${finish}`;

    // Candidate — full shift confirmation.
    const details = [
      `Role: ${job.title}`,
      whenLine,
      `Where: ${loc}`,
      job.reportingContact ? `Report to: ${job.reportingContact}` : null,
      job.reportingInstructions ? `Arrival: ${job.reportingInstructions}` : null,
      job.ppe ? `PPE: ${job.ppe}` : null,
      `Pay: £${Number(job.payRate).toFixed(2)}/hr`,
      'To cancel, contact Starff as early as possible per your agency terms.',
    ].filter(Boolean).join('\n');
    await this.notifications.send({
      to: app.candidate.user.email,
      kind: 'PLACEMENT_CONFIRMED',
      subject: recurring ? `You're booked: ${job.title} — ${shiftCount} shifts from ${when}` : `You're booked: ${job.title} on ${when}`,
      body: details,
      userId: app.candidate.user.id,
      actionUrl: process.env.CANDIDATE_PORTAL_URL ? `${process.env.CANDIDATE_PORTAL_URL}/dashboard/bookings` : undefined,
      actionLabel: 'View booking',
    });

    // Client — worker confirmed for their booking.
    const contact = await this.prisma.clientContact.findFirst({
      where: { client: { jobs: { some: { id: job.id } } } },
      orderBy: { isPrimary: 'desc' },
    });
    if (contact) {
      await this.notifications.send({
        to: contact.email,
        kind: 'PLACEMENT_CONFIRMED',
        subject: `Worker confirmed for ${job.title}`,
        body: recurring
          ? `${app.candidate.firstName} is confirmed for your ${job.title} — ${shiftCount} recurring shifts starting ${when}. You can view them under Assigned Workers.`
          : `${app.candidate.firstName} is confirmed for your ${job.title} shift on ${when}. You can view them under Assigned Workers.`,
        userId: contact.userId ?? undefined,
        actionUrl: process.env.CLIENT_PORTAL_URL ? `${process.env.CLIENT_PORTAL_URL}/dashboard/workers` : undefined,
        actionLabel: 'View workers',
      });
    }
  }
}
