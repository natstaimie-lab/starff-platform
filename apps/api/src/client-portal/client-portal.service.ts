import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JobStatus, Role, ShiftStatus, TimesheetStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { ReliabilityService } from '../reliability/reliability.service';

@Injectable()
export class ClientPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly reliability: ReliabilityService,
  ) {}

  /** Resolve the Client company for the logged-in client-contact user. */
  private async clientFor(userId: string) {
    const contact = await this.prisma.clientContact.findUnique({
      where: { userId },
      include: { client: true },
    });
    if (!contact) throw new NotFoundException('No client account for this login');
    return { contact, client: contact.client };
  }

  async me(userId: string) {
    const { contact, client } = await this.clientFor(userId);
    return { client, contact: { firstName: contact.firstName, lastName: contact.lastName, email: contact.email } };
  }

  /**
   * Self-provision a company for a brand-new employer who signed up in the
   * mobile app. Idempotent: if this user already has a client-contact it just
   * returns it (so it's safe to call on every login). Mirrors the candidate's
   * idempotent POST /candidates — no duplicate accounts are created.
   */
  async registerCompany(
    userId: string,
    email: string | undefined,
    dto: { companyName: string; firstName?: string; lastName?: string; phone?: string },
  ) {
    const existing = await this.prisma.clientContact.findUnique({
      where: { userId },
      include: { client: true },
    });
    if (existing) return { client: existing.client, contact: existing };

    // Ensure the mirrored User row exists with the CLIENT role.
    await this.prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: email ?? `${userId}@placeholder.starff`,
        role: 'CLIENT',
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
      update: { role: 'CLIENT' },
    });

    const client = await this.prisma.client.create({
      data: {
        name: dto.companyName.trim(),
        status: 'LEAD',
        registrationSource: 'MOBILE',
        billingEmail: email,
      },
    });
    const contact = await this.prisma.clientContact.create({
      data: {
        clientId: client.id,
        userId,
        email: email ?? '',
        firstName: dto.firstName ?? '',
        lastName: dto.lastName ?? '',
        phone: dto.phone,
        isPrimary: true,
      },
    });
    return { client, contact };
  }

  async overview(userId: string) {
    const { client } = await this.clientFor(userId);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(); dayEnd.setHours(23, 59, 59, 999);

    const [activeBookings, todayShifts, timesheetsPending, invoiceAgg] = await Promise.all([
      this.prisma.job.count({ where: { clientId: client.id, status: { in: [JobStatus.OPEN, JobStatus.FILLED] } } }),
      this.prisma.shift.findMany({ where: { job: { clientId: client.id }, candidateId: { not: null }, startAt: { gte: dayStart, lte: dayEnd } }, select: { candidateId: true } }),
      this.prisma.timesheet.count({ where: { status: TimesheetStatus.SUBMITTED, shift: { job: { clientId: client.id } } } }),
      this.prisma.invoice.aggregate({ _sum: { total: true }, where: { clientId: client.id, createdAt: { gte: startOfMonth } } }),
    ]);

    const workersOnSiteToday = new Set(todayShifts.map((s) => s.candidateId)).size;
    return {
      company: client.name,
      activeBookings,
      workersOnSiteToday,
      timesheetsPending,
      spendMtd: Number(invoiceAgg._sum.total ?? 0),
    };
  }

  async jobs(userId: string) {
    const { client } = await this.clientFor(userId);
    const jobs = await this.prisma.job.findMany({
      where: { clientId: client.id },
      orderBy: { createdAt: 'desc' },
      include: {
        site: { select: { name: true } },
        shifts: { select: { candidateId: true } },
      },
    });
    return jobs.map((j) => ({
      id: j.id,
      title: j.title,
      status: j.status,
      openings: j.openings,
      site: j.site?.name ?? null,
      filled: j.shifts.filter((s) => s.candidateId).length,
      total: Math.max(j.openings, j.shifts.length),
      // When Starff has asked for more detail the job sits in UNDER_REVIEW with
      // a reviewNote — the portal surfaces this so the client can respond.
      reviewNote: j.status === JobStatus.UNDER_REVIEW ? j.reviewNote : null,
    }));
  }

  /** A single job owned by this client, with the fields the Book form edits.
   *  Scoped so a client can only ever load their own request. */
  async job(userId: string, id: string) {
    const { client } = await this.clientFor(userId);
    const job = await this.prisma.job.findFirst({
      where: { id, clientId: client.id },
      include: { site: { select: { id: true, name: true } } },
    });
    if (!job) throw new NotFoundException('Job not found');
    return {
      id: job.id,
      title: job.title,
      status: job.status,
      reviewNote: job.status === JobStatus.UNDER_REVIEW ? job.reviewNote : null,
      payRate: job.payRate,
      chargeRate: job.chargeRate,
      openings: job.openings,
      siteId: job.siteId,
      sector: job.sector,
      description: job.description,
      ppe: job.ppe,
      uniform: job.uniform,
      siteInstructions: job.siteInstructions,
      reportingContact: job.reportingContact,
      reportingInstructions: job.reportingInstructions,
      requiredQualifications: job.requiredQualifications,
      experienceRequirements: job.experienceRequirements,
      transportRequirements: job.transportRequirements,
      clientRequirements: job.clientRequirements,
      bookingUrgency: job.bookingUrgency,
      breakInfo: job.breakInfo,
      notes: job.notes,
      startDate: job.startDate?.toISOString() ?? null,
      endDate: job.endDate?.toISOString() ?? null,
      recurrenceDays: job.recurrenceDays,
      shiftStartTime: job.shiftStartTime,
      shiftEndTime: job.shiftEndTime,
      openEnded: job.openEnded,
    };
  }

  /** Client edits their own request while it is still awaiting review (SUBMITTED
   *  or UNDER_REVIEW). Re-stamps it SUBMITTED, clears any review note, and
   *  re-notifies staff. Once Starff has approved/started recruiting, edits are
   *  locked here and must go through the admin amend flow. */
  async updateJob(
    userId: string,
    id: string,
    dto: {
      title?: string;
      payRate?: number;
      chargeRate?: number;
      openings?: number;
      siteId?: string | null;
      sector?: string;
      description?: string;
      ppe?: string;
      uniform?: string;
      siteInstructions?: string;
      reportingContact?: string;
      reportingInstructions?: string;
      requiredQualifications?: string;
      experienceRequirements?: string;
      transportRequirements?: string;
      clientRequirements?: string;
      bookingUrgency?: string;
      breakInfo?: string;
      notes?: string;
      startDate?: string | null;
      endDate?: string | null;
      recurrenceDays?: number[];
      shiftStartTime?: string | null;
      shiftEndTime?: string | null;
      openEnded?: boolean;
      responseNote?: string;
    },
  ) {
    const { client, contact } = await this.clientFor(userId);
    const existing = await this.prisma.job.findFirst({ where: { id, clientId: client.id } });
    if (!existing) throw new NotFoundException('Job not found');
    if (existing.status !== JobStatus.SUBMITTED && existing.status !== JobStatus.UNDER_REVIEW) {
      throw new BadRequestException('This request is already being processed by Starff and can no longer be edited here.');
    }

    // Only assign fields the client actually sent (partial update).
    const data: Record<string, unknown> = {};
    const scalar: (keyof typeof dto)[] = [
      'title', 'description', 'sector', 'ppe', 'uniform', 'siteInstructions',
      'reportingContact', 'reportingInstructions', 'requiredQualifications',
      'experienceRequirements', 'transportRequirements', 'clientRequirements',
      'bookingUrgency', 'breakInfo', 'notes',
    ];
    for (const k of scalar) if (dto[k] !== undefined) data[k] = dto[k];
    if (dto.payRate !== undefined) data.payRate = dto.payRate;
    if (dto.chargeRate !== undefined) data.chargeRate = dto.chargeRate;
    if (dto.openings !== undefined) data.openings = dto.openings;
    if (dto.siteId !== undefined) data.siteId = dto.siteId || null;
    if (dto.startDate !== undefined) data.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.endDate !== undefined) data.endDate = dto.endDate ? new Date(dto.endDate) : null;
    if (dto.recurrenceDays !== undefined) data.recurrenceDays = dto.recurrenceDays;
    if (dto.shiftStartTime !== undefined) data.shiftStartTime = dto.shiftStartTime || null;
    if (dto.shiftEndTime !== undefined) data.shiftEndTime = dto.shiftEndTime || null;
    if (dto.openEnded !== undefined) data.openEnded = dto.openEnded;

    // Responding to a request-for-info returns the job to the review queue.
    data.status = JobStatus.SUBMITTED;
    data.submittedAt = new Date();
    data.reviewNote = null;

    const job = await this.prisma.job.update({ where: { id }, data });

    await this.audit.log({
      actorId: userId,
      action: 'job.resubmitted',
      entity: 'Job',
      entityId: job.id,
      meta: { fields: Object.keys(data), note: dto.responseNote ?? null },
    });

    const staff = await this.prisma.user.findMany({
      where: { role: { in: [Role.ADMIN, Role.RECRUITER] }, isActive: true },
      select: { id: true, email: true },
    });
    const who = `${contact.firstName} ${contact.lastName}`.trim() || client.name;
    await Promise.all(
      staff.map((s) =>
        this.notifications.send({
          to: s.email,
          kind: 'JOB_SUBMITTED',
          subject: `Updated staffing request from ${client.name}`,
          body: `${who} updated the request for ${job.title} and resubmitted it for review.${dto.responseNote ? ` Note: ${dto.responseNote}` : ''}`,
          userId: s.id,
        }),
      ),
    );

    return job;
  }

  /** Client asks Starff to change a booking that's already past review (e.g.
   *  confirmed). It doesn't edit the job — it notifies staff to action it,
   *  audited, so bookings with workers already assigned change under control. */
  async requestChange(userId: string, id: string, note: string) {
    const { client, contact } = await this.clientFor(userId);
    const job = await this.prisma.job.findFirst({ where: { id, clientId: client.id }, select: { id: true, title: true } });
    if (!job) throw new NotFoundException('Job not found');
    if (!note?.trim()) throw new BadRequestException('Describe the change you need');

    await this.audit.log({ actorId: userId, action: 'job.change_requested', entity: 'Job', entityId: id, meta: { note } });
    const staff = await this.prisma.user.findMany({
      where: { role: { in: [Role.ADMIN, Role.RECRUITER] }, isActive: true }, select: { id: true, email: true },
    });
    const who = `${contact.firstName} ${contact.lastName}`.trim() || client.name;
    await Promise.all(
      staff.map((s) => this.notifications.send({
        to: s.email, kind: 'JOB_SUBMITTED',
        subject: `Change requested — ${job.title} (${client.name})`,
        body: `${who} requested a change to their ${job.title} booking: ${note}`,
        userId: s.id,
      })),
    );
    return { ok: true };
  }

  /** Client contests a sent invoice — flags Starff to review it. Does NOT
   *  change the invoice; Starff investigate and amend/void or explain. */
  async contestInvoice(userId: string, id: string, reason: string) {
    const { client, contact } = await this.clientFor(userId);
    if (!reason?.trim()) throw new BadRequestException('Please tell us what looks wrong');
    const invoice = await this.prisma.invoice.findFirst({ where: { id, clientId: client.id }, select: { id: true, number: true, total: true, status: true } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'DRAFT' || invoice.status === 'VOID') throw new BadRequestException('This invoice cannot be contested');

    await this.audit.log({ actorId: userId, action: 'invoice.contested', entity: 'Invoice', entityId: id, meta: { number: invoice.number, reason } });
    const staff = await this.prisma.user.findMany({
      where: { role: { in: [Role.ADMIN, Role.RECRUITER] }, isActive: true }, select: { id: true, email: true },
    });
    const who = `${contact.firstName} ${contact.lastName}`.trim() || client.name;
    await Promise.all(
      staff.map((s) => this.notifications.send({
        to: s.email, kind: 'INVOICE_DISPUTED',
        subject: `Invoice ${invoice.number} contested — ${client.name}`,
        body: `${who} is contesting invoice ${invoice.number} (£${Number(invoice.total).toFixed(2)}): ${reason}`,
        userId: s.id,
        actionUrl: '/dashboard/timesheets',
      })),
    );
    return { ok: true };
  }

  async timesheets(userId: string) {
    const { client } = await this.clientFor(userId);
    return this.prisma.timesheet.findMany({
      where: { status: TimesheetStatus.SUBMITTED, shift: { job: { clientId: client.id } } },
      orderBy: { createdAt: 'desc' },
      include: {
        candidate: { select: { firstName: true, lastName: true } },
        shift: { select: { startAt: true, job: { select: { title: true } } } },
      },
    });
  }

  async approveTimesheet(userId: string, timesheetId: string) {
    const { client } = await this.clientFor(userId);
    const ts = await this.prisma.timesheet.findUnique({
      where: { id: timesheetId },
      include: { shift: { include: { job: true } } },
    });
    if (!ts) throw new NotFoundException('Timesheet not found');
    if (ts.shift.job.clientId !== client.id) throw new ForbiddenException('Not your timesheet');
    return this.prisma.timesheet.update({ where: { id: timesheetId }, data: { status: TimesheetStatus.APPROVED, approvedAt: new Date() } });
  }

  async invoices(userId: string) {
    const { client } = await this.clientFor(userId);
    return this.prisma.invoice.findMany({ where: { clientId: client.id }, orderBy: { createdAt: 'desc' } });
  }

  /** One invoice with its line items — scoped to the requesting client. */
  async invoice(userId: string, id: string) {
    const { client } = await this.clientFor(userId);
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            timesheet: {
              select: {
                hoursWorked: true,
                candidate: { select: { firstName: true, lastName: true } },
                shift: { select: { startAt: true, job: { select: { title: true } } } },
              },
            },
          },
        },
      },
    });
    if (!invoice || invoice.clientId !== client.id) {
      throw new NotFoundException('Invoice not found');
    }
    return invoice;
  }

  async locations(userId: string) {
    const { client } = await this.clientFor(userId);
    const sites = await this.prisma.clientSite.findMany({ where: { clientId: client.id } });
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(); dayEnd.setHours(23, 59, 59, 999);
    return Promise.all(sites.map(async (s) => {
      const shifts = await this.prisma.shift.findMany({ where: { siteId: s.id, candidateId: { not: null }, startAt: { gte: dayStart, lte: dayEnd } }, select: { candidateId: true } });
      return { id: s.id, name: s.name, address: [s.addressLine1, s.city, s.postcode].filter(Boolean).join(', '), workers: new Set(shifts.map((x) => x.candidateId)).size };
    }));
  }

  /** Redacted detail for a worker assigned to this client's jobs. Same
   *  whitelist as submissions() — never any PII (surname, address, NI/bank,
   *  documents, medical, contact). Scoped: 404 unless the worker actually has
   *  a shift on one of this client's jobs. */
  async workerDetail(userId: string, candidateId: string) {
    const { client } = await this.clientFor(userId);
    const shifts = await this.prisma.shift.findMany({
      where: { candidateId, job: { clientId: client.id } },
      orderBy: { startAt: 'desc' },
      select: {
        id: true, status: true, startAt: true, endAt: true,
        checkInAt: true, lateReportedAt: true, absentReportedAt: true,
        job: { select: { title: true } },
        timesheet: { select: { status: true, hoursWorked: true } },
      },
    });
    if (shifts.length === 0) throw new NotFoundException('Worker not found on your bookings');

    const c = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
      select: {
        id: true, firstName: true, headline: true, city: true, maxTravelMiles: true,
        rating: true, status: true,
        skills: { select: { skill: { select: { name: true } } } },
        availability: { select: { dayOfWeek: true } },
        documents: { where: { status: 'VERIFIED', type: { in: ['QUALIFICATION', 'LICENCE', 'CERTIFICATE'] } }, select: { type: true } },
      },
    });
    if (!c) throw new NotFoundException('Worker not found on your bookings');

    const days = [...new Set(c.availability.map((av) => av.dayOfWeek))].sort((a, b) => a - b).map((d) => ClientPortalService.DAYS[d]);
    const qualLabel: Record<string, string> = { QUALIFICATION: 'Qualification', LICENCE: 'Licence', CERTIFICATE: 'Certificate' };
    const now = Date.now();
    const completed = shifts.filter((s) => s.status === 'COMPLETED').length;
    const upcoming = shifts.filter((s) => +new Date(s.startAt) >= now && ['ASSIGNED', 'CONFIRMED', 'IN_PROGRESS'].includes(s.status))
      .sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt))[0];

    // Attendance & timesheets — computed from THIS client's shifts only.
    const startedShifts = shifts.filter((s) => +new Date(s.startAt) < now && s.status !== 'CANCELLED');
    const noShows = startedShifts.filter((s) => s.status === 'NO_SHOW' || s.absentReportedAt).length;
    const lateArrivals = startedShifts.filter((s) => s.lateReportedAt).length;
    const onTime = startedShifts.filter((s) => s.checkInAt && !s.lateReportedAt && !s.absentReportedAt).length;
    const paidStatuses = new Set(['APPROVED', 'INVOICED', 'PAID']);
    const timesheets = shifts.map((s) => s.timesheet).filter((t): t is NonNullable<typeof t> => !!t);
    const hoursApproved = timesheets
      .filter((t) => paidStatuses.has(t.status))
      .reduce((sum, t) => sum + Number(t.hoursWorked ?? 0), 0);
    const attendance = {
      hoursApproved: Math.round(hoursApproved * 100) / 100,
      timesheetsApproved: timesheets.filter((t) => paidStatuses.has(t.status)).length,
      timesheetsPending: timesheets.filter((t) => t.status === 'SUBMITTED').length,
      noShows,
      lateArrivals,
      onTimeRate: startedShifts.length ? Math.round((onTime / startedShifts.length) * 100) : null,
    };

    return {
      firstName: c.firstName, // first name only — no surname
      reference: `C-${c.id.slice(-6).toUpperCase()}`,
      role: c.headline ?? shifts[0].job.title,
      experience: c.headline ?? null,
      skills: c.skills.map((s) => s.skill.name),
      qualifications: [...new Set(c.documents.map((d) => qualLabel[d.type] ?? d.type))],
      availability: days,
      travelArea: c.city ? `${c.city}${c.maxTravelMiles ? ` (within ${c.maxTravelMiles} miles)` : ''}` : null,
      complianceConfirmed: c.status === 'COMPLIANT' || c.status === 'ACTIVE',
      rating: c.rating,
      // Working history with THIS client only.
      withYou: {
        totalShifts: shifts.length,
        completedShifts: completed,
        roles: [...new Set(shifts.map((s) => s.job.title))],
        nextShift: upcoming ? { startAt: upcoming.startAt, endAt: upcoming.endAt, role: upcoming.job.title, status: upcoming.status } : null,
      },
      attendance,
    };
  }

  async workers(userId: string) {
    const { client } = await this.clientFor(userId);
    const shifts = await this.prisma.shift.findMany({
      where: { job: { clientId: client.id }, candidateId: { not: null } },
      orderBy: { startAt: 'desc' },
      include: {
        candidate: { select: { id: true, firstName: true, lastName: true, status: true, city: true } },
        job: { select: { title: true } },
      },
    });
    const byCandidate = new Map<string, any>();
    for (const s of shifts) {
      if (!s.candidate) continue;
      if (!byCandidate.has(s.candidate.id)) {
        byCandidate.set(s.candidate.id, {
          id: s.candidate.id,
          name: `${s.candidate.firstName} ${s.candidate.lastName}`,
          status: s.candidate.status,
          city: s.candidate.city,
          role: s.job.title,
          shifts: 0,
        });
      }
      byCandidate.get(s.candidate.id).shifts += 1;
    }
    return [...byCandidate.values()];
  }

  async createJob(
    userId: string,
    dto: {
      title: string;
      payRate: number;
      chargeRate: number;
      openings?: number;
      siteId?: string;
      // operational request details (all optional)
      sector?: string;
      description?: string;
      ppe?: string;
      uniform?: string;
      siteInstructions?: string;
      reportingContact?: string;
      reportingInstructions?: string;
      requiredQualifications?: string;
      experienceRequirements?: string;
      transportRequirements?: string;
      clientRequirements?: string;
      bookingUrgency?: string;
      breakInfo?: string;
      notes?: string;
      startDate?: string;
      endDate?: string;
      recurrenceDays?: number[];
      shiftStartTime?: string;
      shiftEndTime?: string;
      openEnded?: boolean;
    },
  ) {
    const { client, contact } = await this.clientFor(userId);
    // Controlled workflow: a client request lands as SUBMITTED for admin
    // review — it is NOT auto-published to candidates.
    const job = await this.prisma.job.create({
      data: {
        clientId: client.id,
        siteId: dto.siteId || undefined,
        title: dto.title,
        description: dto.description,
        payRate: dto.payRate,
        chargeRate: dto.chargeRate,
        openings: dto.openings ?? 1,
        status: JobStatus.SUBMITTED,
        submittedAt: new Date(),
        recurrenceDays: dto.recurrenceDays ?? [],
        shiftStartTime: dto.shiftStartTime,
        shiftEndTime: dto.shiftEndTime,
        openEnded: dto.openEnded ?? false,
        sector: dto.sector,
        ppe: dto.ppe,
        uniform: dto.uniform,
        siteInstructions: dto.siteInstructions,
        reportingContact: dto.reportingContact,
        reportingInstructions: dto.reportingInstructions,
        requiredQualifications: dto.requiredQualifications,
        experienceRequirements: dto.experienceRequirements,
        transportRequirements: dto.transportRequirements,
        clientRequirements: dto.clientRequirements,
        bookingUrgency: dto.bookingUrgency,
        breakInfo: dto.breakInfo,
        notes: dto.notes,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });

    await this.audit.log({
      actorId: userId,
      action: 'job.submitted',
      entity: 'Job',
      entityId: job.id,
      meta: { title: job.title, openings: job.openings, clientId: client.id },
    });

    // Notify Starff staff that a new request is awaiting review.
    const staff = await this.prisma.user.findMany({
      where: { role: { in: [Role.ADMIN, Role.RECRUITER] }, isActive: true },
      select: { id: true, email: true },
    });
    const who = `${contact.firstName} ${contact.lastName}`.trim() || client.name;
    await Promise.all(
      staff.map((s) =>
        this.notifications.send({
          to: s.email,
          kind: 'JOB_SUBMITTED',
          subject: `New staffing request from ${client.name}`,
          body: `${who} submitted a request for ${job.openings} × ${job.title}. Review and approve it to start recruiting.`,
          userId: s.id,
        }),
      ),
    );

    return job;
  }

  // ── Candidate submissions (admin → client) + client decision ─────────────────

  private static readonly SUBMISSION_STAGES = [
    'SUBMITTED_TO_CLIENT', 'CLIENT_ACCEPTED', 'CLIENT_REJECTED', 'ALTERNATIVE_REQUESTED', 'BOOKED',
  ] as const;
  private static readonly DECIDABLE = [
    'SUBMITTED_TO_CLIENT', 'CLIENT_ACCEPTED', 'CLIENT_REJECTED', 'ALTERNATIVE_REQUESTED',
  ];
  private static readonly DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /**
   * Candidates Starff has put forward to this client — REDACTED to a strict
   * whitelist. Sensitive data (bank, NI, full address, ID/RTW documents, medical,
   * emergency contact, internal notes, charge rate / pay margin) is NEVER included.
   */
  async submissions(userId: string) {
    const { client } = await this.clientFor(userId);
    const apps = await this.prisma.application.findMany({
      where: { job: { clientId: client.id }, status: { in: [...ClientPortalService.SUBMISSION_STAGES] } },
      orderBy: [{ submittedToClientAt: 'desc' }],
      include: {
        job: { select: { id: true, title: true, startDate: true, endDate: true, openings: true } },
        candidate: {
          select: {
            id: true, firstName: true, headline: true, city: true, maxTravelMiles: true,
            rating: true, status: true,
            skills: { select: { skill: { select: { name: true } } } },
            availability: { select: { dayOfWeek: true } },
            documents: { where: { status: 'VERIFIED', type: { in: ['QUALIFICATION', 'LICENCE', 'CERTIFICATE'] } }, select: { type: true } },
          },
        },
      },
    });

    return apps.map((a) => {
      const c = a.candidate;
      const days = [...new Set(c.availability.map((av) => av.dayOfWeek))].sort((a, b) => a - b).map((d) => ClientPortalService.DAYS[d]);
      const qualLabel: Record<string, string> = { QUALIFICATION: 'Qualification', LICENCE: 'Licence', CERTIFICATE: 'Certificate' };
      return {
        id: a.id, // application id — the client acts on this
        shiftId: a.shiftId, // for report-absent on a confirmed booking
        status: a.status,
        submittedAt: a.submittedToClientAt,
        decidedAt: a.clientDecidedAt,
        decisionNote: a.clientDecisionNote,
        adminSummary: a.adminSummary,
        job: { id: a.job.id, title: a.job.title, startDate: a.job.startDate, endDate: a.job.endDate, openings: a.job.openings },
        candidate: {
          firstName: c.firstName, // first name only — no surname
          reference: `C-${c.id.slice(-6).toUpperCase()}`, // candidate reference, not the raw id
          role: c.headline ?? a.job.title,
          experience: c.headline ?? null,
          skills: c.skills.map((s) => s.skill.name),
          qualifications: [...new Set(c.documents.map((d) => qualLabel[d.type] ?? d.type))],
          availability: days,
          travelArea: c.city ? `${c.city}${c.maxTravelMiles ? ` (within ${c.maxTravelMiles} miles)` : ''}` : null,
          complianceConfirmed: c.status === 'COMPLIANT' || c.status === 'ACTIVE',
          rating: c.rating,
        },
      };
    });
  }

  /** Client accepts / rejects / requests an alternative. This does NOT book —
   *  Starff admin confirms the final placement. */
  async decideSubmission(
    userId: string,
    applicationId: string,
    decision: 'ACCEPT' | 'REJECT' | 'ALTERNATIVE',
    note?: string,
  ) {
    const { client } = await this.clientFor(userId);
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { job: { select: { clientId: true, title: true } } },
    });
    if (!app || app.job.clientId !== client.id) throw new NotFoundException('Submission not found');
    if (!ClientPortalService.DECIDABLE.includes(app.status)) {
      throw new ForbiddenException('This candidate can no longer be actioned');
    }
    const map: Record<string, 'CLIENT_ACCEPTED' | 'CLIENT_REJECTED' | 'ALTERNATIVE_REQUESTED'> = {
      ACCEPT: 'CLIENT_ACCEPTED', REJECT: 'CLIENT_REJECTED', ALTERNATIVE: 'ALTERNATIVE_REQUESTED',
    };
    const status = map[decision];
    if (!status) throw new ForbiddenException('Invalid decision');

    const updated = await this.prisma.application.update({
      where: { id: applicationId },
      data: { status, clientDecidedAt: new Date(), clientDecisionNote: note ?? null },
    });
    await this.audit.log({
      actorId: userId, action: 'client.decision', entity: 'Application', entityId: applicationId,
      meta: { decision: status, jobId: app.jobId },
    });

    // Notify the recruiter who submitted (else all active staff).
    const submittedBy = app.submittedById
      ? await this.prisma.user.findUnique({ where: { id: app.submittedById }, select: { id: true, email: true, isActive: true } })
      : null;
    const recipients = submittedBy?.isActive
      ? [submittedBy]
      : await this.prisma.user.findMany({ where: { role: { in: [Role.ADMIN, Role.RECRUITER] }, isActive: true }, select: { id: true, email: true } });
    const kind = status === 'CLIENT_ACCEPTED' ? 'CLIENT_ACCEPTED' : status === 'CLIENT_REJECTED' ? 'CLIENT_REJECTED' : 'ALTERNATIVE_REQUESTED';
    const verb = status === 'CLIENT_ACCEPTED' ? 'accepted a candidate for' : status === 'CLIENT_REJECTED' ? 'rejected a candidate for' : 'requested an alternative for';
    await Promise.all(
      recipients.map((r) =>
        this.notifications.send({
          to: r.email, kind,
          subject: `${client.name} ${verb} ${app.job.title}`,
          body: `${client.name} ${verb} the ${app.job.title} request.${note ? ` Note: ${note}` : ''} Confirm the final booking in the dashboard.`,
          userId: r.id,
        }),
      ),
    );
    return { id: updated.id, status: updated.status };
  }

  /** Client flags a confirmed worker for replacement. Does NOT change the
   *  booking — it notifies Starff, who action the replacement. */
  async requestReplacement(userId: string, applicationId: string, reason?: string) {
    const { client } = await this.clientFor(userId);
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { job: { select: { clientId: true, title: true } }, candidate: { select: { firstName: true } } },
    });
    if (!app || app.job.clientId !== client.id) throw new NotFoundException('Booking not found');
    if (app.status !== 'BOOKED') throw new ForbiddenException('Only a confirmed booking can be replaced');

    await this.audit.log({
      actorId: userId, action: 'client.replacement_requested', entity: 'Application', entityId: applicationId,
      meta: { jobId: app.jobId, reason: reason ?? null },
    });
    const staff = await this.prisma.user.findMany({
      where: { role: { in: [Role.ADMIN, Role.RECRUITER] }, isActive: true }, select: { id: true, email: true },
    });
    await Promise.all(
      staff.map((s) =>
        this.notifications.send({
          to: s.email, kind: 'REPLACEMENT_REQUIRED',
          subject: `Replacement requested — ${app.job.title}`,
          body: `${client.name} has requested a replacement for ${app.candidate.firstName} on ${app.job.title}.${reason ? ` Reason: ${reason}` : ''}`,
          userId: s.id,
        }),
      ),
    );
    return { ok: true };
  }

  /** Client reports a booked worker as absent. Marks the shift, raises an
   *  UNCONFIRMED reliability incident (admin confirms) and notifies staff. */
  async reportAbsent(userId: string, shiftId: string, note?: string) {
    const { client } = await this.clientFor(userId);
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      include: { job: { select: { clientId: true, title: true } }, candidate: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!shift || shift.job.clientId !== client.id) throw new NotFoundException('Shift not found');
    if (!shift.candidateId) throw new BadRequestException('No worker booked on this shift');

    await this.prisma.shift.update({ where: { id: shiftId }, data: { absentReportedAt: new Date(), status: 'NO_SHOW' } });
    // UNCONFIRMED reliability incident — admin must confirm before it fully counts.
    await this.reliability.addIncident(shift.candidateId, {
      type: 'NO_SHOW',
      reason: `Reported absent by ${client.name}${note ? ` — ${note}` : ''}`,
      status: 'UNCONFIRMED',
      evidenceSource: 'Client report',
      shiftId,
      jobId: shift.jobId,
    }, userId);
    await this.audit.log({ actorId: userId, action: 'client.reported_absent', entity: 'Shift', entityId: shiftId, meta: { candidateId: shift.candidateId } });

    const staff = await this.prisma.user.findMany({ where: { role: { in: [Role.ADMIN, Role.RECRUITER] }, isActive: true }, select: { id: true, email: true } });
    await Promise.all(staff.map((s) => this.notifications.send({
      to: s.email, kind: 'REPLACEMENT_REQUIRED',
      subject: `${client.name} reported a worker absent — ${shift.job.title}`,
      body: `${client.name} reported ${shift.candidate?.firstName ?? 'a worker'} as absent for the ${shift.job.title} shift. Review and arrange cover if needed.`,
      userId: s.id,
    })));
    return { ok: true };
  }

  // ── Onboarding: company profile (the client editing their own company) ──
  async updateProfile(
    userId: string,
    dto: { name?: string; industry?: string; companyRegNo?: string; addressLine1?: string; city?: string; postcode?: string; billingEmail?: string; paymentTerms?: number },
  ) {
    const { client } = await this.clientFor(userId);
    return this.prisma.client.update({
      where: { id: client.id },
      data: {
        name: dto.name?.trim() || client.name,
        industry: dto.industry ?? undefined,
        companyRegNo: dto.companyRegNo ?? undefined,
        addressLine1: dto.addressLine1 ?? undefined,
        city: dto.city ?? undefined,
        postcode: dto.postcode ?? undefined,
        billingEmail: dto.billingEmail ?? undefined,
        paymentTerms: dto.paymentTerms ?? undefined,
      },
    });
  }

  // ── Onboarding: agreement & e-signature (with genuine timestamps) ──
  async setAgreement(userId: string, dto: { agreementAccepted?: boolean; signatureName?: string }) {
    const { client } = await this.clientFor(userId);
    const now = new Date();
    const data: Record<string, unknown> = {};
    if (dto.agreementAccepted !== undefined) {
      data.agreementAccepted = !!dto.agreementAccepted;
      data.agreementAcceptedAt = dto.agreementAccepted ? (client.agreementAcceptedAt ?? now) : null;
    }
    if (dto.signatureName !== undefined) {
      const name = dto.signatureName?.trim() || null;
      data.signatureName = name;
      data.signedAt = name ? (client.signedAt ?? now) : null;
    }
    return this.prisma.client.update({ where: { id: client.id }, data });
  }

  // ── Onboarding: hiring locations ──
  async addLocation(userId: string, dto: { name: string; addressLine1?: string; city?: string; postcode?: string }) {
    const { client } = await this.clientFor(userId);
    if (!dto.name?.trim()) throw new ForbiddenException('Location name is required');
    return this.prisma.clientSite.create({
      data: { clientId: client.id, name: dto.name.trim(), addressLine1: dto.addressLine1, city: dto.city, postcode: dto.postcode },
    });
  }

  async removeLocation(userId: string, id: string) {
    const { client } = await this.clientFor(userId);
    const site = await this.prisma.clientSite.findUnique({ where: { id } });
    if (!site || site.clientId !== client.id) throw new NotFoundException('Location not found');
    await this.prisma.clientSite.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Onboarding: authorised users (extra contacts on the account) ──
  async listContacts(userId: string) {
    const { client } = await this.clientFor(userId);
    return this.prisma.clientContact.findMany({
      where: { clientId: client.id },
      orderBy: [{ isPrimary: 'desc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, jobTitle: true, isPrimary: true },
    });
  }

  async addContact(userId: string, dto: { firstName: string; lastName: string; email: string; phone?: string; jobTitle?: string }) {
    const { client } = await this.clientFor(userId);
    if (!dto.firstName?.trim() || !dto.email?.trim()) throw new ForbiddenException('Name and email are required');
    return this.prisma.clientContact.create({
      data: {
        clientId: client.id,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName?.trim() || '',
        email: dto.email.trim().toLowerCase(),
        phone: dto.phone?.trim() || null,
        jobTitle: dto.jobTitle?.trim() || null,
        isPrimary: false,
      },
    });
  }

  async removeContact(userId: string, id: string) {
    const { contact, client } = await this.clientFor(userId);
    const row = await this.prisma.clientContact.findUnique({ where: { id } });
    if (!row || row.clientId !== client.id) throw new NotFoundException('Contact not found');
    if (row.isPrimary) throw new ForbiddenException('Cannot remove the primary contact');
    if (row.id === contact.id) throw new ForbiddenException('You cannot remove your own login');
    await this.prisma.clientContact.delete({ where: { id } });
    return { deleted: true };
  }
}
