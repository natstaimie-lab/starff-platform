import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

// Restrict a route to one or more roles, e.g. @Roles('ADMIN', 'RECRUITER')
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
