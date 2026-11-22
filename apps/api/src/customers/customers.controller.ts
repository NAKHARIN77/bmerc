import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { DbService } from '../db/db.service.js';
import { AuditService } from '../audit/audit.service.js';
import { LogView } from '../audit/log-view.js';
import { conflict, notFound, parse } from '../common/http.js';
import { PageQuery, pageArgs, paged, uuid } from '../common/paging.js';
import { changed } from '../common/diff.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth-user.js';

const text = (max: number) => z.string().trim().max(max).nullable().optional();
const CustomerBody = z.object({
  name: z.string().trim().min(2).max(200),
  contactName: text(200),
  email: z.email().nullable().optional(),
  phone: text(50),
  country: text(100),
});
const CustomerPatch = CustomerBody.partial().refine((b) => Object.keys(b).length > 0, 'Nothing to update');
const CustomerQuery = PageQuery.extend({ q: z.string().trim().max(100).optional(), country: z.string().max(100).optional() });

const detail = { id: true, name: true, contactName: true, email: true, phone: true, country: true, createdAt: true } as const;

// Customers belong to the whole company (not one site), so everyone who receives jobs can pick from the full list.
// Contact details (email, phone) only come back from the detail endpoint, and each read is logged.
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  @Roles('company_admin', 'site_manager', 'head_technician')
  @Get()
  async list(@CurrentUser() me: AuthUser, @Query() query: unknown) {
    const q = parse(CustomerQuery, query);
    const where = {
      ...(q.q ? { name: { contains: q.q, mode: 'insensitive' as const } } : {}),
      ...(q.country ? { country: q.country } : {}),
    };
    const db = this.db.tenant(me);
    const [rows, total] = await Promise.all([
      db.customer.findMany({
        where,
        select: { id: true, name: true, country: true, _count: { select: { sites: true, jobs: { where: { status: { notIn: ['qc_passed', 'dispatched'] } } } } } },
        orderBy: { name: 'asc' },
        ...pageArgs(q),
      }),
      db.customer.count({ where }),
    ]);
    return paged(rows.map(({ _count, ...c }) => ({ ...c, sites: _count.sites, openJobs: _count.jobs })), total, q);
  }

  @Roles('company_admin', 'site_manager', 'head_technician')
  @LogView('customer')
  @Get(':id')
  async get(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const c = await this.db.tenant(me).customer.findUnique({
      where: { id: parse(uuid, id) },
      select: { ...detail, sites: { select: { id: true, name: true, country: true, province: true, status: true }, orderBy: { name: 'asc' } } },
    });
    if (!c) throw notFound('Customer');
    return c;
  }

  @Roles('company_admin')
  @Post()
  async create(@CurrentUser() me: AuthUser, @Body() body: unknown, @Req() req: Request) {
    const data = parse(CustomerBody, body);
    const c = await this.db.tenant(me).customer.create({ data: { ...data, companyId: me.companyId! }, select: detail });
    await this.audit.log({ companyId: me.companyId, actorUserId: me.id, action: 'customer.created', entityType: 'customer', entityId: c.id, after: c, ip: req.ip });
    return c;
  }

  @Roles('company_admin')
  @Patch(':id')
  async update(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const data = parse(CustomerPatch, body);
    const db = this.db.tenant(me);
    const before = await db.customer.findUnique({ where: { id: parse(uuid, id) }, select: detail });
    if (!before) throw notFound('Customer');
    const after = await db.customer.update({ where: { id }, data, select: detail });
    await this.audit.log({
      companyId: me.companyId, actorUserId: me.id, action: 'customer.updated', entityType: 'customer', entityId: id,
      before: changed(before, data), after: changed(after, data), ip: req.ip,
    });
    return after;
  }

  /** Only customers with no devices, jobs or sites; anything with history stays for the device record. */
  @Roles('company_admin')
  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() me: AuthUser, @Param('id') id: string, @Req() req: Request) {
    const db = this.db.tenant(me);
    const c = await db.customer.findUnique({
      where: { id: parse(uuid, id) },
      select: { ...detail, _count: { select: { devices: true, jobs: true, sites: true } } },
    });
    if (!c) throw notFound('Customer');
    const { _count, ...before } = c;
    if (_count.devices || _count.jobs || _count.sites) {
      throw conflict('IN_USE', 'This customer has devices, jobs or sites and cannot be deleted', _count);
    }
    await db.customer.delete({ where: { id } });
    await this.audit.log({ companyId: me.companyId, actorUserId: me.id, action: 'customer.deleted', entityType: 'customer', entityId: id, before, ip: req.ip });
  }
}
