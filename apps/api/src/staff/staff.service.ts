import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type StaffRole = 'ADMIN' | 'RECRUITER';
const STAFF_ROLES: Role[] = [Role.ADMIN, Role.RECRUITER];
const isStaffRole = (r: string): r is StaffRole => r === 'ADMIN' || r === 'RECRUITER';

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  private admin(): SupabaseClient {
    return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
  }

  /** The logged-in staff member's own record — used by the UI to gate actions. */
  async me(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true },
    });
    if (!u) throw new NotFoundException('User not found');
    return u;
  }

  /** All staff logins (admins + recruiters). Admin-only. */
  list() {
    return this.prisma.user.findMany({
      where: { role: { in: STAFF_ROLES } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, createdAt: true },
    });
  }

  /**
   * Invite a new staff member. Creates their Supabase login via a secure invite
   * link (no password is ever set or emailed by us) and their User row with the
   * chosen role. Admin-only.
   */
  async invite(dto: { email: string; firstName?: string; lastName?: string; role: string }) {
    const email = dto.email.trim().toLowerCase();
    if (!isStaffRole(dto.role)) throw new ForbiddenException('Role must be ADMIN or RECRUITER');
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('A user with that email already exists');

    const supabase = this.admin();
    const invite = await supabase.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { data: { role: dto.role }, redirectTo: process.env.ADMIN_PORTAL_URL ?? 'http://localhost:3000' },
    });
    if (invite.error || !invite.data.user) {
      throw new ConflictException(`Could not create login: ${invite.error?.message ?? 'unknown error'}`);
    }

    const user = await this.prisma.user.create({
      data: { id: invite.data.user.id, email, role: dto.role as Role, firstName: dto.firstName?.trim() || null, lastName: dto.lastName?.trim() || null },
    });
    return {
      id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName, isActive: user.isActive,
      inviteLink: invite.data.properties?.action_link ?? null,
    };
  }

  /** Change a staff member's role (Admin ↔ Recruiter). Admin-only. */
  async setRole(actorId: string, id: string, role: string) {
    if (!isStaffRole(role)) throw new ForbiddenException('Role must be ADMIN or RECRUITER');
    if (id === actorId) throw new ForbiddenException('You cannot change your own role');
    const u = await this.staffOrThrow(id);
    if (u.role === Role.ADMIN && role === 'RECRUITER') await this.assertNotLastAdmin(id);
    return this.prisma.user.update({ where: { id }, data: { role: role as Role }, select: { id: true, role: true } });
  }

  /** Deactivate / reactivate a staff login (revoke access without deleting). Admin-only. */
  async setActive(actorId: string, id: string, isActive: boolean) {
    if (id === actorId) throw new ForbiddenException('You cannot deactivate your own account');
    const u = await this.staffOrThrow(id);
    if (!isActive && u.role === Role.ADMIN) await this.assertNotLastAdmin(id);
    return this.prisma.user.update({ where: { id }, data: { isActive }, select: { id: true, isActive: true } });
  }

  private async staffOrThrow(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u || !STAFF_ROLES.includes(u.role)) throw new NotFoundException('Staff member not found');
    return u;
  }

  /** Guard against locking everyone out by removing the last active admin. */
  private async assertNotLastAdmin(excludeId: string) {
    const others = await this.prisma.user.count({
      where: { role: Role.ADMIN, isActive: true, id: { not: excludeId } },
    });
    if (others === 0) throw new ForbiddenException('You cannot remove the last active admin');
  }
}
