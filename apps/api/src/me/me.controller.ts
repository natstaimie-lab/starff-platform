import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { MeService } from './me.service';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
@Roles(Role.CANDIDATE)
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  profile(@CurrentUser() user: AuthUser) {
    return this.me.profile(user.id);
  }

  @Get('offers')
  offers() {
    return this.me.offers();
  }

  @Post('offers/:shiftId/accept')
  accept(@CurrentUser() user: AuthUser, @Param('shiftId') shiftId: string) {
    return this.me.acceptOffer(user.id, shiftId);
  }

  // ── Open jobs the candidate can apply to ──
  @Get('jobs')
  openJobs(@CurrentUser() user: AuthUser) {
    return this.me.openJobs(user.id);
  }

  @Post('jobs/:id/apply')
  apply(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.me.applyToJob(user.id, id);
  }

  // ── Shift check-in ──
  @Post('shifts/:id/acknowledge')
  ackShift(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.me.acknowledgeShift(user.id, id);
  }

  @Post('shifts/:id/check-in')
  checkIn(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.me.checkIn(user.id, id);
  }

  @Post('shifts/:id/check-out')
  checkOut(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.me.checkOut(user.id, id);
  }

  @Post('shifts/:id/report-late')
  reportLate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.me.reportLate(user.id, id);
  }

  // ── Job invitations (admin invited this candidate; they confirm interest) ──
  @Get('invitations')
  invitations(@CurrentUser() user: AuthUser) {
    return this.me.invitations(user.id);
  }

  @Post('invitations/:id/respond')
  respond(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: { response: 'INTERESTED' | 'UNAVAILABLE' | 'DECLINE' | 'INFO'; note?: string },
  ) {
    return this.me.respondToInvitation(user.id, id, dto.response, dto.note);
  }

  @Put('availability')
  setAvailability(@CurrentUser() user: AuthUser, @Body('days') days: number[]) {
    return this.me.setAvailability(user.id, days ?? []);
  }

  @Post('timesheets/:shiftId')
  submitTimesheet(@CurrentUser() user: AuthUser, @Param('shiftId') shiftId: string) {
    return this.me.submitTimesheet(user.id, shiftId);
  }

  @Post('documents')
  addDocument(
    @CurrentUser() user: AuthUser,
    @Body() dto: { type: string; fileUrl: string; fileName?: string },
  ) {
    return this.me.addDocument(user.id, dto);
  }

  // ── Employment history ──
  @Get('employment')
  listEmployment(@CurrentUser() user: AuthUser) {
    return this.me.listEmployment(user.id);
  }

  @Post('employment')
  addEmployment(
    @CurrentUser() user: AuthUser,
    @Body() dto: { employer: string; jobTitle?: string; startDate?: string; endDate?: string; current?: boolean; reasonForLeaving?: string },
  ) {
    return this.me.addEmployment(user.id, dto);
  }

  @Delete('employment/:id')
  removeEmployment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.me.removeEmployment(user.id, id);
  }

  // ── References ──
  @Get('references')
  listReferences(@CurrentUser() user: AuthUser) {
    return this.me.listReferences(user.id);
  }

  @Post('references')
  addReference(
    @CurrentUser() user: AuthUser,
    @Body() dto: { name: string; relationship?: string; company?: string; email?: string; phone?: string },
  ) {
    return this.me.addReference(user.id, dto);
  }

  @Delete('references/:id')
  removeReference(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.me.removeReference(user.id, id);
  }

  // ── Declarations, consent, agreement & e-signature ──
  @Put('declarations')
  setDeclarations(
    @CurrentUser() user: AuthUser,
    @Body() dto: { healthDeclaration?: boolean; healthNotes?: string; consentGdpr?: boolean; agreementAccepted?: boolean; signatureName?: string },
  ) {
    return this.me.setDeclarations(user.id, dto);
  }
}
