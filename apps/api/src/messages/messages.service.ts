import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConversationKind, Conversation, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

// A staff message e-mails the member only when it opens a thread or re-engages
// one that's gone quiet — a live back-and-forth stays in-app + push only.
const QUIET_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async displayName(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) return 'User';
    const name = [u.firstName, u.lastName].filter(Boolean).join(' ');
    return name || u.email;
  }

  /** Get (or create) the member's single conversation with the agency. No welcome
   * message is seeded — a thread exists only once someone actually writes. */
  private async getOrCreateThread(userId: string, role?: Role) {
    let convo = await this.prisma.conversation.findFirst({ where: { memberUserId: userId } });
    if (!convo) {
      const name = await this.displayName(userId);
      convo = await this.prisma.conversation.create({
        data: {
          kind: role === Role.CLIENT ? ConversationKind.CLIENT : ConversationKind.CANDIDATE,
          memberUserId: userId,
          subject: name,
        },
      });
    }
    return convo;
  }

  // ---------- member (candidate / client) ----------

  async memberThread(userId: string, _role?: Role) {
    // Don't create a thread just because the member opened the tab — that's what
    // used to litter the admin inbox with empty conversations.
    const convo = await this.prisma.conversation.findFirst({ where: { memberUserId: userId } });
    if (!convo) return { conversationId: null, messages: [] };
    await this.prisma.message.updateMany({
      where: { conversationId: convo.id, senderIsStaff: true, readAt: null },
      data: { readAt: new Date() },
    });
    const messages = await this.prisma.message.findMany({ where: { conversationId: convo.id }, orderBy: { createdAt: 'asc' } });
    return { conversationId: convo.id, messages };
  }

  async memberSend(userId: string, role: Role | undefined, body: string) {
    const text = (body ?? '').trim();
    if (!text) throw new BadRequestException('Message is empty');
    const convo = await this.getOrCreateThread(userId, role);
    const name = await this.displayName(userId);
    const msg = await this.prisma.message.create({
      data: { conversationId: convo.id, senderUserId: userId, senderIsStaff: false, senderName: name, body: text },
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
    return convos
      // Hide any thread that has no messages yet (nothing to show).
      .filter((c) => c.messages.length > 0)
      .map((c) => ({
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

  /** Reply within an existing conversation. */
  async staffSend(actorId: string, conversationId: string, body: string) {
    const convo = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!convo) throw new NotFoundException('Conversation not found');
    return this.postStaffMessage(actorId, convo, body);
  }

  /** Start (or continue) a conversation with a member by their user id — lets
   * staff reach out first, not only reply. */
  async staffStart(actorId: string, memberUserId: string, body: string) {
    const member = await this.prisma.user.findUnique({ where: { id: memberUserId }, select: { role: true } });
    if (!member) throw new NotFoundException('Member not found');
    const convo = await this.getOrCreateThread(memberUserId, member.role);
    return this.postStaffMessage(actorId, convo, body);
  }

  /** Post a staff message to a conversation and alert the member: in-app + push
   * always, email only when the thread is new or has gone quiet (>24h). */
  private async postStaffMessage(actorId: string, convo: Conversation, body: string) {
    const text = (body ?? '').trim();
    if (!text) throw new BadRequestException('Message is empty');

    const last = await this.prisma.message.findFirst({
      where: { conversationId: convo.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const emailThis = !last || Date.now() - new Date(last.createdAt).getTime() > QUIET_MS;

    const name = await this.displayName(actorId);
    const msg = await this.prisma.message.create({
      data: { conversationId: convo.id, senderUserId: actorId, senderIsStaff: true, senderName: name, body: text },
    });
    await this.prisma.conversation.update({ where: { id: convo.id }, data: { lastMessageAt: new Date() } });

    // Alert the member (best-effort — never blocks the message).
    try {
      const member = await this.prisma.user.findUnique({ where: { id: convo.memberUserId }, select: { email: true } });
      const email = member?.email ?? '';
      const realEmail = !!email && !email.endsWith('@candidate.local') && !email.endsWith('@placeholder.starff');
      const portal = convo.kind === ConversationKind.CLIENT
        ? (process.env.CLIENT_PORTAL_URL ?? 'http://localhost:3003')
        : (process.env.CANDIDATE_PORTAL_URL ?? 'http://localhost:3002');
      const preview = text.length > 140 ? `${text.slice(0, 137)}…` : text;
      await this.notifications.send({
        to: email || 'noreply@starff.co.uk',
        userId: convo.memberUserId,
        kind: 'NEW_MESSAGE',
        subject: 'New message from Starff',
        body: preview,
        actionUrl: `${portal}/dashboard/messages`,
        actionLabel: 'View message',
        email: emailThis && realEmail,
      });
    } catch {
      /* notification is best-effort */
    }
    return msg;
  }
}
