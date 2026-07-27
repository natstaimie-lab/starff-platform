import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { StaffService } from './staff.service';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

@ApiTags('staff')
@ApiBearerAuth()
@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  // Any staff member can read their own record (drives UI permission gating).
  @Get('me')
  @Roles(Role.ADMIN, Role.RECRUITER)
  me(@CurrentUser() u: AuthUser) {
    return this.staff.me(u.id);
  }

  // Everything below is Admin-only.
  @Get()
  @Roles(Role.ADMIN)
  list() {
    return this.staff.list();
  }

  @Post()
  @Roles(Role.ADMIN)
  invite(@Body() dto: { email: string; firstName?: string; lastName?: string; role: string }) {
    return this.staff.invite(dto);
  }

  @Patch(':id/role')
  @Roles(Role.ADMIN)
  setRole(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body('role') role: string) {
    return this.staff.setRole(u.id, id, role);
  }

  @Patch(':id/active')
  @Roles(Role.ADMIN)
  setActive(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.staff.setActive(u.id, id, isActive);
  }
}
