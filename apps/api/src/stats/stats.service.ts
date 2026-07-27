import { Injectable } from '@nestjs/common';
import {
  CandidateStatus,
  JobStatus,
  TimesheetStatus,
  InvoiceStatus,
  EnquiryStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReliabilityService } from '../reliability/reliability.service';

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const [
      candidates,
      workers,
      clients,
      bookings,
      timesheets,
      pendingTimesheets,
      newEnquiries,
      complianceAttention,
      revenueAgg,
    ] = await Promise.all([
      this.prisma.candidate.count(),
      this.prisma.candidate.count({
        where: { status: { in: [CandidateStatus.ACTIVE, CandidateStatus.COMPLIANT] } },
      }),
      this.prisma.client.count(),
      this.prisma.job.count({ where: { status: { in: [JobStatus.OPEN, JobStatus.FILLED] } } }),
      this.prisma.timesheet.count(),
      this.prisma.timesheet.count({ where: { status: TimesheetStatus.SUBMITTED } }),
      this.prisma.enquiry.count({ where: { status: EnquiryStatus.NEW } }),
      // Candidates needing a compliance decision (drives the sidebar badge).
      this.prisma.candidate.count({
        where: { status: { in: [CandidateStatus.NEW, CandidateStatus.SCREENING, CandidateStatus.INACTIVE, CandidateStatus.REJECTED] } },
      }),
      this.prisma.invoice.aggregate({
        _sum: { total: true },
        where: { status: InvoiceStatus.PAID },
      }),
    ]);

    return {
      candidates,
      workers,
      clients,
      bookings,
      timesheets,
      pendingTimesheets,
      newEnquiries,
      complianceAttention,
      revenue: Number(revenueAgg._sum.total ?? 0),
    };
  }

  /** Compliance breakdown by candidate status — powers the dashboard donut.
   *  Same buckets the Compliance page uses, so the two never disagree. */
  async compliance() {
    const grouped = await this.prisma.candidate.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const by = (s: CandidateStatus) => grouped.find((g) => g.status === s)?._count._all ?? 0;
    const compliant = by(CandidateStatus.COMPLIANT);
    const active = by(CandidateStatus.ACTIVE);
    const screening = by(CandidateStatus.SCREENING);
    const awaiting = by(CandidateStatus.NEW);
    const inactive = by(CandidateStatus.INACTIVE);
    const rejected = by(CandidateStatus.REJECTED);
    const total = grouped.reduce((n, g) => n + g._count._all, 0);
    const clearedPct = total ? Math.round(((compliant + active) / total) * 100) : 0;
    return { compliant, active, screening, awaiting, inactive, rejected, total, clearedPct };
  }

  /** Real weekly activity for the Overview chart — buckets records by the
   *  Monday of their createdAt week over the last `weeks` weeks. */
  async trends(weeks = 7) {
    const now = new Date();
    // Monday 00:00 of the current week.
    const monday = new Date(now);
    const dow = (monday.getDay() + 6) % 7; // 0 = Monday
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - dow);
    const start = new Date(monday);
    start.setDate(start.getDate() - (weeks - 1) * 7);

    const [candidates, jobs, timesheets, invoices] = await Promise.all([
      this.prisma.candidate.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true } }),
      this.prisma.job.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true } }),
      this.prisma.timesheet.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true } }),
      this.prisma.invoice.findMany({ where: { createdAt: { gte: start } }, select: { createdAt: true } }),
    ]);

    const buckets = Array.from({ length: weeks }, (_, i) => {
      const wStart = new Date(start);
      wStart.setDate(wStart.getDate() + i * 7);
      return wStart;
    });
    const idxFor = (d: Date) => {
      const diff = Math.floor((d.getTime() - start.getTime()) / (7 * 24 * 3600 * 1000));
      return Math.min(Math.max(diff, 0), weeks - 1);
    };
    const tally = (rows: { createdAt: Date }[]) => {
      const arr = new Array(weeks).fill(0);
      for (const r of rows) arr[idxFor(r.createdAt)]++;
      return arr;
    };

    return {
      labels: buckets.map((b) => b.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })),
      series: [
        { name: 'Timesheets', data: tally(timesheets) },
        { name: 'Bookings', data: tally(jobs) },
        { name: 'Candidates', data: tally(candidates) },
        { name: 'Invoices', data: tally(invoices) },
      ],
    };
  }

  /** Live counts for the controlled recruitment workflow queues + a couple of
   *  small actionable lists for the admin dashboard. */
  async workflow() {
    const [
      awaitingApproval,
      responsesToReview,
      readyToSubmit,
      awaitingClient,
      clientAccepted,
      alternativesRequested,
      placements,
      recruiting,
      toRefill,
      awaitingApprovalJobs,
      readyToBook,
      upcomingShifts,
      reliabilityIncidents,
    ] = await Promise.all([
      this.prisma.job.count({ where: { status: { in: [JobStatus.SUBMITTED, JobStatus.UNDER_REVIEW] } } }),
      this.prisma.application.count({ where: { status: { in: ['INTERESTED', 'UNAVAILABLE', 'INFO_REQUESTED'] } } }),
      this.prisma.application.count({ where: { status: 'INTERESTED' } }),
      this.prisma.application.count({ where: { status: 'SUBMITTED_TO_CLIENT' } }),
      this.prisma.application.count({ where: { status: 'CLIENT_ACCEPTED' } }),
      this.prisma.application.count({ where: { status: 'ALTERNATIVE_REQUESTED' } }),
      this.prisma.application.count({ where: { status: 'BOOKED' } }),
      this.prisma.job.count({ where: { status: { in: [JobStatus.RECRUITING, JobStatus.OFFERS_SENT, JobStatus.PARTIALLY_FILLED] } } }),
      this.prisma.application.count({ where: { status: 'REPLACED' } }),
      this.prisma.job.findMany({
        where: { status: { in: [JobStatus.SUBMITTED, JobStatus.UNDER_REVIEW] } },
        orderBy: { submittedAt: 'asc' },
        take: 8,
        select: { id: true, title: true, openings: true, status: true, submittedAt: true, client: { select: { name: true } } },
      }),
      this.prisma.application.findMany({
        where: { status: 'CLIENT_ACCEPTED' },
        orderBy: { clientDecidedAt: 'asc' },
        take: 8,
        select: {
          id: true,
          candidate: { select: { firstName: true, lastName: true } },
          job: { select: { id: true, title: true, client: { select: { name: true } } } },
        },
      }),
      this.prisma.shift.findMany({
        where: { candidateId: { not: null }, status: { in: ['ASSIGNED', 'CONFIRMED', 'IN_PROGRESS'] }, startAt: { gte: new Date(), lte: new Date(Date.now() + 7 * 24 * 3600 * 1000) } },
        orderBy: { startAt: 'asc' },
        take: 8,
        select: { id: true, startAt: true, status: true, candidate: { select: { firstName: true, lastName: true } }, job: { select: { id: true, title: true, client: { select: { name: true } } } } },
      }),
      // Active (confirmed/unconfirmed) reliability incidents → candidates of concern.
      this.prisma.reliabilityIncident.findMany({
        where: { status: { in: ['CONFIRMED', 'UNCONFIRMED'] } },
        select: { candidateId: true, scoreImpact: true, weightFactor: true, status: true, candidate: { select: { firstName: true, lastName: true } } },
      }),
    ]);

    // Roll up reliability incidents per candidate → count those at MEDIUM+ concern.
    const byCand = new Map<string, { name: string; incidents: { status: any; scoreImpact: number; weightFactor: number }[] }>();
    for (const i of reliabilityIncidents) {
      if (!byCand.has(i.candidateId)) byCand.set(i.candidateId, { name: `${i.candidate.firstName} ${i.candidate.lastName}`, incidents: [] });
      byCand.get(i.candidateId)!.incidents.push(i);
    }
    const reliabilityConcerns = [...byCand.entries()]
      .map(([id, v]) => ({ candidateId: id, name: v.name, points: ReliabilityService.pointsFor(v.incidents), level: ReliabilityService.levelFor(ReliabilityService.pointsFor(v.incidents)) }))
      .filter((c) => c.level === 'MEDIUM' || c.level === 'HIGH')
      .sort((a, b) => b.points - a.points);

    return {
      counts: {
        awaitingApproval,
        responsesToReview,
        readyToSubmit,
        awaitingClient,
        clientAccepted,
        alternativesRequested,
        placements,
        recruiting,
        toRefill,
        upcomingShifts: upcomingShifts.length,
        reliabilityConcerns: reliabilityConcerns.length,
      },
      awaitingApprovalJobs,
      readyToBook,
      upcomingShifts,
      reliabilityConcerns: reliabilityConcerns.slice(0, 8),
    };
  }
}
