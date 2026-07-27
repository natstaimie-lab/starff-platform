import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReliabilityStatus, ReliabilityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * RELIABILITY MONITORING — internal only, never shared with clients. Concern
 * levels support HUMAN decisions; nothing here ever auto-rejects, suspends or
 * removes a candidate, and no protected characteristics are used (only recorded
 * behaviour on shifts).
 */

// Default concern points per incident type (admin can override per incident).
export const DEFAULT_IMPACT: Record<ReliabilityType, number> = {
  NO_SHOW: 10,
  LATE_CANCELLATION: 6,
  LATENESS: 3,
  MISSED_CHECKIN: 4,
  LEFT_EARLY: 5,
  TIMESHEET_MISSING: 2,
  NO_RESPONSE: 3,
  WITHDREW: 5,
  CLIENT_COMPLAINT: 8,
  NEGATIVE_FEEDBACK: 4,
  POSITIVE_FEEDBACK: -3, // good feedback reduces concern
  DISPUTE: 2,
  OTHER: 2,
};

export const TYPE_LABEL: Record<ReliabilityType, string> = {
  NO_SHOW: 'No-show', LATE_CANCELLATION: 'Late cancellation', LATENESS: 'Lateness',
  MISSED_CHECKIN: 'Missed check-in', LEFT_EARLY: 'Left early', TIMESHEET_MISSING: 'Timesheet not submitted',
  NO_RESPONSE: 'No response to confirmed shift', WITHDREW: 'Withdrew after accepting',
  CLIENT_COMPLAINT: 'Client complaint', NEGATIVE_FEEDBACK: 'Negative feedback',
  POSITIVE_FEEDBACK: 'Positive feedback', DISPUTE: 'Disputed incident', OTHER: 'Other',
};

export type ConcernLevel = 'LOW' | 'WATCH' | 'MEDIUM' | 'HIGH';

/** Status weightings — only CONFIRMED (full) and UNCONFIRMED (half) count. */
const STATUS_WEIGHT: Partial<Record<ReliabilityStatus, number>> = {
  CONFIRMED: 1,
  UNCONFIRMED: 0.5,
};

