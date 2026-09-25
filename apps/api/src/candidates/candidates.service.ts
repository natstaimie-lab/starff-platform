import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { DocumentStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { RegistrationService } from '../registration/registration.service';

@Injectable()
export class CandidatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly registration: RegistrationService,
  ) {}

  /**
   * Create a candidate profile. Also creates the User row (as CANDIDATE) if it
   * doesn't exist yet — this is what a new sign-up calls right after Supabase
   * registration.
   */
  async create(dto: CreateCandidateDto) {
    const realEmail = dto.email && !dto.email.toLowerCase().endsWith('@candidate.local')
      ? dto.email.trim().toLowerCase()
      : undefined;

    // ── Sign-up path: a real Supabase auth user already exists (mobile/website
    // self-serve passes its userId). Attach the profile to it and welcome them. ──
    if (dto.userId) {
      const email = realEmail ?? dto.email ?? this.placeholderEmail(dto, dto.userId);
      await this.prisma.user.upsert({
        where: { id: dto.userId },
        update: {},
        create: { id: dto.userId, email, role: Role.CANDIDATE, firstName: dto.firstName, lastName: dto.lastName, phone: dto.phone },
      });
      const existing = await this.prisma.candidate.findUnique({ where: { userId: dto.userId } });
      if (existing) return existing;
      const candidate = await this.prisma.candidate.create({
        data: { userId: dto.userId, firstName: dto.firstName, lastName: dto.lastName, phone: dto.phone, city: dto.city, postcode: dto.postcode, headline: dto.headline },
      });
      if (realEmail) {
        await this.notifications
          .send({
            to: realEmail,
            userId: dto.userId,
            kind: 'ACTIVATION',
            subject: 'Welcome to Starff',
            body: `Hi ${dto.firstName}, welcome to Starff! Your worker account is ready. Complete your profile, upload your documents and set your availability so we can start matching you to shifts.`,
            actionUrl: process.env.CANDIDATE_PORTAL_URL || undefined,
            actionLabel: 'Open your worker portal',
          })
          .catch(() => {});
      }
      return candidate;
    }

    // ── Admin front desk: no auth user yet. Create the profile against a
    // placeholder login first; if a real email was given, upgrade it to a proper
    // Supabase login (and optionally email the set-password invite). ──
    const placeholderId = randomUUID();
    // Always seed with a local placeholder address — attachCandidateLogin owns the
    // real email (and its uniqueness / clash checks) when one is supplied.
    const placeholderEmail = this.placeholderEmail(dto, placeholderId);
    await this.prisma.user.create({
      data: { id: placeholderId, email: placeholderEmail, role: Role.CANDIDATE, firstName: dto.firstName, lastName: dto.lastName, phone: dto.phone },
    });
    const candidate = await this.prisma.candidate.create({
      data: { userId: placeholderId, firstName: dto.firstName, lastName: dto.lastName, phone: dto.phone, city: dto.city, postcode: dto.postcode, headline: dto.headline },
    });

    if (realEmail) {
      try {
        await this.registration.attachCandidateLogin(candidate.id, { email: realEmail, sendInvite: dto.sendInvite === true });
      } catch (e) {
        // Keep "add with email" atomic: undo the placeholder if the login couldn't
        // be provisioned (e.g. the email already belongs to someone else).
        await this.prisma.candidate.delete({ where: { id: candidate.id } }).catch(() => {});
        await this.prisma.user.delete({ where: { id: placeholderId } }).catch(() => {});
        throw e;
      }
      return this.prisma.candidate.findUnique({ where: { id: candidate.id } });
    }
    return candidate;
  }

  private placeholderEmail(dto: { firstName: string; lastName: string }, id: string) {
    return (
      `${dto.firstName}.${dto.lastName}.${id.slice(0, 6)}`.toLowerCase().replace(/[^a-z0-9.]/g, '') +
      '@candidate.local'
    );
  }

  /**
   * Admin "Invite to portal / Resend invite" for an existing candidate — creates
   * or repairs their login and emails the set-password link. Delegates to the
   * shared provisioning logic in RegistrationService.
   */
  attachLogin(candidateId: string, dto: { email?: string; sendInvite?: boolean }) {
    return this.registration.attachCandidateLogin(candidateId, {
      email: dto.email,
      sendInvite: dto.sendInvite !== false,
    });
  }

  // Admin/recruiter list with simple filtering + pagination.
  findAll(params: { status?: string; skip?: number; take?: number; includeArchived?: boolean }) {
    const where: Prisma.CandidateWhereInput = {};
    if (params.status) {
      where.status = params.status as any;
    }
    if (!params.includeArchived) where.archivedAt = null; // hide archived by default
    return this.prisma.candidate.findMany({
      where,
      skip: params.skip ?? 0,
      take: Math.min(params.take ?? 25, 100),
      orderBy: { createdAt: 'desc' },
      include: {
        documents: true,
        skills: { include: { skill: true } },
        // counts let the dashboard show registration progress
        _count: { select: { availability: true, employmentHistory: true, references: true } },
      },
    });
  }

  async findOne(id: string) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id },
      include: {
        documents: true,
        skills: { include: { skill: true } },
        availability: true,
        employmentHistory: { orderBy: [{ current: 'desc' }, { startDate: 'desc' }] },
        references: { orderBy: { createdAt: 'asc' } },
        user: { select: { email: true } },
      },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');
    // Surface portal-login state for the admin front desk without exposing the raw
    // placeholder address. `hasLogin` = a real (non-placeholder) email is attached.
    const rawEmail = candidate.user?.email ?? null;
    const isPlaceholder = !rawEmail || rawEmail.endsWith('@candidate.local');
    return {
      ...candidate,
      loginEmail: isPlaceholder ? null : rawEmail,
      hasLogin: !isPlaceholder,
    };
  }

  // A candidate can fetch their own profile via their user id.
  async findByUserId(userId: string) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { userId },
      include: { documents: true, availability: true },
    });
    if (!candidate) throw new NotFoundException('Profile not found');
    return candidate;
  }

  /**
   * Update a candidate. A candidate may edit their own profile but may NOT
   * change their `status` — only admins/recruiters can.
   */
  async update(id: string, dto: UpdateCandidateDto, actor: AuthUser) {
    const candidate = await this.findOne(id);

    const isStaff = actor.role === Role.ADMIN || actor.role === Role.RECRUITER;
    const isOwner = candidate.userId === actor.id;
    if (!isStaff && !isOwner) {
      throw new ForbiddenException('Not your profile');
    }
    if (dto.status && !isStaff) {
      throw new ForbiddenException('Only staff can change candidate status');
    }

    return this.prisma.candidate.update({ where: { id }, data: dto });
  }

  /** Staff verifies / rejects one of a candidate's compliance documents. */
  async setDocumentStatus(candidateId: string, docId: string, status: DocumentStatus, verifierId: string) {
    const doc = await this.prisma.candidateDocument.findUnique({ where: { id: docId } });
    if (!doc || doc.candidateId !== candidateId) throw new NotFoundException('Document not found');
    return this.prisma.candidateDocument.update({
      where: { id: docId },
      data: {
        status,
        verifiedById: status === DocumentStatus.VERIFIED ? verifierId : null,
        verifiedAt: status === DocumentStatus.VERIFIED ? new Date() : null,
      },
    });
  }

  /**
   * Archive (soft-delete) or restore a candidate. Hides them from lists and
   * deactivates their login, but keeps all data — fully reversible.
   */
  async setArchived(id: string, archived: boolean) {
    const c = await this.prisma.candidate.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Candidate not found');
    await this.prisma.candidate.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
    });
    // Block/allow their portal login to match the archive state.
    await this.prisma.user.update({ where: { id: c.userId }, data: { isActive: !archived } }).catch(() => {});
    return { id, archived };
  }

  /**
   * Permanently delete a candidate — profile, documents, login and auth user.
   * Admin-only, irreversible (GDPR-style removal).
   */
  async remove(id: string) {
    const c = await this.prisma.candidate.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Candidate not found');
    const userId = c.userId;

    // Candidate children (documents, skills, availability, employment, references)
    // cascade on candidate delete. Clear the user's other refs, then the user.
    await this.prisma.candidate.delete({ where: { id } });
    await this.prisma.notification.deleteMany({ where: { userId } });
    await this.prisma.conversation.deleteMany({ where: { memberUserId: userId } });
    await this.prisma.user.delete({ where: { id: userId } }).catch(() => {});

    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    await supabase.auth.admin.deleteUser(userId).catch(() => {});
    return { deleted: true };
  }

  /** Short-lived signed URL so staff can view a private document file. */
  async documentUrl(candidateId: string, docId: string) {
    const doc = await this.prisma.candidateDocument.findUnique({ where: { id: docId } });
    if (!doc || doc.candidateId !== candidateId) throw new NotFoundException('Document not found');
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    const { data, error } = await supabase.storage
      .from('candidate-documents')
      .createSignedUrl(doc.fileUrl, 300);
    if (error) throw new NotFoundException('Could not open document');
    return { url: data.signedUrl };
  }
}
