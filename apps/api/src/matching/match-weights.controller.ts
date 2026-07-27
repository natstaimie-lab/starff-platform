import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { MatchWeightsService, MatchWeightValues, WEIGHT_LABELS } from './match-weights.service';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

@ApiTags('matching')
@ApiBearerAuth()
@Controller('matching/weights')
export class MatchWeightsController {
  constructor(private readonly weights: MatchWeightsService) {}

  /** Current weights + labels — any staff member may view. */
  @Get()
  @Roles(Role.ADMIN, Role.RECRUITER)
  async get() {
    return { weights: await this.weights.get(), labels: WEIGHT_LABELS };
  }

  /** Adjust the weighting of each matching factor — administrators only. */
  @Patch()
  @Roles(Role.ADMIN)
  update(@CurrentUser() u: AuthUser, @Body() dto: Partial<MatchWeightValues>) {
    return this.weights.update(dto, u.id);
  }
}
