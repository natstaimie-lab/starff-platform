import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, TimesheetStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.invoice.findMany({
      orderBy: { createdAt: 'desc' },
      include: { client: { select: { name: true } } },
    });
  }

  /** Full invoice with its line items (worker · job · shift) for review. */
  async findOne(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        client: { select: { name: true, billingEmail: true, addressLine1: true, city: true, postcode: true, paymentTerms: true } },
        lines: {
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
    return invoice;
  }

  private async getOr404(id: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      include: { lines: { select: { timesheetId: true } } },
    });
    if (!inv) throw new NotFoundException('Invoice not found');
    return inv;
  }

  /** Approve & send to the client (DRAFT → SENT). Sets a due date if missing. */
  async send(id: string) {
    const inv = await this.getOr404(id);
    if (inv.status === InvoiceStatus.PAID || inv.status === InvoiceStatus.VOID) {
      throw new BadRequestException(`Cannot send a ${inv.status.toLowerCase()} invoice`);
    }
    const dueDate = inv.dueDate ?? new Date(new Date(inv.periodEnd).getTime() + 30 * 86400000);
    return this.prisma.invoice.update({ where: { id }, data: { status: InvoiceStatus.SENT, dueDate } });
  }

  /** Mark a sent invoice as paid — also settles its timesheets (payroll done). */
  async markPaid(id: string) {
    const inv = await this.getOr404(id);
    if (inv.status === InvoiceStatus.VOID) throw new BadRequestException('Cannot mark a void invoice as paid');
    const timesheetIds = inv.lines.map((l) => l.timesheetId).filter((t): t is string => !!t);
    if (timesheetIds.length) {
      await this.prisma.timesheet.updateMany({ where: { id: { in: timesheetIds } }, data: { status: TimesheetStatus.PAID } });
    }
    return this.prisma.invoice.update({ where: { id }, data: { status: InvoiceStatus.PAID } });
  }

  /** Reject / cancel an invoice (→ VOID). Cannot void a paid invoice. */
  async voidInvoice(id: string) {
    const inv = await this.getOr404(id);
    if (inv.status === InvoiceStatus.PAID) throw new BadRequestException('Cannot void a paid invoice');
    return this.prisma.invoice.update({ where: { id }, data: { status: InvoiceStatus.VOID } });
  }
}
