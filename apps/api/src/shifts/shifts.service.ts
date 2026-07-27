import { Injectable, NotFoundException } from '@nestjs/common';
import { ShiftStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateShiftDto) {
    return this.prisma.shift.create({
      data: {
        jobId: dto.jobId,
        siteId: dto.siteId,
        candidateId: dto.candidateId,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        breakMinutes: dto.breakMinutes ?? 0,
        payRate: dto.payRate,
        chargeRate: dto.chargeRate,
        status: dto.candidateId ? ShiftStatus.ASSIGNED : ShiftStatus.OPEN,
      },
    });
  }

  findAll() {
    return this.prisma.shift.findMany({
      orderBy: { startAt: 'asc' },
      include: {
        job: { select: { id: true, title: true, client: { select: { name: true } } } },
        site: { select: { name: true } },
        candidate: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async update(id: string, dto: UpdateShiftDto) {
    const shift = await this.prisma.shift.findUnique({ where: { id } });
    if (!shift) throw new NotFoundException('Shift not found');
    return this.prisma.shift.update({
      where: { id },
      data: {
        candidateId: dto.candidateId ?? shift.candidateId,
        status:
          dto.status ??
          (dto.candidateId ? ShiftStatus.ASSIGNED : shift.status),
      },
    });
  }
}
