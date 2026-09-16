import { SetMetadata } from '@nestjs/common';

// Routes a staff member may call BEFORE completing MFA (i.e. at aal1). Only
// safe, non-sensitive routes should carry this — e.g. /auth/whoami, which the
// portal calls to learn the account's role so it can drive the MFA gate.
export const MFA_EXEMPT_KEY = 'mfaExempt';
export const MfaExempt = () => SetMetadata(MFA_EXEMPT_KEY, true);
