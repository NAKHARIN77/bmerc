import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { DbService } from '../db/db.service.js';
import { AuditService } from '../audit/audit.service.js';
import { conflict, forbidden, notFound, parse } from '../common/http.js';
import { uuid } from '../common/paging.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { COMPANY_ROLES, type AuthUser } from '../auth/auth-user.js';
import { canSeeSite, jobScope } from '../auth/scope.js';
import type { TenantTx } from '../prisma/tenant.js';
import type { Prisma } from '../generated/prisma/client.js';
import { moveStock } from '../stock/ledger.js';
import { canWork } from './permissions.js';

// Part requests (decided 2026-11-24): a technician asks for parts for a job; the stock keeper, a site manager,
// the company admin or the team's head technician approves (parts leave the job's site stock and go on the job)
// or rejects with a reason. Asking moves a job in repair to Waiting for parts; when the last request is decided
// the job goes back to In repair.

const RequestBody = z.object({
  partId: z.uuid(),
  qty: z.number().int().min(1).max(10_000),
  note: z.string().trim().max(500).optional(),
});
const RejectBody = z.object({ reason: z.string().trim().min(3, 'Say why').max(500) });
const ListQuery = z.object({ status: z.enum(['pending', 'all']).default('pending'), jobId: z.uuid().optional() });

const DECIDERS = ['stock_keeper', 'company_admin', 'site_manager', 'head_technician'] as const;
const canDecide = (me: AuthUser, siteId: string) => (DECIDERS as readonly string[]).includes(me.role ?? '') && canSeeSite(me, siteId);
const OPEN_FOR_REQUESTS = ['todo', 'in_repair', 'waiting_parts'] as const;

const select = {
  id: true, qty: true, note: true, status: true, createdAt: true, decidedAt: true, decisionNote: true,
  requestedById: true, decidedById: true, siteId: true, partId: true,
  part: { select: { id: true, name: true, sku: true, unit: true } },
  job: { select: { id: true, number: true, status: true, assigneeId: true, device: { select: { model: true } } } },
  site: { select: { id: true, name: true } },
} satisfies Prisma.PartRequestSelect;

@Controller()
export class PartRequestsController {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  /** Ask for parts for a job. */
  @Roles(...COMPANY_ROLES)
  @Post('jobs/:id/part-requests')
  async create(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const b = parse(RequestBody, body);
    const out = await this.db.tenantTx(me, async (tx) => {
      const job = await this.lockJob(tx, me, id);
      if (!canWork(me, job)) throw forbidden('You cannot ask for parts on this job');
      if (!(OPEN_FOR_REQUESTS as readonly string[]).includes(job.status)) throw conflict('JOB_CLOSED', 'Parts can only be asked for while the job is open');
      const part = await tx.part.findUnique({ where: { id: b.partId }, select: { id: true, name: true, isActive: true } });
      if (!part) throw notFound('Part');
      if (!part.isActive) throw conflict('PART_INACTIVE', 'This part is no longer in the catalog');
      const r = await tx.partRequest.create({
        data: { companyId: me.companyId!, jobId: job.id, siteId: job.siteId, partId: part.id, qty: b.qty, note: b.note || null, requestedById: me.id },
        select: { id: true },
      });
      const what = `${b.qty} × ${part.name}`;
      if (job.status === 'in_repair') await this.setStatus(tx, me, job, 'waiting_parts', `Asked for ${what}`);
      else await tx.jobEvent.create({ data: { companyId: me.companyId!, jobId: job.id, fromStatus: job.status, toStatus: job.status, actorId: me.id, note: `Asked for ${what}` } });
      return { r, job };
    });
    await this.audit.log({ companyId: me.companyId, actorUserId: me.id, action: 'part_request.created', entityType: 'part_request', entityId: out.r.id, after: { jobId: out.job.id, ...b }, ip: req.ip });
    return out.r;
  }

