import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

@Injectable()
export class AiService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build a compact snapshot of the current operation so the model can answer
   * grounded questions. Kept small on purpose — it is sent on every request.
   */
  private async snapshot(): Promise<string> {
    const [
      candidates,
      compliant,
      pendingTs,
      openJobs,
      newEnquiries,
      recentCandidates,
      jobs,
      timesheets,
    ] = await Promise.all([
      this.prisma.candidate.count(),
      this.prisma.candidate.count({ where: { status: { in: ['COMPLIANT', 'ACTIVE'] } } }),
      this.prisma.timesheet.count({ where: { status: 'SUBMITTED' } }),
      this.prisma.job.count({ where: { status: { in: ['OPEN', 'FILLED'] } } }),
      this.prisma.enquiry.count({ where: { status: 'NEW' } }),
      this.prisma.candidate.findMany({ take: 8, orderBy: { createdAt: 'desc' }, select: { firstName: true, lastName: true, status: true, headline: true, city: true } }),
      this.prisma.job.findMany({ take: 8, orderBy: { createdAt: 'desc' }, select: { title: true, status: true, openings: true, client: { select: { name: true } } } }),
      this.prisma.timesheet.findMany({ where: { status: 'SUBMITTED' }, take: 8, include: { candidate: { select: { firstName: true, lastName: true } }, shift: { select: { job: { select: { title: true, client: { select: { name: true } } } } } } } }),
    ]);

    const lines: string[] = [];
    lines.push(`Totals: ${candidates} candidates (${compliant} compliant/active), ${openJobs} open bookings, ${pendingTs} timesheets pending approval, ${newEnquiries} new website enquiries.`);
    lines.push('');
    lines.push('Recent candidates:');
    recentCandidates.forEach((c) => lines.push(`- ${c.firstName} ${c.lastName} — ${c.headline ?? 'role n/a'}, ${c.city ?? 'location n/a'}, compliance: ${c.status}`));
    lines.push('');
    lines.push('Recent job bookings:');
    jobs.forEach((j) => lines.push(`- ${j.client.name}: ${j.title} — ${j.status}, ${j.openings} opening(s)`));
    lines.push('');
    lines.push('Timesheets awaiting approval:');
    if (timesheets.length === 0) lines.push('- none');
    timesheets.forEach((t) => lines.push(`- ${t.candidate.firstName} ${t.candidate.lastName} — ${t.shift.job.title} for ${t.shift.job.client.name}, ${t.hoursWorked ?? '?'}h`));
    return lines.join('\n');
  }

  async ask(message: string, history: ChatMessage[] = []) {
    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        configured: false,
        reply:
          "The AI Assistant isn't switched on yet. Add your Anthropic API key as ANTHROPIC_API_KEY in the platform's .env file and restart the API to enable it.",
      };
    }

    const client = new Anthropic();
    const snapshot = await this.snapshot();
    const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const system = [
      "You are the AI assistant inside Starff's admin dashboard. Starff is a UK temporary-recruitment agency.",
      'You help staff (admins and recruiters) understand and act on their operations.',
      'Answer using ONLY the live data snapshot below. If the answer is not in the snapshot, say you do not have that data rather than guessing.',
      'Be concise, practical and specific. You may suggest actions (e.g. "approve these timesheets", "chase the missing Right-to-Work"), but you cannot perform them — the user takes actions in the dashboard.',
      `Today is ${today}.`,
      '',
      '--- LIVE DATA SNAPSHOT ---',
      snapshot,
    ].join('\n');

    // keep the last few turns to bound tokens
    const trimmed = history.slice(-8);
    const messages = [...trimmed, { role: 'user' as const, content: message }];

    const resp = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      system,
      messages,
    });

    const reply = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    return { configured: true, reply: reply || 'Sorry, I could not produce a response.' };
  }

  /** A compact snapshot of ONE worker's own record — never other people's data. */
  private async candidateSnapshot(userId: string): Promise<string> {
    const candidate = await this.prisma.candidate.findUnique({
      where: { userId },
      include: {
        documents: { select: { type: true, status: true } },
        shifts: {
          where: { startAt: { gte: new Date() } },
          orderBy: { startAt: 'asc' },
          take: 5,
          include: { job: { select: { title: true, client: { select: { name: true } } } } },
        },
      },
    });
    if (!candidate) return 'No worker profile found for this account.';
    const docs =
      candidate.documents.map((d) => `${d.type}: ${d.status}`).join(', ') || 'none uploaded';
    const shifts =
      candidate.shifts
        .map((s) => `${s.job?.title ?? 'shift'} for ${s.job?.client?.name ?? 'Starff'} on ${new Date(s.startAt).toDateString()}`)
        .join('; ') || 'none booked';
    return [
      `Worker: ${candidate.firstName} ${candidate.lastName}`,
      `Compliance status: ${candidate.status}`,
      `Right to work: ${candidate.rightToWorkType ?? 'not set'}`,
      `Documents on file: ${docs}`,
      `Upcoming shifts: ${shifts}`,
    ].join('\n');
  }

  /** Worker-facing assistant, grounded ONLY on the signed-in worker's own record. */
  async askCandidate(userId: string, message: string, history: ChatMessage[] = []) {
    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        configured: false,
        reply:
          "Starff AI isn't switched on yet. Ask the Starff team via Messages in the meantime.",
      };
    }

    const client = new Anthropic();
    const snapshot = await this.candidateSnapshot(userId);
    const system = [
      'You are Starff AI, a friendly UK temporary-work assistant for workers in Logistics, Events, Construction, Delivery and Hospitality.',
      'Help with compliance, right-to-work share codes, DBS levels, CSCS/CPC/SIA, shifts, timesheets and getting paid.',
      'Answer in 2–4 short sentences. Be practical and reassuring.',
      "Use the worker's own record below where relevant, but NEVER invent personal details you cannot see, and never reveal anyone else's data.",
      'You can suggest actions but cannot perform them.',
      '',
      '--- THIS WORKER ---',
      snapshot,
    ].join('\n');

    const trimmed = history.slice(-8);
    const messages = [...trimmed, { role: 'user' as const, content: message }];

    const resp = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 600,
      system,
      messages,
    });

    const reply = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    return { configured: true, reply: reply || 'Sorry, I could not produce a response.' };
  }
}
