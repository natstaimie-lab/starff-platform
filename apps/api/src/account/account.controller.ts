import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AccountService } from './account.service';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

@ApiTags('account')
@ApiBearerAuth()
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  // ── Self-service (the signed-in user, from the app) ──
  /** Start deleting your own account. Deactivates it immediately. */
  @Post('deletion-request')
  @Roles(Role.CANDIDATE, Role.CLIENT)
  requestDeletion(@CurrentUser() user: AuthUser, @Body('reason') reason?: string) {
    return this.account.requestDeletion(user.id, reason);
  }

  // ── Admin review + erasure ──
  @Get('deletion-requests')
  @Roles(Role.ADMIN, Role.RECRUITER)
  listRequests() {
    return this.account.listRequests();
  }

  @Post('deletion-requests/:userId/cancel')
  @Roles(Role.ADMIN, Role.RECRUITER)
  cancel(@CurrentUser() actor: AuthUser, @Param('userId') userId: string) {
    return this.account.cancel(actor.id, userId);
  }

  @Post('deletion-requests/:userId/complete')
  @Roles(Role.ADMIN, Role.RECRUITER)
  complete(@CurrentUser() actor: AuthUser, @Param('userId') userId: string) {
    return this.account.markHandled(actor.id, userId);
  }
}
