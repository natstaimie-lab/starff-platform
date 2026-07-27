import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { Roles } from '../auth/roles.decorator';

@ApiTags('clients')
@ApiBearerAuth()
@Controller('clients')
@Roles(Role.ADMIN, Role.RECRUITER)
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Post()
  create(@Body() dto: CreateClientDto) {
    return this.clients.create(dto);
  }

  @Get()
  findAll(@Query('includeArchived') includeArchived?: string) {
    return this.clients.findAll({ includeArchived: includeArchived === 'true' });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clients.findOne(id);
  }

  // Archive / restore (soft-delete). Day-to-day staff action — reversible.
  @Patch(':id/archive')
  archive(@Param('id') id: string, @Body('archived') archived?: boolean) {
    return this.clients.setArchived(id, archived ?? true);
  }

  // Permanent delete — ADMIN ONLY (method-level role overrides the class default).
  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.clients.remove(id);
  }
}
