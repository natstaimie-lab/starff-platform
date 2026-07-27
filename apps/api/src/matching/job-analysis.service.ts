import { Injectable, NotFoundException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';

export interface JobAnalysis {
  aiEnhanced: boolean;
  summary: string;
  mandatory: string[];
  preferred: string[];
  skills: string[];
  requiredDocuments: string[];
  requiredQualifications: string[];
  suitableSectors: string[];
  suitableExperience: string[];
  location: string;
  availability: string;
  clientPreferences: string[];
}

// Sector → the documents a worker typically needs (UK temp staffing). RTW + ID
// are always required on top of these.
const SECTOR_DOCS: Record<string, string[]> = {
  construction: ['CSCS card'],
  labouring: ['CSCS card'],
  security: ['SIA licence', 'Enhanced DBS'],
  care: ['Enhanced DBS'],
  healthcare: ['Enhanced DBS'],
  driving: ['Relevant driving licence'],
  logistics: ['Relevant driving licence (if driving)'],
  hospitality: ['Personal licence (if serving alcohol)'],
};
// Sector → related sectors a suitable candidate might come from.
const RELATED_SECTORS: Record<string, string[]> = {
  events: ['Events', 'Hospitality', 'Security', 'Promotions'],
  hospitality: ['Hospitality', 'Events', 'Catering'],
  logistics: ['Logistics', 'Warehouse', 'Driving'],
  warehouse: ['Warehouse', 'Logistics', 'Manufacturing'],
  construction: ['Construction', 'Labouring', 'Groundworks'],
  security: ['Security', 'Events', 'Facilities'],
  care: ['Care', 'Healthcare', 'Support Work'],
};
// Licence keywords to surface as required documents from free-text quals.
const LICENCE_KEYWORDS: Array<[RegExp, string]> = [
  [/\bsia\b/i, 'SIA licence'],
  [/\bcscs\b/i, 'CSCS card'],
  [/\bdbs\b/i, 'DBS check'],
  [/\b(flt|forklift|counterbalance|reach truck)\b/i, 'Forklift/FLT licence'],
  [/\b(hgv|lgv|cat c|class 1|class 2|driving licen)/i, 'Driving licence'],
  [/\bfirst aid\b/i, 'First aid certificate'],
  [/\bfood hygiene\b/i, 'Food hygiene certificate'],
];

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const splitList = (s?: string | null): string[] =>
  (s ?? '').split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);

/**
 * Turns a staffing request into a structured matching profile with a plain-English
 * summary for admins. Deterministic by default (works with no AI key); an optional
 * AI-generated summary refines the wording when ANTHROPIC_API_KEY is set. It only
 * ANALYSES the job — it never rejects candidates.
 */
@Injectable()
export class JobAnalysisService {
  constructor(private readonly prisma: PrismaService) {}

