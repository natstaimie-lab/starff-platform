import { Injectable, NotFoundException } from '@nestjs/common';
import { ConversationKind, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  private async displayName(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) return 'User';
    const name = [u.firstName, u.lastName].filter(Boolean).join(' ');
    return name || u.email;
  }

  /** Get (or create) the logged-in member's single conversation with the agency. */
  private async getOrCreateThread(userId: string, role?: Role) {
    let convo = await this.prisma.conversation.findFirst({ where: { memberUserId: userId } });
    if (!convo) {
      const name = await this.displayName(userId);
      convo = await this.prisma.conversation.create({
        data: {
          kind: role === Role.CLIENT ? ConversationKind.CLIENT : ConversationKind.CANDIDATE,
          memberUserId: userId,
          subject: name,
          messages: {
            create: {
              senderUserId: userId, // placeholder author of the system welcome
              senderIsStaff: true,
              senderName: 'Starff Team',
              body: `Hi ${name.split(' ')[0]}, I'm your Starff consultant. Message me here about shifts, compliance or anything else — I'm happy to help.`,
            },
          },
        },
      });
    }
    return convo;
  }

  // ---------- member (candidate / client) ----------

  async memberThread(userId: string, role?: Role) {
    const convo = await this.getOrCreateThread(userId, role);
    await this.prisma.message.updateMany({
      where: { conversationId: convo.id, senderIsStaff: true, readAt: null },
      data: { readAt: new Date() },
    });
    const messages = await this.prisma.message.findMany({ where: { conversationId: convo.id }, orderBy: { createdAt: 'asc' } });
    return { conversationId: convo.id, messages };
  }

  async memberSend(userId: string, role: Role | undefined, body: string) {
    const convo = await this.getOrCreateThread(userId, role);
    const name = await this.displayName(userId);
    const msg = await this.prisma.message.create({
      data: { conversationId: convo.id, senderUserId: userId, senderIsStaff: false, senderName: name, body },
    });
    await this.prisma.conversation.update({ where: { id: convo.id }, data: { lastMessageAt: new Date() } });
    return msg;
  }

  // ---------- staff (admin / recruiter) ----------

  async listConversations() {
    const convos = await this.prisma.conversation.findMany({
      orderBy: { lastMessageAt: 'desc' },
      include: {
        member: { select: { firstName: true, lastName: true, email: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { messages: { where: { senderIsStaff: false, readAt: null } } } },
      },
    });
    return convos.map((c) => ({
      id: c.id,
      kind: c.kind,
      name: [c.member.firstName, c.member.lastName].filter(Boolean).join(' ') || c.member.email,
      lastMessage: c.messages[0]?.body ?? '',
      lastAt: c.lastMessageAt,
      unread: c._count.messages,
    }));
  }

  async staffThread(conversationId: string) {
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { member: { select: { firstName: true, lastName: true, email: true } } },
    });
    if (!convo) throw new NotFoundException('Conversation not found');
    await this.prisma.message.updateMany({
      where: { conversationId, senderIsStaff: false, readAt: null },
      data: { readAt: new Date() },
    });
    const messages = await this.prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } });
    return {
      conversationId,
      kind: convo.kind,
      name: [convo.member.firstName, convo.member.lastName].filter(Boolean).join(' ') || convo.member.email,
      messages,
    };
  }

  async staffSend(actorId: string, conversationId: string, body: string) {
    const convo = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!convo) throw new NotFoundException('Conversation not found');
    const name = await this.displayName(actorId);
    const msg = await this.prisma.message.create({
      data: { conversationId, senderUserId: actorId, senderIsStaff: true, senderName: name, body },
    });
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
    return msg;
  }
}