@Injectable()
export class ReliabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Concern points → level. High never triggers any automatic action. */
  static levelFor(points: number): ConcernLevel {
    if (points >= 20) return 'HIGH';
    if (points >= 10) return 'MEDIUM';
    if (points >= 5) return 'WATCH';
    return 'LOW';
  }

  /** Weighted concern points for a set of incidents (active statuses only). */
  static pointsFor(incidents: { status: ReliabilityStatus; scoreImpact: number; weightFactor: number }[]): number {
    const total = incidents.reduce((sum, i) => {
      const sw = STATUS_WEIGHT[i.status];
      if (!sw) return sum;
      return sum + i.scoreImpact * i.weightFactor * sw;
    }, 0);
    return Math.max(0, Math.round(total * 10) / 10);
  }

  /** Full internal reliability profile for one candidate (admin view). */
  async profile(candidateId: string) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');

    const incidents = await this.prisma.reliabilityIncident.findMany({
      where: { candidateId },
      orderBy: { occurredAt: 'desc' },
    });
    const shifts = await this.prisma.shift.findMany({
      where: { candidateId },
      select: { status: true },
    });
    const completed = shifts.filter((s) => s.status === 'COMPLETED').length;
    const noShow = shifts.filter((s) => s.status === 'NO_SHOW').length;
    const finished = completed + noShow;

    const points = ReliabilityService.pointsFor(incidents);
    const level = ReliabilityService.levelFor(points);
    const active = incidents.filter((i) => i.status === 'CONFIRMED' || i.status === 'UNCONFIRMED');
    const repeated = this.hasRepeatedBehaviour(active);

    return {
      candidateId,
      level,
      points,
      concernNote: this.concernNote(level, active.length, repeated),
      stats: {
        completedShifts: completed,
        noShows: noShow,
        completionRate: finished > 0 ? Math.round((completed / finished) * 100) : null,
        totalIncidents: incidents.length,
        activeIncidents: active.length,
        disputed: incidents.filter((i) => i.status === 'DISPUTED').length,
        unresolved: active.filter((i) => !i.reviewDate).length,
      },
      incidents: incidents.map((i) => this.shape(i)),
    };
  }

  /** A candidate's own limited view (no internal admin notes / reporter). */
  async myProfile(userId: string) {
    const candidate = await this.prisma.candidate.findUnique({ where: { userId }, select: { id: true } });
    if (!candidate) throw new NotFoundException('No candidate profile');
    const full = await this.profile(candidate.id);
    return {
      level: full.level,
      concernNote: full.concernNote,
      stats: { completedShifts: full.stats.completedShifts, completionRate: full.stats.completionRate },
      incidents: full.incidents
        .filter((i) => i.status !== 'REMOVED')
        .map((i) => ({
          id: i.id, type: i.type, typeLabel: i.typeLabel, reason: i.reason,
          occurredAt: i.occurredAt, status: i.status, canAppeal: i.status === 'CONFIRMED' || i.status === 'UNCONFIRMED',
          appealNote: i.appealNote, appealedAt: i.appealedAt,
        })),
    };
  }

  async addIncident(
    candidateId: string,
    dto: { type: ReliabilityType; severity?: number; reason: string; notes?: string; evidenceSource?: string; shiftId?: string; jobId?: string; occurredAt?: string; scoreImpact?: number; status?: ReliabilityStatus; reviewDate?: string },
    actorId?: string,
  ) {
    const candidate = await this.prisma.candidate.findUnique({ where: { id: candidateId }, select: { id: true } });
    if (!candidate) throw new NotFoundException('Candidate not found');
    const incident = await this.prisma.reliabilityIncident.create({
      data: {
        candidateId,
        type: dto.type,
        severity: dto.severity ?? 3,
        status: dto.status ?? 'UNCONFIRMED',
        reason: dto.reason,
        notes: dto.notes,
        evidenceSource: dto.evidenceSource,
        shiftId: dto.shiftId,
        jobId: dto.jobId,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        scoreImpact: dto.scoreImpact ?? DEFAULT_IMPACT[dto.type],
        reportedById: actorId ?? undefined,
        reviewDate: dto.reviewDate ? new Date(dto.reviewDate) : undefined,
      },
    });
    await this.audit.log({ actorId, action: 'reliability.incident_added', entity: 'ReliabilityIncident', entityId: incident.id, meta: { candidateId, type: dto.type } });
    return this.shape(incident);
  }

  /** Admin override / manual review: change status, severity, impact, weighting,
   *  review date, notes — or REMOVE an incorrect concern (kept for audit). */
  async updateIncident(
    id: string,
    dto: { status?: ReliabilityStatus; severity?: number; scoreImpact?: number; weightFactor?: number; reviewDate?: string; notes?: string },
    actorId?: string,
  ) {
    const before = await this.prisma.reliabilityIncident.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Incident not found');
    const data: Prisma.ReliabilityIncidentUpdateInput = {};
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.severity !== undefined) data.severity = dto.severity;
    if (dto.scoreImpact !== undefined) data.scoreImpact = dto.scoreImpact;
    if (dto.weightFactor !== undefined) data.weightFactor = Math.max(0, dto.weightFactor);
    if (dto.reviewDate !== undefined) data.reviewDate = dto.reviewDate ? new Date(dto.reviewDate) : null;
    if (dto.notes !== undefined) data.notes = dto.notes;
    const updated = await this.prisma.reliabilityIncident.update({ where: { id }, data });
    await this.audit.log({
      actorId, action: 'reliability.incident_updated', entity: 'ReliabilityIncident', entityId: id,
      meta: { from: before.status, to: updated.status, changed: Object.keys(data) },
    });
    return this.shape(updated);
  }

  /** Candidate correction / appeal — flags the incident DISPUTED and records the note. */
  async appeal(userId: string, incidentId: string, note: string) {
    const candidate = await this.prisma.candidate.findUnique({ where: { userId }, select: { id: true } });
    if (!candidate) throw new NotFoundException('No candidate profile');
    const incident = await this.prisma.reliabilityIncident.findUnique({ where: { id: incidentId } });
    if (!incident || incident.candidateId !== candidate.id) throw new NotFoundException('Incident not found');
    if (incident.status === 'REMOVED' || incident.status === 'RESOLVED') {
      throw new ForbiddenException('This concern is already closed');
    }
    const updated = await this.prisma.reliabilityIncident.update({
      where: { id: incidentId },
      data: { status: 'DISPUTED', appealNote: note, appealedAt: new Date() },
    });
    await this.audit.log({ actorId: userId, action: 'reliability.appeal', entity: 'ReliabilityIncident', entityId: incidentId, meta: { note } });
    // Notify staff to review — handled by the controller layer to avoid a dep here.
    return { id: updated.id, status: updated.status };
  }

  /** Concern levels for many candidates at once (used by the matcher). */
  async levelsFor(candidateIds: string[]): Promise<Map<string, ConcernLevel>> {
    if (candidateIds.length === 0) return new Map();
    const incidents = await this.prisma.reliabilityIncident.findMany({
      where: { candidateId: { in: candidateIds }, status: { in: ['CONFIRMED', 'UNCONFIRMED'] } },
      select: { candidateId: true, status: true, scoreImpact: true, weightFactor: true },
    });
    const byCand = new Map<string, typeof incidents>();
    for (const i of incidents) {
      if (!byCand.has(i.candidateId)) byCand.set(i.candidateId, []);
      byCand.get(i.candidateId)!.push(i);
    }
    const out = new Map<string, ConcernLevel>();
    for (const id of candidateIds) {
      out.set(id, ReliabilityService.levelFor(ReliabilityService.pointsFor(byCand.get(id) ?? [])));
    }
    return out;
  }

  // ── helpers ──────────────────────────────────────────────────────────────
  private hasRepeatedBehaviour(active: { type: ReliabilityType }[]): boolean {
    const counts = new Map<ReliabilityType, number>();
    active.forEach((i) => counts.set(i.type, (counts.get(i.type) ?? 0) + 1));
    return [...counts.values()].some((n) => n >= 2);
  }
  private concernNote(level: ConcernLevel, activeCount: number, repeated: boolean): string {
    if (level === 'LOW') return activeCount === 0 ? 'No reliability concerns on record.' : 'Minor, isolated concerns only.';
    const rep = repeated ? 'a repeated pattern' : 'isolated incidents';
    if (level === 'WATCH') return `Worth keeping an eye on — ${rep}.`;
    if (level === 'MEDIUM') return `Review recommended before booking — ${rep}.`;
    return `High concern — ${rep}. Needs a human decision; the system will not block automatically.`;
  }
  private shape(i: {
    id: string; candidateId: string; type: ReliabilityType; severity: number; status: ReliabilityStatus;
    reason: string; notes: string | null; evidenceSource: string | null; shiftId: string | null; jobId: string | null;
    occurredAt: Date; scoreImpact: number; weightFactor: number; reportedById: string | null; reviewDate: Date | null;
    appealNote: string | null; appealedAt: Date | null; createdAt: Date;
  }) {
    return {
      id: i.id, type: i.type, typeLabel: TYPE_LABEL[i.type], severity: i.severity, status: i.status,
      reason: i.reason, notes: i.notes, evidenceSource: i.evidenceSource, shiftId: i.shiftId, jobId: i.jobId,
      occurredAt: i.occurredAt, scoreImpact: i.scoreImpact, weightFactor: i.weightFactor,
      reportedById: i.reportedById, reviewDate: i.reviewDate, appealNote: i.appealNote, appealedAt: i.appealedAt,
      createdAt: i.createdAt,
    };
  }
}