  async analyse(jobId: string): Promise<JobAnalysis> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        skills: { include: { skill: true } },
        site: { select: { name: true, city: true, postcode: true } },
        client: { select: { name: true, city: true } },
      },
    });
    if (!job) throw new NotFoundException('Job not found');

    const sectorKey = (job.sector ?? '').toLowerCase().trim();
    const quals = splitList(job.requiredQualifications);
    const jobSkillNames = job.skills.map((s) => s.skill.name);

    // ── mandatory ──
    const mandatory: string[] = ['Right to work verified', 'Compliance cleared to work'];
    quals.forEach((q) => mandatory.push(q));
    if (job.startDate) {
      const d = new Date(job.startDate);
      const time = job.endDate
        ? `${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}–${new Date(job.endDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
        : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      mandatory.push(`Available ${DAYS[d.getDay()]} ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`);
    }

    // ── preferred ──
    const preferred: string[] = [];
    if (job.experienceRequirements) preferred.push(job.experienceRequirements);
    if (job.sector) preferred.push(`${job.sector} sector experience`);
    if (job.transportRequirements) preferred.push(job.transportRequirements);

    // ── required documents ──
    const docs = new Set<string>(['Right to Work', 'Proof of ID']);
    (SECTOR_DOCS[sectorKey] ?? []).forEach((d) => docs.add(d));
    for (const [re, label] of LICENCE_KEYWORDS) {
      if (re.test(job.requiredQualifications ?? '') || re.test(job.title)) docs.add(label);
    }

    // ── suitable sectors / experience ──
    const suitableSectors = RELATED_SECTORS[sectorKey] ?? (job.sector ? [job.sector] : ['Any relevant sector']);
    const suitableExperience: string[] = [];
    if (job.sector) suitableExperience.push(`${job.sector} work`);
    if (job.experienceRequirements) suitableExperience.push(job.experienceRequirements);
    if (suitableExperience.length === 0) suitableExperience.push('General temporary work');

    // ── location / availability ──
    const locBits = [job.site?.name ?? job.site?.city ?? job.client?.city, job.site?.postcode].filter(Boolean);
    let location = locBits.join(', ') || 'Location on file';
    if (job.transportRequirements) location += ` · Transport: ${job.transportRequirements}`;
    const availability = job.startDate
      ? `${new Date(job.startDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}${job.endDate ? `, ${new Date(job.startDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}–${new Date(job.endDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}`
      : 'Shift date to be confirmed';

    // ── client preferences ──
    const clientPreferences: string[] = [];
    if (job.clientRequirements) clientPreferences.push(job.clientRequirements);
    if (job.uniform) clientPreferences.push(`Uniform: ${job.uniform}`);
    if (job.bookingUrgency && job.bookingUrgency !== 'Standard') clientPreferences.push(`${job.bookingUrgency} booking`);

    const profile: Omit<JobAnalysis, 'aiEnhanced' | 'summary'> = {
      mandatory,
      preferred,
      skills: jobSkillNames.length ? jobSkillNames : quals,
      requiredDocuments: [...docs],
      requiredQualifications: quals,
      suitableSectors,
      suitableExperience,
      location,
      availability,
      clientPreferences,
    };

    const deterministicSummary = this.buildSummary(job, profile);
    let summary = deterministicSummary;
    let aiEnhanced = false;
    if (process.env.ANTHROPIC_API_KEY) {
      const ai = await this.aiSummary(job, profile).catch(() => null);
      if (ai) { summary = ai; aiEnhanced = true; }
    }

    return { aiEnhanced, summary, ...profile };
  }

  private buildSummary(job: any, p: Omit<JobAnalysis, 'aiEnhanced' | 'summary'>): string {
    const urgency = job.bookingUrgency && job.bookingUrgency !== 'Standard' ? `${job.bookingUrgency.toLowerCase()} ` : '';
    const parts: string[] = [];
    parts.push(`${urgency ? 'An ' + urgency : 'A '}request for ${job.openings} × ${job.title}${job.sector ? ` in ${job.sector}` : ''} at ${p.location.split(' · ')[0]}, on ${p.availability}, paying £${Number(job.payRate).toFixed(2)}/hr.`);
    parts.push(`Must have: ${p.mandatory.slice(0, 4).join('; ')}.`);
    if (p.preferred.length) parts.push(`Preferred: ${p.preferred.join('; ')}.`);
    parts.push(`Best suited to candidates from ${p.suitableSectors.join(', ')}.`);
    return parts.join(' ');
  }

  private async aiSummary(job: any, p: Omit<JobAnalysis, 'aiEnhanced' | 'summary'>): Promise<string | undefined> {
    const client = new Anthropic();
    const facts = [
      `Title: ${job.title}`,
      `Sector: ${job.sector ?? 'n/a'}`,
      `Workers: ${job.openings}`,
      `Pay: £${Number(job.payRate).toFixed(2)}/hr`,
      `When: ${p.availability}`,
      `Where: ${p.location}`,
      `Mandatory: ${p.mandatory.join('; ')}`,
      `Preferred: ${p.preferred.join('; ') || 'none'}`,
      `Required documents: ${p.requiredDocuments.join(', ')}`,
      `Client preferences: ${p.clientPreferences.join('; ') || 'none'}`,
    ].join('\n');
    const resp = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 300,
      system:
        'You are a UK temp-recruitment assistant for Starff. Given a staffing request, write a clear 2–3 sentence plain-English summary for an admin describing what kind of worker is needed and the key must-haves. No headings, no bullet points, no invented facts.',
      messages: [{ role: 'user', content: facts }],
    });
    return resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim() || undefined;
  }
}
