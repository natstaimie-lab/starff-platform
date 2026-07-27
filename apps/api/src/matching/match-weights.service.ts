import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface MatchWeightValues {
  skills: number;
  compliance: number;
  rightToWork: number;
  availability: number;
  rating: number;
  reliability: number;
  proximity: number;
}

export const DEFAULT_WEIGHTS: MatchWeightValues = {
  skills: 35, compliance: 15, rightToWork: 10, availability: 15, rating: 10, reliability: 10, proximity: 5,
};

/** Human labels for the admin weighting screen. */
export const WEIGHT_LABELS: Record<keyof MatchWeightValues, string> = {
  skills: 'Skills & qualifications',
  compliance: 'Compliance clearance',
  rightToWork: 'Right to work',
  availability: 'Availability',
  rating: 'Performance rating',
  reliability: 'Reliability / attendance',
  proximity: 'Distance / location',
};

/** Reads and updates the admin-tunable matching-factor weights (singleton). */
@Injectable()
export class MatchWeightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The active weights (creates the default singleton on first read). */
  async get(): Promise<MatchWeightValues> {
    const row = await this.prisma.matchWeights.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default', ...DEFAULT_WEIGHTS },
    });
    return {
      skills: row.skills, compliance: row.compliance, rightToWork: row.rightToWork,
      availability: row.availability, rating: row.rating, reliability: row.reliability, proximity: row.proximity,
    };
  }

  async update(dto: Partial<MatchWeightValues>, actorId?: string): Promise<MatchWeightValues> {
    const before = await this.get();
    // Only accept the known keys, coerced to non-negative numbers.
    const data: Partial<MatchWeightValues> = {};
    (Object.keys(DEFAULT_WEIGHTS) as (keyof MatchWeightValues)[]).forEach((k) => {
      if (dto[k] != null && Number.isFinite(dto[k])) data[k] = Math.max(0, Number(dto[k]));
    });
    const row = await this.prisma.matchWeights.upsert({
      where: { id: 'default' },
      update: { ...data, updatedById: actorId ?? undefined },
      create: { id: 'default', ...DEFAULT_WEIGHTS, ...data, updatedById: actorId ?? undefined },
    });
    const after: MatchWeightValues = {
      skills: row.skills, compliance: row.compliance, rightToWork: row.rightToWork,
      availability: row.availability, rating: row.rating, reliability: row.reliability, proximity: row.proximity,
    };
    await this.audit.log({
      actorId, action: 'match.weights_changed', entity: 'MatchWeights', entityId: 'default',
      meta: JSON.parse(JSON.stringify({ before, after })),
    });
    return after;
  }
}
