import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DocumentStatus, Role } from '@prisma/client';
import { CandidatesService } from './candidates.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

@ApiTags('candidates')
@ApiBearerAuth()
@Controller('candidates')
export class CandidatesController {
  constructor(private readonly candidates: CandidatesService) {}

  // Any logged-in user (a new sign-up) can create their own candidate profile.
  @Post()
  create(@Body() dto: CreateCandidateDto) {
    return this.candidates.create(dto);
  }

  // Staff only — browse all candidates.
  @Get()
  @Roles(Role.ADMIN, Role.RECRUITER)
  findAll(
    @Query('status') status?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.candidates.findAll({
      status,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
      includeArchived: includeArchived === 'true',
    });
  }

  // A candidate fetches their own profile.
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.candidates.findByUserId(user.id);
  }

  // Staff only — view one candidate in full.
  @Get(':id')
  @Roles(Role.ADMIN, Role.RECRUITER)
  findOne(@Param('id') id: string) {
    return this.candidates.findOne(id);
  }

  // Owner (their own profile) or staff. Status changes are staff-only (enforced in the service).
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCandidateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.candidates.update(id, dto, user);
  }

  // Staff — verify / reject a candidate's compliance document.
  @Patch(':id/documents/:docId')
  @Roles(Role.ADMIN, Role.RECRUITER)
  setDocStatus(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Body('status') status: DocumentStatus,
    @CurrentUser() user: AuthUser,
  ) {
    return this.candidates.setDocumentStatus(id, docId, status, user.id);
  }

  // Staff — get a short-lived link to view a private document file.
  @Get(':id/documents/:docId/url')
  @Roles(Role.ADMIN, Role.RECRUITER)
  docUrl(@Param('id') id: string, @Param('docId') docId: string) {
    return this.candidates.documentUrl(id, docId);
  }

  // Archive / restore (soft-delete). Day-to-day staff action — reversible.
  @Patch(':id/archive')
  @Roles(Role.ADMIN, Role.RECRUITER)
  archive(@Param('id') id: string, @Body('archived') archived?: boolean) {
    return this.candidates.setArchived(id, archived ?? true);
  }

  // Permanent delete — ADMIN ONLY, irreversible.
  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.candidates.remove(id);
  }
}
