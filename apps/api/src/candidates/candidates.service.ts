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

@Injectable()
export class CandidatesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a candidate profile. Also creates the User row (as CANDIDATE) if it
   * doesn't exist yet — this is what a new sign-up calls right after Supabase
   * registration.
   */
  async create(dto: CreateCandidateDto) {
    // Sign-up path passes a real Supabase userId + email. Admin "Add candidate"
    // passes neither, so we mint a placeholder User row to attach the profile to.
    const userId = dto.userId ?? randomUUID();
    const email =
      dto.email ??
      `${dto.firstName}.${dto.lastName}.${userId.slice(0, 6)}`.toLowerCase().replace(/[^a-z0-9.]/g, '') +
        '@candidate.local';

    await this.prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        email,
        role: Role.CANDIDATE,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
      },
    });

    // Idempotent: if this user already has a candidate profile (e.g. a repeat
    // login), return it rather than creating a duplicate.
    const existing = await this.prisma.candidate.findUnique({ where: { userId } });
    if (existing) return existing;

    return this.prisma.candidate.create({
      data: {
        userId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        city: dto.city,
        postcode: dto.postcode,
        headline: dto.headline,
      },
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
      },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');
    return candidate;
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
