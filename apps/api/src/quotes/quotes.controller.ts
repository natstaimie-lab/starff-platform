import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { QuoteStatus, Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { QuotesService } from './quotes.service';
import { QuoteStatusDto, SaveQuoteDto } from './dto/save-quote.dto';

/**
 * Saved quotes — staff only. Registered after RateSettingsController so the
 * fixed paths (quotes/rate-settings, quotes/calculate) win over quotes/:id.
 */
@ApiTags('quotes')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.RECRUITER)
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Get()
  list(@Query('status') status?: string, @Query('clientId') clientId?: string) {
    if (status && !(status in QuoteStatus)) throw new BadRequestException('Unknown status');
    return this.quotes.list({ status: status as QuoteStatus | undefined, clientId: clientId || undefined });
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: SaveQuoteDto) {
    return this.quotes.create(dto, u.id);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.quotes.get(id);
  }

  /** Replace details and lines — drafts only. */
  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: SaveQuoteDto) {
    return this.quotes.update(id, dto, u.id);
  }

  @Patch(':id/status')
  setStatus(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: QuoteStatusDto) {
    return this.quotes.setStatus(id, dto.status, u.id);
  }
}
