import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { DocumentStatus, DocumentType, ShiftStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';
import { bookingBlockers } from '../applications/applications.service';

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Same compliance gate as booking: refuse to put an uncleared worker on a shift. */
  private async assertBookable(candidateId: string) {
    const c = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { status: true, archivedAt: true, rightToWorkType: true, documents: { select: { type: true, status: true, expiryDate: true } } },
    });
    if (!c) throw new NotFoundException('Candidate not found');
    const blockers = bookingBlockers(c);
    if (blockers.length) throw new BadRequestException(`This worker can't be booked yet: ${blockers.join('; ')}`);
  }

  async create(dto: CreateShiftDto) {
    if (dto.candidateId) await this.assertBookable(dto.candidateId);
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
      orderBy: { startAt: 'desc' },
      include: {
        job: { select: { id: true, title: true, client: { select: { name: true } } } },
        site: { select: { name: true } },
        candidate: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  /** Signed (5-minute) URLs for the clock-in selfie and the worker's identity
   * selfie — the latest VERIFIED one, else the latest uploaded. */
  async checkInPhoto(id: string) {
    const shift = await this.prisma.shift.findUnique({
      where: { id },
      select: { checkInAt: true, checkInPhotoUrl: true, candidateId: true },
    });
    if (!shift) throw new NotFoundException('Shift not found');
    if (!shift.checkInPhotoUrl) throw new NotFoundException('No check-in photo for this shift');

    const selfies = shift.candidateId
      ? await this.prisma.candidateDocument.findMany({
          where: { candidateId: shift.candidateId, type: DocumentType.SELFIE },
          orderBy: { createdAt: 'desc' },
          select: { fileUrl: true, status: true },
        })
      : [];
    const selfie = selfies.find((d) => d.status === DocumentStatus.VERIFIED) ?? selfies[0] ?? null;

    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    const sign = async (path: string) => {
      const { data, error } = await supabase.storage.from('candidate-documents').createSignedUrl(path, 300);
      return error ? null : data.signedUrl;
    };
    return {
      checkedInAt: shift.checkInAt,
      checkInPhotoUrl: await sign(shift.checkInPhotoUrl),
      identitySelfieUrl: selfie ? await sign(selfie.fileUrl) : null,
      identitySelfieVerified: selfie?.status === DocumentStatus.VERIFIED,
    };
  }

  async update(id: string, dto: UpdateShiftDto) {
    const shift = await this.prisma.shift.findUnique({ where: { id } });
    if (!shift) throw new NotFoundException('Shift not found');
    if (dto.candidateId && dto.candidateId !== shift.candidateId) await this.assertBookable(dto.candidateId);
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
