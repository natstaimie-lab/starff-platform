import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface OperationalAlert {
  type: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
  candidateId: string | null;
  candidateName: string | null;
  shiftId: string | null;
  jobId: string | null;
  jobTitle: string | null;
  occurredAt: string;
}

/**
 * Derives operational alerts for admins from existing shift / timesheet /
 * document data. Read-only and advisory — nothing here takes any automatic
 * disciplinary action; alerts exist for a human to review and act on.
 */
@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAlerts(): Promise<{ alerts: OperationalAlert[]; counts: Record<string, number> }> {
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 3600 * 1000);
    const in30d = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
    const alerts: OperationalAlert[] = [];

    // Shifts that matter for monitoring: assigned/confirmed/in-progress or recently past.
    const shifts = await this.prisma.shift.findMany({
      where: {
        candidateId: { not: null },
        status: { notIn: ['CANCELLED'] },
        startAt: { gte: new Date(now.getTime() - 14 * 24 * 3600 * 1000) },
      },
      include: {
        candidate: { select: { id: true, firstName: true, lastName: true } },
        job: { select: { id: true, title: true } },
        timesheet: { select: { id: true } },
      },
      orderBy: { startAt: 'asc' },
    });

    for (const s of shifts) {
      const base = {
        candidateId: s.candidateId,
        candidateName: s.candidate ? `${s.candidate.firstName} ${s.candidate.lastName}` : null,
        shiftId: s.id, jobId: s.jobId, jobTitle: s.job?.title ?? null,
      };
      // Worker flagged running late.
      if (s.lateReportedAt && !s.checkOutAt) {
        alerts.push({ ...base, type: 'RUNNING_LATE', severity: 'high', message: `${base.candidateName} reported running late`, occurredAt: s.lateReportedAt.toISOString() });
      }
      // Client reported absent.
      if (s.absentReportedAt) {
        alerts.push({ ...base, type: 'REPORTED_ABSENT', severity: 'high', message: `Client reported ${base.candidateName} absent`, occurredAt: s.absentReportedAt.toISOString() });
      }
      // Confirmation not acknowledged (starts soon, still not acknowledged).
      if (!s.acknowledgedAt && s.status === 'ASSIGNED' && s.startAt <= in48h && s.startAt > now) {
        alerts.push({ ...base, type: 'NOT_ACKNOWLEDGED', severity: 'medium', message: `${base.candidateName} hasn't confirmed ${base.jobTitle}`, occurredAt: s.startAt.toISOString() });
      }
      // Check-in not completed (shift started, no check-in).
      if (!s.checkInAt && !s.absentReportedAt && s.startAt < now && ['ASSIGNED', 'CONFIRMED'].includes(s.status)) {
        alerts.push({ ...base, type: 'NO_CHECK_IN', severity: 'high', message: `${base.candidateName} hasn't checked in for ${base.jobTitle}`, occurredAt: s.startAt.toISOString() });
      }
      // Timesheet outstanding (shift finished, no timesheet).
      if (!s.timesheet && s.endAt < now && (s.status === 'COMPLETED' || s.status === 'IN_PROGRESS')) {
        alerts.push({ ...base, type: 'TIMESHEET_OUTSTANDING', severity: 'medium', message: `Timesheet outstanding — ${base.candidateName}, ${base.jobTitle}`, occurredAt: s.endAt.toISOString() });
      }
    }

    // Documents approaching expiry (within 30 days) for non-archived candidates.
    const expiring = await this.prisma.candidateDocument.findMany({
      where: { expiryDate: { not: null, gte: now, lte: in30d }, candidate: { archivedAt: null }, type: { in: ['RIGHT_TO_WORK', 'DBS_CHECK', 'ID', 'LICENCE', 'CERTIFICATE'] } },
      include: { candidate: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { expiryDate: 'asc' },
      take: 50,
    });
    for (const d of expiring) {
      alerts.push({
        type: 'DOC_EXPIRING', severity: 'medium',
        message: `${d.candidate.firstName} ${d.candidate.lastName}'s ${d.type.replace(/_/g, ' ').toLowerCase()} expires ${d.expiryDate!.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
        candidateId: d.candidate.id, candidateName: `${d.candidate.firstName} ${d.candidate.lastName}`,
        shiftId: null, jobId: null, jobTitle: null, occurredAt: d.expiryDate!.toISOString(),
      });
    }

    const order = { high: 0, medium: 1, low: 2 } as const;
    alerts.sort((a, b) => order[a.severity] - order[b.severity]);
    const counts = alerts.reduce((acc, a) => { acc[a.type] = (acc[a.type] ?? 0) + 1; acc.total = (acc.total ?? 0) + 1; return acc; }, {} as Record<string, number>);
    return { alerts, counts };
  }
}
