import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ClientPortalService } from './client-portal.service';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

@ApiTags('client-portal')
@ApiBearerAuth()
@Controller('client')
@Roles(Role.CLIENT)
export class ClientPortalController {
  constructor(private readonly svc: ClientPortalService) {}

  @Get('me')
  me(@CurrentUser() u: AuthUser) {
    return this.svc.me(u.id);
  }

  // Employer self-signup from the mobile app. @Roles() (empty) overrides the
  // class-level CLIENT requirement so a brand-new employer — who has no CLIENT
  // role yet — can create their company. Idempotent.
  @Post('register-company')
  @Roles()
  registerCompany(
    @CurrentUser() u: AuthUser,
    @Body() dto: { companyName: string; firstName?: string; lastName?: string; phone?: string },
  ) {
    return this.svc.registerCompany(u.id, u.email, dto);
  }

  @Get('overview')
  overview(@CurrentUser() u: AuthUser) {
    return this.svc.overview(u.id);
  }

  @Get('jobs')
  jobs(@CurrentUser() u: AuthUser) {
    return this.svc.jobs(u.id);
  }

  @Post('jobs')
  createJob(
    @CurrentUser() u: AuthUser,
    @Body()
    dto: {
      title: string;
      payRate: number;
      chargeRate: number;
      openings?: number;
      siteId?: string;
      sector?: string;
      description?: string;
      ppe?: string;
      uniform?: string;
      siteInstructions?: string;
      reportingContact?: string;
      reportingInstructions?: string;
      requiredQualifications?: string;
      experienceRequirements?: string;
      transportRequirements?: string;
      clientRequirements?: string;
      bookingUrgency?: string;
      breakInfo?: string;
      notes?: string;
      startDate?: string;
      endDate?: string;
      recurrenceDays?: number[];
      shiftStartTime?: string;
      shiftEndTime?: string;
      openEnded?: boolean;
    },
  ) {
    return this.svc.createJob(u.id, dto);
  }

  @Get('jobs/:id')
  job(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.job(u.id, id);
  }

  @Patch('jobs/:id')
  updateJob(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body()
    dto: {
      title?: string;
      payRate?: number;
      chargeRate?: number;
      openings?: number;
      siteId?: string | null;
      sector?: string;
      description?: string;
      ppe?: string;
      uniform?: string;
      siteInstructions?: string;
      reportingContact?: string;
      reportingInstructions?: string;
      requiredQualifications?: string;
      experienceRequirements?: string;
      transportRequirements?: string;
      clientRequirements?: string;
      bookingUrgency?: string;
      breakInfo?: string;
      notes?: string;
      startDate?: string | null;
      endDate?: string | null;
      recurrenceDays?: number[];
      shiftStartTime?: string | null;
      shiftEndTime?: string | null;
      openEnded?: boolean;
      responseNote?: string;
    },
  ) {
    return this.svc.updateJob(u.id, id, dto);
  }

  @Post('jobs/:id/request-change')
  requestChange(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: { note: string }) {
    return this.svc.requestChange(u.id, id, dto?.note ?? '');
  }

  // ── Candidate submissions from Starff + the client's decision ──
  @Get('submissions')
  submissions(@CurrentUser() u: AuthUser) {
    return this.svc.submissions(u.id);
  }

  @Post('submissions/:id/decision')
  decideSubmission(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: { decision: 'ACCEPT' | 'REJECT' | 'ALTERNATIVE'; note?: string },
  ) {
    return this.svc.decideSubmission(u.id, id, dto.decision, dto.note);
  }

  @Post('submissions/:id/request-replacement')
  requestReplacement(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: { reason?: string }) {
    return this.svc.requestReplacement(u.id, id, dto?.reason);
  }

  @Post('shifts/:id/report-absent')
  reportAbsent(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: { note?: string }) {
    return this.svc.reportAbsent(u.id, id, dto?.note);
  }

  @Get('workers')
  workers(@CurrentUser() u: AuthUser) {
    return this.svc.workers(u.id);
  }

  @Get('workers/:id')
  workerDetail(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.workerDetail(u.id, id);
  }

  @Get('timesheets')
  timesheets(@CurrentUser() u: AuthUser) {
    return this.svc.timesheets(u.id);
  }

  @Patch('timesheets/:id/approve')
  approve(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.approveTimesheet(u.id, id);
  }

  @Get('invoices/:id')
  invoiceOne(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.invoice(u.id, id);
  }

  @Get('invoices')
  invoices(@CurrentUser() u: AuthUser) {
    return this.svc.invoices(u.id);
  }

  @Post('invoices/:id/contest')
  contestInvoice(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: { reason: string }) {
    return this.svc.contestInvoice(u.id, id, body?.reason);
  }

  @Get('locations')
  locations(@CurrentUser() u: AuthUser) {
    return this.svc.locations(u.id);
  }

  // ── Onboarding ──
  @Patch('profile')
  updateProfile(
    @CurrentUser() u: AuthUser,
    @Body() dto: { name?: string; industry?: string; companyRegNo?: string; addressLine1?: string; city?: string; postcode?: string; billingEmail?: string; paymentTerms?: number },
  ) {
    return this.svc.updateProfile(u.id, dto);
  }

  @Put('agreement')
  setAgreement(@CurrentUser() u: AuthUser, @Body() dto: { agreementAccepted?: boolean; signatureName?: string }) {
    return this.svc.setAgreement(u.id, dto);
  }

  @Post('locations')
  addLocation(@CurrentUser() u: AuthUser, @Body() dto: { name: string; addressLine1?: string; city?: string; postcode?: string }) {
    return this.svc.addLocation(u.id, dto);
  }

  @Delete('locations/:id')
  removeLocation(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.removeLocation(u.id, id);
  }

  @Get('contacts')
  contacts(@CurrentUser() u: AuthUser) {
    return this.svc.listContacts(u.id);
  }

  @Post('contacts')
  addContact(@CurrentUser() u: AuthUser, @Body() dto: { firstName: string; lastName: string; email: string; phone?: string; jobTitle?: string }) {
    return this.svc.addContact(u.id, dto);
  }

  @Delete('contacts/:id')
  removeContact(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.removeContact(u.id, id);
  }
}
