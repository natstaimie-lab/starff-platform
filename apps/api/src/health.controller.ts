import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from './auth/public.decorator';

/** Unauthenticated liveness probe for the host's health checks (Render/Fly/etc). */
@ApiTags('health')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  health() {
    return { ok: true, service: 'starff-api', ts: new Date().toISOString() };
  }
}
