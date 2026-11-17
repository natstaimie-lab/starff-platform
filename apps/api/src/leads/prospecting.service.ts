import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LeadSource, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LeadsService } from './leads.service';
import { normaliseCompany } from './client-match';
import {
  CONTACT_TITLES, WAREHOUSE_JOB_TITLES, alreadyKnown, isoWeekKey, normaliseDomain, pickContact, roomLeft, type Known,
} from './prospecting';

const APOLLO = 'https://api.apollo.io/api/v1';
const LONDON = 'London, United Kingdom';
/** Free-mail domains never count as a company's website. */
const FREEMAIL = new Set(['gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.co.uk', 'yahoo.com', 'yahoo.co.uk', 'icloud.com', 'me.com', 'aol.com', 'btinternet.com', 'sky.com']);

/** Suggestions per ISO week, at most (APOLLO_WEEKLY_CAP, default 20). Each one costs ~1 Apollo credit. */
const weeklyCap = () => Math.max(1, Math.min(100, Number(process.env.APOLLO_WEEKLY_CAP) || 20));
/** Company-search pages per run, at most (1 credit each, 25 companies a page). */
const maxPages = () => Math.max(1, Math.min(10, Number(process.env.APOLLO_MAX_PAGES) || 4));
/** The Monday run is on in production unless APOLLO_PROSPECTING=off; elsewhere only with APOLLO_PROSPECTING=on. */
const autorunOn = () => {
  const v = (process.env.APOLLO_PROSPECTING ?? '').toLowerCase();
  if (v === 'off') return false;
  return v === 'on' || process.env.NODE_ENV === 'production';
};

type ApolloOrg = {
  id: string; name?: string | null; primary_domain?: string | null; website_url?: string | null; linkedin_url?: string | null;
  primary_phone?: { number?: string | null; sanitized_number?: string | null } | null; phone?: string | null;
  estimated_num_employees?: number | null; city?: string | null;
};
type ApolloPersonHit = { id: string; first_name?: string | null; title?: string | null; has_email?: boolean | null };
type ApolloPerson = {
  id: string; name?: string | null; first_name?: string | null; last_name?: string | null; title?: string | null;
  email?: string | null; email_status?: string | null; linkedin_url?: string | null; city?: string | null;
};
type LastRun = { at: string; trigger: string; made: number; checked: number; credits: number; message: string };

/**
 * CRM Phase 4d: AI prospecting. Finds London companies hiring warehouse staff
 * through Apollo, picks their Ops / Site / Warehouse manager and adds them to
 * "Suggested leads". Staff accept (becomes a Lead) or reject. Never emails anyone.
 *
 * Credits: company search 1 per page, people search free, one email lookup
 * (people/match, ~1 credit) per suggestion. The weekly cap bounds the spend.
 */
