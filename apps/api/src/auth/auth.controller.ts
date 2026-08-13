import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from './current-user.decorator';

/**
 * Identity of the logged-in user — no @Roles, so any authenticated user can
 * call it. Portals use this right after sign-in to check the account's role
 * matches the portal (a candidate login must not open the admin dashboard).
 */
@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  @Get('whoami')
  whoami(@CurrentUser() u: AuthUser) {
    return { id: u.id, email: u.email ?? null, role: u.role ?? null };
  }
}
