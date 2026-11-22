import { Controller, Get, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../db/db.service.js';
import { notFound, parse } from '../common/http.js';
import { PageQuery, pageArgs, paged, uuid } from '../common/paging.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { COMPANY_ROLES, type AuthUser } from '../auth/auth-user.js';
import { jobScope } from '../auth/scope.js';
import { LogView } from '../audit/log-view.js';
import { JobStatus } from '../generated/prisma/enums.js';

const JobsQuery = PageQuery.extend({
  status: z.enum(JobStatus).optional(),
  siteId: z.uuid().optional(),
  assigneeId: z.uuid().optional(),
  q: z.string().trim().max(100).optional(), // job number, serial or customer name
  customerId: z.uuid().optional(),
  open: z.enum(['true']).optional(), // not yet passed QC
  assigned: z.enum(['true']).optional(), // held by a technician
});
const SummaryQuery = z.object({ siteId: z.uuid().optional(), customerId: z.uuid().optional() });
const DONE: JobStatus[] = ['qc_passed', 'dispatched'];

const listSelect = {
  id: true, number: true, status: true, priority: true, reportedFault: true, receivedAt: true, updatedAt: true,
  device: { select: { id: true, kind: true, model: true, serialNo: true } },
  customer: { select: { id: true, name: true } },
  site: { select: { id: true, name: true } },
  assignee: { select: { id: true, fullName: true } },
} as const;

// Read side only for now; create / assign / transition come with the repair workflow (plan step 6).
@Controller('jobs')
export class JobsController {
  constructor(private readonly db: DbService) {}

  @Roles(...COMPANY_ROLES)
  @Get()
  async list(@CurrentUser() me: AuthUser, @Query() query: unknown) {
    const q = parse(JobsQuery, query);
    const where = {
      AND: [
        jobScope(me),
        q.status ? { status: q.status } : {},
        q.siteId ? { siteId: q.siteId } : {},
        q.assigneeId ? { assigneeId: q.assigneeId } : {},
        q.customerId ? { customerId: q.customerId } : {},
        q.open ? { status: { notIn: DONE } } : {},
        q.assigned ? { assigneeId: { not: null } } : {},
        q.q
          ? {
              OR: [
                { number: { contains: q.q, mode: 'insensitive' as const } },
                { device: { serialNo: { contains: q.q, mode: 'insensitive' as const } } },
                { customer: { name: { contains: q.q, mode: 'insensitive' as const } } },
              ],
            }
          : {},
      ],
    };
    const db = this.db.tenant(me);
    const [items, total] = await Promise.all([
      db.job.findMany({ where, select: listSelect, orderBy: { receivedAt: 'desc' }, ...pageArgs(q) }),
      db.job.count({ where }),
    ]);
    return paged(items, total, q);
  }

  /** Job counts by status for the KPI cards and filter tabs, within what this user may see. */
  @Roles(...COMPANY_ROLES)
  @Get('summary')
  async summary(@CurrentUser() me: AuthUser, @Query() query: unknown) {
    const q = parse(SummaryQuery, query);
    const rows = await this.db.tenant(me).job.groupBy({
      by: ['status'],
      where: { AND: [jobScope(me), q.siteId ? { siteId: q.siteId } : {}, q.customerId ? { customerId: q.customerId } : {}] },
      _count: { _all: true },
    });
    const byStatus = Object.fromEntries(Object.values(JobStatus).map((s) => [s, 0])) as Record<JobStatus, number>;
    for (const r of rows) byStatus[r.status] = r._count._all;
    const total = Object.values(byStatus).reduce((a, n) => a + n, 0);
    return { total, open: total - byStatus.qc_passed - byStatus.dispatched, byStatus };
  }

  /** Includes customer contact details, so every view is logged. Out-of-scope jobs return 404. */
  @Roles(...COMPANY_ROLES)
  @LogView('job')
  @Get(':id')
  async get(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const job = await this.db.tenant(me).job.findFirst({
      where: { AND: [{ id: parse(uuid, id) }, jobScope(me)] },
      select: {
        ...listSelect,
        workNote: true, unrepairableReason: true, qcPassedAt: true, dispatchedAt: true,
        device: { select: { id: true, kind: true, model: true, serialNo: true, hashrateTh: true, qrCode: true } },
        customer: { select: { id: true, name: true, contactName: true, email: true, phone: true } },
        events: { select: { id: true, fromStatus: true, toStatus: true, actorId: true, note: true, createdAt: true }, orderBy: { id: 'asc' } },
        parts: { select: { id: true, qty: true, part: { select: { id: true, name: true, sku: true, unit: true } } } },
        components: { select: { id: true, component: true, serialNo: true, replacementSerialNo: true, workDone: true, result: true } },
      },
    });
    if (!job) throw notFound('Job');
    return { ...job, events: job.events.map((e) => ({ ...e, id: e.id.toString() })) };
  }
}