@Injectable()
export class ProspectingService {
  private readonly logger = new Logger('Prospecting');
  private running = false;
  private lastRun: LastRun | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly leads: LeadsService,
  ) {}

  private async apollo<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${APOLLO}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'x-api-key': process.env.APOLLO_API_KEY ?? '' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const text = (await res.text().catch(() => '')).slice(0, 200);
      throw new Error(`Apollo ${path} answered ${res.status}${text ? `: ${text}` : ''}`);
    }
    return res.json() as Promise<T>;
  }

  /** Companies we already have (leads, clients, earlier suggestions incl. rejected). */
  private async known(): Promise<Known> {
    const [leads, clients, sugg] = await Promise.all([
      this.prisma.lead.findMany({ select: { companyName: true, contactEmail: true } }),
      this.prisma.client.findMany({ select: { name: true, billingEmail: true } }),
      this.prisma.suggestedLead.findMany({ select: { companyName: true, domain: true } }),
    ]);
    const domains = new Set<string>();
    const names = new Set<string>();
    const addEmail = (e: string | null | undefined) => {
      const d = (e ?? '').split('@')[1]?.toLowerCase();
      if (d && !FREEMAIL.has(d)) domains.add(d);
    };
    const addName = (n: string | null | undefined) => { const x = normaliseCompany(n); if (x.length >= 3) names.add(x); };
    for (const l of leads) { addName(l.companyName); addEmail(l.contactEmail); }
    for (const c of clients) { addName(c.name); addEmail(c.billingEmail); }
    for (const s of sugg) { addName(s.companyName); const d = normaliseDomain(s.domain); if (d) domains.add(d); }
    return { domains, names };
  }

  async summary() {
    const weekKey = isoWeekKey();
    const [pending, thisWeek] = await Promise.all([
      this.prisma.suggestedLead.count({ where: { status: 'PENDING' } }),
      this.prisma.suggestedLead.count({ where: { weekKey } }),
    ]);
    return {
      pending, thisWeek, weeklyCap: weeklyCap(), weekKey,
      configured: !!process.env.APOLLO_API_KEY, autorun: autorunOn(), running: this.running, lastRun: this.lastRun,
    };
  }

  /** Find new suggestions now, up to what is left of this week's cap. Returns straight away; work runs in the background. */
  async run(trigger: 'schedule' | 'manual', userId?: string) {
    if (!process.env.APOLLO_API_KEY) return { started: false, message: 'Prospecting is off: APOLLO_API_KEY is not set on the API server.' };
    if (this.running) throw new ConflictException('Already looking for leads. Give it a minute.');
    const weekKey = isoWeekKey();
    const room = roomLeft(weeklyCap(), await this.prisma.suggestedLead.count({ where: { weekKey } }));
    if (room === 0) return { started: false, capReached: true, message: `This week's limit of ${weeklyCap()} suggestions is reached. More on Monday.` };

    this.running = true;
    void this.find(trigger, weekKey, room)
      .then((r) => { this.lastRun = r; })
      .catch((e) => {
        this.logger.warn(`prospecting run failed: ${(e as Error).message}`);
        this.lastRun = { at: new Date().toISOString(), trigger, made: 0, checked: 0, credits: 0, message: `Failed: ${(e as Error).message}` };
      })
      .finally(() => { this.running = false; });
    await this.audit.log({ actorId: userId, action: 'prospecting.run', entity: 'SuggestedLead', entityId: weekKey, meta: { trigger, room } });
    return { started: true, message: `Looking for up to ${room} London warehouse companies. They appear here as they're found.` };
  }

  private async find(trigger: string, weekKey: string, room: number): Promise<LastRun> {
    const known = await this.known();
    const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    let made = 0, checked = 0, credits = 0;

    for (let page = 1; page <= maxPages() && made < room; page++) {
      const r = await this.apollo<{ organizations?: ApolloOrg[]; accounts?: ApolloOrg[] }>('/mixed_companies/search', {
        q_organization_job_titles: WAREHOUSE_JOB_TITLES,
        organization_job_locations: [LONDON],
        organization_job_posted_at_range: { min: since },
        organization_num_employees_ranges: ['11,50', '51,200', '201,500', '501,1000', '1001,5000', '5001,10000'],
        page,
        per_page: 25,
      });
      credits += 1;
      const orgs = [...(r.organizations ?? []), ...(r.accounts ?? [])];
      if (!orgs.length) break;

      for (const org of orgs) {
        if (made >= room) break;
        if (!org.id || !org.name || alreadyKnown(org, known, normaliseCompany)) continue;
        checked++;
        // Mark it known now so a second hit on a later page is skipped.
        const domain = normaliseDomain(org.primary_domain || org.website_url) || null;
        if (domain) known.domains.add(domain);
        known.names.add(normaliseCompany(org.name));

        // Free: who works there with the right title, in London.
        const people = await this.apollo<{ people?: ApolloPersonHit[] }>('/mixed_people/api_search', {
          organization_ids: [org.id], person_titles: CONTACT_TITLES, person_locations: [LONDON], per_page: 25,
        }).catch(() => ({ people: [] as ApolloPersonHit[] }));
        const hit = pickContact(people.people ?? []);
        if (!hit) continue; // no manager to talk to: skip, no credit spent

        // ~1 credit: their name and work email.
        let person: ApolloPerson | null = null;
        try {
          const m = await this.apollo<{ person?: ApolloPerson }>(`/people/match?id=${encodeURIComponent(hit.id)}&reveal_personal_emails=false&reveal_phone_number=false`, {});
          person = m.person ?? null;
          credits += 1;
        } catch (e) { this.logger.warn(`people/match failed for ${org.name}: ${(e as Error).message}`); }

        const contactName = person?.name || [person?.first_name, person?.last_name].filter(Boolean).join(' ') || hit.first_name || null;
        const emailOk = person?.email && person.email_status !== 'unavailable' ? person.email.toLowerCase() : null;
        try {
          await this.prisma.suggestedLead.create({
            data: {
              weekKey, trigger, apolloOrgId: org.id, companyName: org.name, domain,
              website: org.website_url || null, companyLinkedin: org.linkedin_url || null,
              companyPhone: org.primary_phone?.sanitized_number || org.primary_phone?.number || org.phone || null,
              employees: org.estimated_num_employees ?? null, city: org.city || person?.city || 'London',
              apolloPersonId: hit.id, contactName, contactRole: person?.title || hit.title || null,
              contactEmail: emailOk, emailStatus: person?.email_status || null, contactLinkedin: person?.linkedin_url || null,
              reason: `Advertising warehouse roles in London in the last 30 days (Apollo job postings).${hit.title ? ` Best contact found: ${person?.title || hit.title}.` : ''}`,
            },
          });
          made++;
        } catch (e) {
          if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e; // already suggested
        }
      }
    }
    const message = made ? `Found ${made} new suggestion${made === 1 ? '' : 's'}.` : 'No new companies with a matching manager this time.';
    this.logger.log(`${trigger} run: ${message} (${checked} checked, ~${credits} credits)`);
    return { at: new Date().toISOString(), trigger, made, checked, credits, message };
  }

  /** Mondays 07:00 London, before the 07:30 AI drafting. */
  @Cron('0 7 * * 1', { name: 'apollo-prospecting', timeZone: 'Europe/London' })
  async weeklyRun() {
    if (!autorunOn()) return;
    try { await this.run('schedule'); } catch (e) { this.logger.warn(`weekly run failed: ${(e as Error).message}`); }
  }

  list(status: 'PENDING' | 'DONE') {
    return this.prisma.suggestedLead.findMany({
      where: status === 'PENDING' ? { status: 'PENDING' } : { status: { not: 'PENDING' }, decidedAt: { gte: new Date(Date.now() - 30 * 864e5) } },
      orderBy: status === 'PENDING' ? { createdAt: 'desc' } : { decidedAt: 'desc' },
      take: 100,
    });
  }

  private async pending(id: string) {
    const s = await this.prisma.suggestedLead.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Suggestion not found');
    if (s.status !== 'PENDING') throw new ConflictException(`This suggestion was already ${s.status.toLowerCase()}.`);
    return s;
  }

  /** Accept: becomes a NEW lead (source AI), due today so it shows in Follow-ups and the AI drafts a first email. */
  async accept(id: string, userId: string) {
    const s = await this.pending(id);
    const links = [s.website && `Website: ${s.website}`, s.companyLinkedin && `Company LinkedIn: ${s.companyLinkedin}`, s.contactLinkedin && `Contact LinkedIn: ${s.contactLinkedin}`, s.companyPhone && `Switchboard: ${s.companyPhone}`, s.employees && `About ${s.employees} employees`].filter(Boolean);
    const lead = await this.leads.create({
      companyName: s.companyName,
      contactName: s.contactName ?? undefined,
      contactEmail: s.contactEmail ?? undefined,
      contactRole: s.contactRole ?? undefined,
      contactPhone: s.companyPhone ?? undefined,
      sector: 'Warehouse & Logistics',
      city: s.city ?? 'London',
      notes: [`Found by AI prospecting (Apollo). ${s.reason ?? ''}`.trim(), ...links].join('\n'),
      source: LeadSource.AI,
      createdByAi: true,
      nextActionAt: new Date().toISOString(),
    }, userId);
    await this.prisma.suggestedLead.update({ where: { id }, data: { status: 'ACCEPTED', leadId: lead.id, decidedAt: new Date(), decidedById: userId } });
    await this.audit.log({ actorId: userId, action: 'prospecting.accepted', entity: 'SuggestedLead', entityId: id, meta: { leadId: lead.id, company: s.companyName } });
    return { leadId: lead.id };
  }

  /** Reject: kept so the same company is never suggested again. */
  async reject(id: string, reason: string | undefined, userId: string) {
    const s = await this.pending(id);
    await this.prisma.suggestedLead.update({ where: { id }, data: { status: 'REJECTED', rejectReason: reason?.trim() || null, decidedAt: new Date(), decidedById: userId } });
    await this.audit.log({ actorId: userId, action: 'prospecting.rejected', entity: 'SuggestedLead', entityId: id, meta: { company: s.companyName, reason } });
    return { ok: true };
  }
}
