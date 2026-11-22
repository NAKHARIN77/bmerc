import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service.js';
import { parse } from '../common/http.js';
import { PageQuery, pageArgs, paged } from '../common/paging.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth-user.js';
import { LogView } from './log-view.js';

const AuditQuery = PageQuery.extend({
  action: z.string().max(100).optional(), // prefix, e.g. "view." or "auth."
  actorUserId: z.uuid().optional(),
});

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  /** Company admin: this company's log only, newest first. */
  @Roles('company_admin')
  @LogView('audit_log')
  @Get()
  async list(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    const q = parse(AuditQuery, query);
    const where = {
      companyId: user.companyId!,
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.actorUserId ? { actorUserId: q.actorUserId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, ...pageArgs(q) }),
      this.prisma.auditLog.count({ where }),
    ]);
    const actors = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.actorUserId).filter((x): x is string => !!x))] } },
      select: { id: true, fullName: true, email: true },
    });
    const byId = new Map(actors.map((a) => [a.id, a]));
    return paged(
      rows.map((r) => ({ ...r, id: r.id.toString(), actor: r.actorUserId ? (byId.get(r.actorUserId) ?? null) : null })),
      total,
      q,
    );
  }
}
