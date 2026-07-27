import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import { RolesGuard } from './roles.guard';

/**
 * Registers both guards globally so every route is protected by default:
 *   1. SupabaseAuthGuard — must be logged in (unless @Public())
 *   2. RolesGuard        — must have the right role (if @Roles() is set)
 */
@Module({
  providers: [
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
