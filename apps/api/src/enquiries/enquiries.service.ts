import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EnquiryStatus, EnquiryType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEnquiryDto } from './dto/create-enquiry.dto';

@Injectable()
export class EnquiriesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateEnquiryDto) {
    return this.prisma.enquiry.create({
      data: {
        type: dto.type,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        company: dto.company,
        message: dto.message,
        payload: (dto.payload ?? undefined) as Prisma.InputJsonValue,
        source: 'wordpress',
      },
    });
  }

  findAll(params: { type?: string; status?: string }) {
    const where: Prisma.EnquiryWhereInput = {};
    if (params.type) where.type = params.type as any;
    if (params.status) where.status = params.status as any;
    return this.prisma.enquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /**
   * Turn an enquiry into a real record:
   *  - "Post a job" → a Client (with the enquirer as a contact)
   *  - anything else → a Candidate
   * Then mark the enquiry CONVERTED.
   */
  async convert(id: string) {
    const enquiry = await this.prisma.enquiry.findUnique({ where: { id } });
    if (!enquiry) throw new NotFoundException('Enquiry not found');

    const [firstName, ...rest] = (enquiry.name ?? 'New Contact').split(' ');
    const lastName = rest.join(' ') || '—';
    let result: { kind: 'client' | 'candidate'; id: string };

    if (enquiry.type === EnquiryType.POST_A_JOB) {
      const client = await this.prisma.client.create({
        data: {
          name: enquiry.company ?? enquiry.name ?? 'New Client',
          status: 'LEAD',
          billingEmail: enquiry.email ?? undefined,
          contacts: enquiry.name
            ? { create: { firstName, lastName, email: enquiry.email ?? '', phone: enquiry.phone ?? undefined, isPrimary: true } }
            : undefined,
        },
      });
      result = { kind: 'client', id: client.id };
    } else {
      // Reuse an existing account for this email instead of crashing on the
      // unique-email constraint (e.g. the enquirer is already a user).
      const existingUser = enquiry.email
        ? await this.prisma.user.findUnique({ where: { email: enquiry.email } })
        : null;

      if (existingUser) {
        const existingCandidate = await this.prisma.candidate.findUnique({
          where: { userId: existingUser.id },
        });
        if (existingCandidate) {
          // Already a candidate — just link the enquiry to it.
          result = { kind: 'candidate', id: existingCandidate.id };
        } else if (existingUser.role === Role.CANDIDATE) {
          const candidate = await this.prisma.candidate.create({
            data: { userId: existingUser.id, firstName, lastName, phone: enquiry.phone ?? undefined, status: 'NEW' },
          });
          result = { kind: 'candidate', id: candidate.id };
        } else {
          throw new ConflictException(
            `This email (${enquiry.email}) already belongs to a ${existingUser.role.toLowerCase()} account, so it can't be converted into a new candidate.`,
          );
        }
      } else {
        const userId = randomUUID();
        await this.prisma.user.create({
          data: { id: userId, email: enquiry.email ?? `${userId.slice(0, 8)}@candidate.local`, role: Role.CANDIDATE, firstName, lastName },
        });
        const candidate = await this.prisma.candidate.create({
          data: { userId, firstName, lastName, phone: enquiry.phone ?? undefined, status: 'NEW' },
        });
        result = { kind: 'candidate', id: candidate.id };
      }
    }

    await this.prisma.enquiry.update({ where: { id }, data: { status: EnquiryStatus.CONVERTED } });
    return result;
  }
}