  /** Requests the user may see: deciders see their sites, technicians see their own jobs. With jobId, that job's requests. */
  @Roles(...COMPANY_ROLES)
  @Get('part-requests')
  async list(@CurrentUser() me: AuthUser, @Query() query: unknown) {
    const q = parse(ListQuery, query);
    const db = this.db.tenant(me);
    let where: Prisma.PartRequestWhereInput;
    if (q.jobId) {
      const job = await db.job.findFirst({ where: { AND: [{ id: q.jobId }, jobScope(me)] }, select: { id: true } });
      if (!job) throw notFound('Job');
      where = { jobId: job.id };
    } else if (me.role === 'technician') {
      where = { OR: [{ requestedById: me.id }, { job: { assigneeId: me.id } }] };
    } else {
      where = me.siteIds === null ? {} : { siteId: { in: me.siteIds } };
    }
    if (q.status === 'pending') where = { AND: [where, { status: 'pending' }] };
    const rows = await db.partRequest.findMany({ where, select, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 200 });
    const people = [...new Set(rows.flatMap((r) => [r.requestedById, r.decidedById]).filter((x): x is string => !!x))];
    const names = new Map((await this.db.raw.user.findMany({ where: { id: { in: people }, companyId: me.companyId! }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]));
    const stock = await db.siteStock.findMany({ where: { OR: rows.map((r) => ({ siteId: r.siteId, partId: r.partId })) }, select: { siteId: true, partId: true, qty: true } });
    const left = new Map(stock.map((s) => [`${s.siteId}:${s.partId}`, s.qty]));
    return rows.map(({ requestedById, decidedById, siteId, partId, ...r }) => ({
      ...r,
      requestedBy: names.get(requestedById) ?? null,
      decidedBy: decidedById ? (names.get(decidedById) ?? null) : null,
      inStock: left.get(`${siteId}:${partId}`) ?? 0,
      canDecide: r.status === 'pending' && canDecide(me, siteId),
      canCancel: r.status === 'pending' && requestedById === me.id,
    }));
  }

  /** Number waiting for a decision at the user's sites (menu badge). */
  @Roles(...DECIDERS)
  @Get('part-requests/pending-count')
  async pending(@CurrentUser() me: AuthUser) {
    const count = await this.db.tenant(me).partRequest.count({ where: { status: 'pending', ...(me.siteIds === null ? {} : { siteId: { in: me.siteIds } }) } });
    return { count };
  }

  /** Approve: take the parts out of the job's site stock and put them on the job. */
  @Roles(...DECIDERS)
  @Post('part-requests/:id/approve')
  async approve(@CurrentUser() me: AuthUser, @Param('id') id: string, @Req() req: Request) {
    const out = await this.db.tenantTx(me, async (tx) => {
      const r = await this.lockRequest(tx, me, id);
      if (!canDecide(me, r.siteId)) throw forbidden('You cannot approve requests at this site');
      const job = await this.lockJob(tx, me, r.jobId, true);
      if (!(OPEN_FOR_REQUESTS as readonly string[]).includes(job.status)) throw conflict('JOB_CLOSED', `Job ${job.number} is no longer open. Reject this request instead`);
      const m = await moveStock(tx, { companyId: me.companyId!, siteId: r.siteId, partId: r.partId, type: 'out', delta: -r.qty, jobId: job.id, reason: `Used in ${job.number} (request approved)`, actorId: me.id });
      const jp = await tx.jobPart.create({ data: { companyId: me.companyId!, jobId: job.id, partId: r.partId, qty: r.qty, movementId: m.movementId }, select: { id: true } });
      await tx.partRequest.update({ where: { id: r.id }, data: { status: 'approved', decidedById: me.id, decidedAt: new Date(), jobPartId: jp.id } });
      await this.resumeIfDone(tx, me, job, `Parts given: ${r.qty} × ${r.part.name}`);
      return { r, m };
    });
    await this.audit.log({ companyId: me.companyId, actorUserId: me.id, action: 'part_request.approved', entityType: 'part_request', entityId: out.r.id, before: { qty: out.m.before }, after: { qty: out.m.after, jobId: out.r.jobId }, ip: req.ip });
    return { status: 'approved', left: out.m.after };
  }

  @Roles(...DECIDERS)
  @Post('part-requests/:id/reject')
  async reject(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const { reason } = parse(RejectBody, body);
    const r = await this.db.tenantTx(me, async (tx) => {
      const r = await this.lockRequest(tx, me, id);
      if (!canDecide(me, r.siteId)) throw forbidden('You cannot reject requests at this site');
      await tx.partRequest.update({ where: { id: r.id }, data: { status: 'rejected', decidedById: me.id, decidedAt: new Date(), decisionNote: reason } });
      const job = await this.lockJob(tx, me, r.jobId, true);
      await this.resumeIfDone(tx, me, job, `Request for ${r.qty} × ${r.part.name} rejected: ${reason}`);
      return r;
    });
    await this.audit.log({ companyId: me.companyId, actorUserId: me.id, action: 'part_request.rejected', entityType: 'part_request', entityId: r.id, after: { reason }, ip: req.ip });
    return { status: 'rejected' };
  }

  /** The person who asked takes the request back while it is still waiting. */
  @Roles(...COMPANY_ROLES)
  @Post('part-requests/:id/cancel')
  async cancel(@CurrentUser() me: AuthUser, @Param('id') id: string, @Req() req: Request) {
    const r = await this.db.tenantTx(me, async (tx) => {
      const r = await this.lockRequest(tx, me, id);
      if (r.requestedById !== me.id) throw forbidden('Only the person who asked can cancel this request');
      await tx.partRequest.update({ where: { id: r.id }, data: { status: 'cancelled', decidedById: me.id, decidedAt: new Date() } });
      const job = await this.lockJob(tx, me, r.jobId, true);
      await this.resumeIfDone(tx, me, job, `Request for ${r.qty} × ${r.part.name} cancelled`);
      return r;
    });
    await this.audit.log({ companyId: me.companyId, actorUserId: me.id, action: 'part_request.cancelled', entityType: 'part_request', entityId: r.id, ip: req.ip });
    return { status: 'cancelled' };
  }

  private async lockRequest(tx: TenantTx, me: AuthUser, id: string) {
    const rid = parse(uuid, id);
    await tx.$queryRaw`SELECT id FROM part_requests WHERE id = ${rid}::uuid FOR UPDATE`;
    const r = await tx.partRequest.findUnique({ where: { id: rid }, select: { id: true, jobId: true, siteId: true, partId: true, qty: true, status: true, requestedById: true, part: { select: { name: true } } } });
    // Deciders see their sites; anyone else only requests they made.
    if (!r || !(canSeeSite(me, r.siteId) || r.requestedById === me.id)) throw notFound('Part request');
    if (r.status !== 'pending') throw conflict('REQUEST_CLOSED', `This request is already ${r.status}`);
    return r;
  }

  /** Lock the job. Deciders reach jobs at their sites even when the job scope (team) would hide them. */
  private async lockJob(tx: TenantTx, me: AuthUser, id: string, bySite = false) {
    const jobId = parse(uuid, id);
    await tx.$queryRaw`SELECT id FROM jobs WHERE id = ${jobId}::uuid FOR UPDATE`;
    const job = await tx.job.findFirst({
      where: bySite ? { id: jobId } : { AND: [{ id: jobId }, jobScope(me)] },
      select: { id: true, number: true, status: true, assigneeId: true, siteId: true },
    });
    if (!job || (bySite && !canSeeSite(me, job.siteId) && !(await tx.job.count({ where: { AND: [{ id: jobId }, jobScope(me)] } })))) throw notFound('Job');
    return job;
  }

  private async setStatus(tx: TenantTx, me: AuthUser, job: { id: string; status: string }, to: 'in_repair' | 'waiting_parts', note: string) {
    await tx.job.update({ where: { id: job.id }, data: { status: to } });
    await tx.jobEvent.create({ data: { companyId: me.companyId!, jobId: job.id, fromStatus: job.status as never, toStatus: to, actorId: me.id, note } });
  }

  /** After a decision: a job waiting for parts goes back to In repair once nothing is pending; always leave a note. */
  private async resumeIfDone(tx: TenantTx, me: AuthUser, job: { id: string; status: string }, note: string) {
    const pending = await tx.partRequest.count({ where: { jobId: job.id, status: 'pending' } });
    if (job.status === 'waiting_parts' && pending === 0) return this.setStatus(tx, me, job, 'in_repair', note);
    await tx.jobEvent.create({ data: { companyId: me.companyId!, jobId: job.id, fromStatus: job.status as never, toStatus: job.status as never, actorId: me.id, note } });
  }
}
