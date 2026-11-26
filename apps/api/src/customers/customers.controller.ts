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

// Customers ship devices to the repair center; they never log in. They belong to the whole company (not one site),
// so everyone who receives jobs can pick from the full list.
// Contact details: the list shows email and phone to admins and site managers; the contact person
// only comes back from the detail endpoint. Every read that includes contact details is logged.
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  @Roles('company_admin', 'site_manager', 'head_technician')
  @Get()
  async list(@CurrentUser() me: AuthUser, @Query() query: unknown, @Req() req: Request) {
    const q = parse(CustomerQuery, query);
    const withEmail = me.role === 'company_admin' || me.role === 'site_manager';
    const like = q.q ? { contains: q.q, mode: 'insensitive' as const } : undefined;
    const where = {
      ...(like ? { OR: [{ name: like }, ...(withEmail ? [{ email: like }] : [])] } : {}),
      ...(q.country ? { country: q.country } : {}),
    };
    const db = this.db.tenant(me);
    const [rows, total] = await Promise.all([
      db.customer.findMany({
        where,
        select: { id: true, name: true, country: true, email: withEmail, phone: withEmail, _count: { select: { devices: true, jobs: { where: { status: { notIn: ['qc_passed', 'dispatched'] } } } } } },
        orderBy: { name: 'asc' },
        ...pageArgs(q),
      }),
      db.customer.count({ where }),
    ]);
    if (withEmail && rows.length) {
      await this.audit.log({ companyId: me.companyId, actorUserId: me.id, action: 'view.customer_list', entityType: 'customer', after: { query: q }, ip: req.ip });
    }
    return paged(rows.map(({ _count, ...c }) => ({ ...c, devices: _count.devices, openJobs: _count.jobs })), total, q);
  }

  /** Totals for the KPI cards and the country filter. No contact details. */
  @Roles('company_admin', 'site_manager', 'head_technician')
  @Get('summary')
  async summary(@CurrentUser() me: AuthUser) {
    const db = this.db.tenant(me);
    const [customers, devicesIn, openJobs, countries] = await Promise.all([
      db.customer.count(),
      db.device.count({ where: { jobs: { some: { status: { not: 'dispatched' } } } } }), // still at the repair center
      db.job.count({ where: { status: { notIn: ['qc_passed', 'dispatched'] } } }),
      db.customer.groupBy({ by: ['country'], where: { country: { not: null } }, orderBy: { country: 'asc' } }),
    ]);
    return { customers, devicesIn, openJobs, countries: countries.map((c) => c.country!) };
  }

  @Roles('company_admin', 'site_manager', 'head_technician')
  @LogView('customer')
  @Get(':id')
  async get(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const c = await this.db.tenant(me).customer.findUnique({
      where: { id: parse(uuid, id) },
      select: {
        ...detail,
        devices: { select: { id: true, kind: true, model: true, serialNo: true, qrCode: true }, orderBy: { createdAt: 'desc' }, take: 50 },
      },
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

  /** Only customers with no devices or jobs; anything with history stays for the device record. */
  @Roles('company_admin')
  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() me: AuthUser, @Param('id') id: string, @Req() req: Request) {
    const db = this.db.tenant(me);
    const c = await db.customer.findUnique({
      where: { id: parse(uuid, id) },
      select: { ...detail, _count: { select: { devices: true, jobs: true } } },
    });
    if (!c) throw notFound('Customer');
    const { _count, ...before } = c;
    if (_count.devices || _count.jobs) {
      throw conflict('IN_USE', 'This customer has devices or jobs and cannot be deleted', _count);
    }
    await db.customer.delete({ where: { id } });
    await this.audit.log({ companyId: me.companyId, actorUserId: me.id, action: 'customer.deleted', entityType: 'customer', entityId: id, before, ip: req.ip });
  }
}
