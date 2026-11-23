import { Controller, Get, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../db/db.service.js';
import { forbidden, notFound, parse } from '../common/http.js';
import { PageQuery, pageArgs, paged, uuid } from '../common/paging.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { COMPANY_ROLES, TEAM_ROLES, type AuthUser } from '../auth/auth-user.js';
import { canSeeSite, jobScope } from '../auth/scope.js';
import { LogView } from '../audit/log-view.js';
import { JobStatus } from '../generated/prisma/enums.js';
import { allowedActions } from './permissions.js';

const JobsQuery = PageQuery.extend({
  status: z.enum(JobStatus).optional(),
  siteId: z.uuid().optional(),
  assigneeId: z.uuid().optional(),
  q: z.string().trim().max(100).optional(), // job number, serial or customer name
  customerId: z.uuid().optional(),
  open: z.enum(['true']).optional(), // not yet passed QC
  active: z.enum(['true']).optional(), // not yet returned to the customer (the bench board)
  assigned: z.enum(['true']).optional(), // held by a technician
  mine: z.enum(['true']).optional(), // assigned to me
});
const SummaryQuery = z.object({ siteId: z.uuid().optional(), customerId: z.uuid().optional() });
const AssigneesQuery = z.object({ siteId: z.uuid() });
const DONE: JobStatus[] = ['qc_passed', 'dispatched'];

const listSelect = {
  id: true, number: true, status: true, priority: true, reportedFault: true, workNote: true, receivedAt: true, updatedAt: true,
  device: { select: { id: true, kind: true, model: true, serialNo: true, qrCode: true } },
  customer: { select: { id: true, name: true } },
  site: { select: { id: true, name: true } },
  assignee: { select: { id: true, fullName: true } },
  qcPassedAt: true,
  // Latest bench test and label print, for the board cards.
  tests: { select: { passed: true, testedOn: true, workDone: true }, orderBy: { createdAt: 'desc' as const }, take: 1 },
  qrPrintLogs: { select: { printedAt: true }, orderBy: { id: 'desc' as const }, take: 1 },
} as const;

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
        q.active ? { status: { not: 'dispatched' as const } } : {},
        q.assigned ? { assigneeId: { not: null } } : {},
        q.mine ? { assigneeId: me.id } : {},
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

  /** Technicians who can take jobs at a site. A head technician only sees their own team. */
  @Roles('company_admin', 'site_manager', 'head_technician')
  @Get('assignees')
  async assignees(@CurrentUser() me: AuthUser, @Query() query: unknown) {
    const { siteId } = parse(AssigneesQuery, query);
    if (!canSeeSite(me, siteId)) throw forbidden();
    const teams = await this.db.tenant(me).team.findMany({
      where: { siteId, ...(me.role === 'head_technician' ? { id: me.teamId ?? '' } : {}) },
      select: { id: true, name: true },
    });
    const users = await this.db.raw.user.findMany({
      where: { companyId: me.companyId!, isActive: true, role: { in: TEAM_ROLES }, teamId: { in: teams.map((t) => t.id) } },
      select: { id: true, fullName: true, role: true, teamId: true },
      orderBy: { fullName: 'asc' },
    });
    const teamName = new Map(teams.map((t) => [t.id, t.name]));
    const load = await this.workload(me, users.map((u) => u.id));
    return users.map((u) => ({
      id: u.id, fullName: u.fullName, role: u.role, teamId: u.teamId, team: teamName.get(u.teamId!) ?? null,
      openJobs: load.get(u.id)?.open ?? 0,
    }));
  }

  /**
   * Technicians this user oversees with how many jobs each holds (prototype "Technician job cards").
   * Admin: every team; site manager: teams at their sites; head technician: their own team.
   */
  @Roles('company_admin', 'site_manager', 'head_technician')
  @Get('technicians')
  async technicians(@CurrentUser() me: AuthUser) {
    const teams = await this.db.tenant(me).team.findMany({
      where: me.role === 'head_technician' ? { id: me.teamId ?? '' } : me.siteIds === null ? {} : { siteId: { in: me.siteIds } },
      select: { id: true, name: true, site: { select: { id: true, name: true } } },
    });
    const users = await this.db.raw.user.findMany({
      where: { companyId: me.companyId!, isActive: true, role: { in: TEAM_ROLES }, teamId: { in: teams.map((t) => t.id) } },
      select: { id: true, fullName: true, role: true, teamId: true },
      orderBy: { fullName: 'asc' },
    });
    const team = new Map(teams.map((t) => [t.id, t]));
    const load = await this.workload(me, users.map((u) => u.id));
    return users.map((u) => {
      const t = team.get(u.teamId!)!;
      return { id: u.id, fullName: u.fullName, role: u.role, team: { id: t.id, name: t.name }, site: t.site, openJobs: load.get(u.id)?.open ?? 0, atQc: load.get(u.id)?.qc ?? 0 };
    });
  }

  /** Jobs held per technician: open (not yet at QC) and waiting at QC to be returned. */
  private async workload(me: AuthUser, userIds: string[]) {
    const rows = await this.db.tenant(me).job.groupBy({
      by: ['assigneeId', 'status'],
      where: { assigneeId: { in: userIds }, status: { not: 'dispatched' } },
      _count: { _all: true },
    });
    const out = new Map<string, { open: number; qc: number }>();
    for (const r of rows) {
      const m = out.get(r.assigneeId!) ?? { open: 0, qc: 0 };
      if (r.status === 'qc_passed') m.qc += r._count._all;
      else if (r.status !== 'unrepairable') m.open += r._count._all;
      out.set(r.assigneeId!, m);
    }
    return out;
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
        assigneeId: true, siteId: true,
        unrepairableReason: true, qcPassedAt: true, dispatchedAt: true,
        device: { select: { id: true, kind: true, model: true, serialNo: true, hashrateTh: true, qrCode: true } },
        customer: { select: { id: true, name: true, contactName: true, email: true, phone: true } },
        events: { select: { id: true, fromStatus: true, toStatus: true, actorId: true, note: true, createdAt: true }, orderBy: { id: 'asc' } },
        parts: { select: { id: true, qty: true, part: { select: { id: true, name: true, sku: true, unit: true } } }, orderBy: { id: 'asc' } },
        components: { select: { id: true, component: true, serialNo: true, replacementSerialNo: true, workDone: true, result: true } },
        tests: { select: { id: true, testedOn: true, testedById: true, workDone: true, results: true, passed: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
        qrPrintLogs: { select: { id: true, printedBy: true, copies: true, printedAt: true }, orderBy: { id: 'desc' } },
        invoice: { select: { id: true, number: true, status: true, currency: true, totalCents: true, paidCents: true } },
      },
    });
    if (!job) throw notFound('Job');
    const actorIds = [...new Set([...job.events.map((e) => e.actorId), ...job.tests.map((t) => t.testedById), ...job.qrPrintLogs.map((l) => l.printedBy)].filter((a): a is string => !!a))];
    const actors = new Map(
      (await this.db.raw.user.findMany({ where: { id: { in: actorIds }, companyId: me.companyId! }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]),
    );
    const { assigneeId, siteId, ...rest } = job;
    return {
      ...rest,
      events: job.events.map((e) => ({ ...e, id: e.id.toString(), by: e.actorId ? (actors.get(e.actorId) ?? null) : null })),
      tests: job.tests.map(({ testedById, ...t }) => ({ ...t, testedBy: actors.get(testedById) ?? null })),
      qrPrintLogs: job.qrPrintLogs.map(({ printedBy, ...l }) => ({ ...l, id: l.id.toString(), by: actors.get(printedBy) ?? null })),
      can: { ...allowedActions(me, { status: job.status, assigneeId, siteId }), bill: me.role === 'company_admin' || me.role === 'site_manager' },
    };
  }
}
