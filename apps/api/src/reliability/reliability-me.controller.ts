import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ReliabilityService } from './reliability.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

@ApiTags('reliability')
@ApiBearerAuth()
@Controller('me/reliability')
@Roles(Role.CANDIDATE)
export class ReliabilityMeController {
  constructor(
    private readonly reliability: ReliabilityService,
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  /** The candidate's own reliability summary (limited view). */
  @Get()
  mine(@CurrentUser() u: AuthUser) {
    return this.reliability.myProfile(u.id);
  }

  /** Candidate corrects / appeals a concern — notifies staff to review. */
  @Post('incidents/:id/appeal')
  async appeal(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: { note: string }) {
    const res = await this.reliability.appeal(u.id, id, dto?.note ?? '');
    // Notify staff that a reliability concern needs review.
    const staff = await this.prisma.user.findMany({ where: { role: { in: [Role.ADMIN, Role.RECRUITER] }, isActive: true }, select: { id: true, email: true } });
    const cand = await this.prisma.candidate.findUnique({ where: { userId: u.id }, select: { firstName: true, lastName: true } });
    await Promise.all(
      staff.map((s) =>
        this.notifications.send({
          to: s.email, kind: 'RELIABILITY_REVIEW',
          subject: `Reliability concern disputed — ${cand?.firstName ?? 'a candidate'} ${cand?.lastName ?? ''}`.trim(),
          body: `${cand?.firstName ?? 'A candidate'} has disputed a reliability concern and it needs review.${dto?.note ? ` Their note: ${dto.note}` : ''}`,
          userId: s.id,
        }),
      ),
    );
    return res;
  }
}
