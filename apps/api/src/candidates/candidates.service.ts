import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { DocumentStatus, Prisma, RegistrationSource, Role } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/current-user.decorator';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { RegistrationService } from '../registration/registration.service';
import { WORKER_DOCUMENTS, getWorkerDoc, workerAgreementSnapshot } from '../me/worker-documents';
import { cleanSectors } from '../common/sectors';
import { DocumentCheckService } from '../documents/document-check.service';

@Injectable()
export class CandidatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly registration: RegistrationService,
    private readonly docCheck: DocumentCheckService,
  ) {}

  /** Staff — re-run the automated pre-check on one document. */
  async recheckDocument(candidateId: string, docId: string) {
    const doc = await this.prisma.candidateDocument.findUnique({ where: { id: docId } });
    if (!doc || doc.candidateId !== candidateId) throw new NotFoundException('Document not found');
    await this.docCheck.check(docId);
    return this.prisma.candidateDocument.findUnique({
      where: { id: docId },
      select: { aiCheckVerdict: true, aiCheckSummary: true, aiCheckedAt: true },
    });
  }

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
      const source = (dto.source as RegistrationSource) ?? RegistrationSource.PORTAL;
      const candidate = await this.prisma.candidate.create({
        data: { userId: dto.userId, firstName: dto.firstName, lastName: dto.lastName, phone: dto.phone, city: dto.city, postcode: dto.postcode, headline: dto.headline, preferredSectors: cleanSectors(dto.preferredSectors), registrationSource: source },
      });
      // Alert staff a new worker just signed up (best-effort; never blocks).
      await this.notifications.notifyStaffSignup({
        name: `${dto.firstName} ${dto.lastName}`,
        audience: 'worker',
        source,
        lookingFor: candidate.preferredSectors,
        link: `/dashboard/candidates/${candidate.id}`,
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
  async findAll(params: { status?: string; skip?: number; take?: number; includeArchived?: boolean }, actor?: AuthUser) {
    const where: Prisma.CandidateWhereInput = {};
    if (params.status) {
      where.status = params.status as any;
    }
    if (!params.includeArchived) where.archivedAt = null; // hide archived by default
    const rows = await this.prisma.candidate.findMany({
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
    return rows.map((r) => this.redactForRole(r, actor?.role));
  }

  /**
   * Role-aware redaction (least privilege). ADMIN sees everything. RECRUITER —
   * who matches, books and chases — never sees financial, NI or health data, and
   * can't reach the document files (only their type + status). Enforced here on
   * the server so the sensitive fields are simply never sent, not just hidden.
   */
  private static readonly SENSITIVE = ['nationalInsurance', 'bankAccountName', 'bankSortCode', 'bankAccountNumber', 'healthNotes'] as const;

  private redactForRole<T extends Record<string, any>>(candidate: T, role?: string): T {
    // Only recruiters are restricted. Admins and the worker themselves see all.
    if (role !== Role.RECRUITER) return candidate;
    const c: any = { ...candidate };
    c.nationalInsurance = null;
    c.bankAccountName = null;
    c.bankSortCode = null;
    c.bankAccountNumber = null;
    c.healthNotes = null;
    if (Array.isArray(c.documents)) {
      // Keep type/status/expiry/pre-check; strip the file so it can't be opened.
      c.documents = c.documents.map((d: any) => ({ ...d, fileUrl: null, fileName: null }));
    }
    return c;
  }

  async findOne(id: string, actor?: AuthUser) {
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
    return this.redactForRole({
      ...candidate,
      loginEmail: isPlaceholder ? null : rawEmail,
      hasLogin: !isPlaceholder,
    }, actor?.role);
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
    const candidate = await this.findOne(id, actor);

    const isStaff = actor.role === Role.ADMIN || actor.role === Role.RECRUITER;
    const isOwner = candidate.userId === actor.id;
    if (!isStaff && !isOwner) {
      throw new ForbiddenException('Not your profile');
    }
    if (dto.status && !isStaff) {
      throw new ForbiddenException('Only staff can change candidate status');
    }

    // Recruiters can't see sensitive fields, so they can't write them either.
    const data: any = { ...dto };
    if (actor.role === Role.RECRUITER) {
      for (const f of CandidatesService.SENSITIVE) delete data[f];
    }
    const updated = await this.prisma.candidate.update({ where: { id }, data });
    return this.redactForRole(updated, actor.role);
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

  // ── Worker documents (admin view of what a worker has signed) ──

  /** A worker's signed-document status, for the admin candidate detail page. */
  async agreements(candidateId: string) {
    const candidate = await this.prisma.candidate.findUnique({ where: { id: candidateId } });
    if (!candidate) throw new NotFoundException('Candidate not found');
    const records = await this.prisma.candidateAgreement.findMany({ where: { candidateId } });
    const byKey = new Map(records.map((r) => [r.docKey, r]));
    return {
      documents: WORKER_DOCUMENTS.map((doc) => {
        const rec = byKey.get(doc.key);
        return {
          key: doc.key,
          title: doc.title,
          optional: doc.optional,
          currentVersion: doc.version,
          accepted: rec?.accepted ?? false,
          declined: rec?.declined ?? false,
          signatureName: rec?.signatureName ?? null,
          acceptedAt: rec?.acceptedAt ?? null,
          signedVersion: rec?.version ?? null,
          outdated: !!rec?.accepted && rec.version !== doc.version,
        };
      }),
    };
  }

  /** Generate the signed PDF for one worker document the worker has accepted. */
  async agreementPdf(candidateId: string, key: string): Promise<{ buffer: Buffer; filename: string }> {
    const candidate = await this.prisma.candidate.findUnique({ where: { id: candidateId } });
    if (!candidate) throw new NotFoundException('Candidate not found');
    const doc = getWorkerDoc(key);
    if (!doc) throw new NotFoundException('Unknown document');
    const record = await this.prisma.candidateAgreement.findUnique({
      where: { candidateId_docKey: { candidateId, docKey: key } },
    });
    if (!record || !record.accepted) {
      throw new BadRequestException('This worker has not signed this document yet.');
    }

    const body = record.agreementText || workerAgreementSnapshot(doc);
    const version = record.version || doc.version;
    const workerName = `${candidate.firstName} ${candidate.lastName}`.trim();
    const fmt = (d?: Date | null) =>
      d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

    const ORANGE = '#F47A20', INK = '#0B1F3A', MUTED = '#5A6B82', LINE = '#CBD6E4';
    const pdf = new PDFDocument({ size: 'A4', margin: 56 });
    const chunks: Buffer[] = [];
    pdf.on('data', (c: Buffer) => chunks.push(c));
    const finished = new Promise<Buffer>((resolve) => pdf.on('end', () => resolve(Buffer.concat(chunks))));

    pdf.fillColor(ORANGE).font('Helvetica-Bold').fontSize(22).text('STARFF');
    pdf.fillColor(INK).font('Helvetica-Bold').fontSize(15).text(doc.title);
    pdf.fillColor(MUTED).font('Helvetica').fontSize(9).text(`Document version ${version}`);
    pdf.moveDown(1.2);

    pdf.fillColor(INK).font('Helvetica-Bold').fontSize(11).text('Worker');
    pdf.font('Helvetica').fontSize(11).fillColor(INK).text(workerName || '—');
    pdf.moveDown(1.2);

    // Render the lightweight markdown, auto-paginating across pages.
    for (const raw of body.split('\n')) {
      const line = raw.trimEnd();
      if (!line) { pdf.moveDown(0.45); continue; }
      if (line.startsWith('### ')) {
        pdf.moveDown(0.3).font('Helvetica-Bold').fontSize(11).fillColor(INK).text(line.slice(4));
      } else if (line.startsWith('## ')) {
        pdf.moveDown(0.5).font('Helvetica-Bold').fontSize(12.5).fillColor(INK).text(line.slice(3));
      } else if (line.startsWith('# ')) {
        pdf.moveDown(0.3).font('Helvetica-Bold').fontSize(13.5).fillColor(INK).text(line.slice(2));
      } else if (line.startsWith('- ')) {
        pdf.font('Helvetica').fontSize(9.5).fillColor(INK).text('•  ' + line.slice(2), { lineGap: 2, indent: 8 });
      } else if (line.includes(' | ')) {
        pdf.font('Helvetica').fontSize(9.5).fillColor(INK).text(line.split(' | ').join('  —  '), { lineGap: 2 });
      } else {
        pdf.font('Helvetica').fontSize(9.5).fillColor(INK).text(line, { lineGap: 2 });
      }
    }
    pdf.moveDown(1.2);

    pdf.strokeColor(LINE).moveTo(pdf.page.margins.left, pdf.y).lineTo(pdf.page.width - pdf.page.margins.right, pdf.y).stroke();
    pdf.moveDown(0.7);
    pdf.fillColor(INK).font('Helvetica-Bold').fontSize(11).text('Signature');
    pdf.font('Helvetica').fontSize(11).fillColor(INK).text(`Signed by: ${record.signatureName ?? '—'}`);
    pdf.fillColor(MUTED).fontSize(10).text(`Date signed: ${fmt(record.acceptedAt)}`);
    pdf.moveDown(2);

    pdf.fillColor(MUTED).fontSize(8).text(
      'This document is a record of the agreement accepted electronically by the worker through Starff. ' +
      'Starff Ltd, registered in England & Wales, company no. 17166246. Registered office: 66 Paul Street, London EC2A 4NA.',
      { lineGap: 2 },
    );
    pdf.fillColor(MUTED).fontSize(8).text(`Generated ${fmt(new Date())}.`);

    pdf.end();
    const buffer = await finished;
    const safeName = (workerName || 'worker').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    return { buffer, filename: `${safeName}-${key}.pdf` };
  }
}
