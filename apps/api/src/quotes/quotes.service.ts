import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, QuoteStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RateSettingsService } from './rate-settings.service';
import { calculateQuote } from './quote-calculator';
import { toQuoteSettings } from './to-quote-settings';
import type { QuoteLineDto, SaveQuoteDto, SendQuoteDto } from './dto/save-quote.dto';
import { buildQuotePdf, quoteFilename } from './quote-pdf';
import { QuoteMailer } from './quote-mailer';

const DEFAULT_VALID_DAYS = 30;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Which status changes staff may make. */
const NEXT: Record<QuoteStatus, QuoteStatus[]> = {
  DRAFT: ['SENT', 'ACCEPTED', 'DECLINED'],
  SENT: ['DRAFT', 'ACCEPTED', 'DECLINED'],
  ACCEPTED: ['SENT'], // undo a mistaken click
  DECLINED: ['SENT'],
};

const include = {
  client: { select: { id: true, name: true } },
  lead: { select: { id: true, companyName: true } },
  lines: { orderBy: { position: 'asc' } },
} satisfies Prisma.QuoteInclude;

type QuoteWithLines = Prisma.QuoteGetPayload<{ include: typeof include }>;

/** Saved quotes: priced on the server with the current rate settings. */
@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rates: RateSettingsService,
    private readonly audit: AuditService,
    private readonly mailer: QuoteMailer,
  ) {}

  /** Adds `expired`: a DRAFT or SENT quote whose valid-until date has passed. */
  private present(q: QuoteWithLines) {
    const endOfValidDay = new Date(q.validUntil);
    endOfValidDay.setUTCHours(23, 59, 59, 999);
    const expired = (q.status === 'DRAFT' || q.status === 'SENT') && endOfValidDay.getTime() < Date.now();
    return { ...q, expired };
  }

  /** Price every line with the current rates. Throws 400 on bad figures. */
  private async price(lines: QuoteLineDto[]) {
    const values = await this.rates.get();
    const settings = toQuoteSettings(values);
    let total = 0, totalCost = 0;
    const priced = lines.map((l, i) => {
      const marginPerHour = l.marginPerHour ?? values.defaultMarginPerHour;
      let r;
      try {
        r = calculateQuote({ ...l, marginPerHour }, settings);
      } catch (e) {
        if (e instanceof RangeError) throw new BadRequestException(`Line ${i + 1}: ${e.message}`);
        throw e;
      }
      total += r.total; totalCost += r.totalCost;
      return {
        position: i,
        description: l.description.trim() || `Line ${i + 1}`,
        payRate: l.payRate,
        marginPerHour: r.marginPerHour,
        hoursPerShift: l.hoursPerShift,
        shifts: l.shifts ?? 1,
        temps: l.temps ?? 1,
        shiftType: l.shiftType ?? 'standard',
        pensionEnrolled: l.pensionEnrolled ?? true,
        costPerHour: r.costPerHour,
        chargeRate: r.chargeRate,
        totalHours: r.totalHours,
        total: r.total,
        totalCost: r.totalCost,
        profit: r.profit,
      };
    });
    total = round2(total); totalCost = round2(totalCost);
    return {
      lines: priced,
      totals: { total, totalCost, profit: round2(total - totalCost) },
      ratesSnapshot: values as unknown as Prisma.InputJsonValue,
    };
  }

  private validUntil(v?: string): Date {
    if (v) return new Date(v.slice(0, 10) + 'T00:00:00.000Z');
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + DEFAULT_VALID_DAYS);
    return d;
  }

  private async checkWho(dto: SaveQuoteDto) {
    const prospect = dto.prospectName?.trim();
    if (!dto.clientId && !prospect) throw new BadRequestException('Choose a client or enter a company name');
    if (dto.clientId) {
      const c = await this.prisma.client.findUnique({ where: { id: dto.clientId }, select: { id: true } });
      if (!c) throw new BadRequestException('Client not found');
    }
    if (dto.leadId) {
      const l = await this.prisma.lead.findUnique({ where: { id: dto.leadId }, select: { id: true } });
      if (!l) throw new BadRequestException('Lead not found');
    }
    return {
      // Only touch the link when leadId is sent, so an edit without it keeps the link.
      ...(dto.leadId !== undefined ? { leadId: dto.leadId || null } : {}),
      clientId: dto.clientId ?? null,
      prospectName: dto.clientId ? null : prospect!,
      contactName: dto.contactName?.trim() || null,
      contactEmail: dto.contactEmail?.trim() || null,
      title: dto.title?.trim() || null,
      notes: dto.notes?.trim() || null,
    };
  }

  /** Next number for this year: Q-2026-0001, Q-2026-0002, … */
  private async nextNumber(): Promise<string> {
    const prefix = `Q-${new Date().getUTCFullYear()}-`;
    const last = await this.prisma.quote.findFirst({
      where: { number: { startsWith: prefix } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const n = last ? parseInt(last.number.slice(prefix.length), 10) + 1 : 1;
    return prefix + String(n).padStart(4, '0');
  }

  async create(dto: SaveQuoteDto, actorId?: string) {
    const who = await this.checkWho(dto);
    const { lines, totals, ratesSnapshot } = await this.price(dto.lines);
    // Two people saving at the same moment could pick the same number — retry.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const q = await this.prisma.quote.create({
          data: {
            number: await this.nextNumber(),
            ...who,
            validUntil: this.validUntil(dto.validUntil),
            ...totals,
            ratesSnapshot,
            createdById: actorId ?? null,
            lines: { create: lines },
          },
          include,
        });
        await this.audit.log({
          actorId, action: 'quote.created', entity: 'Quote', entityId: q.id,
          meta: { number: q.number, total: totals.total, lines: lines.length, leadId: q.leadId },
        });
        if (q.leadId) {
          await this.logOnLead(q.leadId, actorId, {
            type: 'NOTE', subject: `Quote ${q.number} drafted`,
            outcome: `£${totals.total.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} for ${lines.length} ${lines.length === 1 ? 'role' : 'roles'}`,
            meta: { quoteId: q.id, number: q.number },
          });
        }
        return this.present(q);
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && attempt < 2) continue;
        throw e;
      }
    }
    throw new ConflictException('Could not number the quote, please try again');
  }

  async list(params: { status?: QuoteStatus; clientId?: string } = {}) {
    const rows = await this.prisma.quote.findMany({
      where: { status: params.status, clientId: params.clientId },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include,
    });
    return rows.map((q) => this.present(q));
  }

  async get(id: string) {
    const q = await this.prisma.quote.findUnique({ where: { id }, include });
    if (!q) throw new NotFoundException('Quote not found');
    return this.present(q);
  }

  /** Replace the details and lines. Only while the quote is still a draft. */
  async update(id: string, dto: SaveQuoteDto, actorId?: string) {
    const existing = await this.prisma.quote.findUnique({ where: { id }, select: { status: true, total: true } });
    if (!existing) throw new NotFoundException('Quote not found');
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Only draft quotes can be edited. Move it back to Draft first.');
    }
    const who = await this.checkWho(dto);
    const { lines, totals, ratesSnapshot } = await this.price(dto.lines);
    const q = await this.prisma.$transaction(async (tx) => {
      await tx.quoteLine.deleteMany({ where: { quoteId: id } });
      return tx.quote.update({
        where: { id },
        data: {
          ...who,
          ...(dto.validUntil ? { validUntil: this.validUntil(dto.validUntil) } : {}),
          ...totals,
          ratesSnapshot,
          lines: { create: lines },
        },
        include,
      });
    });
    await this.audit.log({
      actorId, action: 'quote.updated', entity: 'Quote', entityId: id,
      meta: { number: q.number, totalBefore: Number(existing.total), totalAfter: totals.total },
    });
    return this.present(q);
  }

  async setStatus(id: string, status: QuoteStatus, actorId?: string) {
    const existing = await this.prisma.quote.findUnique({ where: { id }, select: { status: true, number: true } });
    if (!existing) throw new NotFoundException('Quote not found');
    if (existing.status === status) return this.get(id);
    if (!NEXT[existing.status].includes(status)) {
      throw new BadRequestException(`A ${existing.status.toLowerCase()} quote can't be moved to ${status.toLowerCase()}`);
    }
    const now = new Date();
    const q = await this.prisma.quote.update({
      where: { id },
      data: {
        status,
        ...(status === 'SENT' ? { sentAt: now, decidedAt: null } : {}),
        ...(status === 'ACCEPTED' || status === 'DECLINED' ? { decidedAt: now } : {}),
        ...(status === 'DRAFT' ? { decidedAt: null } : {}),
      },
      include,
    });
    await this.audit.log({
      actorId, action: 'quote.status_changed', entity: 'Quote', entityId: id,
      meta: { number: existing.number, from: existing.status, to: status },
    });
    return this.present(q);
  }

  // ── PDF + email ────────────────────────────────────────────────────────────

  private async pdfFor(q: QuoteWithLines) {
    const companyName = q.client?.name ?? q.prospectName ?? 'Client';
    const buffer = await buildQuotePdf({
      number: q.number, title: q.title, companyName, contactName: q.contactName,
      createdAt: q.createdAt, validUntil: q.validUntil, total: Number(q.total),
      lines: q.lines.map((l) => ({
        description: l.description, temps: l.temps, shifts: l.shifts, hoursPerShift: Number(l.hoursPerShift),
        shiftType: l.shiftType, chargeRate: Number(l.chargeRate), totalHours: Number(l.totalHours), total: Number(l.total),
      })),
    });
    return { buffer, filename: quoteFilename(q.number), companyName };
  }

  /** The client-facing PDF (charge rates and totals only). */
  async pdf(id: string) {
    const q = await this.prisma.quote.findUnique({ where: { id }, include });
    if (!q) throw new NotFoundException('Quote not found');
    const { buffer, filename } = await this.pdfFor(q);
    return { buffer, filename };
  }

  /** The default covering email, for the admin to edit before sending. */
  async emailDraft(id: string, actorId?: string) {
    const q = await this.get(id);
    const sender = actorId ? await this.prisma.user.findUnique({ where: { id: actorId }, select: { firstName: true, lastName: true, email: true } }) : null;
    const company = q.client?.name ?? q.prospectName ?? '';
    const first = q.contactName?.trim().split(/\s+/)[0];
    const valid = q.validUntil.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    return {
      to: q.contactEmail ? [q.contactEmail] : [],
      subject: `Your Starff quote ${q.number}${q.title ? ` — ${q.title}` : ''}`,
      message: `${first ? `Hi ${first},` : 'Hello,'}\n\nThank you for considering Starff${company ? ` for ${company}` : ''}. Please find your quote attached.\n\nThe quote is valid until ${valid}. If you have any questions or would like to go ahead, just reply to this email and we'll get your team booked in.`,
      from: this.mailer.from,
      replyTo: this.mailer.replyTo(sender?.email),
      senderEmail: sender?.email ?? null,
    };
  }

  /** Email the PDF to the client and mark the quote as Sent. */
  async send(id: string, dto: SendQuoteDto, actorId?: string) {
    const q = await this.prisma.quote.findUnique({ where: { id }, include });
    if (!q) throw new NotFoundException('Quote not found');
    if (q.status !== 'DRAFT' && q.status !== 'SENT') {
      throw new BadRequestException(`This quote is ${q.status.toLowerCase()} — move it back to Sent or Draft before emailing it again.`);
    }
    if (this.present(q).expired) {
      throw new BadRequestException('This quote has passed its valid-until date. Move it to Draft, update the date, then send it.');
    }
    const draft = await this.emailDraft(id, actorId);
    const to = (dto.to?.length ? dto.to : draft.to).map((e) => e.trim()).filter(Boolean);
    if (!to.length) throw new BadRequestException('Add an email address to send the quote to.');
    const sender = actorId ? await this.prisma.user.findUnique({ where: { id: actorId }, select: { firstName: true, lastName: true, email: true } }) : null;
    const senderName = [sender?.firstName, sender?.lastName].filter(Boolean).join(' ') || null;

    const { buffer, filename } = await this.pdfFor(q);
    const result = await this.mailer.send({
      to, cc: dto.cc, senderEmail: sender?.email, senderName,
      subject: dto.subject?.trim() || draft.subject,
      message: dto.message?.trim() || draft.message,
      pdf: buffer, filename,
    });

    const updated = await this.prisma.quote.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date(), decidedAt: null },
      include,
    });
    await this.audit.log({
      actorId, action: 'quote.sent', entity: 'Quote', entityId: id,
      meta: { number: q.number, to, cc: dto.cc ?? [], from: this.mailer.from, resendId: result.id ?? null, total: Number(q.total) },
    });
    if (q.leadId) {
      await this.logOnLead(q.leadId, actorId, {
        type: 'EMAIL', direction: 'outbound', subject: `Quote ${q.number} sent`,
        body: `Emailed to ${to.join(', ')}${dto.cc?.length ? ` (cc ${dto.cc.join(', ')})` : ''}.`,
        meta: { quoteId: q.id, number: q.number, resendId: result.id ?? null },
      });
    }
    return { ...this.present(updated), emailedTo: to };
  }

  /**
   * Put a line on the lead's activity log (quote drafted / sent). Best-effort:
   * a failure here must never undo the quote action. Doesn't change the stage —
   * staff move the lead themselves.
   */
  private async logOnLead(
    leadId: string,
    actorId: string | undefined,
    a: { type: 'NOTE' | 'EMAIL'; direction?: string; subject: string; body?: string; outcome?: string; meta: Prisma.InputJsonValue },
  ) {
    try {
      const now = new Date();
      await this.prisma.$transaction([
        this.prisma.leadActivity.create({ data: { leadId, ...a, occurredAt: now, createdById: actorId ?? null } }),
        this.prisma.lead.update({ where: { id: leadId }, data: { lastActivityAt: now } }),
      ]);
    } catch { /* lead may have been removed; the quote action still stands */ }
  }
}
