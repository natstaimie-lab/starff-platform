import { Injectable, NotFoundException } from '@nestjs/common';
import { TimesheetStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TimesheetsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(status?: TimesheetStatus) {
    return this.prisma.timesheet.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        candidate: { select: { firstName: true, lastName: true } },
        shift: {
          select: {
            startAt: true,
            endAt: true,
            payRate: true,
            job: { select: { title: true, client: { select: { name: true } } } },
          },
        },
      },
    });
  }

  private async setStatus(id: string, status: TimesheetStatus, extra: object) {
    const ts = await this.prisma.timesheet.findUnique({ where: { id } });
    if (!ts) throw new NotFoundException('Timesheet not found');
    return this.prisma.timesheet.update({ where: { id }, data: { status, ...extra } });
  }

  approve(id: string, approverId: string) {
    return this.setStatus(id, TimesheetStatus.APPROVED, {
      approvedById: approverId,
      approvedAt: new Date(),
    });
  }

  reject(id: string, reason?: string) {
    return this.setStatus(id, TimesheetStatus.REJECTED, { rejectReason: reason });
  }
}
