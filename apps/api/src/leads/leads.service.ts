import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ClientStatus, LeadActivityType, LeadSource, LeadStage, Prisma, RegistrationSource, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RegistrationService } from '../registration/registration.service';
import type { ChangeStageDto, ConvertLeadDto, CreateLeadDto, LogActivityDto, UpdateLeadDto } from './dto/lead.dto';
import { clientStatusForStage, followUpBucket, londonDay, stageChangeError, stageForClientStatus } from './lead-stages';
import { findClientMatches, type MatchReason } from './client-match';

const listSelect = {
  client: { select: { id: true, name: true, status: true } },
  _count: { select: { activities: true, quotes: true } },
} satisfies Prisma.LeadInclude;

const detailInclude = {
  client: { select: { id: true, name: true, status: true } },
  enquiry: { select: { id: true, type: true, status: true, message: true, createdAt: true } },
  activities: { orderBy: { occurredAt: 'desc' }, take: 200 },
  quotes: {
    orderBy: { createdAt: 'desc' },
    select: { id: true, number: true, status: true, title: true, total: true, profit: true, validUntil: true, sentAt: true, decidedAt: true, createdAt: true, _count: { select: { lines: true } } },
  },
} satisfies Prisma.LeadInclude;

const blank = (s?: string | null) => (s?.trim() ? s.trim() : undefined);

