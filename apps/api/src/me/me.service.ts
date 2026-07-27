import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationStatus, Role, ShiftStatus, TimesheetStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  private async candidateFor(userId: string) {
    const candidate = await this.prisma.candidate.findUnique({ where: { userId } });
    if (!candidate) throw new NotFoundException('No candidate profile for this account');
    return candidate;
  }

  /** OPEN jobs the candidate can apply to, flagged with whether they already have. */
  async openJobs(userId: string) {
    const candidate = await this.candidateFor(userId);
    const applied = await this.prisma.application.findMany({
      where: { candidateId: candidate.id },
      select: { jobId: true },
    });
    const appliedIds = new Set(applied.map((a) => a.jobId));
    const jobs = await this.prisma.job.findMany({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        client: { select: { name: true } },
        site: { select: { name: true, city: true } },
      },
    });
    return jobs.map((j) => ({
      id: j.id,
      title: j.title,
      payRate: j.payRate,
      openings: j.openings,
      client: j.client?.name ?? 'Starff',
      city: j.site?.city ?? null,
      applied: appliedIds.has(j.id),
    }));
  }

  /** Apply to a job — idempotent via the unique [jobId, candidateId] constraint. */
  async applyToJob(userId: string, jobId: string) {
    const candidate = await this.candidateFor(userId);
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');
    return this.prisma.application.upsert({
      where: { jobId_candidateId: { jobId, candidateId: candidate.id } },
      create: { jobId, candidateId: candidate.id, status: 'APPLIED', source: 'mobile' },
      update: {},
    });
  }

  // ── Shift monitoring / check-in (worker actions) ────────────────────────────

  private async ownShift(userId: string, shiftId: string) {
    const candidate = await this.candidateFor(userId);
    const shift = await this.prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift || shift.candidateId !== candidate.id) throw new NotFoundException('Shift not found');
    return { candidate, shift };
  }

  /** Worker confirms they'll attend a booked shift. */
  async acknowledgeShift(userId: string, shiftId: string) {
    const { candidate, shift } = await this.ownShift(userId, shiftId);
    if (shift.status === ShiftStatus.CANCELLED) throw new BadRequestException('This shift was cancelled');
    await this.prisma.shift.update({
      where: { id: shiftId },
      data: { acknowledgedAt: shift.acknowledgedAt ?? new Date(), status: shift.status === ShiftStatus.ASSIGNED ? ShiftStatus.CONFIRMED : shift.status },
    });
    await this.audit.log({ actorId: candidate.userId, action: 'shift.acknowledged', entity: 'Shift', entityId: shiftId, meta: { jobId: shift.jobId } });
    // If every booked worker on the job has acknowledged, mark the job CONFIRMED.
    const jobShifts = await this.prisma.shift.findMany({ where: { jobId: shift.jobId, candidateId: { not: null }, status: { not: ShiftStatus.CANCELLED } }, select: { acknowledgedAt: true } });
    if (jobShifts.length > 0 && jobShifts.every((s) => s.acknowledgedAt)) {
      await this.prisma.job.update({ where: { id: shift.jobId }, data: { status: 'CONFIRMED' } }).catch(() => {});
    }
    return { ok: true };
  }

  /** Worker checks in on the day. */
  async checkIn(userId: string, shiftId: string) {
    const { candidate, shift } = await this.ownShift(userId, shiftId);
    if (shift.status === ShiftStatus.CANCELLED) throw new BadRequestException('This shift was cancelled');
    await this.prisma.shift.update({
      where: { id: shiftId },
      data: { checkInAt: shift.checkInAt ?? new Date(), acknowledgedAt: shift.acknowledgedAt ?? new Date(), status: ShiftStatus.IN_PROGRESS },
    });
    await this.audit.log({ actorId: candidate.userId, action: 'shift.checked_in', entity: 'Shift', entityId: shiftId, meta: { jobId: shift.jobId } });
    await this.prisma.job.update({ where: { id: shift.jobId }, data: { status: 'IN_PROGRESS' } }).catch(() => {});
    return { ok: true };
  }

  /** Worker checks out — completes the shift. */
  async checkOut(userId: string, shiftId: string) {
    const { candidate, shift } = await this.ownShift(userId, shiftId);
    await this.prisma.shift.update({
      where: { id: shiftId },
      data: { checkOutAt: new Date(), status: ShiftStatus.COMPLETED },
    });
    await this.audit.log({ actorId: candidate.userId, action: 'shift.checked_out', entity: 'Shift', entityId: shiftId, meta: { jobId: shift.jobId } });
    return { ok: true };
  }

  /** Worker flags they're running late — raises an operational alert for staff. */
  async reportLate(userId: string, shiftId: string) {
    const { candidate, shift } = await this.ownShift(userId, shiftId);
    await this.prisma.shift.update({ where: { id: shiftId }, data: { lateReportedAt: new Date() } });
    await this.audit.log({ actorId: candidate.userId, action: 'shift.reported_late', entity: 'Shift', entityId: shiftId, meta: { jobId: shift.jobId } });
    const staff = await this.prisma.user.findMany({ where: { role: { in: [Role.ADMIN, Role.RECRUITER] }, isActive: true }, select: { id: true, email: true } });
    const job = await this.prisma.job.findUnique({ where: { id: shift.jobId }, select: { title: true } });
    await Promise.all(staff.map((s) => this.notifications.send({
      to: s.email, kind: 'SHIFT_CHANGED',
      subject: `${candidate.firstName} ${candidate.lastName} is running late`,
      body: `${candidate.firstName} flagged they're running late for the ${job?.title ?? 'shift'} starting ${shift.startAt.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`,
      userId: s.id,
    })));
    return { ok: true };
  }

  // ── Job invitations (admin → candidate; candidate confirms interest) ─────────

  /** Statuses that belong on the candidate's "shift offers" screen — from the
   *  initial offer through to Starff confirming (so it never just "vanishes"
   *  after they respond). Once BOOKED it moves to My Bookings; CLIENT_REJECTED /
   *  REPLACED drop off. */
  private static readonly INVITE_STAGES: ApplicationStatus[] = [
    'INVITED', 'INTERESTED', 'UNAVAILABLE', 'INFO_REQUESTED', 'ALTERNATIVE_REQUESTED',
    'SUBMITTED_TO_CLIENT', 'CLIENT_ACCEPTED',
  ];
  /** Statuses from which a candidate may still (re)state their response. */
  private static readonly RESPONDABLE: ApplicationStatus[] = [
    'INVITED', 'INTERESTED', 'UNAVAILABLE', 'INFO_REQUESTED',
  ];

  /**
   * The candidate's job invitations. Returns ONLY candidate-safe fields — no
   * confidential client info (company name, full address, charge rate, internal
   * match score, or admin notes are all withheld).
   */
  async invitations(userId: string) {
    const candidate = await this.candidateFor(userId);
    // Delivery tracking: mark still-pending offers as opened the first time the
    // candidate views them.
    await this.prisma.application.updateMany({
      where: { candidateId: candidate.id, status: 'INVITED', offerOpenedAt: null },
      data: { offerOpenedAt: new Date() },
    });
    const apps = await this.prisma.application.findMany({
      where: { candidateId: candidate.id, status: { in: MeService.INVITE_STAGES } },
      orderBy: [{ invitedAt: 'desc' }],
      include: {
        job: {
          include: {
            site: { select: { city: true } },
            client: { select: { city: true } },
            skills: { include: { skill: { select: { name: true } } } },
          },
        },
      },
    });
    return apps.map((a) => ({
      id: a.id,
      status: a.status,
      invitedAt: a.invitedAt,
      responseDeadline: a.responseDeadline,
      respondedAt: a.respondedAt,
      responseNote: a.candidateResponseNote,
      job: {
        title: a.job.title,
        sector: a.job.sector,
        startDate: a.job.startDate,
        endDate: a.job.endDate,
        // general location only — never the client company or full address
        location: a.job.site?.city ?? a.job.client?.city ?? null,
        payRate: a.job.payRate,
        skills: a.job.skills.map((s) => s.skill.name),
        ppe: a.job.ppe,
        instructions: a.job.siteInstructions,
        breakInfo: a.job.breakInfo,
      },
    }));
  }

  /** Candidate responds to an invitation. Interest is NOT a booking. */
  async respondToInvitation(
    userId: string,
    applicationId: string,
    response: 'INTERESTED' | 'UNAVAILABLE' | 'DECLINE' | 'INFO',
    note?: string,
  ) {
    const candidate = await this.candidateFor(userId);
    const app = await this.prisma.application.findUnique({ where: { id: applicationId } });
    if (!app || app.candidateId !== candidate.id) throw new NotFoundException('Invitation not found');
    if (!MeService.RESPONDABLE.includes(app.status)) {
      throw new BadRequestException('This invitation can no longer be updated');
    }
    const map: Record<string, ApplicationStatus> = {
      INTERESTED: 'INTERESTED', UNAVAILABLE: 'UNAVAILABLE', DECLINE: 'DECLINED', INFO: 'INFO_REQUESTED',
    };
    const status = map[response];
    if (!status) throw new BadRequestException('Invalid response');

    const updated = await this.prisma.application.update({
      where: { id: applicationId },
      data: { status, respondedAt: new Date(), candidateResponseNote: note ?? null },
    });
    await this.audit.log({
      actorId: candidate.userId, action: 'candidate.responded', entity: 'Application', entityId: applicationId,
      meta: { response: status, jobId: app.jobId },
    });

    // Notify staff (prefer the recruiter who invited; else all active staff).
    const job = await this.prisma.job.findUnique({ where: { id: app.jobId }, select: { title: true } });
    const invitedBy = app.invitedById
      ? await this.prisma.user.findUnique({ where: { id: app.invitedById }, select: { id: true, email: true, isActive: true } })
      : null;
    const recipients = invitedBy?.isActive
      ? [invitedBy]
      : await this.prisma.user.findMany({ where: { role: { in: [Role.ADMIN, Role.RECRUITER] }, isActive: true }, select: { id: true, email: true } });
    const who = `${candidate.firstName} ${candidate.lastName}`;
    const verb = status === 'INTERESTED' ? 'is available & interested in' : status === 'UNAVAILABLE' ? 'is not available for' : status === 'DECLINED' ? 'declined' : 'asked for more info on';
    await Promise.all(
      recipients.map((r) =>
        this.notifications.send({
          to: r.email, kind: 'CANDIDATE_RESPONSE',
          subject: `${who} ${verb} ${job?.title ?? 'a shift'}`,
          body: `${who} ${verb} the ${job?.title ?? 'shift'}.${note ? ` Note: ${note}` : ''}`,
          userId: r.id,
        }),
      ),
    );
    return { id: updated.id, status: updated.status };
  }

  /** Everything the candidate dashboard needs about the logged-in candidate. */
  async profile(userId: string) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { userId },
      include: {
        documents: true,
        availability: true,
        shifts: {
          orderBy: { startAt: 'asc' },
          include: {
            job: {
              select: {
                title: true, ppe: true, uniform: true, breakInfo: true,
                reportingContact: true, reportingInstructions: true, siteInstructions: true,
                client: { select: { name: true, addressLine1: true, city: true, postcode: true } },
              },
            },
            site: { select: { name: true, addressLine1: true, city: true, postcode: true } },
          },
        },
        timesheets: {
          orderBy: { createdAt: 'desc' },
          include: { shift: { select: { startAt: true, payRate: true, job: { select: { title: true, client: { select: { name: true } } } } } } },
        },
      },
    });
    if (!candidate) throw new NotFoundException('No candidate profile for this account');
    return candidate;
  }

  /** Open shifts the candidate could accept (not yet assigned to anyone). */
  async offers() {
    return this.prisma.shift.findMany({
      where: { status: ShiftStatus.OPEN, candidateId: null },
      orderBy: { startAt: 'asc' },
      include: {
        job: { select: { title: true, payRate: true, client: { select: { name: true } } } },
        site: { select: { name: true, city: true } },
      },
    });
  }

  /** Accept an open shift → assign it to this candidate. */
  async acceptOffer(userId: string, shiftId: string) {
    const candidate = await this.candidateFor(userId);
    const shift = await this.prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift) throw new NotFoundException('Shift not found');
    if (shift.candidateId || shift.status !== ShiftStatus.OPEN) {
      throw new BadRequestException('This shift is no longer available');
    }
    return this.prisma.shift.update({
      where: { id: shiftId },
      data: { candidateId: candidate.id, status: ShiftStatus.ASSIGNED },
    });
  }

  /** Replace the candidate's weekly availability (array of day numbers 0-6). */
  async setAvailability(userId: string, days: number[]) {
    const candidate = await this.candidateFor(userId);
    await this.prisma.availability.deleteMany({ where: { candidateId: candidate.id } });
    await this.prisma.availability.createMany({
      data: days.map((d) => ({ candidateId: candidate.id, dayOfWeek: d, startTime: '00:00', endTime: '23:59' })),
    });
    return this.prisma.availability.findMany({ where: { candidateId: candidate.id } });
  }

  /** Submit a timesheet for one of the candidate's completed shifts. */
  async submitTimesheet(userId: string, shiftId: string) {
    const candidate = await this.candidateFor(userId);
    const shift = await this.prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift || shift.candidateId !== candidate.id) throw new NotFoundException('Shift not found');
    const hours = Math.max(0, (shift.endAt.getTime() - shift.startAt.getTime()) / 3600000 - shift.breakMinutes / 60);
    return this.prisma.timesheet.upsert({
      where: { shiftId },
      update: { status: TimesheetStatus.SUBMITTED, hoursWorked: Number(hours.toFixed(2)) },
      create: {
        shiftId,
        candidateId: candidate.id,
        status: TimesheetStatus.SUBMITTED,
        clockIn: shift.startAt,
        clockOut: shift.endAt,
        breakMinutes: shift.breakMinutes,
        hoursWorked: Number(hours.toFixed(2)),
      },
    });
  }

  /** Record a document the candidate uploaded (file already in Supabase Storage). */
  async addDocument(userId: string, dto: { type: string; fileUrl: string; fileName?: string }) {
    const candidate = await this.candidateFor(userId);
    return this.prisma.candidateDocument.create({
      data: {
        candidateId: candidate.id,
        type: dto.type as any,
        fileUrl: dto.fileUrl,
        fileName: dto.fileName,
      },
    });
  }

  // ── Employment history ──
  async listEmployment(userId: string) {
    const candidate = await this.candidateFor(userId);
    return this.prisma.employmentHistory.findMany({
      where: { candidateId: candidate.id },
      orderBy: [{ current: 'desc' }, { startDate: 'desc' }],
    });
  }

  async addEmployment(
    userId: string,
    dto: { employer: string; jobTitle?: string; startDate?: string; endDate?: string; current?: boolean; reasonForLeaving?: string },
  ) {
    const candidate = await this.candidateFor(userId);
    if (!dto.employer?.trim()) throw new BadRequestException('Employer is required');
    return this.prisma.employmentHistory.create({
      data: {
        candidateId: candidate.id,
        employer: dto.employer.trim(),
        jobTitle: dto.jobTitle?.trim() || null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.current || !dto.endDate ? null : new Date(dto.endDate),
        current: !!dto.current,
        reasonForLeaving: dto.reasonForLeaving?.trim() || null,
      },
    });
  }

  async removeEmployment(userId: string, id: string) {
    const candidate = await this.candidateFor(userId);
    const row = await this.prisma.employmentHistory.findUnique({ where: { id } });
    if (!row || row.candidateId !== candidate.id) throw new NotFoundException('Employment record not found');
    await this.prisma.employmentHistory.delete({ where: { id } });
    return { deleted: true };
  }

  // ── References ──
  async listReferences(userId: string) {
    const candidate = await this.candidateFor(userId);
    return this.prisma.candidateReference.findMany({
      where: { candidateId: candidate.id },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addReference(
    userId: string,
    dto: { name: string; relationship?: string; company?: string; email?: string; phone?: string },
  ) {
    const candidate = await this.candidateFor(userId);
    if (!dto.name?.trim()) throw new BadRequestException('Reference name is required');
    return this.prisma.candidateReference.create({
      data: {
        candidateId: candidate.id,
        name: dto.name.trim(),
        relationship: dto.relationship?.trim() || null,
        company: dto.company?.trim() || null,
        email: dto.email?.trim() || null,
        phone: dto.phone?.trim() || null,
      },
    });
  }

  async removeReference(userId: string, id: string) {
    const candidate = await this.candidateFor(userId);
    const row = await this.prisma.candidateReference.findUnique({ where: { id } });
    if (!row || row.candidateId !== candidate.id) throw new NotFoundException('Reference not found');
    await this.prisma.candidateReference.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Declarations, consent, agreement & e-signature ──
  // Timestamps are stamped the first time each is accepted and cleared if undone,
  // so we keep a genuine record of when the candidate consented/signed.
  async setDeclarations(
    userId: string,
    dto: { healthDeclaration?: boolean; healthNotes?: string; consentGdpr?: boolean; agreementAccepted?: boolean; signatureName?: string },
  ) {
    const candidate = await this.candidateFor(userId);
    const now = new Date();
    const data: Record<string, unknown> = {};

    if (dto.healthDeclaration !== undefined) data.healthDeclaration = !!dto.healthDeclaration;
    if (dto.healthNotes !== undefined) data.healthNotes = dto.healthNotes?.trim() || null;

    if (dto.consentGdpr !== undefined) {
      data.consentGdpr = !!dto.consentGdpr;
      data.consentGdprAt = dto.consentGdpr ? (candidate.consentGdprAt ?? now) : null;
    }
    if (dto.agreementAccepted !== undefined) {
      data.agreementAccepted = !!dto.agreementAccepted;
      data.agreementAcceptedAt = dto.agreementAccepted ? (candidate.agreementAcceptedAt ?? now) : null;
    }
    if (dto.signatureName !== undefined) {
      const name = dto.signatureName?.trim() || null;
      data.signatureName = name;
      data.signedAt = name ? (candidate.signedAt ?? now) : null;
    }

    return this.prisma.candidate.update({ where: { id: candidate.id }, data });
  }
}
