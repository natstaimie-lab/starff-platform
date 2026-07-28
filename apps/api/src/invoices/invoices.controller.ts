import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { InvoicesService } from './invoices.service';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

class UpdateInvoiceDto {
  lines?: { id: string; description?: string; hours?: number; rate?: number }[];
}

@ApiTags('invoices')
@ApiBearerAuth()
@Controller('invoices')
@Roles(Role.ADMIN, Role.RECRUITER)
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  findAll() {
    return this.invoices.findAll();
  }

  // Draft invoices from all approved, not-yet-invoiced timesheets (by client).
  @Post('generate')
  generate(@CurrentUser() u: AuthUser) {
    return this.invoices.generateDrafts(u.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.invoices.findOne(id);
  }

  // Edit a draft invoice's line items (description / hours / rate).
  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateInvoiceDto) {
    return this.invoices.update(id, dto, u.id);
  }

  // Approve & send to the client (notifies the client).
  @Patch(':id/send')
  send(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.invoices.send(id, u.id);
  }

  // Mark a sent invoice as paid (settles the linked timesheets too).
  @Patch(':id/paid')
  markPaid(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.invoices.markPaid(id, u.id);
  }

  // Reject / cancel the invoice.
  @Patch(':id/void')
  voidInvoice(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.invoices.voidInvoice(id, u.id);
  }
}
