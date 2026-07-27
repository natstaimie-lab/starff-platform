import { Injectable, NotFoundException } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateClientDto) {
    return this.prisma.client.create({ data: dto });
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
