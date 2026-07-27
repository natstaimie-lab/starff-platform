import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, ReliabilityStatus, ReliabilityType } from '@prisma/client';
import { ReliabilityService } from './reliability.service';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

@ApiTags('reliability')
@ApiBearerAuth()
@Controller()
export class ReliabilityController {
  constructor(private readonly reliability: ReliabilityService) {}

  /** Full internal reliability profile for a candidate. Staff only. */
  @Get('candidates/:id/reliability')
  @Roles(Role.ADMIN, Role.RECRUITER)
  profile(@Param('id') id: string) {
    return this.reliability.profile(id);
  }

  /** Log a reliability incident against a candidate. */
  @Post('candidates/:id/reliability/incidents')
  @Roles(Role.ADMIN, Role.RECRUITER)
  add(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: { type: ReliabilityType; severity?: number; reason: string; notes?: string; evidenceSource?: string; shiftId?: string; jobId?: string; occurredAt?: string; scoreImpact?: number; status?: ReliabilityStatus; reviewDate?: string },
  ) {
    return this.reliability.addIncident(id, dto, u.id);
  }

  /** Admin override / manual review — change status, weighting, or remove. Admins only. */
  @Patch('reliability/incidents/:id')
  @Roles(Role.ADMIN)
  update(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: { status?: ReliabilityStatus; severity?: number; scoreImpact?: number; weightFactor?: number; reviewDate?: string; notes?: string },
  ) {
    return this.reliability.updateIncident(id, dto, u.id);
  }
}
