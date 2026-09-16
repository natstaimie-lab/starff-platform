import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from './current-user.decorator';
import { MfaExempt } from './mfa-exempt.decorator';

/**
 * Identity of the logged-in user — no @Roles, so any authenticated user can
 * call it. Portals use this right after sign-in to check the account's role
 * matches the portal (a candidate login must not open the admin dashboard).
 */
@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  // Callable at aal1 (before MFA) so the portal can learn the role and decide
  // whether to force the MFA gate. Returns no sensitive data.
  @MfaExempt()
  @Get('whoami')
  whoami(@CurrentUser() u: AuthUser) {
    return { id: u.id, email: u.email ?? null, role: u.role ?? null };
  }
}
