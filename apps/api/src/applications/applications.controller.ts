import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ApplicationsService } from './applications.service';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

@ApiTags('applications')
@ApiBearerAuth()
@Controller('applications')
@Roles(Role.ADMIN, Role.RECRUITER)
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  /** Admin confirms the final placement for a candidate. */
  @Post(':id/book')
  book(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.applications.book(id, u.id);
  }

  /** Admin replaces a booked worker (cancel + re-open the vacancy). */
  @Post(':id/replace')
  replace(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: { reason?: string }) {
    return this.applications.replace(id, dto?.reason, u.id);
  }

  /** Admin withdraws an offer before it's booked. */
  @Post(':id/withdraw')
  withdraw(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.applications.withdrawOffer(id, u.id);
  }
}
