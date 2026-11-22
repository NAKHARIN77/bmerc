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
import { siteScope } from '../auth/scope.js';
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
  list(@CurrentUser() me: AuthUser) {
    return this.db.tenant(me).site.findMany({ where: siteScope(me), select, orderBy: { name: 'asc' } });
  }

  @Roles(...COMPANY_ROLES)
  @Get(':id')
  async get(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const site = await this.db.tenant(me).site.findFirst({ where: { AND: [{ id: parse(uuid, id) }, siteScope(me)] }, select });
    if (!site) throw notFound('Site');
    return site;
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
