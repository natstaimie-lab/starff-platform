import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { RegistrationService } from './registration.service';
import { RegisterCandidateDto } from './dto/register-candidate.dto';
import { RegisterClientDto } from './dto/register-client.dto';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

@ApiTags('registration')
@Controller('registration')
export class RegistrationController {
  constructor(private readonly registration: RegistrationService) {}

  // ── Public front-door endpoints (website / mobile app) ──
  // Same shared-secret pattern as the enquiries webhook so only our own
  // site/app can call them.
  private assertWebhook(secret?: string) {
    if (secret !== process.env.WORDPRESS_WEBHOOK_SECRET) {
      throw new UnauthorizedException('Bad webhook secret');
    }
  }

  @Public()
  @Post('candidate')
  registerCandidate(
    @Body() dto: RegisterCandidateDto,
    @Headers('x-webhook-secret') secret?: string,
  ) {
    this.assertWebhook(secret);
    return this.registration.registerCandidate(dto);
  }

  @Public()
  @Post('client')
  registerClient(
    @Body() dto: RegisterClientDto,
    @Headers('x-webhook-secret') secret?: string,
  ) {
    this.assertWebhook(secret);
    return this.registration.registerClient(dto);
  }

  // ── Authenticated: the logged-in user's own onboarding progress ──
  @Get('candidate/progress')
  @Roles(Role.CANDIDATE)
  candidateProgress(@CurrentUser() user: AuthUser) {
    return this.registration.candidateProgress(user.id);
  }

  @Post('candidate/submit')
  @Roles(Role.CANDIDATE)
  submitCandidate(@CurrentUser() user: AuthUser) {
    return this.registration.submitCandidate(user.id);
  }

  @Get('client/progress')
  @Roles(Role.CLIENT)
  clientProgress(@CurrentUser() user: AuthUser) {
    return this.registration.clientProgress(user.id);
  }

  @Post('client/submit')
  @Roles(Role.CLIENT)
  submitClient(@CurrentUser() user: AuthUser) {
    return this.registration.submitClient(user.id);
  }

  // ── Staff review: approve / reject / request more info ──
  @Post('candidate/:id/review')
  @Roles(Role.ADMIN, Role.RECRUITER)
  reviewCandidate(
    @Param('id') id: string,
    @Body() dto: { action: 'APPROVE' | 'REJECT' | 'REQUEST_INFO'; note?: string },
  ) {
    return this.registration.reviewCandidate(id, dto.action, dto.note);
  }

  @Post('client/:id/review')
  @Roles(Role.ADMIN, Role.RECRUITER)
  reviewClient(
    @Param('id') id: string,
    @Body() dto: { action: 'APPROVE' | 'REJECT' | 'REQUEST_INFO'; note?: string },
  ) {
    return this.registration.reviewClient(id, dto.action, dto.note);
  }
}
