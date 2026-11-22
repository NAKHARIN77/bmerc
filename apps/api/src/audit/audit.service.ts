import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AuditEntry {
  companyId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(e: AuditEntry) {
    await this.prisma.auditLog.create({
      data: {
        companyId: e.companyId ?? null,
        actorUserId: e.actorUserId ?? null,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        before: (e.before ?? undefined) as never,
        after: (e.after ?? undefined) as never,
        ip: e.ip,
      },
    });
  }
}
