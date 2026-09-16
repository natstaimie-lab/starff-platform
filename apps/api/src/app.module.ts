import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CandidatesModule } from './candidates/candidates.module';
import { EnquiriesModule } from './enquiries/enquiries.module';
import { ClientsModule } from './clients/clients.module';
import { JobsModule } from './jobs/jobs.module';
import { ShiftsModule } from './shifts/shifts.module';
import { TimesheetsModule } from './timesheets/timesheets.module';
import { InvoicesModule } from './invoices/invoices.module';
import { MeModule } from './me/me.module';
import { ClientPortalModule } from './client-portal/client-portal.module';
import { MessagesModule } from './messages/messages.module';
import { AiModule } from './ai/ai.module';
import { StatsModule } from './stats/stats.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RegistrationModule } from './registration/registration.module';
import { StaffModule } from './staff/staff.module';
import { AuditModule } from './audit/audit.module';
import { MatchingModule } from './matching/matching.module';
import { ApplicationsModule } from './applications/applications.module';
import { ReliabilityModule } from './reliability/reliability.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    // Rate limiting (per client IP). A generous default so a site full of
    // workers behind one WiFi never trips it, while gross abuse / scraping /
    // brute force is stopped. Costlier routes (e.g. the AI assistant) set
    // tighter per-route limits with @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),
    PrismaModule,
    AuditModule,
    AuthModule,
    CandidatesModule,
    EnquiriesModule,
    ClientsModule,
    JobsModule,
    ShiftsModule,
    TimesheetsModule,
    InvoicesModule,
    MeModule,
    ClientPortalModule,
    MessagesModule,
    AiModule,
    StatsModule,
    NotificationsModule,
    RegistrationModule,
    StaffModule,
    MatchingModule,
    ApplicationsModule,
    ReliabilityModule,
  ],
  providers: [
    // Apply the rate limiter globally to every route.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
