import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService, NotifyKind } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { MatchingService } from '../matching/matching.service';
import { CreateJobDto } from './dto/create-job.dto';
import { ApproveJobDto, RejectJobDto } from './dto/review-job.dto';

/** Stages an admin can move a job into via the generic status endpoint. */
const REVIEW_STAGES: JobStatus[] = [
  JobStatus.DRAFT,
  JobStatus.SUBMITTED,
  JobStatus.UNDER_REVIEW,
  JobStatus.APPROVED,
  JobStatus.RECRUITING,
  JobStatus.CANDIDATES_SUBMITTED,
  JobStatus.PARTIALLY_FILLED,
  JobStatus.FILLED,
  JobStatus.COMPLETED,
  JobStatus.CLOSED,
  JobStatus.CANCELLED,
];

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly matching: MatchingService,
  ) {}

  create(dto: CreateJobDto) {
    const { startDate, endDate, ...rest } = dto;
    return this.prisma.job.create({
      data: {
        ...rest,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      },
    });
  }

  findAll() {
    return this.prisma.job.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { id: true, name: true, city: true } },
        site: { select: { id: true, name: true } },
        _count: { select: { shifts: true, applications: true } },
      },
    });
  }

  async findOne(id: string) {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: {
        client: { include: { contacts: true } },
        site: true,
        shifts: true,
        applications: {
          orderBy: [{ matchScore: 'desc' }],
          include: { candidate: { select: { id: true, firstName: true, lastName: true, rating: true, status: true } } },
        },
        _count: { select: { shifts: true, applications: true } },
      },
    });
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  /** Amend an existing job's operational details (admin edit). */
  async update(id: string, dto: import('./dto/update-job.dto').UpdateJobDto, actorId?: string) {
    await this.requireJob(id);
    const { startDate, endDate, siteId, ...rest } = dto;
    const data: Record<string, unknown> = { ...rest };
    if (startDate !== undefined) data.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) data.endDate = endDate ? new Date(endDate) : null;
    if (siteId !== undefined) data.siteId = siteId || null;

    const updated = await this.prisma.job.update({ where: { id }, data });
    await this.audit.log({
      actorId,
      action: 'job.amended',
      entity: 'Job',
      entityId: id,
      meta: { fields: Object.keys(data) },
    });
    return updated;
  }

  // ── Admin review gate ─────────────────────────────────────────────────────

  /** Generic stage transition (used by the admin job board). */
  async setStatus(id: string, status: JobStatus, actorId?: string) {
    if (!REVIEW_STAGES.includes(status)) {
      throw new BadRequestException(`Unsupported status ${status}`);
    }
    const job = await this.requireJob(id);
    const updated = await this.prisma.job.update({ where: { id }, data: { status } });
    await this.audit.log({
      actorId,
      action: 'job.status_changed',
      entity: 'Job',
      entityId: id,
      meta: { from: job.status, to: status },
    });
    return updated;
  }

  async approve(id: string, dto: ApproveJobDto, actorId?: string) {
    const job = await this.requireJob(id);
    const data: Prisma.JobUpdateInput = {
      status: JobStatus.RECRUITING,
      approvedAt: new Date(),
      approvedById: actorId ?? undefined,
      distributionMode: dto.distributionMode ?? job.distributionMode ?? 'assisted',
      reviewNote: dto.note ?? job.reviewNote,
    };
    if (dto.payRate !== undefined) data.payRate = dto.payRate;
    if (dto.chargeRate !== undefined) data.chargeRate = dto.chargeRate;

    const updated = await this.prisma.job.update({ where: { id }, data });
    await this.audit.log({
      actorId,
      action: 'job.approved',
      entity: 'Job',
      entityId: id,
      meta: {
        payRate: dto.payRate,
        chargeRate: dto.chargeRate,
        distributionMode: updated.distributionMode,
      },
    });
    await this.notifyClient(id, {
      kind: 'JOB_APPROVED',
      subject: `Your staffing request "${job.title}" has been approved`,
      body: `Starff has approved your request for ${job.title}. We are now sourcing suitable workers and will submit candidates for your review shortly.`,
    });
    return updated;
  }

  async reject(id: string, dto: RejectJobDto, actorId?: string) {
    const job = await this.requireJob(id);
    const updated = await this.prisma.job.update({
      where: { id },
      data: { status: JobStatus.CANCELLED, reviewNote: dto.note },
    });
    await this.audit.log({
      actorId,
      action: 'job.rejected',
      entity: 'Job',
      entityId: id,
      meta: { note: dto.note },
    });
    await this.notifyClient(id, {
      kind: 'JOB_REJECTED',
      subject: `Update on your staffing request "${job.title}"`,
      body: `Starff is unable to proceed with this request at the moment. ${dto.note ?? ''}`.trim(),
    });
    return updated;
  }

  async requestInfo(id: string, dto: RejectJobDto, actorId?: string) {
    const job = await this.requireJob(id);
    const updated = await this.prisma.job.update({
      where: { id },
      data: { status: JobStatus.UNDER_REVIEW, reviewNote: dto.note },
    });
    await this.audit.log({
      actorId,
      action: 'job.info_requested',
      entity: 'Job',
      entityId: id,
      meta: { note: dto.note },
    });
    await this.notifyClient(id, {
      kind: 'JOB_INFO_REQUESTED',
      subject: `More information needed for "${job.title}"`,
      body: `Starff needs a little more detail before approving this request: ${dto.note}`,
    });
    return updated;
  }

  /**
   * Admin invites selected candidates to a job. Persists the match score onto
   * each Application, marks it INVITED, and notifies the candidate. Interest is
   * NOT a booking — the candidate must still respond, and admin stays in control.
   */
  async invite(jobId: string, candidateIds: string[], responseDeadline: string | undefined, actorId?: string) {
    const job = await this.requireJob(jobId);
    const invitable: JobStatus[] = [JobStatus.APPROVED, JobStatus.RECRUITING, JobStatus.OFFERS_SENT, JobStatus.CANDIDATES_SUBMITTED, JobStatus.PARTIALLY_FILLED];
    if (!invitable.includes(job.status)) {
      throw new BadRequestException('Job must be approved before candidates can be invited');
    }
    if (!candidateIds?.length) throw new BadRequestException('Select at least one candidate to invite');

    // Score once, index by candidate so we can persist the match rationale.
    const { recommendations } = await this.matching.score(jobId);
    const byId = new Map(recommendations.map((r) => [r.candidateId, r]));
    const deadline = responseDeadline ? new Date(responseDeadline) : undefined;

    const candidates = await this.prisma.candidate.findMany({
      where: { id: { in: candidateIds } },
      include: { user: { select: { id: true, email: true } } },
    });

    let invited = 0;
    for (const c of candidates) {
      const rec = byId.get(c.id);
      const app = await this.prisma.application.upsert({
        where: { jobId_candidateId: { jobId, candidateId: c.id } },
        create: {
          jobId, candidateId: c.id, status: 'INVITED', source: 'admin',
          invitedAt: new Date(), invitedById: actorId ?? undefined, responseDeadline: deadline,
          matchScore: rec?.score ?? null,
          matchReasons: rec?.reasons ?? undefined,
          missingRequirements: rec?.missingRequirements ?? undefined,
        },
        update: {
          status: 'INVITED', invitedAt: new Date(), invitedById: actorId ?? undefined,
          responseDeadline: deadline, respondedAt: null, candidateResponseNote: null,
          matchScore: rec?.score ?? null,
          matchReasons: rec?.reasons ?? undefined,
          missingRequirements: rec?.missingRequirements ?? undefined,
        },
      });
      invited++;
      await this.audit.log({
        actorId, action: 'candidate.invited', entity: 'Application', entityId: app.id,
        meta: { jobId, candidateId: c.id, score: rec?.score ?? null },
      });
      await this.notifications.send({
        to: c.user.email,
        kind: 'JOB_INVITATION',
        subject: `New shift opportunity: ${job.title}`,
        body: `You've been invited to a ${job.title} shift${job.startDate ? ` on ${new Date(job.startDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}` : ''} paying £${Number(job.payRate).toFixed(2)}/hr. Let us know if you're available and interested.`,
        userId: c.user.id,
        actionUrl: process.env.CANDIDATE_PORTAL_URL ? `${process.env.CANDIDATE_PORTAL_URL}/dashboard/invitations` : undefined,
        actionLabel: 'View invitation',
      });
    }

    // Offers are out — reflect that on the job ("Offers sent") unless it's
    // already further along.
    const preOffer: JobStatus[] = [JobStatus.APPROVED, JobStatus.RECRUITING];
    if (preOffer.includes(job.status)) {
      await this.prisma.job.update({ where: { id: jobId }, data: { status: JobStatus.OFFERS_SENT } });
    }
    return { invited };
  }

  /**
   * Admin submits confirmed (INTERESTED) candidates to the client. Only
   * candidates who have confirmed interest can be put forward. A curated admin
   * summary can accompany each. The job moves to CANDIDATES_SUBMITTED.
   */
  async submitToClient(jobId: string, applicationIds: string[], summaries: Record<string, string> | undefined, actorId?: string) {
    const job = await this.requireJob(jobId);
    if (!applicationIds?.length) throw new BadRequestException('Select at least one candidate to submit');

    const apps = await this.prisma.application.findMany({
      where: { id: { in: applicationIds }, jobId },
      include: { candidate: { select: { firstName: true, lastName: true } } },
    });
    const notInterested = apps.filter((a) => a.status !== 'INTERESTED');
    if (notInterested.length > 0) {
      throw new BadRequestException('Only candidates who have confirmed interest can be submitted to the client');
    }

    let submitted = 0;
    for (const a of apps) {
      await this.prisma.application.update({
        where: { id: a.id },
        data: {
          status: 'SUBMITTED_TO_CLIENT',
          submittedToClientAt: new Date(),
          submittedById: actorId ?? undefined,
          adminSummary: summaries?.[a.id] ?? a.adminSummary ?? undefined,
        },
      });
      submitted++;
      await this.audit.log({
        actorId, action: 'candidate.submitted_to_client', entity: 'Application', entityId: a.id,
        meta: { jobId, candidateId: a.candidateId },
      });
    }

    await this.prisma.job.update({ where: { id: jobId }, data: { status: JobStatus.CANDIDATES_SUBMITTED } });

    await this.notifyClient(jobId, {
      kind: 'CANDIDATE_SUBMITTED_TO_CLIENT',
      subject: `${submitted} candidate${submitted > 1 ? 's' : ''} ready for review — ${job.title}`,
      body: `Starff has put ${submitted} candidate${submitted > 1 ? 's' : ''} forward for your ${job.title} request. Please review and accept, reject or request an alternative.`,
      path: '/dashboard/submissions',
      actionLabel: 'Review candidates',
    });
    return { submitted };
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async requireJob(id: string) {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  /** Notify the client's primary contact (falls back to any contact). */
  private async notifyClient(
    jobId: string,
    msg: { kind: NotifyKind; subject: string; body: string; path?: string; actionLabel?: string },
  ) {
    const contacts = await this.prisma.clientContact.findMany({
      where: { client: { jobs: { some: { id: jobId } } } },
      orderBy: { isPrimary: 'desc' },
    });
    const target = contacts[0];
    if (!target) return;
    await this.notifications.send({
      to: target.email,
      kind: msg.kind,
      subject: msg.subject,
      body: msg.body,
      userId: target.userId ?? undefined,
      actionUrl: process.env.CLIENT_PORTAL_URL
        ? `${process.env.CLIENT_PORTAL_URL}${msg.path ?? '/dashboard/bookings'}`
        : undefined,
      actionLabel: msg.actionLabel ?? 'View request',
    });
  }
}
