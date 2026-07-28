import { Injectable, NotFoundException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MatchWeightsService } from './match-weights.service';
import { ReliabilityService } from '../reliability/reliability.service';

export interface Recommendation {
  candidateId: string;
  name: string;
  headline: string | null;
  city: string | null;
  status: string;
  available: boolean;
  score: number; // 0–100 suitability
  reasons: string[]; // positive human-readable reasons
  missingRequirements: string[]; // soft gaps to be aware of
  conflict: boolean; // overlaps an existing booking (always false for eligible)
  pipelineStatus: string | null; // if an Application already exists for this job
  reliabilityLevel: 'LOW' | 'WATCH' | 'MEDIUM' | 'HIGH'; // internal concern level
}

/** A candidate filtered out before scoring — shown transparently, never deleted
 *  or permanently rejected. Admin can still invite them (manual override). */
export interface Excluded {
  candidateId: string;
  name: string;
  headline: string | null;
  city: string | null;
  status: string;
  reasons: string[]; // why they were filtered out for THIS job
  pipelineStatus: string | null;
}

const DOC_LABEL: Record<string, string> = {
  RIGHT_TO_WORK: 'right-to-work document', DBS_CHECK: 'DBS check', ID: 'ID document',
};

const outward = (pc?: string | null) => (pc ? pc.toUpperCase().replace(/\s+/g, '').slice(0, -3) : '');
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/**
 * FAIRNESS SAFEGUARD — the matcher must NEVER use protected characteristics.
 * The only candidate fields read for scoring are the job-relevant ones listed in
 * `score()` (skills, compliance/RTW status, availability, rating, attendance,
 * proximity). The following must never influence a match or reliability score:
 * race, ethnicity, nationality, religion, sex, sexual orientation, age /
 * date-of-birth, disability, pregnancy, or health information. `dateOfBirth` and
 * similar fields exist on the Candidate record for compliance but are never read
 * here. Any new scoring factor must be checked against this list.
 */
const PROTECTED_FIELDS_NEVER_SCORED = [
  'race', 'ethnicity', 'nationality', 'religion', 'sex', 'sexualOrientation',
  'age', 'dateOfBirth', 'disability', 'pregnancy', 'health', 'nationalInsurance',
] as const;

/**
 * Deterministic candidate matcher. Scores REAL candidate data against a job's
 * requirements and explains why. It NEVER invents data and NEVER auto-excludes a
 * candidate for a non-essential gap — instead it surfaces the missing mandatory
 * requirement so an admin can decide. Admin remains the final decision-maker.
 */
