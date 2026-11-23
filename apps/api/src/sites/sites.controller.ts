import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { DbService } from '../db/db.service.js';
import { AuditService } from '../audit/audit.service.js';
import { notFound, parse } from '../common/http.js';
import { uuid } from '../common/paging.js';
import { changed } from '../common/diff.js';
import { assertSiteSlot } from '../common/limits.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { COMPANY_ROLES, type AuthUser } from '../auth/auth-user.js';
import { jobScope, siteScope } from '../auth/scope.js';
import { LogView } from '../audit/log-view.js';
import { SiteStatus } from '../generated/prisma/enums.js';

const text = (max: number) => z.string().trim().max(max).nullable().optional();
const SiteBody = z.object({
  name: z.string().trim().min(2).max(200),
  country: text(100),
  province: text(100),
  address: text(500),
  status: z.enum(SiteStatus).optional(),
});
const SitePatch = SiteBody.partial().refine((b) => Object.keys(b).length > 0, 'Nothing to update');

const select = {
  id: true, name: true, country: true, province: true, address: true, status: true, createdAt: true,
  teams: { select: { id: true, name: true, headUserId: true }, orderBy: { name: 'asc' as const } },
} as const;

// A site is a branch of the repair center (not a customer location).
// No delete: sites carry stock and job history. Set status to inactive instead.
@Controller('sites')
export class SitesController {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  @Roles(...COMPANY_ROLES)
  @Get()
  async list(@CurrentUser() me: AuthUser) {
    const db = this.db.tenant(me);
    const sites = await db.site.findMany({ where: siteScope(me), select, orderBy: { name: 'asc' } });
    // Number of different parts each site has in stock (prototype "Parts" column).
    const stocked = await db.siteStock.groupBy({ by: ['siteId'], where: { siteId: { in: sites.map((s) => s.id) }, qty: { gt: 0 } }, _count: { _all: true } });
    const count = new Map(stocked.map((r) => [r.siteId, r._count._all]));
    return sites.map((s) => ({ ...s, partsStocked: count.get(s.id) ?? 0 }));
  }

  @Roles(...COMPANY_ROLES)
  @Get(':id')
  async get(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const site = await this.db.tenant(me).site.findFirst({ where: { AND: [{ id: parse(uuid, id) }, siteScope(me)] }, select });
    if (!site) throw notFound('Site');
    return site;
  }

  /**
   * Customers who sent devices to this site, who they are, and every device and job they sent here.
   * Customers belong to the whole company (design doc Q1); this view is derived from the site's jobs.
   * Includes contact details, so each read is logged.
   */
  @Roles('company_admin', 'site_manager', 'head_technician')
  @LogView('site_customers')
  @Get(':id/customers')
  async customers(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const siteId = parse(uuid, id);
    const db = this.db.tenant(me);
    const site = await db.site.findFirst({ where: { AND: [{ id: siteId }, siteScope(me)] }, select: { id: true } });
    if (!site) throw notFound('Site');
    const jobs = await db.job.findMany({
      where: { AND: [{ siteId }, jobScope(me)] },
      orderBy: { receivedAt: 'desc' },
      take: 1000,
      select: {
        id: true, number: true, status: true, reportedFault: true, receivedAt: true, dispatchedAt: true,
        device: { select: { id: true, kind: true, model: true, serialNo: true, qrCode: true } },
        customer: { select: { id: true, name: true, contactName: true, email: true, phone: true, country: true } },
      },
    });
    const byCustomer = new Map<string, { customer: (typeof jobs)[number]['customer']; jobs: Array<Omit<(typeof jobs)[number], 'customer'>> }>();
    for (const { customer, ...job } of jobs) {
      const row = byCustomer.get(customer.id) ?? { customer, jobs: [] };
      row.jobs.push(job);
      byCustomer.set(customer.id, row);
    }
    return [...byCustomer.values()]
      .map(({ customer, jobs: list }) => ({
        ...customer,
        devices: new Set(list.map((j) => j.device.id)).size,
        openJobs: list.filter((j) => j.status !== 'qc_passed' && j.status !== 'dispatched').length,
        lastReceivedAt: list[0].receivedAt,
        jobs: list,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Counts toward the plan's site limit unless created as inactive. */
  @Roles('company_admin')
  @Post()
  async create(@CurrentUser() me: AuthUser, @Body() body: unknown, @Req() req: Request) {
    const data = parse(SiteBody, body);
    if (data.status !== 'inactive') await assertSiteSlot(this.db.raw, me.companyId!);
    const site = await this.db.tenant(me).site.create({ data: { ...data, companyId: me.companyId! }, select });
    await this.audit.log({ companyId: me.companyId, actorUserId: me.id, action: 'site.created', entityType: 'site', entityId: site.id, after: data, ip: req.ip });
    return site;
  }

  @Roles('company_admin')
  @Patch(':id')
  async update(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const data = parse(SitePatch, body);
    const db = this.db.tenant(me);
    const before = await db.site.findUnique({ where: { id: parse(uuid, id) } });
    if (!before) throw notFound('Site');
    if (before.status === 'inactive' && data.status && data.status !== 'inactive') {
      await assertSiteSlot(this.db.raw, me.companyId!);
    }
    await db.site.update({ where: { id }, data });
    const after = await db.site.findUniqueOrThrow({ where: { id } });
    await this.audit.log({
      companyId: me.companyId, actorUserId: me.id, action: 'site.updated', entityType: 'site', entityId: id,
      before: changed(before, data), after: changed(after, data), ip: req.ip,
    });
    return db.site.findUniqueOrThrow({ where: { id }, select });
  }

}
