import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EnquiryStatus, EnquiryType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEnquiryDto } from './dto/create-enquiry.dto';
import { RegistrationService } from '../registration/registration.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class EnquiriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registration: RegistrationService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: CreateEnquiryDto) {
    const enquiry = await this.prisma.enquiry.create({
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

    // Auto-acknowledge a worker registration (best-effort — never blocks the form).
    if (enquiry.type === EnquiryType.CANDIDATE_REGISTER && enquiry.email) {
      const firstName = (enquiry.name ?? 'there').split(' ')[0];
      await this.notifications.send({
        to: enquiry.email,
        kind: 'REGISTRATION_RECEIVED',
        subject: "We've received your Starff registration",
        body: `Hi ${firstName}, thanks for registering your interest with Starff. Our team will review your details and email you shortly with a link to set up your worker portal.`,
      });
    }

    return enquiry;
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
   * Turn an enquiry into a real record with a real login, reusing the tested
   * registration flow (which creates the Supabase account + emails a secure
   * activation / set-password link to the enquirer):
   *  - "Post a job" → a Client (contact invited to the client portal)
   *  - anything else → a Candidate (invited to the candidate portal)
   * Then mark the enquiry CONVERTED.
   */
  async convert(id: string) {
    const enquiry = await this.prisma.enquiry.findUnique({ where: { id } });
    if (!enquiry) throw new NotFoundException('Enquiry not found');
    if (!enquiry.email) {
      throw new BadRequestException(
        "This enquiry has no email address, so it can't be converted into an account.",
      );
    }

    const [firstName, ...rest] = (enquiry.name ?? 'New Contact').split(' ');
    const lastName = rest.join(' ') || '—';

    // Guard: don't collide with an account that already exists under a different role.
    const existingUser = await this.prisma.user.findUnique({ where: { email: enquiry.email } });

    let result: { kind: 'client' | 'candidate'; id: string };

    if (enquiry.type === EnquiryType.POST_A_JOB) {
      if (existingUser && existingUser.role !== Role.CLIENT) {
        throw new ConflictException(
          `This email (${enquiry.email}) already belongs to a ${existingUser.role.toLowerCase()} account, so it can't be set up as a new client.`,
        );
      }
      const res = await this.registration.registerClient({
        companyName: enquiry.company ?? enquiry.name ?? 'New Client',
        contactFirstName: firstName,
        contactLastName: lastName,
        contactEmail: enquiry.email,
        contactPhone: enquiry.phone ?? undefined,
      } as any);
      result = { kind: 'client', id: res.clientId };
    } else {
      if (existingUser && existingUser.role !== Role.CANDIDATE) {
        throw new ConflictException(
          `This email (${enquiry.email}) already belongs to a ${existingUser.role.toLowerCase()} account, so it can't be converted into a new candidate.`,
        );
      }
      const res = await this.registration.registerCandidate({
        firstName,
        lastName,
        email: enquiry.email,
        phone: enquiry.phone ?? undefined,
      } as any);
      result = { kind: 'candidate', id: res.candidateId };
    }

    await this.prisma.enquiry.update({ where: { id }, data: { status: EnquiryStatus.CONVERTED } });
    return result;
  }
}
