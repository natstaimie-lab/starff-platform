import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AiService } from './ai.service';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
@Roles(Role.ADMIN, Role.RECRUITER)
// The AI routes call Claude (real cost) — cap them tighter than the global
// limit so a stuck client or abuse can't run up the bill.
@Throttle({ default: { limit: 30, ttl: 60000 } })
export class AiController {
  constructor(private readonly ai: AiService) {}

  // Staff ops assistant (grounded on the whole operation).
  @Post('ask')
  ask(@Body() body: { message: string; history?: ChatMessage[] }) {
    return this.ai.ask(body.message, body.history ?? []);
  }

  // Worker assistant (grounded ONLY on the signed-in worker's own record).
  // Method-level @Roles overrides the class-level staff restriction.
  @Post('me/ask')
  @Roles(Role.CANDIDATE)
  askCandidate(
    @CurrentUser() user: AuthUser,
    @Body() body: { message: string; history?: ChatMessage[] },
  ) {
    return this.ai.askCandidate(user.id, body.message, body.history ?? []);
  }
}