/** CRM Phase 2: leads, their activity log and stage changes. */
@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly registration: RegistrationService,
  ) {}

  list(f: { stage?: LeadStage; q?: string; ownerId?: string; clientId?: string; dueBefore?: Date; includeArchived?: boolean }) {
    const where: Prisma.LeadWhereInput = {};
    if (!f.includeArchived) where.archivedAt = null;
    if (f.stage) where.stage = f.stage;
    if (f.ownerId) where.ownerId = f.ownerId;
    if (f.clientId) where.clientId = f.clientId;
    if (f.dueBefore) where.nextActionAt = { lte: f.dueBefore };
    if (f.q?.trim()) {
      const contains = f.q.trim();
      where.OR = [
        { companyName: { contains, mode: 'insensitive' } },
        { contactName: { contains, mode: 'insensitive' } },
        { contactEmail: { contains, mode: 'insensitive' } },
      ];
    }
    return this.prisma.lead.findMany({
      where,
      include: listSelect,
      orderBy: [{ nextActionAt: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'desc' }],
      take: 500,
    });
  }

  async get(id: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id }, include: detailInclude });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  /**
   * Create a lead. With enquiryId or clientId the blanks are filled in from
   * that record. Safe to repeat for the same enquiry: it returns the lead
   * that already exists (with `existing: true`) instead of making a second one.
   */
  async create(dto: CreateLeadDto, userId: string) {
    let companyName = blank(dto.companyName);
    let contactName = blank(dto.contactName);
    let contactEmail = blank(dto.contactEmail)?.toLowerCase();
    let contactPhone = blank(dto.contactPhone);
    let notes = blank(dto.notes);
    let source = dto.source;
    let stage = dto.stage;
    let clientId = dto.clientId || undefined;

    if (dto.enquiryId) {
      const existing = await this.prisma.lead.findUnique({ where: { enquiryId: dto.enquiryId }, include: listSelect });
      if (existing) return { ...existing, existing: true };
      const enq = await this.prisma.enquiry.findUnique({ where: { id: dto.enquiryId } });
      if (!enq) throw new NotFoundException('Enquiry not found');
      if (enq.type === 'CANDIDATE_REGISTER') {
        throw new BadRequestException('That enquiry is a worker sign-up, not a company — it can\'t become a lead.');
      }
      companyName ??= blank(enq.company) ?? blank(enq.name);
      contactName ??= blank(enq.name);
      contactEmail ??= blank(enq.email)?.toLowerCase();
      contactPhone ??= blank(enq.phone);
      notes ??= blank(enq.message);
      source ??= LeadSource.ENQUIRY;
    }

    if (clientId) {
      const client = await this.prisma.client.findUnique({
        where: { id: clientId },
        include: { contacts: { orderBy: { isPrimary: 'desc' }, take: 1 } },
      });
      if (!client) throw new NotFoundException('Client not found');
      const c = client.contacts[0];
      companyName ??= client.name;
      contactName ??= c ? `${c.firstName} ${c.lastName}`.trim() : undefined;
      contactEmail ??= c?.email?.toLowerCase() ?? undefined;
      contactPhone ??= c?.phone ?? undefined;
      source ??= LeadSource.CLIENT;
      stage ??= stageForClientStatus(client.status);
    }

    if (!companyName) throw new BadRequestException('Give a company name (or an enquiryId / clientId to take it from).');

    const lead = await this.prisma.lead.create({
      data: {
        companyName,
        contactName,
        contactEmail,
        contactPhone,
        contactRole: blank(dto.contactRole),
        sector: blank(dto.sector),
        city: blank(dto.city),
        postcode: blank(dto.postcode)?.toUpperCase(),
        estimatedValue: dto.estimatedValue,
        notes,
        clientId,
        enquiryId: dto.enquiryId || undefined,
        source: source ?? (dto.createdByAi ? LeadSource.AI : LeadSource.MANUAL),
        stage: stage ?? LeadStage.NEW,
        ownerId: dto.ownerId ?? userId,
        createdById: userId,
        createdByAi: dto.createdByAi ?? false,
        nextActionAt: dto.nextActionAt ? new Date(dto.nextActionAt) : undefined,
      },
      include: listSelect,
    });

    await this.audit.log({
      actorId: userId,
      action: 'lead.created',
      entity: 'Lead',
      entityId: lead.id,
      meta: { source: lead.source, stage: lead.stage, enquiryId: lead.enquiryId, clientId: lead.clientId, byAi: lead.createdByAi },
    });
    return { ...lead, existing: false };
  }

  async update(id: string, dto: UpdateLeadDto, userId: string) {
    await this.get(id);
    if (dto.clientId) {
      const exists = await this.prisma.client.count({ where: { id: dto.clientId } });
      if (!exists) throw new NotFoundException('Client not found');
    }
    const data: Prisma.LeadUncheckedUpdateInput = {};
    if (dto.companyName !== undefined) {
      const name = blank(dto.companyName);
      if (!name) throw new BadRequestException('Company name can\'t be empty');
      data.companyName = name;
    }
    if (dto.contactName !== undefined) data.contactName = blank(dto.contactName) ?? null;
    if (dto.contactEmail !== undefined) data.contactEmail = blank(dto.contactEmail)?.toLowerCase() ?? null;
    if (dto.contactPhone !== undefined) data.contactPhone = blank(dto.contactPhone) ?? null;
    if (dto.contactRole !== undefined) data.contactRole = blank(dto.contactRole) ?? null;
    if (dto.sector !== undefined) data.sector = blank(dto.sector) ?? null;
    if (dto.city !== undefined) data.city = blank(dto.city) ?? null;
    if (dto.postcode !== undefined) data.postcode = blank(dto.postcode)?.toUpperCase() ?? null;
    if (dto.estimatedValue !== undefined) data.estimatedValue = dto.estimatedValue;
    if (dto.notes !== undefined) data.notes = blank(dto.notes) ?? null;
    if (dto.ownerId !== undefined) data.ownerId = dto.ownerId;
    if (dto.nextActionAt !== undefined) data.nextActionAt = new Date(dto.nextActionAt);
    if (dto.clearNextAction) data.nextActionAt = null;
    if (dto.clientId !== undefined) data.clientId = dto.clientId || null;

    const lead = await this.prisma.lead.update({ where: { id }, data, include: listSelect });
    await this.audit.log({ actorId: userId, action: 'lead.updated', entity: 'Lead', entityId: id, meta: { fields: Object.keys(data) } });
    return lead;
  }

  /** Log a call, email, note or meeting against the lead. */
  async logActivity(id: string, dto: LogActivityDto, userId: string) {
    await this.get(id);
    if (!blank(dto.subject) && !blank(dto.body) && !blank(dto.outcome)) {
      throw new BadRequestException('Add a subject, body or outcome so the activity says something.');
    }
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    const [activity] = await this.prisma.$transaction([
      this.prisma.leadActivity.create({
        data: {
          leadId: id,
          type: dto.type,
          direction: dto.type === 'CALL' || dto.type === 'EMAIL' ? dto.direction ?? 'outbound' : dto.direction,
          subject: blank(dto.subject),
          body: blank(dto.body),
          outcome: blank(dto.outcome),
          occurredAt,
          createdById: userId,
          byAi: dto.byAi ?? false,
        },
      }),
      this.prisma.lead.update({
        where: { id },
        data: {
          lastActivityAt: occurredAt,
          ...(dto.nextActionAt ? { nextActionAt: new Date(dto.nextActionAt) } : {}),
        },
      }),
    ]);
    return activity;
  }

  listActivities(id: string, type?: LeadActivityType) {
    return this.prisma.leadActivity.findMany({
      where: { leadId: id, ...(type ? { type } : {}) },
      orderBy: { occurredAt: 'desc' },
      take: 500,
    });
  }

  /**
   * Move the lead to a new stage. Writes a STAGE_CHANGE activity and an audit
   * entry, and nudges a linked client from LEAD to PROSPECT once we're talking.
   */
  async changeStage(id: string, dto: ChangeStageDto, userId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id }, include: { client: { select: { id: true, status: true } } } });
    if (!lead) throw new NotFoundException('Lead not found');
    const err = stageChangeError(lead.stage, dto.stage, dto.reason);
    if (err) throw new BadRequestException(err);

    const now = new Date();
    const nextClientStatus = lead.client ? clientStatusForStage(dto.stage, lead.client.status) : null;

    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.lead.update({
        where: { id },
        data: {
          stage: dto.stage,
          stageChangedAt: now,
          lastActivityAt: now,
          lostReason: dto.stage === 'LOST' ? blank(dto.reason) : null,
        },
      }),
      this.prisma.leadActivity.create({
        data: {
          leadId: id,
          type: LeadActivityType.STAGE_CHANGE,
          subject: `${lead.stage} → ${dto.stage}`,
          body: blank(dto.note),
          outcome: dto.stage === 'LOST' ? blank(dto.reason) : undefined,
          meta: { from: lead.stage, to: dto.stage, reason: blank(dto.reason) ?? null },
          occurredAt: now,
          createdById: userId,
          byAi: dto.byAi ?? false,
        },
      }),
    ];
    if (lead.client && nextClientStatus) {
      ops.push(this.prisma.client.update({ where: { id: lead.client.id }, data: { status: nextClientStatus } }));
    }
    await this.prisma.$transaction(ops);

    await this.audit.log({
      actorId: userId,
      action: 'lead.stage_changed',
      entity: 'Lead',
      entityId: id,
      meta: {
        from: lead.stage,
        to: dto.stage,
        reason: blank(dto.reason) ?? null,
        byAi: dto.byAi ?? false,
        ...(nextClientStatus ? { clientId: lead.client!.id, clientStatus: { from: lead.client!.status, to: nextClientStatus } } : {}),
      },
    });
    return this.get(id);
  }

  /** Hide a lead from lists (recoverable). */
  async setArchived(id: string, archived: boolean, userId: string) {
    await this.get(id);
    const lead = await this.prisma.lead.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    await this.audit.log({ actorId: userId, action: archived ? 'lead.archived' : 'lead.restored', entity: 'Lead', entityId: id });
    return lead;
  }

  /** Pipeline counts per stage, for a board header. */
  async summary() {
    const rows = await this.prisma.lead.groupBy({ by: ['stage'], where: { archivedAt: null }, _count: { _all: true } });
    const counts = Object.fromEntries(Object.values(LeadStage).map((s) => [s, 0])) as Record<LeadStage, number>;
    for (const r of rows) counts[r.stage] = r._count._all;
    // Due = follow-up date is today (London) or earlier, same as the Today list.
    const due = await this.prisma.lead.count({
      where: { archivedAt: null, stage: { notIn: ['WON', 'LOST'] }, nextActionAt: { lt: londonDay().end } },
    });
    return { counts, followUpsDue: due };
  }

  /**
   * The Today list: every open lead (not won, lost or archived) grouped by its
   * next follow-up — overdue, today, the next 7 days, later, and no follow-up
   * set. The last group is how prospects slip through the cracks, so it's shown
   * too. Each lead carries its latest activity so you know where you left off.
   */
  async today() {
    const now = new Date();
    const leads = await this.prisma.lead.findMany({
      where: { archivedAt: null, stage: { notIn: ['WON', 'LOST'] } },
      include: {
        client: { select: { id: true, name: true, status: true } },
        activities: { orderBy: { occurredAt: 'desc' }, take: 1, select: { type: true, subject: true, outcome: true, occurredAt: true } },
      },
      orderBy: [{ nextActionAt: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'desc' }],
      take: 1000,
    });
    const groups = { overdue: [], today: [], upcoming: [], later: [], none: [] } as Record<ReturnType<typeof followUpBucket>, unknown[]>;
    for (const { activities, ...l } of leads) {
      groups[followUpBucket(l.nextActionAt, now)].push({ ...l, lastActivity: activities[0] ?? null });
    }
    const { start, end } = londonDay(now);
    return { day: { start, end }, ...groups };
  }

  /**
   * Convert to client: turn a won lead into a client in one go.
   *  1. Uses the lead's linked client, or creates one (status Prospect until
   *     staff approve their onboarding, which is what makes a client Active).
   *  2. Sets up the contact's client-portal login and (by default) emails the
   *     activation link.
   *  3. Copies the accepted quote's lines as the client's agreed rates and links
   *     the quote to the client.
   *  4. Marks the lead Won (with a stage-change entry) and logs the conversion.
   * Safe to run again if step 2 fails part-way: it reuses the client, the
   * login and any rates already copied.
   */
  async convert(id: string, dto: ConvertLeadDto, userId: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, status: true } },
        quotes: { where: { status: 'ACCEPTED' }, orderBy: { decidedAt: { sort: 'desc', nulls: 'last' } }, include: { lines: { orderBy: { position: 'asc' } } } },
      },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    if (lead.archivedAt) throw new BadRequestException('This lead is archived. Restore it first.');
    if (lead.stage === 'WON' && lead.clientId) {
      throw new ConflictException(`${lead.companyName} has already been converted to a client.`);
    }

    // Who gets the portal login.
    const [first, ...rest] = (lead.contactName ?? '').trim().split(/\s+/);
    const firstName = blank(dto.contactFirstName) ?? (first || undefined);
    const lastName = blank(dto.contactLastName) ?? (rest.join(' ') || undefined);
    const email = (blank(dto.contactEmail) ?? lead.contactEmail ?? '').toLowerCase();
    const phone = blank(dto.contactPhone) ?? lead.contactPhone ?? undefined;
    if (!email) throw new BadRequestException('Add the contact\'s email so they can log in to the client portal.');
    if (!firstName || !lastName) throw new BadRequestException('Add the contact\'s first and last name.');

    // Which quote's rates to copy.
    let quote: (typeof lead.quotes)[number] | null = lead.quotes[0] ?? null;
    if (dto.quoteId) {
      quote = lead.quotes.find((q) => q.id === dto.quoteId) ?? null;
      if (!quote) throw new BadRequestException('That quote isn\'t an accepted quote for this lead. Mark it Accepted in Saved Quotes first.');
    }

    // Which client this becomes: the one chosen in the convert box, the one the
    // lead is already linked to, or a new one — but only after the duplicate
    // check, so a won deal never creates a second copy of an existing client.
    let target: { id: string; status: ClientStatus } | null = lead.client ? { id: lead.client.id, status: lead.client.status } : null;
    let duplicates: Awaited<ReturnType<LeadsService['clientMatches']>> = [];
    if (dto.clientId) {
      const chosen = await this.prisma.client.findUnique({ where: { id: dto.clientId }, select: { id: true, status: true } });
      if (!chosen) throw new BadRequestException('That client no longer exists.');
      target = chosen;
    } else if (!target) {
      duplicates = await this.clientMatches(lead.companyName, email);
      if (duplicates.length && !dto.createNew) {
        throw new ConflictException({
          statusCode: 409,
          code: 'POSSIBLE_DUPLICATE',
          message: `${lead.companyName} may already be a client. Choose the existing client, or confirm it's a new one.`,
          matches: duplicates,
        });
      }
    }

    // The login email must not belong to someone else.
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      include: { clientContact: { select: { clientId: true, client: { select: { name: true } } } } },
    });
    if (existingUser && existingUser.role !== Role.CLIENT) {
      throw new ConflictException(`${email} already belongs to a ${existingUser.role.toLowerCase()} account, so it can't be a client login. Use a different email.`);
    }
    if (existingUser?.clientContact && existingUser.clientContact.clientId !== target?.id) {
      throw new ConflictException(`${email} is already a contact at ${existingUser.clientContact.client.name}. Use a different email, or choose ${existingUser.clientContact.client.name} as the client.`);
    }

    // 1. Client.
    let clientId = target?.id ?? null;
    let clientCreated = false;
    if (!clientId) {
      const client = await this.prisma.client.create({
        data: {
          name: lead.companyName,
          industry: lead.sector,
          city: lead.city,
          postcode: lead.postcode,
          billingEmail: email,
          status: ClientStatus.PROSPECT,
          registrationSource: RegistrationSource.ADMIN,
          notes: `Converted from CRM lead on ${new Date().toISOString().slice(0, 10)}.`,
        },
      });
      clientId = client.id;
      clientCreated = true;
      // Link straight away so a retry reuses this client.
      await this.prisma.lead.update({ where: { id }, data: { clientId } });
    } else {
      if (lead.clientId !== clientId) await this.prisma.lead.update({ where: { id }, data: { clientId } });
      if (target?.status === ClientStatus.LEAD) {
        await this.prisma.client.update({ where: { id: clientId }, data: { status: ClientStatus.PROSPECT } });
      }
    }

    // 2. Portal login + invite email.
    const sendInvite = dto.sendInvite !== false;
    const invite = await this.registration.inviteClientContact({
      clientId, firstName, lastName, email, phone, jobTitle: lead.contactRole ?? undefined, sendInvite,
    });

    // 3 + 4. Agreed rates, quote link, Won.
    const now = new Date();
    const already = quote ? await this.prisma.clientRate.count({ where: { clientId, quoteId: quote.id } }) : 0;
    const rates = quote && !already ? quote.lines.map((l, i) => ({
      clientId: clientId!, quoteId: quote!.id, position: i,
      role: l.description, shiftType: l.shiftType, payRate: l.payRate, chargeRate: l.chargeRate,
      marginPerHour: l.marginPerHour, hoursPerShift: l.hoursPerShift, pensionEnrolled: l.pensionEnrolled,
      agreedAt: quote!.decidedAt ?? now, createdById: userId,
    })) : [];
    const wasStage = lead.stage;
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    if (rates.length) ops.push(this.prisma.clientRate.createMany({ data: rates }));
    if (quote) ops.push(this.prisma.quote.update({ where: { id: quote.id }, data: { clientId } }));
    ops.push(this.prisma.lead.update({
      where: { id },
      data: { clientId, stage: 'WON', stageChangedAt: now, lastActivityAt: now, lostReason: null, nextActionAt: null },
    }));
    if (wasStage !== 'WON') {
      ops.push(this.prisma.leadActivity.create({
        data: {
          leadId: id, type: LeadActivityType.STAGE_CHANGE, subject: `${wasStage} → WON`,
          meta: { from: wasStage, to: 'WON', reason: 'Converted to client' }, occurredAt: now, createdById: userId, byAi: dto.byAi ?? false,
        },
      }));
    }
    ops.push(this.prisma.leadActivity.create({
      data: {
        leadId: id, type: LeadActivityType.NOTE, subject: 'Converted to client',
        body: [
          clientCreated ? 'New client record created.' : 'Linked to the existing client record.',
          ...(clientCreated && duplicates.length ? [`Possible duplicate${duplicates.length === 1 ? '' : 's'} (${duplicates.map((d) => d.name).join(', ')}) were checked and a new client was created anyway.`] : []),
          sendInvite ? `Client portal invite emailed to ${email}.` : `Portal login set up for ${email} (invite not emailed).`,
          quote
            ? (rates.length ? `${rates.length} agreed ${rates.length === 1 ? 'rate' : 'rates'} copied from quote ${quote.number}.` : `Agreed rates from quote ${quote.number} were already on file.`)
            : 'No accepted quote, so no agreed rates were copied.',
        ].join(' '),
        meta: { clientId, quoteId: quote?.id ?? null, ratesCopied: rates.length, contactUserId: invite.userId },
        occurredAt: new Date(now.getTime() + 1), createdById: userId, byAi: dto.byAi ?? false,
      },
    }));
    await this.prisma.$transaction(ops);

    await this.audit.log({
      actorId: userId,
      action: 'lead.converted',
      entity: 'Lead',
      entityId: id,
      meta: {
        clientId, clientCreated, quoteId: quote?.id ?? null, ratesCopied: rates.length, contactEmail: email, invited: sendInvite, from: wasStage, byAi: dto.byAi ?? false,
        linkedExisting: !clientCreated && !!dto.clientId,
        // Staff saw possible duplicates and chose to create a new client anyway.
        duplicateOverride: clientCreated && duplicates.length ? duplicates.map((d) => ({ clientId: d.clientId, reasons: d.reasons })) : null,
      },
    });

    return {
      clientId,
      clientCreated,
      contactUserId: invite.userId,
      loginCreated: invite.invited,
      invited: sendInvite,
      quoteNumber: quote?.number ?? null,
      ratesCopied: rates.length,
    };
  }

  /** Existing clients that look like this company (same login/billing email or same name once tidied up). */
  private async clientMatches(companyName: string, email: string | null | undefined) {
    const clients = await this.prisma.client.findMany({
      select: {
        id: true, name: true, status: true, city: true, postcode: true, billingEmail: true, archivedAt: true, createdAt: true,
        contacts: { select: { email: true, firstName: true, lastName: true, isPrimary: true } },
      },
      take: 5000,
    });
    const byId = new Map(clients.map((c) => [c.id, c]));
    return findClientMatches(
      { companyName, email },
      clients.map((c) => ({ id: c.id, name: c.name, billingEmail: c.billingEmail, contactEmails: c.contacts.map((x) => x.email) })),
    ).slice(0, 10).map(({ clientId, reasons }) => {
      const c = byId.get(clientId)!;
      const primary = c.contacts.find((x) => x.isPrimary) ?? c.contacts[0];
      return {
        clientId, reasons: reasons as MatchReason[],
        name: c.name, status: c.status, city: c.city, postcode: c.postcode, archived: !!c.archivedAt, createdAt: c.createdAt,
        primaryContact: primary ? `${primary.firstName} ${primary.lastName}`.trim() : null,
        contacts: c.contacts.length,
      };
    });
  }

  /**
   * What the convert box shows before converting: the client this lead is
   * already linked to (if any) and any existing clients that look like it,
   * checked against `email` (the login email typed in the box) and the name.
   */
  async convertCheck(id: string, email?: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id }, include: { client: { select: { id: true, name: true, status: true } } } });
    if (!lead) throw new NotFoundException('Lead not found');
    const matches = lead.client ? [] : await this.clientMatches(lead.companyName, email?.trim() || lead.contactEmail);
    return { linkedClient: lead.client, matches };
  }
}
