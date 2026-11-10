import { BadRequestException, Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { RateSettingsService, RateSettingValues, RATE_LABELS } from './rate-settings.service';
import { Roles } from '../auth/roles.decorator';
import { CalculateQuoteDto } from './dto/calculate-quote.dto';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

@ApiTags('quotes')
@ApiBearerAuth()
@Controller('quotes')
export class RateSettingsController {
  constructor(private readonly rates: RateSettingsService) {}

  /** Current rate settings + labels — any staff member may view. */
  @Get('rate-settings')
  @Roles(Role.ADMIN, Role.RECRUITER)
  async get() {
    return { settings: await this.rates.get(), labels: RATE_LABELS };
  }

  /** Change the figures (e.g. after the April rate changes) — administrators only. */
  @Patch('rate-settings')
  @Roles(Role.ADMIN)
  update(@CurrentUser() u: AuthUser, @Body() dto: Partial<RateSettingValues>) {
    return this.rates.update(dto, u.id);
  }

  /** Work out a quote: cost breakdown, charge rate, total and profit. Nothing is saved. */
  @Post('calculate')
  @HttpCode(200)
  @Roles(Role.ADMIN, Role.RECRUITER)
  async calculate(@Body() dto: CalculateQuoteDto) {
    try {
      return await this.rates.calculate(dto);
    } catch (e) {
      if (e instanceof RangeError) throw new BadRequestException(e.message);
      throw e;
    }
  }
}
