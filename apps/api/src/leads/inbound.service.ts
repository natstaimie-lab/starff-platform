import { Injectable, Logger, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { LeadActivityType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AiSalesService } from './ai-sales.service';
import { LeadsService } from './leads.service';
import { UNSUBSCRIBE_RX, stripQuoted } from './lead-stages';
import { verifySvix } from './svix';

const htmlToText = (html: string) =>
  html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

const londonDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d);

/** "Sam Patel <sam@x.com>" → { name, email } */
function parseFrom(raw: string | undefined | null): { name: string | null; email: string } {
  const s = (raw ?? '').trim();
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim() || null, email: m[2].trim().toLowerCase() } : { name: null, email: s.toLowerCase() };
}

/**
 * CRM Phase 4c: employer replies arrive from Resend inbound. Each one is
 * stored, matched to a lead by the sender's address, logged on the timeline,
 * and read by the AI salesperson: unsubscribes stop all emails straight away;
 * everything else gets a suggested stage change and a drafted answer in AI
 * approvals. Nothing is sent and no stage moves without staff.
 */
@Injectable()
export class InboundService {
  private readonly logger = new Logger('Inbound');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ai: AiSalesService,
    private readonly leads: LeadsService,
  ) {}

  /** Webhook entry: verify, store once, answer fast, then process in the background. */
  async receive(rawBody: string, headers: { id?: string; timestamp?: string; signature?: string }) {
    const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
    if (!secret) throw new ServiceUnavailableException('Inbound email is not set up (RESEND_INBOUND_WEBHOOK_SECRET missing).');
    if (!verifySvix(secret, rawBody, headers)) throw new UnauthorizedException('Bad webhook signature');

    let event: { type?: string; data?: { email_id?: string; from?: string; to?: string[]; subject?: string; message_id?: string } };
    try { event = JSON.parse(rawBody); } catch { return { ok: true, ignored: 'not json' }; }
    if (event.type !== 'email.received' || !event.data?.email_id) return { ok: true, ignored: event.type ?? 'unknown' };

    const d = event.data;
    const from = parseFrom(d.from);
    let row;
    try {
      row = await this.prisma.inboundEmail.create({
        data: {
          resendEmailId: d.email_id!, fromEmail: from.email, fromName: from.name, toEmails: (d.to ?? []) as Prisma.InputJsonValue,
          subject: d.subject ?? null, messageId: d.message_id ?? null,
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') return { ok: true, duplicate: true }; // Resend retried
      throw e;
    }
    void this.process(row.id).catch((e) => this.logger.error(`inbound ${row.id} failed: ${(e as Error).message}`));
    return { ok: true, id: row.id };
  }

  /** Fetch the body from Resend (the webhook only carries metadata). */
  private async fetchBody(resendEmailId: string): Promise<{ text: string; fromName: string | null; subject: string | null }> {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY is not set');
    const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(resendEmailId)}`, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`Resend ${res.status} ${await res.text().catch(() => '')}`.trim());
    const e = (await res.json()) as { text?: string | null; html?: string | null; subject?: string | null; headers?: Record<string, string> };
    const body = e.text?.trim() ? e.text : e.html ? htmlToText(e.html) : '';
    return { text: stripQuoted(body).slice(0, 20000), fromName: parseFrom(e.headers?.from).name, subject: e.subject ?? null };
  }

  /** Handle a stored inbound email. Safe to re-run for a RECEIVED or FAILED row. */
  async process(inboundId: string, bodyOverride?: { text: string; fromName?: string | null; subject?: string | null }) {
    const row = await this.prisma.inboundEmail.findUnique({ where: { id: inboundId } });
    if (!row) throw new NotFoundException('Inbound email not found');
    if (row.status !== 'RECEIVED' && row.status !== 'FAILED') return row;

    try {
      // Once fetched, the text is kept, so a retry (e.g. after the AI was busy) doesn't fetch it again.
      const body = bodyOverride ?? (row.text != null ? { text: row.text, fromName: row.fromName, subject: row.subject } : await this.fetchBody(row.resendEmailId));
      const text = body.text.trim();
      const fromName = body.fromName ?? row.fromName;
      const subject = body.subject ?? row.subject;
      await this.prisma.inboundEmail.update({ where: { id: row.id }, data: { text, fromName, subject } });

      // Every lead with this address (most recently active first). Archived leads still count for unsubscribes.
      const leads = await this.prisma.lead.findMany({
        where: { contactEmail: row.fromEmail },
        orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { lastActivityAt: { sort: 'desc', nulls: 'last' } }],
        select: { id: true, companyName: true, contactName: true, stage: true, archivedAt: true },
      });

      // 1. Unsubscribe: honoured before anything else, and works with the AI off.
      if (UNSUBSCRIBE_RX.test(`${subject ?? ''}\n${text}`)) {
        await this.unsubscribe(row.fromEmail, leads.map((l) => l.id), row.id, text);
        return this.prisma.inboundEmail.update({ where: { id: row.id }, data: { status: 'UNSUBSCRIBED', leadId: leads[0]?.id ?? null, intent: 'unsubscribe', summary: 'Asked not to be emailed again.' } });
      }

      const lead = leads.find((l) => !l.archivedAt) ?? null;
      if (!lead) {
        await this.notifyStaff('Reply from an unknown address', `${fromName ?? row.fromEmail} replied ("${subject ?? 'no subject'}") but no lead has that email.`, '/dashboard/leads/approvals');
        return this.prisma.inboundEmail.update({ where: { id: row.id }, data: { status: 'UNMATCHED' } });
      }

      // 2. On the timeline as an inbound email.
      const now = new Date();
      await this.prisma.$transaction([
        this.prisma.leadActivity.create({
          data: {
            leadId: lead.id, type: LeadActivityType.EMAIL, direction: 'inbound', subject: subject ?? '(no subject)', body: text || '(empty message)',
            meta: { inboundEmailId: row.id, resendEmailId: row.resendEmailId, from: row.fromEmail }, occurredAt: row.receivedAt,
          },
        }),
        this.prisma.lead.update({ where: { id: lead.id }, data: { lastActivityAt: now } }),
      ]);
      // Anything drafted before this reply is out of date.
      await this.leads.staleDrafts(lead.id);

      // 3. The AI reads it: intent, suggested stage, drafted answer.
      let read: Awaited<ReturnType<AiSalesService['readReply']>> = null;
      try {
        read = await this.ai.readReply(lead.id, { subject, text, fromName });
      } catch (e) {
        this.logger.warn(`AI could not read inbound ${row.id}: ${(e as Error).message}`);
      }

      if (read?.intent === 'unsubscribe') {
        await this.unsubscribe(row.fromEmail, leads.map((l) => l.id), row.id, text);
        return this.prisma.inboundEmail.update({ where: { id: row.id }, data: { status: 'UNSUBSCRIBED', leadId: lead.id, intent: 'unsubscribe', summary: read.summary || 'Asked not to be emailed again.' } });
      }
      if (read?.intent === 'out_of_office') {
        return this.prisma.inboundEmail.update({ where: { id: row.id }, data: { status: 'IGNORED', leadId: lead.id, intent: read.intent, summary: read.summary } });
      }

      if (read && (read.needsReply || read.suggestedStage)) {
        await this.prisma.aiDraft.create({
          data: {
            leadId: lead.id, kind: 'REPLY', trigger: 'reply', forDay: `${londonDate()}#reply-${row.id}`,
            subject: read.needsReply ? read.subject : '', body: read.needsReply ? read.body : '',
            reasoning: read.summary || null, theirSummary: read.summary || null, intent: read.intent,
            suggestedStage: read.suggestedStage, suggestedReason: read.stageReason || null,
            nextFollowUpDays: read.nextFollowUpDays || 3, warnings: read.warnings as Prisma.InputJsonValue, model: read.model, inboundEmailId: row.id,
          },
        });
      }

      const label: Record<string, string> = { interested: 'is interested', question: 'has a question', not_now: 'says not now', not_interested: 'says no', wrong_person: 'says wrong person', other: 'replied' };
      await this.notifyStaff(
        `${lead.companyName} replied`,
        `${fromName ?? lead.contactName ?? row.fromEmail} ${read ? label[read.intent] ?? 'replied' : 'replied'}${read?.summary ? `: ${read.summary}` : '.'}`,
        read ? '/dashboard/leads/approvals' : `/dashboard/leads/${lead.id}`,
      );
      await this.audit.log({ action: 'lead.reply_received', entity: 'Lead', entityId: lead.id, meta: { inboundEmailId: row.id, intent: read?.intent ?? null, suggestedStage: read?.suggestedStage ?? null } });
      return this.prisma.inboundEmail.update({ where: { id: row.id }, data: { status: 'MATCHED', leadId: lead.id, intent: read?.intent ?? null, summary: read?.summary ?? null } });
    } catch (e) {
      await this.prisma.inboundEmail.update({ where: { id: row.id }, data: { status: 'FAILED', error: (e as Error).message.slice(0, 500) } }).catch(() => {});
      throw e;
    }
  }

  /** Stop all emails to this address: every lead with it is marked unsubscribed and its waiting drafts go out of date. */
  private async unsubscribe(email: string, leadIds: string[], inboundId: string, text: string) {
    const now = new Date();
    for (const id of leadIds) {
      await this.prisma.lead.update({ where: { id }, data: { unsubscribedAt: now, unsubscribeNote: `Replied asking not to be emailed (${londonDate(now)}).` } });
      await this.prisma.leadActivity.create({
        data: { leadId: id, type: LeadActivityType.NOTE, subject: 'Unsubscribed by email reply', body: text.slice(0, 2000) || null, meta: { inboundEmailId: inboundId, email }, occurredAt: now },
      });
      await this.leads.staleDrafts(id);
      await this.audit.log({ action: 'lead.unsubscribed', entity: 'Lead', entityId: id, meta: { email, inboundEmailId: inboundId, via: 'reply' } });
    }
    await this.notifyStaff('Unsubscribed', `${email} asked not to be emailed again. All emails to them are now blocked.`, leadIds[0] ? `/dashboard/leads/${leadIds[0]}` : '/dashboard/leads/approvals');
  }

  private async notifyStaff(title: string, body: string, link: string) {
    try {
      const staff = await this.prisma.user.findMany({ where: { role: { in: [Role.ADMIN, Role.RECRUITER] }, isActive: true }, select: { id: true } });
      if (staff.length) await this.prisma.notification.createMany({ data: staff.map((s) => ({ userId: s.id, type: 'lead_reply', title, body, link })) });
    } catch { /* best-effort */ }
  }

  /** Replies that matched no lead, or that failed, for the approvals page. */
  listUnhandled() {
    return this.prisma.inboundEmail.findMany({
      where: { status: { in: ['UNMATCHED', 'FAILED'] } },
      orderBy: { receivedAt: 'desc' },
      take: 50,
      select: { id: true, status: true, fromEmail: true, fromName: true, subject: true, text: true, receivedAt: true, error: true },
    });
  }

  async dismiss(id: string, userId: string) {
    const row = await this.prisma.inboundEmail.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Inbound email not found');
    await this.prisma.inboundEmail.update({ where: { id }, data: { status: 'IGNORED' } });
    await this.audit.log({ actorId: userId, action: 'inbound.dismissed', entity: 'InboundEmail', entityId: id });
    return { ok: true };
  }
}
