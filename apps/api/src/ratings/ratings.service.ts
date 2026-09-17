import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Worker ratings. A rating is one 1–5 star score from a client (after a shift)
 * or a staff assessment. The worker's displayed `Candidate.rating` is kept as
 * the average of all their ratings, so the dashboard reliability panel fills in
 * as ratings arrive. Individual ratings are retained in CandidateRating.
 */
@Injectable()
export class RatingsService {
  constructor(private readonly prisma: PrismaService) {}

  async rate(
    candidateId: string,
    byUserId: string,
    byRole: Role,
    stars: number,
    comment?: string,
    shiftId?: string,
  ) {
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      throw new BadRequestException('Rating must be a whole number of stars from 1 to 5.');
    }
    const candidate = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { id: true },
    });
    if (!candidate) throw new NotFoundException('Worker not found.');

    await this.prisma.candidateRating.create({
      data: { candidateId, byUserId, byRole, stars, comment: comment?.trim() || undefined, shiftId },
    });

    // Recompute and cache the average on the candidate for fast dashboard reads.
    const agg = await this.prisma.candidateRating.aggregate({
      where: { candidateId },
      _avg: { stars: true },
      _count: { _all: true },
    });
    const rating = agg._avg.stars != null ? Math.round(agg._avg.stars * 10) / 10 : null;
    await this.prisma.candidate.update({ where: { id: candidateId }, data: { rating } });

    return { rating, count: agg._count._all };
  }

  /** The rating summary for one worker (average + how many ratings). */
  async summary(candidateId: string) {
    const agg = await this.prisma.candidateRating.aggregate({
      where: { candidateId },
      _avg: { stars: true },
      _count: { _all: true },
    });
    return {
      rating: agg._avg.stars != null ? Math.round(agg._avg.stars * 10) / 10 : null,
      count: agg._count._all,
    };
  }
}
