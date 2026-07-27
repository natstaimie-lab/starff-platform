import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditInput {
  /** platform user (uuid) who performed the action, if known */
  actorId?: string | null;
  /** dotted action name, e.g. "job.approved", "application.booked" */
  action: string;
  /** entity type, e.g. "Job", "Application", "Shift" */
  entity: string;
  entityId: string;
  /** any extra structured context (rates, notes, before/after, etc.) */
  meta?: Prisma.InputJsonValue;
}

/**
 * Central audit trail writer. The AuditLog table existed but was never written
 * to — every controlled-workflow action routes through here so we get a
 * tamper-evident history of who did what. Best-effort: a failed audit write is
 * logged but never throws, so it can't roll back the business action.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: input.actorId ?? null,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId,
          meta: input.meta ?? undefined,
        },
      });
    } catch (e) {
      this.logger.warn(`audit write failed for ${input.action}: ${(e as Error).message}`);
    }
  }
}
