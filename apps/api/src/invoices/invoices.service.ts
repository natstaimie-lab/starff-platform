import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, TimesheetStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';

const VAT_RATE = 0.2; // UK standard rate
const round2 = (n: number) => Math.round(n * 100) / 100;
const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Open client disputes, resolved from the audit trail: an `invoice.contested`
   * entry is "open" until Starff re-send or void that invoice (editing alone
   * keeps it open so the banner persists while it's being corrected). Returns
   * the latest open dispute per invoice id.
   */
  private async openDisputes(ids: string[]): Promise<Map<string, { reason: string; at: Date }>> {
    const out = new Map<string, { reason: string; at: Date }>();
    if (ids.length === 0) return out;
    const logs = await this.prisma.auditLog.findMany({
      where: { entity: 'Invoice', entityId: { in: ids }, action: { in: ['invoice.contested', 'invoice.sent', 'invoice.voided'] } },
      orderBy: { createdAt: 'desc' },
      select: { entityId: true, action: true, meta: true, createdAt: true },
    });
    const seen = new Set<string>();
    for (const l of logs) {
      if (seen.has(l.entityId)) continue; // only the most recent relevant action counts
      seen.add(l.entityId);
      if (l.action === 'invoice.contested') {
        out.set(l.entityId, { reason: (l.meta as { reason?: string } | null)?.reason ?? '', at: l.createdAt });
      }
    }
    return out;
  }

  async findAll() {
    const invoices = await this.prisma.invoice.findMany({
      orderBy: { createdAt: 'desc' },
      include: { client: { select: { name: true } }, _count: { select: { lines: true } } },
    });
    const disputes = await this.openDisputes(invoices.map((i) => i.id));
    return invoices.map((i) => ({ ...i, disputed: disputes.has(i.id) }));
  }

  /** Full invoice with its line items (worker · job · shift) for review. */
  async findOne(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        client: { select: { name: true, billingEmail: true, addressLine1: true, city: true, postcode: true, paymentTerms: true } },
        lines: {
          orderBy: { description: 'asc' },
          include: {
            timesheet: {
              select: {
                hoursWorked: true,
                candidate: { select: { firstName: true, lastName: true } },
                shift: { select: { startAt: true, endAt: true, job: { select: { title: true } } } },
              },
            },
          },
        },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    const dispute = (await this.openDisputes([id])).get(id) ?? null;
    return { ...invoice, dispute };
  }

  /**
   * Draft invoices from every APPROVED, not-yet-invoiced timesheet, grouped by
   * client (one draft per client). Each line is a worker-shift at the client's
   * charge rate; the source timesheets move to INVOICED so they aren't billed
   * twice. Nothing is sent — the drafts are for admin review/edit first.
   */
  async generateDrafts(actorId?: string) {
    const timesheets = await this.prisma.timesheet.findMany({
      where: { status: TimesheetStatus.APPROVED, hoursWorked: { not: null } },
      include: {
        candidate: { select: { firstName: true, lastName: true } },
        shift: {
          select: {
            startAt: true, endAt: true, chargeRate: true,
            job: { select: { title: true, clientId: true, client: { select: { paymentTerms: true } } } },
          },
        },
      },
    });

    // Group by client (skip any timesheet whose job isn't linked to a client).
    const byClient = new Map<string, typeof timesheets>();
    for (const t of timesheets) {
      const cid = t.shift.job.clientId;
      if (!cid) continue;
      if (!byClient.has(cid)) byClient.set(cid, []);
      byClient.get(cid)!.push(t);
    }
    if (byClient.size === 0) return { created: 0, invoices: [] as { id: string; number: string }[] };

    const now = new Date();
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    let seq = await this.prisma.invoice.count();
    const created: { id: string; number: string }[] = [];

    for (const [clientId, list] of byClient) {
      const periodStart = new Date(Math.min(...list.map((t) => +t.shift.startAt)));
      const periodEnd = new Date(Math.max(...list.map((t) => +t.shift.endAt)));
      const lines = list.map((t) => {
        const hours = Number(t.hoursWorked);
        const rate = Number(t.shift.chargeRate);
        const day = new Date(t.shift.startAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        return {
          timesheetId: t.id,
          description: `${t.candidate.firstName} ${t.candidate.lastName} — ${t.shift.job.title} (${day})`,
          hours, rate, amount: round2(hours * rate),
        };
      });
      const subtotal = round2(lines.reduce((n, l) => n + l.amount, 0));
      const vat = round2(subtotal * VAT_RATE);
      const total = round2(subtotal + vat);
      const terms = list[0].shift.job.client?.paymentTerms ?? 30;
      seq += 1;

      const invoice = await this.prisma.invoice.create({
        data: {
          clientId,
          number: `INV-${ym}-${String(seq).padStart(4, '0')}`,
          status: InvoiceStatus.DRAFT,
          periodStart, periodEnd,
          subtotal, vat, total,
          dueDate: new Date(periodEnd.getTime() + terms * 86400000),
          lines: { create: lines },
        },
      });
      await this.prisma.timesheet.updateMany({
        where: { id: { in: list.map((t) => t.id) } },
        data: { status: TimesheetStatus.INVOICED },
      });
      created.push({ id: invoice.id, number: invoice.number });
    }

    await this.audit.log({ actorId, action: 'invoice.generated', entity: 'Invoice', entityId: created.map((c) => c.id).join(','), meta: { count: created.length } });
    return { created: created.length, invoices: created };
  }

  /**
   * Edit a DRAFT invoice's line items (description / hours / rate) and recompute
   * amounts, subtotal, VAT and total. Sent/paid/void invoices are locked.
   */
  async update(id: string, dto: { lines?: { id: string; description?: string; hours?: number; rate?: number }[] }, actorId?: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id }, include: { lines: { select: { id: true } } } });
    if (!inv) throw new NotFoundException('Invoice not found');
    // Drafts are always editable; a sent invoice may be amended while a client
    // dispute is open (so Starff can correct it and re-send). Paid/void are locked.
    const hasOpenDispute = (await this.openDisputes([id])).has(id);
    const editable = inv.status === InvoiceStatus.DRAFT || ((inv.status === InvoiceStatus.SENT || inv.status === InvoiceStatus.OVERDUE) && hasOpenDispute);
    if (!editable) throw new BadRequestException('This invoice can only be edited as a draft or while a client dispute is open');

    const ownIds = new Set(inv.lines.map((l) => l.id));
    for (const l of dto.lines ?? []) {
      if (!ownIds.has(l.id)) throw new BadRequestException('Line does not belong to this invoice');
      const hours = round2(Number(l.hours ?? 0));
      const rate = round2(Number(l.rate ?? 0));
      if (hours < 0 || rate < 0) throw new BadRequestException('Hours and rate must be positive');
      await this.prisma.invoiceLine.update({
        where: { id: l.id },
        data: { description: l.description?.trim() || undefined, hours, rate, amount: round2(hours * rate) },
      });
    }

    const lines = await this.prisma.invoiceLine.findMany({ where: { invoiceId: id }, select: { amount: true } });
    const subtotal = round2(lines.reduce((n, l) => n + Number(l.amount), 0));
    const vat = round2(subtotal * VAT_RATE);
    const total = round2(subtotal + vat);
    await this.audit.log({ actorId, action: 'invoice.edited', entity: 'Invoice', entityId: id, meta: { subtotal, total } });
    return this.prisma.invoice.update({ where: { id }, data: { subtotal, vat, total } });
  }

  private async getOr404(id: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      include: { lines: { select: { timesheetId: true } }, client: { select: { name: true } } },
    });
    if (!inv) throw new NotFoundException('Invoice not found');
    return inv;
  }

  /** Approve & send to the client (DRAFT → SENT). Notifies the client's portal
   *  users and sets a due date if missing. */
  async send(id: string, actorId?: string) {
    const inv = await this.getOr404(id);
    if (inv.status === InvoiceStatus.PAID || inv.status === InvoiceStatus.VOID) {
      throw new BadRequestException(`Cannot send a ${inv.status.toLowerCase()} invoice`);
    }
    const wasDisputed = (await this.openDisputes([id])).has(id);
    const dueDate = inv.dueDate ?? new Date(new Date(inv.periodEnd).getTime() + 30 * 86400000);
    const updated = await this.prisma.invoice.update({ where: { id }, data: { status: InvoiceStatus.SENT, dueDate } });

    // Notify the client's portal logins (+ email to each contact).
    const contacts = await this.prisma.clientContact.findMany({
      where: { clientId: inv.clientId, userId: { not: null } },
      select: { userId: true, email: true },
    });
    const due = dueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    await Promise.all(
      contacts.map((c) =>
        this.notifications.send({
          to: c.email ?? '',
          userId: c.userId ?? undefined,
          kind: 'INVOICE_SENT',
          subject: wasDisputed ? `Updated invoice ${inv.number} from Starff` : `Invoice ${inv.number} from Starff`,
          body: wasDisputed
            ? `We've reviewed your query and updated invoice ${inv.number}. The revised total is ${gbp(Number(updated.total))}, due by ${due}. Please take a look.`
            : `Your invoice ${inv.number} for ${gbp(Number(updated.total))} is now available. Payment is due by ${due}.`,
          actionUrl: '/dashboard/invoices',
          actionLabel: 'View invoice',
        }),
      ),
    );

    await this.audit.log({ actorId, action: 'invoice.sent', entity: 'Invoice', entityId: id, meta: { number: inv.number, total: Number(updated.total), notified: contacts.length, resend: wasDisputed } });
    return updated;
  }

  /** Mark a sent invoice as paid — also settles its timesheets (payroll done). */
  async markPaid(id: string, actorId?: string) {
    const inv = await this.getOr404(id);
    if (inv.status === InvoiceStatus.VOID) throw new BadRequestException('Cannot mark a void invoice as paid');
    const timesheetIds = inv.lines.map((l) => l.timesheetId).filter((t): t is string => !!t);
    if (timesheetIds.length) {
      await this.prisma.timesheet.updateMany({ where: { id: { in: timesheetIds } }, data: { status: TimesheetStatus.PAID } });
    }
    await this.audit.log({ actorId, action: 'invoice.paid', entity: 'Invoice', entityId: id });
    return this.prisma.invoice.update({ where: { id }, data: { status: InvoiceStatus.PAID } });
  }

  /** Reject / cancel an invoice (→ VOID). Cannot void a paid invoice. Releases
   *  its timesheets back to APPROVED so they can be re-invoiced. */
  async voidInvoice(id: string, actorId?: string) {
    const inv = await this.getOr404(id);
    if (inv.status === InvoiceStatus.PAID) throw new BadRequestException('Cannot void a paid invoice');
    const timesheetIds = inv.lines.map((l) => l.timesheetId).filter((t): t is string => !!t);
    if (timesheetIds.length) {
      await this.prisma.timesheet.updateMany({ where: { id: { in: timesheetIds } }, data: { status: TimesheetStatus.APPROVED } });
    }
    await this.audit.log({ actorId, action: 'invoice.voided', entity: 'Invoice', entityId: id });
    return this.prisma.invoice.update({ where: { id }, data: { status: InvoiceStatus.VOID } });
  }
}