@Injectable()
export class MatchingService {
  /** @see PROTECTED_FIELDS_NEVER_SCORED — enforced by code review, listed for auditability. */
  static readonly protectedFields = PROTECTED_FIELDS_NEVER_SCORED;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly weights: MatchWeightsService,
    private readonly reliability: ReliabilityService,
  ) {}

  /**
   * Public wrapper: score candidates for a job, record an audit entry, and
   * optionally attach an AI commentary. Used by the recommendations endpoint.
   */
  async recommend(
    jobId: string,
    opts: { explain?: boolean; actorId?: string } = {},
  ): Promise<{ job: { id: string; title: string }; recommendations: Recommendation[]; excluded: Excluded[]; aiSummary?: string }> {
    const { job, recommendations, excluded } = await this.score(jobId);

    await this.audit.log({
      actorId: opts.actorId,
      action: 'recommendations.generated',
      entity: 'Job',
      entityId: jobId,
      meta: { eligible: recommendations.length, excluded: excluded.length, top: recommendations.slice(0, 5).map((r) => ({ id: r.candidateId, score: r.score })) },
    });

    const result: { job: { id: string; title: string }; recommendations: Recommendation[]; excluded: Excluded[]; aiSummary?: string } = {
      job,
      recommendations,
      excluded,
    };
    if (opts.explain && process.env.ANTHROPIC_API_KEY) {
      result.aiSummary = await this.aiSummary(job.title, recommendations.slice(0, 8));
    }
    return result;
  }

  /**
   * Dashboard-wide "top recommendations" feed: runs the deterministic scorer
   * across the currently open/recruiting jobs and returns the strongest
   * candidate–job matches (best score per candidate). No side effects.
   */
  async topMatches(limit = 6): Promise<
    {
      candidateId: string;
      name: string;
      headline: string | null;
      score: number;
      available: boolean;
      reason: string | null;
      pipelineStatus: string | null;
      jobId: string;
      jobTitle: string;
    }[]
  > {
    const openStatuses = ['RECRUITING', 'APPROVED', 'CANDIDATES_SUBMITTED', 'PARTIALLY_FILLED', 'OPEN', 'OFFERS_SENT'];
    const jobs = await this.prisma.job.findMany({
      where: { status: { in: openStatuses as never } },
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: { id: true },
    });

    // Best match per candidate across the sampled jobs.
    const best = new Map<
      string,
      { candidateId: string; name: string; headline: string | null; score: number; available: boolean; reason: string | null; pipelineStatus: string | null; jobId: string; jobTitle: string }
    >();
    for (const j of jobs) {
      let scored;
      try {
        scored = await this.score(j.id);
      } catch {
        continue;
      }
      for (const r of scored.recommendations.slice(0, 8)) {
        const prev = best.get(r.candidateId);
        if (!prev || r.score > prev.score) {
          best.set(r.candidateId, {
            candidateId: r.candidateId,
            name: r.name,
            headline: r.headline,
            score: r.score,
            available: r.available,
            reason: r.reasons[0] ?? null,
            pipelineStatus: r.pipelineStatus,
            jobId: scored.job.id,
            jobTitle: scored.job.title,
          });
        }
      }
    }
    return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Pure deterministic scoring — no side effects (no audit / no AI). Callable by
   * the invite flow to persist the score on the Application it creates.
   */
  async score(jobId: string): Promise<{ job: { id: string; title: string }; recommendations: Recommendation[]; excluded: Excluded[] }> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        skills: { include: { skill: true } },
        site: { select: { postcode: true, city: true } },
        client: { select: { city: true } },
      },
    });
    if (!job) throw new NotFoundException('Job not found');

    const w = await this.weights.get();
    const totalW = w.skills + w.compliance + w.rightToWork + w.availability + w.rating + w.reliability + w.proximity;

    const requiredSkills = job.skills.filter((s) => s.required).map((s) => s.skillId);
    const allJobSkillNames = new Map(job.skills.map((s) => [s.skillId, s.skill.name]));
    const jobStart = job.startDate ?? null;
    const jobEnd = job.endDate ?? null;
    const jobArea = outward(job.site?.postcode);
    const jobCity = (job.site?.city ?? job.client?.city ?? '').toLowerCase();

    // Pool: exclude archived + hard-rejected up front. Everyone else is checked
    // against the eligibility filters below.
    const candidates = await this.prisma.candidate.findMany({
      where: { archivedAt: null, status: { not: 'REJECTED' } },
      include: {
        skills: true,
        documents: { select: { type: true, status: true, expiryDate: true } },
        availability: true,
        shifts: {
          where: { status: { notIn: ['CANCELLED'] } },
          select: { startAt: true, endAt: true, status: true },
        },
        applications: { where: { jobId }, select: { status: true } },
      },
    });

    const relLevels = await this.reliability.levelsFor(candidates.map((c) => c.id));
    const now = new Date();
    const recs: Recommendation[] = [];
    const excluded: Excluded[] = [];

    for (const c of candidates) {
      const candSkillIds = new Set(c.skills.map((s) => s.skillId));
      const rtwVerified = c.documents.some((d) => d.type === 'RIGHT_TO_WORK' && d.status === 'VERIFIED');
      const pipelineStatus = c.applications[0]?.status ?? null;

      // ── HARD ELIGIBILITY FILTERS (from existing data) ──────────────────────
      const exclusion: string[] = [];
      if (!c.available) exclusion.push('Marked unavailable');
      if (c.status !== 'COMPLIANT' && c.status !== 'ACTIVE') exclusion.push(`Not compliance-cleared (${c.status.toLowerCase()})`);
      if (!rtwVerified && !c.rightToWorkType) exclusion.push('No right-to-work evidence');
      c.documents
        .filter((d) => ['RIGHT_TO_WORK', 'DBS_CHECK', 'ID'].includes(d.type) && (d.status === 'EXPIRED' || (d.expiryDate && d.expiryDate < now)))
        .forEach((d) => exclusion.push(`Expired ${DOC_LABEL[d.type] ?? 'document'}`));
      requiredSkills
        .filter((id) => !candSkillIds.has(id))
        .forEach((id) => exclusion.push(`Missing mandatory skill: ${allJobSkillNames.get(id) ?? 'skill'}`));
      if (jobStart && jobEnd && c.shifts.some((s) => s.status !== 'COMPLETED' && s.status !== 'NO_SHOW' && s.startAt < jobEnd && s.endAt > jobStart)) {
        exclusion.push('Already booked for an overlapping shift');
      }

      if (exclusion.length > 0) {
        excluded.push({
          candidateId: c.id, name: `${c.firstName} ${c.lastName}`, headline: c.headline,
          city: c.city, status: c.status, reasons: exclusion, pipelineStatus,
        });
        continue;
      }

      // ── SCORING (eligible only) — each factor contributes fit(0–1) × its
      //    admin-configured weight, normalised to a stable 0–100% score. ──────
      const reasons: string[] = [];
      const missing: string[] = [];
      let earned = 0;

      // Skills — eligible candidates hold all mandatory skills.
      const skillsFit = requiredSkills.length > 0 ? 1 : 0.6;
      if (requiredSkills.length > 0) reasons.push(`Has all ${requiredSkills.length} required skill${requiredSkills.length > 1 ? 's' : ''}`);
      earned += skillsFit * w.skills;

      // Compliance (eligible are always cleared).
      reasons.push(`Compliance cleared (${c.status})`);
      earned += 1 * w.compliance;

      // Right to work.
      const rtwFit = rtwVerified ? 1 : 0.6;
      reasons.push(rtwVerified ? 'Right to work verified' : `Right to work: ${c.rightToWorkType} (doc not verified)`);
      earned += rtwFit * w.rightToWork;

      // Availability (day/time window).
      let availFit = 0.6;
      if (jobStart) {
        const day = jobStart.getDay();
        const startStr = hhmm(jobStart);
        const slot = c.availability.find((a) => a.dayOfWeek === day && a.startTime <= startStr && a.endTime >= startStr);
        if (slot) { availFit = 1; reasons.push(`Available ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]} ${slot.startTime}–${slot.endTime}`); }
        else { availFit = 0.35; missing.push('Stated availability does not cover the shift time'); }
      }
      earned += availFit * w.availability;

      // Performance rating.
      const ratingFit = c.rating != null ? c.rating / 5 : 0.5;
      if (c.rating != null) reasons.push(`Rating ${c.rating.toFixed(1)}/5`);
      earned += ratingFit * w.rating;

      // Reliability / attendance.
      const past = c.shifts.filter((s) => s.status === 'COMPLETED' || s.status === 'NO_SHOW');
      const completed = past.filter((s) => s.status === 'COMPLETED').length;
      const noShow = past.filter((s) => s.status === 'NO_SHOW').length;
      let relFit = 0.6;
      if (past.length > 0) {
        relFit = completed / past.length;
        reasons.push(`${Math.round(relFit * 100)}% attendance (${completed}/${past.length} shifts)`);
        if (noShow > 0) missing.push(`${noShow} previous no-show(s)`);
      }
      earned += relFit * w.reliability;

      // Distance / location.
      const candArea = outward(c.postcode);
      let proxFit = 0.4;
      if (jobArea && candArea && candArea === jobArea) { proxFit = 1; reasons.push(`Same postcode area (${candArea})`); }
      else if (jobCity && c.city && c.city.toLowerCase() === jobCity) { proxFit = 0.6; reasons.push(`Same town (${c.city})`); }
      earned += proxFit * w.proximity;

      recs.push({
        candidateId: c.id,
        name: `${c.firstName} ${c.lastName}`,
        headline: c.headline,
        city: c.city,
        status: c.status,
        available: c.available,
        score: totalW > 0 ? Math.max(0, Math.min(100, Math.round((earned / totalW) * 100))) : 0,
        reasons,
        missingRequirements: missing,
        conflict: false,
        pipelineStatus,
        reliabilityLevel: relLevels.get(c.id) ?? 'LOW',
      });
    }

    recs.sort((a, b) => b.score - a.score);
    return { job: { id: job.id, title: job.title }, recommendations: recs, excluded };
  }

  /**
   * Optional AI commentary on the ranked shortlist. It only EXPLAINS the existing
   * deterministic ranking — it does not reorder, gate, or override compliance.
   * Best-effort: any failure returns undefined rather than throwing.
   */
  private async aiSummary(jobTitle: string, top: Recommendation[]): Promise<string | undefined> {
    try {
      const client = new Anthropic();
      const lines = top.map((r, i) =>
        `${i + 1}. ${r.name} — score ${r.score}. Strengths: ${r.reasons.join('; ') || 'none'}. Gaps: ${r.missingRequirements.join('; ') || 'none'}.`,
      );
      const resp = await client.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 400,
        system:
          'You are a recruitment matching assistant for Starff, a UK temp agency. Given a job and a pre-ranked candidate shortlist, write 2–3 concise sentences summarising who stands out and any compliance gaps the recruiter should clear. Do NOT change the ranking or make final decisions — the admin decides.',
        messages: [{ role: 'user', content: `Job: ${jobTitle}\n\nShortlist (already scored):\n${lines.join('\n')}` }],
      });
      return resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim() || undefined;
    } catch {
      return undefined;
    }
  }
}
