import { BadRequestException, Controller, Get, Headers, HttpCode, Param, Post, Req, type RawBodyRequest } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { InboundService } from './inbound.service';

/** CRM Phase 4c: employer replies via Resend inbound. */
@ApiTags('inbound')
@Controller('inbound')
export class InboundController {
  constructor(private readonly inbound: InboundService) {}

  /** Resend webhook (event email.received). Public, but signed: bad signatures get 401. */
  @Public()
  @Post('resend')
  @HttpCode(200)
  resend(
    @Req() req: RawBodyRequest<Request>,
    @Headers('svix-id') id?: string,
    @Headers('svix-timestamp') timestamp?: string,
    @Headers('svix-signature') signature?: string,
  ) {
    const raw = req.rawBody?.toString('utf8');
    if (!raw) throw new BadRequestException('Empty body');
    return this.inbound.receive(raw, { id, timestamp, signature });
  }

  /** Replies that matched no lead, or failed to process. */
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.RECRUITER)
  @Get('unhandled')
  unhandled() {
    return this.inbound.listUnhandled();
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.RECRUITER)
  @Post(':id/retry')
  @HttpCode(200)
  retry(@Param('id') id: string) {
    return this.inbound.process(id);
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.RECRUITER)
  @Post(':id/dismiss')
  @HttpCode(200)
  dismiss(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.inbound.dismiss(id, u.id);
  }
}
