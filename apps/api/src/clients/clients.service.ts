import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto, ClientContactDto, ClientSiteDto } from './dto/update-client.dto';
import { RegistrationService } from '../registration/registration.service';
import { CLIENT_AGREEMENT, clientAgreementSnapshot } from '../client-portal/client-agreement';
import PDFDocument from 'pdfkit';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registration: RegistrationService,
  ) {}

  async create(dto: CreateClientDto) {
    // Split the optional primary-contact fields from the client's own fields.
    const { contactFirstName, contactLastName, contactEmail, contactPhone, sendInvite, ...clientData } = dto;
    const client = await this.prisma.client.create({
      data: { ...clientData, registrationSource: 'ADMIN' },
    });

    // If a contact email was given, invite them to the client portal (best-effort).
    if (contactEmail && contactFirstName) {
      try {
        await this.registration.inviteClientContact({
          clientId: client.id,
          firstName: contactFirstName,
          lastName: contactLastName || '—',
          email: contactEmail,
          phone: contactPhone,
          sendInvite: sendInvite === true,
        });
      } catch {
        // never fail client creation because an invite email bounced
      }
    }

    return client;
  }

  findAll(params: { includeArchived?: boolean } = {}) {
    return this.prisma.client.findMany({
      where: params.includeArchived ? {} : { archivedAt: null }, // hide archived by default
      orderBy: { createdAt: 'desc' },
      include: {
        contacts: true,
        _count: { select: { jobs: true, sites: true } },
      },
    });
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: { contacts: true, sites: true, jobs: true },
    });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  /**
   * Generate a signed Terms of Business PDF for a client who has accepted.
   * Uses the exact wording snapshotted at sign-time (falling back to the current
   * wording for clients who accepted before snapshots were stored).
   */
  async agreementPdf(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) throw new NotFoundException('Client not found');
    if (!client.agreementAccepted) {
      throw new BadRequestException('This client has not accepted the agreement yet.');
    }
    const body = client.agreementText || clientAgreementSnapshot(client.name);
    const version = client.agreementVersion || CLIENT_AGREEMENT.version;
    const fmt = (d?: Date | null) =>
      d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

    const ORANGE = '#F47A20', INK = '#0B1F3A', MUTED = '#5A6B82', LINE = '#CBD6E4';
    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(22).text('STARFF');
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(15).text('Client Terms of Business Agreement');
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(`Agreement version ${version}`);
    doc.moveDown(1.2);

    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text('Client');
    doc.font('Helvetica').fontSize(11).fillColor(INK).text(client.name);
    if (client.companyRegNo) doc.fillColor(MUTED).fontSize(10).text(`Company reg. no. ${client.companyRegNo}`);
    const addr = [client.addressLine1, client.city, client.postcode].filter(Boolean).join(', ');
    if (addr) doc.fillColor(MUTED).fontSize(10).text(addr);
    doc.moveDown(1.2);

    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text('Terms accepted');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10.5).fillColor(INK).text(body, { lineGap: 3 });
    doc.moveDown(1.2);

    doc.strokeColor(LINE).moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
    doc.moveDown(0.7);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text('Signature');
    doc.font('Helvetica').fontSize(11).fillColor(INK).text(`Signed by: ${client.signatureName ?? '—'}`);
    doc.fillColor(MUTED).fontSize(10).text(`Date signed: ${fmt(client.signedAt)}`);
    doc.fillColor(MUTED).fontSize(10).text(`Agreement accepted: ${fmt(client.agreementAcceptedAt)}`);
    doc.moveDown(2);

    doc.fillColor(MUTED).fontSize(8).text(
      'This document is a record of the agreement accepted electronically through the Starff client portal. ' +
      'Starff Ltd, registered in England & Wales, company no. 17166246. Registered office: 66 Paul Street, London EC2A 4NA.',
      { lineGap: 2 },
    );
    doc.fillColor(MUTED).fontSize(8).text(`Generated ${fmt(new Date())}.`);

    doc.end();
    const buffer = await done;
    const safe = client.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'client';
    return { buffer, filename: `starff-agreement-${safe}.pdf` };
  }

  /** Admin edit of the company record. Partial update. */
  async update(id: string, dto: UpdateClientDto) {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) throw new NotFoundException('Client not found');
    if (dto.name !== undefined && !dto.name.trim()) {
      throw new BadRequestException('Company name cannot be empty.');
    }
    return this.prisma.client.update({ where: { id }, data: dto });
  }

  /** Add a hiring location / site to a client. */
  async addLocation(id: string, dto: ClientSiteDto) {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) throw new NotFoundException('Client not found');
    if (!dto.name?.trim()) throw new BadRequestException('Location name is required.');
    return this.prisma.clientSite.create({
      data: { clientId: id, name: dto.name.trim(), addressLine1: dto.addressLine1, city: dto.city, postcode: dto.postcode },
    });
  }

  /** Remove a hiring location — blocked if any bookings are tied to it. */
  async removeLocation(id: string, siteId: string) {
    const site = await this.prisma.clientSite.findFirst({ where: { id: siteId, clientId: id } });
    if (!site) throw new NotFoundException('Location not found');
    const [jobs, shifts] = await Promise.all([
      this.prisma.job.count({ where: { siteId } }),
      this.prisma.shift.count({ where: { siteId } }),
    ]);
    if (jobs > 0 || shifts > 0) {
      throw new BadRequestException('This location has bookings linked to it and cannot be removed.');
    }
    await this.prisma.clientSite.delete({ where: { id: siteId } });
    return { removed: true };
  }

  /** Add an authorised contact to a client; optionally invite them to the portal. */
  addContact(id: string, dto: ClientContactDto) {
    return this.registration.addClientContact(id, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      jobTitle: dto.jobTitle,
      sendInvite: dto.sendInvite === true,
    });
  }

  /** (Re)send a portal invite / login link to an existing contact. */
  resendContactInvite(id: string, contactId: string) {
    return this.registration.resendClientContactInvite(contactId);
  }

  /** Edit a contact's own details (name, email, phone, job title). */
  async updateContact(id: string, contactId: string, dto: Partial<ClientContactDto>) {
    const contact = await this.prisma.clientContact.findFirst({ where: { id: contactId, clientId: id } });
    if (!contact) throw new NotFoundException('Contact not found');
    const data: Record<string, unknown> = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim();
    if (dto.email !== undefined) data.email = dto.email.trim().toLowerCase();
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.jobTitle !== undefined) data.jobTitle = dto.jobTitle;
    return this.prisma.clientContact.update({ where: { id: contactId }, data });
  }

  /** Remove a contact and their portal login (irreversible for that contact). */
  async removeContact(id: string, contactId: string) {
    const contact = await this.prisma.clientContact.findFirst({ where: { id: contactId, clientId: id } });
    if (!contact) throw new NotFoundException('Contact not found');
    const userId = contact.userId;
    await this.prisma.clientContact.delete({ where: { id: contactId } });
    if (userId) {
      const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
      await this.prisma.notification.deleteMany({ where: { userId } }).catch(() => {});
      await this.prisma.user.delete({ where: { id: userId } }).catch(() => {});
      await supabase.auth.admin.deleteUser(userId).catch(() => {});
    }
    return { removed: true };
  }

  /**
   * Archive (soft-delete) or restore a client. Hides them from lists and
   * deactivates their contacts' logins, but keeps all data — reversible.
   */
  async setArchived(id: string, archived: boolean) {
    const client = await this.prisma.client.findUnique({ where: { id }, include: { contacts: true } });
    if (!client) throw new NotFoundException('Client not found');
    await this.prisma.client.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    for (const c of client.contacts) {
      if (c.userId) await this.prisma.user.update({ where: { id: c.userId }, data: { isActive: !archived } }).catch(() => {});
    }
    return { id, archived };
  }

  /**
   * Permanently delete a client — company, contacts, sites, jobs, invoices and
   * every contact's login/auth user. Admin-only, irreversible (GDPR removal).
   */
  async remove(id: string) {
    const client = await this.prisma.client.findUnique({ where: { id }, include: { contacts: { select: { userId: true } } } });
    if (!client) throw new NotFoundException('Client not found');
    const userIds = client.contacts.map((c) => c.userId).filter((u): u is string => !!u);

    // Client children (contacts, sites, jobs, invoices) cascade on client delete.
    await this.prisma.client.delete({ where: { id } });

    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    for (const userId of userIds) {
      await this.prisma.notification.deleteMany({ where: { userId } });
      await this.prisma.conversation.deleteMany({ where: { memberUserId: userId } });
      await this.prisma.user.delete({ where: { id: userId } }).catch(() => {});
      await supabase.auth.admin.deleteUser(userId).catch(() => {});
    }
    return { deleted: true };
  }
}
