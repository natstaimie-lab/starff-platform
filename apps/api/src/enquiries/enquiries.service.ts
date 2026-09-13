import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EnquiryStatus, EnquiryType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEnquiryDto } from './dto/create-enquiry.dto';
import { RegistrationService } from '../registration/registration.service';
import { NotificationsService } from '../notifications/notifications.service';

// Conservative spam signals — tuned to avoid false positives on genuine enquiries.
const SPAM_KEYWORDS = [
  /viagra|cialis/i,
  /\bporn\b|\bxxx\b|\bnude\b/i,
  /casino|betting|gambling|\bslots?\b/i,
  /crypto|bitcoin|forex|binary option/i,
  /\bseo\b|back ?links?|rank(ing)? your (site|website)/i,
  /payday loan|loan offer/i,
  /\bviagra\b|escort service/i,
];
const DISPOSABLE_DOMAINS = [
  'mailinator.com', 'tempmail', '10minutemail', 'guerrillamail', 'yopmail',
  'trashmail', 'sharklasers.com', 'getnada', 'dispostable', 'maildrop',
];
// Hidden honeypot field names bots love to fill (added to the site forms).
const HONEYPOT_FIELDS = ['your-website', 'website', 'url', 'hp-field', 'contact-url'];

@Injectable()
export class EnquiriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registration: RegistrationService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Cheap heuristics — returns why it looks like spam, or {spam:false}. */
  private detectSpam(dto: CreateEnquiryDto): { spam: boolean; reason?: string } {
    // 1. Honeypot: a hidden field a human never sees. Bots fill it.
    const payload = (dto.payload ?? {}) as Record<string, unknown>;
    for (const hp of HONEYPOT_FIELDS) {
      const v = payload[hp];
      if (typeof v === 'string' && v.trim() !== '') return { spam: true, reason: 'honeypot filled' };
    }

    const message = dto.message ?? '';
    const text = `${dto.name ?? ''} ${message} ${dto.company ?? ''}`;
    const links = message.match(/https?:\/\/|www\./gi) ?? [];

    // 2. Link-stuffed message.
    if (links.length >= 3) return { spam: true, reason: 'too many links' };
    // 3. Known spam phrases.
    for (const rx of SPAM_KEYWORDS) if (rx.test(text)) return { spam: true, reason: 'spam keyword' };
    // 4. Disposable / throwaway email domain.
    const email = (dto.email ?? '').toLowerCase();
    if (DISPOSABLE_DOMAINS.some((d) => email.includes(d))) return { spam: true, reason: 'disposable email' };
    // 5. Links + no real name (classic bot pattern).
    if (links.length >= 2 && (!dto.name || dto.name.trim().length < 2)) return { spam: true, reason: 'link spam' };

    return { spam: false };
  }

  async create(dto: CreateEnquiryDto) {
    const { spam, reason } = this.detectSpam(dto);

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
        spam,
        spamReason: reason ?? null,
      },
    });

    // Spam is filed quietly to the spam bucket — no bell, no badge, no email.
    if (spam) return enquiry;

    // Notify staff in-app so a new enquiry shows on the admin bell (best-effort).
    try {
      const staff = await this.prisma.user.findMany({
        where: { role: { in: [Role.ADMIN, Role.RECRUITER] }, isActive: true },
        select: { id: true },
      });
      if (staff.length) {
        const label: Record<string, string> = {
          CONTACT: 'contact',
          POST_A_JOB: 'post-a-job',
          CANDIDATE_REGISTER: 'registration',
        };
        await this.prisma.notification.createMany({
          data: staff.map((s) => ({
            userId: s.id,
            type: 'enquiry',
            title: 'New website enquiry',
            body: `${enquiry.name ?? 'Someone'} sent a ${label[enquiry.type] ?? 'new'} enquiry.`,
            link: '/dashboard/enquiries',
          })),
        });
      }
    } catch {
      // best-effort — never block the form on a notification failure
    }

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

  findAll(params: { type?: string; status?: string; spam?: string }) {
    const where: Prisma.EnquiryWhereInput = {};
    if (params.type) where.type = params.type as any;
    if (params.status) where.status = params.status as any;
    // Hide spam by default; the admin "Spam" tab passes spam=true to review it.
    where.spam = params.spam === 'true';
    return this.prisma.enquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Flag or unflag an enquiry as spam ("Not spam" restores it to the main list). */
  async setSpam(id: string, spam: boolean) {
    const enquiry = await this.prisma.enquiry.findUnique({ where: { id } });
    if (!enquiry) throw new NotFoundException('Enquiry not found');
    return this.prisma.enquiry.update({
      where: { id },
      data: { spam: !!spam, spamReason: spam ? (enquiry.spamReason ?? 'marked by staff') : null },
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
