import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  createRemoteJWKSet,
  jwtVerify,
  decodeProtectedHeader,
  type JWTPayload,
} from 'jose';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import { MFA_EXEMPT_KEY } from './mfa-exempt.decorator';

/**
 * Verifies the Supabase access token on every request (unless @Public()),
 * then loads the matching User from our database and attaches it to
 * `request.user` as { id, email, role }.
 *
 * Supabase now signs access tokens with asymmetric keys (ES256) exposed via a
 * JWKS endpoint, so we verify against that. (Older projects used a shared HS256
 * secret; if SUPABASE_JWT_SECRET is set we fall back to it.)
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private static readonly logger = new Logger('Auth');
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  private getJwks() {
    if (!this.jwks) {
      const base = process.env.SUPABASE_URL;
      this.jwks = createRemoteJWKSet(
        new URL(`${base}/auth/v1/.well-known/jwks.json`),
      );
    }
    return this.jwks;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = header.slice('Bearer '.length);

    let payload: JWTPayload;
    try {
      const { alg } = decodeProtectedHeader(token);
      if (alg === 'HS256' && process.env.SUPABASE_JWT_SECRET) {
        // Legacy symmetric verification.
        const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET);
        ({ payload } = await jwtVerify(token, secret));
      } else {
        // Modern asymmetric verification via Supabase's JWKS.
        ({ payload } = await jwtVerify(token, this.getJwks(), {
          issuer: `${process.env.SUPABASE_URL}/auth/v1`,
        }));
      }
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const userId = payload.sub as string;

    // The database call can transiently fail if the Supabase pooler drops a
    // connection. Retry once (Prisma re-establishes on the next call); if it
    // still fails, return a clean 503 rather than leaking a 500 stack trace.
    let user;
    try {
      user = await this.prisma.user.findUnique({ where: { id: userId } });
    } catch {
      try {
        await new Promise((r) => setTimeout(r, 300));
        user = await this.prisma.user.findUnique({ where: { id: userId } });
      } catch (e) {
        SupabaseAuthGuard.logger.error(`DB unreachable during auth: ${(e as Error).message.split('\n')[0]}`);
        throw new ServiceUnavailableException('Service temporarily unavailable — please try again in a moment.');
      }
    }

    // Archived candidates/clients and deactivated staff are blocked.
    if (user && !user.isActive) {
      throw new ForbiddenException('This account has been deactivated.');
    }

    const aal = typeof payload.aal === 'string' ? payload.aal : undefined;
    req.user = {
      id: userId,
      email: user?.email ?? (payload.email as string | undefined),
      role: user?.role,
      aal,
    };

    // Staff MFA enforcement. Behind REQUIRE_STAFF_MFA so it can be rolled out
    // safely (turn it on only once staff have enrolled). Staff (ADMIN /
    // RECRUITER) must have stepped up to aal2 (completed MFA); everyone else and
    // any @MfaExempt() route (e.g. whoami, used to drive enrollment) is allowed.
    if (
      process.env.REQUIRE_STAFF_MFA === 'true' &&
      (user?.role === Role.ADMIN || user?.role === Role.RECRUITER) &&
      aal !== 'aal2'
    ) {
      const mfaExempt = this.reflector.getAllAndOverride<boolean>(MFA_EXEMPT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!mfaExempt) {
        throw new ForbiddenException('MFA_REQUIRED');
      }
    }
    return true;
  }
}
