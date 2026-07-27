import { Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { InvoicesService } from './invoices.service';
import { Roles } from '../auth/roles.decorator';

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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.invoices.findOne(id);
  }

  // Approve & send to the client.
  @Patch(':id/send')
  send(@Param('id') id: string) {
    return this.invoices.send(id);
  }

  // Mark a sent invoice as paid (settles the linked timesheets too).
  @Patch(':id/paid')
  markPaid(@Param('id') id: string) {
    return this.invoices.markPaid(id);
  }

  // Reject / cancel the invoice.
  @Patch(':id/void')
  voidInvoice(@Param('id') id: string) {
    return this.invoices.voidInvoice(id);
  }
}
