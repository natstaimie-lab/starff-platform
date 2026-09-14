import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  CandidateStatus,
  ClientStatus,
  DocumentType,
  RegistrationSource,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RegisterCandidateDto } from './dto/register-candidate.dto';
import { RegisterClientDto } from './dto/register-client.dto';

/** A single onboarding section and whether the required data for it is present. */
export interface ProgressSection {
  key: string;
  label: string;
  done: boolean;
}
export interface ProgressResult {
  percent: number;
  complete: boolean;
  submitted: boolean;
  status: string;
  sections: ProgressSection[];
  nextSection: string | null;
}

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger('Registration');

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private admin(): SupabaseClient {
    return createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
  }

  private candidatePortalUrl() {
    return process.env.CANDIDATE_PORTAL_URL ?? 'http://localhost:3002';
  }
  private clientPortalUrl() {
    return process.env.CLIENT_PORTAL_URL ?? 'http://localhost:3003';
  }

  /**
   * Create the Supabase auth account for `email` (or return the existing one),
   * plus a secure activation link. No password is ever generated or emailed —
   * activation goes through Supabase's own invite/magic-link flow.
   */
  private async ensureAuthUser(
    email: string,
    meta: { firstName: string; lastName: string; role: string },
    redirectTo: string,
  ): Promise<{ id: string; actionLink?: string; isNew: boolean }> {
    const supabase = this.admin();
    // `invite` both creates the user and returns an action link (it does not
    // auto-send, so we control delivery via our own notifications service).
    const invite = await supabase.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { data: meta, redirectTo },
    });
    if (!invite.error && invite.data.user) {
      return {
        id: invite.data.user.id,
        actionLink: invite.data.properties?.action_link,
        isNew: true,
      };
    }
    // Already registered → fall back to a magic-link so they can just log in.
    const magic = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    });
    if (!magic.error && magic.data.user) {
      return {
        id: magic.data.user.id,
        actionLink: magic.data.properties?.action_link,
        isNew: false,
      };
    }
    throw new Error(
      `Could not create or locate auth user: ${invite.error?.message ?? magic.error?.message}`,
    );
  }

  // ────────────────────────────────────────────────────────────
  // CANDIDATE ENROLMENT  (called by the website / app front door)
  // ────────────────────────────────────────────────────────────
  async registerCandidate(dto: RegisterCandidateDto) {
    const email = dto.email.trim().toLowerCase();
    const firstName = dto.firstName.trim();
    const lastName = dto.lastName.trim();
    const source = dto.source ?? RegistrationSource.WEBSITE;

    // 1. Match an existing platform user by email (idempotent front door).
    let user = await this.prisma.user.findUnique({ where: { email } });
    let isNewAccount = false;
    let activationUrl: string | undefined;

    if (!user) {
      const auth = await this.ensureAuthUser(
        email,
        { firstName, lastName, role: 'candidate' },
        this.candidatePortalUrl(),
      );
      isNewAccount = auth.isNew;
      activationUrl = auth.actionLink;
      // Upsert guards against a race where two requests arrive together.
      user = await this.prisma.user.upsert({
        where: { id: auth.id },
        update: {},
        create: {
          id: auth.id,
          email,
          role: Role.CANDIDATE,
          firstName,
          lastName,
          phone: dto.phone,
        },
      });
    }

    // 2. Create or resume the candidate profile (idempotent by userId).
    // On resume, only fill blanks — never overwrite data the candidate has since
    // edited in their portal (a repeat webhook / retry must be non-destructive).
    const existing = await this.prisma.candidate.findUnique({ where: { userId: user.id } });
    const candidate = existing
      ? await this.prisma.candidate.update({
          where: { userId: user.id },
          data: {
            phone: existing.phone ?? dto.phone,
            city: existing.city ?? dto.city,
            postcode: existing.postcode ?? dto.postcode,
            headline: existing.headline ?? dto.sector,
          },
        })
      : await this.prisma.candidate.create({
          data: {
            userId: user.id,
            firstName,
            lastName,
            phone: dto.phone,
            city: dto.city,
            postcode: dto.postcode,
            headline: dto.sector,
            status: CandidateStatus.NEW,
            registrationSource: source,
          },
        });

    // 3. Attach any documents already uploaded — skip duplicates by type+path.
    let attached = 0;
    for (const d of dto.documents ?? []) {
      const exists = await this.prisma.candidateDocument.findFirst({
        where: { candidateId: candidate.id, type: d.type, fileUrl: d.fileUrl },
      });
      if (!exists) {
        await this.prisma.candidateDocument.create({
          data: {
            candidateId: candidate.id,
            type: d.type,
            fileUrl: d.fileUrl,
            fileName: d.fileName,
          },
        });
        attached++;
      }
    }

    // 4. Notify (best-effort; never blocks the registration).
    const portalUrl = this.candidatePortalUrl();
    if (isNewAccount) {
      await this.notifications.send({
        to: email,
        userId: user.id,
        kind: 'ACTIVATION',
        subject: 'Activate your Starff account',
        body: `Hi ${firstName}, thanks for registering with Starff. Activate your account to finish your registration in the candidate portal.`,
        actionUrl: activationUrl ?? portalUrl,
        actionLabel: 'Activate & continue',
      });
    } else {
      await this.notifications.send({
        to: email,
        userId: user.id,
        kind: 'CONTINUE_REGISTRATION',
        subject: 'Continue your Starff registration',
        body: `Welcome back ${firstName}. Pick up your registration where you left off — your details are saved.`,
        actionUrl: portalUrl,
        actionLabel: 'Continue registration',
      });
    }

    return {
      userId: user.id,
      candidateId: candidate.id,
      created: isNewAccount,
      resumed: !isNewAccount,
      documentsAttached: attached,
      portalUrl,
      // Returned so the WordPress redirect can send the user straight on.
      activationUrl: activationUrl ?? null,
    };
  }

  // ────────────────────────────────────────────────────────────
  // CLIENT ENROLMENT
  // ────────────────────────────────────────────────────────────
  async registerClient(dto: RegisterClientDto) {
    const email = dto.contactEmail.trim().toLowerCase();
    const firstName = dto.contactFirstName.trim();
    const lastName = dto.contactLastName.trim();
    const source = dto.source ?? RegistrationSource.WEBSITE;

    // 1. Match the contact's platform user by email.
    let user = await this.prisma.user.findUnique({ where: { email } });
    let isNewAccount = false;
    let activationUrl: string | undefined;

    if (!user) {
      const auth = await this.ensureAuthUser(
        email,
        { firstName, lastName, role: 'client' },
        this.clientPortalUrl(),
      );
      isNewAccount = auth.isNew;
      activationUrl = auth.actionLink;
      user = await this.prisma.user.upsert({
        where: { id: auth.id },
        update: {},
        create: {
          id: auth.id,
          email,
          role: Role.CLIENT,
          firstName,
          lastName,
          phone: dto.contactPhone,
        },
      });
    }

    // 2. Match an existing client: by this contact's login, then by reg number.
    let contact = await this.prisma.clientContact.findUnique({
      where: { userId: user.id },
      include: { client: true },
    });
    let client = contact?.client ?? null;

    if (!client && dto.companyRegNo) {
      client = await this.prisma.client.findFirst({
        where: { companyRegNo: dto.companyRegNo },
      });
    }

    // 3. Create the client if still none, else fill blanks.
    if (!client) {
      client = await this.prisma.client.create({
        data: {
          name: dto.companyName.trim(),
          industry: dto.industry,
          companyRegNo: dto.companyRegNo,
          status: ClientStatus.LEAD,
          billingEmail: email,
          registrationSource: source,
        },
      });
    } else {
      client = await this.prisma.client.update({
        where: { id: client.id },
        data: {
          industry: client.industry ?? dto.industry,
          companyRegNo: client.companyRegNo ?? dto.companyRegNo,
          registrationSource: client.registrationSource ?? source,
        },
      });
    }

    // 4. Link the contact ↔ login (idempotent). The userId is unique, so if this
    //    contact already exists it's reused rather than duplicated.
    if (!contact) {
      contact = await this.prisma.clientContact.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          clientId: client.id,
          userId: user.id,
          firstName,
          lastName,
          email,
          phone: dto.contactPhone,
          isPrimary: true,
        },
        include: { client: true },
      });
    }

    // 5. Notify.
    const portalUrl = this.clientPortalUrl();
    await this.notifications.send({
      to: email,
      userId: user.id,
      kind: isNewAccount ? 'ACTIVATION' : 'CONTINUE_REGISTRATION',
      subject: isNewAccount ? 'Activate your Starff client account' : 'Continue your Starff onboarding',
      body: isNewAccount
        ? `Hi ${firstName}, thanks for registering ${client.name} with Starff. Activate your account to complete onboarding in the client portal.`
        : `Welcome back ${firstName}. Continue ${client.name}'s onboarding — your details are saved.`,
      actionUrl: activationUrl ?? portalUrl,
      actionLabel: isNewAccount ? 'Activate & continue' : 'Continue onboarding',
    });

    return {
      userId: user.id,
      clientId: client.id,
      contactId: contact.id,
      created: isNewAccount,
      resumed: !isNewAccount,
      portalUrl,
      activationUrl: activationUrl ?? null,
    };
  }

  /**
   * Invite a contact to an EXISTING client (used when admin adds a client in the
   * dashboard): create their Supabase login + link the contact + email a secure
   * activation/portal link. Idempotent on the contact's email.
   */
  async inviteClientContact(input: {
    clientId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  }) {
    const email = input.email.trim().toLowerCase();
    let user = await this.prisma.user.findUnique({ where: { email } });
    let isNew = false;
    let activationUrl: string | undefined;

    if (!user) {
      const auth = await this.ensureAuthUser(
        email,
        { firstName: input.firstName, lastName: input.lastName, role: 'client' },
        this.clientPortalUrl(),
      );
      isNew = auth.isNew;
      activationUrl = auth.actionLink;
      user = await this.prisma.user.upsert({
        where: { id: auth.id },
        update: {},
        create: { id: auth.id, email, role: Role.CLIENT, firstName: input.firstName, lastName: input.lastName, phone: input.phone },
      });
    }

    // Link the contact to this client (idempotent by the contact's userId).
    let contact = await this.prisma.clientContact.findUnique({ where: { userId: user.id } });
    if (!contact) {
      const primaryCount = await this.prisma.clientContact.count({ where: { clientId: input.clientId, isPrimary: true } });
      contact = await this.prisma.clientContact.create({
        data: {
          clientId: input.clientId,
          userId: user.id,
          firstName: input.firstName,
          lastName: input.lastName,
          email,
          phone: input.phone,
          isPrimary: primaryCount === 0,
        },
      });
    }

    const portalUrl = this.clientPortalUrl();
    await this.notifications.send({
      to: email,
      userId: user.id,
      kind: isNew ? 'ACTIVATION' : 'CONTINUE_REGISTRATION',
      subject: isNew ? "You've been invited to the Starff client portal" : 'Your Starff client portal',
      body: isNew
        ? `Hi ${input.firstName}, you've been set up on the Starff client portal. Activate your account to log in and manage your staffing.`
        : `Hi ${input.firstName}, log in to the Starff client portal to manage your staffing.`,
      actionUrl: activationUrl ?? portalUrl,
      actionLabel: isNew ? 'Activate & log in' : 'Go to portal',
    });

    return { contactId: contact.id, userId: user.id, invited: isNew };
  }

  // ────────────────────────────────────────────────────────────
  // PROGRESS  (derived — no duplicated "percent" column)
  // ────────────────────────────────────────────────────────────
  async candidateProgress(userId: string): Promise<ProgressResult> {
    const c = await this.prisma.candidate.findUnique({
      where: { userId },
      include: { documents: true, availability: true, employmentHistory: true, references: true },
    });
    if (!c) throw new NotFoundException('Candidate profile not found');

    const hasDoc = (t: DocumentType) => c.documents.some((d) => d.type === t);
    const sections: ProgressSection[] = [
      { key: 'contact', label: 'Contact & address', done: !!(c.phone && c.city && c.postcode) },
      { key: 'personal', label: 'Personal details', done: !!(c.dateOfBirth && c.nationalInsurance) },
      { key: 'emergency', label: 'Emergency contact', done: !!(c.emergencyName && c.emergencyPhone) },
      { key: 'bank', label: 'Bank details', done: !!(c.bankAccountName && c.bankSortCode && c.bankAccountNumber) },
      { key: 'employment', label: 'Employment history', done: c.employmentHistory.length > 0 },
      { key: 'references', label: 'References', done: c.references.length > 0 },
      { key: 'right-to-work', label: 'Right to work', done: hasDoc(DocumentType.RIGHT_TO_WORK) },
      { key: 'identity', label: 'Proof of identity', done: hasDoc(DocumentType.ID) },
      { key: 'cv', label: 'CV', done: hasDoc(DocumentType.CV) },
      { key: 'availability', label: 'Availability', done: c.availability.length > 0 },
      { key: 'health', label: 'Health & safety declaration', done: c.healthDeclaration === true },
      { key: 'consent', label: 'GDPR consent', done: c.consentGdpr === true },
      { key: 'agreement', label: 'Agreement & signature', done: c.agreementAccepted === true && !!c.signatureName },
    ];
    return this.summarise(sections, c.status, c.submittedAt);
  }

  async clientProgress(userId: string): Promise<ProgressResult> {
    const contact = await this.prisma.clientContact.findUnique({
      where: { userId },
      include: { client: { include: { sites: true } } },
    });
    if (!contact?.client) throw new NotFoundException('Client profile not found');
    const cl = contact.client;

    const sections: ProgressSection[] = [
      { key: 'company', label: 'Company profile', done: !!(cl.industry && cl.companyRegNo) },
      { key: 'address', label: 'Business address', done: !!(cl.addressLine1 && cl.city && cl.postcode) },
      { key: 'billing', label: 'Billing details', done: !!(cl.billingEmail && cl.paymentTerms != null) },
      { key: 'sites', label: 'Hiring location', done: cl.sites.length > 0 },
      { key: 'agreement', label: 'Agreement & signature', done: cl.agreementAccepted === true && !!cl.signatureName },
    ];
    return this.summarise(sections, cl.status, cl.submittedAt);
  }

  private summarise(
    sections: ProgressSection[],
    status: CandidateStatus | ClientStatus,
    submittedAt: Date | null,
  ): ProgressResult {
    const done = sections.filter((s) => s.done).length;
    const percent = Math.round((done / sections.length) * 100);
    const next = sections.find((s) => !s.done)?.key ?? null;
    return {
      percent,
      complete: done === sections.length,
      submitted: !!submittedAt,
      status,
      sections,
      nextSection: next,
    };
  }

  // ────────────────────────────────────────────────────────────
  // SUBMIT FOR REVIEW
  // ────────────────────────────────────────────────────────────
  async submitCandidate(userId: string) {
    const c = await this.prisma.candidate.findUnique({ where: { userId } });
    if (!c) throw new NotFoundException('Candidate profile not found');
    const progress = await this.candidateProgress(userId);
    // Idempotent: submitting again just returns the current state.
    const updated = await this.prisma.candidate.update({
      where: { userId },
      data: {
        submittedAt: c.submittedAt ?? new Date(),
        status: c.status === CandidateStatus.NEW ? CandidateStatus.SCREENING : c.status,
      },
    });
    await this.notifications.send({
      to: (await this.prisma.user.findUnique({ where: { id: userId } }))!.email,
      userId,
      kind: 'REGISTRATION_SUBMITTED',
      subject: 'Your Starff registration is with our team',
      body: 'Thanks — your registration has been submitted for review. We\'ll be in touch if we need anything else.',
      actionUrl: this.candidatePortalUrl(),
    });
    return { submittedAt: updated.submittedAt, status: updated.status, progress };
  }

  // ────────────────────────────────────────────────────────────
  // STAFF REVIEW  (approve / reject / request more info)
  // ────────────────────────────────────────────────────────────
  async reviewCandidate(candidateId: string, action: 'APPROVE' | 'REJECT' | 'REQUEST_INFO', note?: string) {
    const c = await this.prisma.candidate.findUnique({ where: { id: candidateId }, include: { user: true } });
    if (!c) throw new NotFoundException('Candidate not found');

    let status = c.status;
    // Any review outcome (approve / reject / send-back) means it's no longer
    // awaiting review, so the "submitted" flag is cleared in every branch.
    let submittedAt: Date | null = null;
    let kind: 'REGISTRATION_APPROVED' | 'REGISTRATION_REJECTED' | 'INFO_REQUESTED';
    let subject: string;
    let body: string;

    if (action === 'APPROVE') {
      status = CandidateStatus.COMPLIANT;
      kind = 'REGISTRATION_APPROVED';
      subject = 'Your Starff registration is approved';
      body = 'Great news — your registration has been approved. We’ll be in touch with work opportunities that match you.';
    } else if (action === 'REJECT') {
      status = CandidateStatus.REJECTED;
      kind = 'REGISTRATION_REJECTED';
      subject = 'Update on your Starff registration';
      body = `Thank you for registering. Unfortunately we’re unable to progress your registration at this time.${note ? ' ' + note : ''}`;
    } else {
      submittedAt = null; // send it back to the candidate to edit
      status = CandidateStatus.SCREENING;
      kind = 'INFO_REQUESTED';
      subject = 'We need a bit more information';
      body = `Please update your registration and re-submit.${note ? ' ' + note : ''}`;
    }

    const updated = await this.prisma.candidate.update({ where: { id: candidateId }, data: { status, submittedAt } });
    await this.notifications.send({ to: c.user.email, userId: c.userId, kind, subject, body, actionUrl: this.candidatePortalUrl() });
    return { status: updated.status, submittedAt: updated.submittedAt };
  }

  async reviewClient(clientId: string, action: 'APPROVE' | 'REJECT' | 'REQUEST_INFO', note?: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, include: { contacts: true } });
    if (!client) throw new NotFoundException('Client not found');
    const primary = client.contacts.find((c) => c.isPrimary) ?? client.contacts[0];

    let status = client.status;
    // Any review outcome clears the "awaiting review" flag.
    let submittedAt: Date | null = null;
    let kind: 'REGISTRATION_APPROVED' | 'REGISTRATION_REJECTED' | 'INFO_REQUESTED';
    let subject: string;
    let body: string;

    if (action === 'APPROVE') {
      status = ClientStatus.ACTIVE;
      kind = 'REGISTRATION_APPROVED';
      subject = 'Your Starff account is approved';
      body = 'Welcome aboard — your account is approved and active. You can now book staff through the client portal.';
    } else if (action === 'REJECT') {
      status = ClientStatus.CLOSED;
      kind = 'REGISTRATION_REJECTED';
      subject = 'Update on your Starff account';
      body = `Thank you for your interest. Unfortunately we’re unable to open your account at this time.${note ? ' ' + note : ''}`;
    } else {
      submittedAt = null;
      status = ClientStatus.PROSPECT;
      kind = 'INFO_REQUESTED';
      subject = 'We need a bit more information';
      body = `Please complete the outstanding details and re-submit your onboarding.${note ? ' ' + note : ''}`;
    }

    const updated = await this.prisma.client.update({ where: { id: clientId }, data: { status, submittedAt } });
    if (primary) {
      await this.notifications.send({ to: primary.email, userId: primary.userId ?? undefined, kind, subject, body, actionUrl: this.clientPortalUrl() });
    }
    return { status: updated.status, submittedAt: updated.submittedAt };
  }

  async submitClient(userId: string) {
    const contact = await this.prisma.clientContact.findUnique({
      where: { userId },
      include: { client: true },
    });
    if (!contact?.client) throw new NotFoundException('Client profile not found');
    const cl = contact.client;
    const progress = await this.clientProgress(userId);
    const updated = await this.prisma.client.update({
      where: { id: cl.id },
      data: {
        submittedAt: cl.submittedAt ?? new Date(),
        status: cl.status === ClientStatus.LEAD ? ClientStatus.PROSPECT : cl.status,
      },
    });
    await this.notifications.send({
      to: contact.email,
      userId,
      kind: 'REGISTRATION_SUBMITTED',
      subject: 'Your Starff onboarding is with our team',
      body: 'Thanks — your onboarding has been submitted for review. Our team will confirm your account shortly.',
      actionUrl: this.clientPortalUrl(),
    });
    return { submittedAt: updated.submittedAt, status: updated.status, progress };
  }
}
