import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import { nextSkuNumber, skuPrefix } from './auto-sku.js';
import { DbService } from '../db/db.service.js';
import { AuditService } from '../audit/audit.service.js';
import { notFound, parse } from '../common/http.js';
import { PageQuery, pageArgs, paged, uuid } from '../common/paging.js';
import { changed } from '../common/diff.js';
import { uniqueOr409 } from '../common/prisma-errors.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { COMPANY_ROLES, type AuthUser } from '../auth/auth-user.js';

const Sku = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/, 'Letters, digits, dot, dash and underscore only');
const PartBody = z.object({
  sku: Sku,
  name: z.string().trim().min(2).max(200),
  category: z.string().trim().max(100).nullable().optional(),
  modelIds: z.array(z.uuid()).max(50).optional(), // miner models it fits; empty = any model
  unit: z.string().trim().min(1).max(20).optional(),
  minQty: z.number().int().min(0).max(1_000_000).optional(),
  isActive: z.boolean().optional(),
});
// On create the SKU may be left empty: the server makes one from the category (see autoSku).
const PartCreate = PartBody.extend({ sku: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), Sku.optional()) });
const PartPatch = PartBody.partial().refine((b) => Object.keys(b).length > 0, 'Nothing to update');
const PartQuery = PageQuery.extend({
  q: z.string().trim().max(100).optional(), // name or SKU
  category: z.string().max(100).optional(),
  active: z.enum(['true', 'false', 'all']).default('true'),
  siteId: z.uuid().optional(), // stock totals for this one site only
});

const select = { id: true, sku: true, name: true, category: true, modelIds: true, unit: true, minQty: true, isActive: true, createdAt: true } as const;
const SKU_TAKEN = ['SKU_TAKEN', 'Another part already uses this SKU'] as const;

// Catalog only. Stock in / out / adjust are ledger operations and come with the stock work (plan step 6).
// Delete removes a part only while nothing refers to it; a part with stock history is retired (isActive false) instead.
@Controller('parts')
export class PartsController {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  /** Stock totals cover only the sites this user may see. */
  @Roles(...COMPANY_ROLES)
  @Get()
  async list(@CurrentUser() me: AuthUser, @Query() query: unknown) {
    const q = parse(PartQuery, query);
    const where = {
      ...(q.active === 'all' ? {} : { isActive: q.active === 'true' }),
      ...(q.category ? { category: q.category } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' as const } }, { sku: { contains: q.q, mode: 'insensitive' as const } }] } : {}),
    };
    const db = this.db.tenant(me);
    const [rows, total] = await Promise.all([
      db.part.findMany({ where, select: { ...select, stock: { where: this.stockWhere(me, q.siteId), select: { qty: true } } }, orderBy: { name: 'asc' }, ...pageArgs(q) }),
      db.part.count({ where }),
    ]);
    return paged(
      rows.map(({ stock, ...p }) => {
        const totalQty = stock.reduce((a, s) => a + s.qty, 0);
        return { ...p, totalQty, belowMin: stock.some((s) => s.qty < p.minQty) };
      }),
      total,
      q,
    );
  }

  @Roles(...COMPANY_ROLES)
  @Get('categories')
  async categories(@CurrentUser() me: AuthUser) {
    const rows = await this.db.tenant(me).part.groupBy({ by: ['category'], where: { category: { not: null } }, orderBy: { category: 'asc' } });
    return rows.map((r) => r.category!);
  }

  @Roles(...COMPANY_ROLES)
  @Get(':id')
  async get(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const p = await this.db.tenant(me).part.findUnique({
      where: { id: parse(uuid, id) },
      select: { ...select, stock: { where: this.stockWhere(me), select: { qty: true, site: { select: { id: true, name: true } } } } },
    });
    if (!p) throw notFound('Part');
    const movements = await this.db.tenant(me).stockMovement.findMany({
      where: { partId: p.id, ...this.stockWhere(me) },
      select: { id: true, type: true, qty: true, reason: true, actorId: true, createdAt: true, site: { select: { name: true } }, job: { select: { id: true, number: true } } },
      orderBy: { id: 'desc' },
      take: 20,
    });
    const actorIds = [...new Set(movements.map((m) => m.actorId).filter((a): a is string => !!a))];
    const actors = new Map(
      (await this.db.raw.user.findMany({ where: { id: { in: actorIds }, companyId: me.companyId! }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]),
    );
    return {
      ...p,
      stock: p.stock.map((s) => ({ site: s.site, qty: s.qty, belowMin: s.qty < p.minQty })),
      movements: movements.map(({ actorId, ...m }) => ({ ...m, id: m.id.toString(), by: actorId ? (actors.get(actorId) ?? null) : null })),
    };
  }

  @Roles('company_admin', 'stock_keeper')
  @Post()
  async create(@CurrentUser() me: AuthUser, @Body() body: unknown, @Req() req: Request) {
    const { sku, ...data } = parse(PartCreate, body);
    await this.assertModels(me, data.modelIds);
    const db = this.db.tenant(me);
    let part;
    if (sku) {
      part = await uniqueOr409(db.part.create({ data: { ...data, sku, companyId: me.companyId! }, select }), ...SKU_TAKEN);
    } else {
      // Next free number for the prefix; retried if another save takes the same number at the same moment.
      const prefix = skuPrefix(data.category);
      for (let attempt = 0; ; attempt++) {
        const taken = await db.part.findMany({ where: { sku: { startsWith: `${prefix}-` } }, select: { sku: true } });
        const next = nextSkuNumber(prefix, taken.map((t) => t.sku)) + attempt;
        try {
          part = await db.part.create({ data: { ...data, sku: `${prefix}-${String(next).padStart(4, '0')}`, companyId: me.companyId! }, select });
          break;
        } catch (e) {
          if (attempt >= 4 || !(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
        }
      }
    }
    await this.audit.log({ companyId: me.companyId, actorUserId: me.id, action: 'part.created', entityType: 'part', entityId: part.id, after: part, ip: req.ip });
    return part;
  }

  @Roles('company_admin', 'stock_keeper')
  @Patch(':id')
  async update(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const data = parse(PartPatch, body);
    await this.assertModels(me, data.modelIds);
    const db = this.db.tenant(me);
    const before = await db.part.findUnique({ where: { id: parse(uuid, id) }, select });
    if (!before) throw notFound('Part');
    const after = await uniqueOr409(db.part.update({ where: { id }, data, select }), ...SKU_TAKEN);
    await this.audit.log({
      companyId: me.companyId, actorUserId: me.id, action: 'part.updated', entityType: 'part', entityId: id,
      before: changed(before, data), after: changed(after, data), ip: req.ip,
    });
    return after;
  }

  /**
   * Removes a part from the catalog. A part that was ever received, issued, transferred or requested is retired
   * instead (isActive false): the stock ledger and old jobs keep pointing at it, and it leaves every picker.
   */
  @Roles('company_admin', 'stock_keeper')
  @Delete(':id')
  async remove(@CurrentUser() me: AuthUser, @Param('id') id: string, @Req() req: Request) {
    const partId = parse(uuid, id);
    const result = await this.db.tenantTx(me, async (tx) => {
      const before = await tx.part.findUnique({ where: { id: partId }, select });
      if (!before) throw notFound('Part');
      const [moves, used, transfers, requests, held] = await Promise.all([
        tx.stockMovement.count({ where: { partId } }),
        tx.jobPart.count({ where: { partId } }),
        tx.stockTransfer.count({ where: { partId } }),
        tx.partRequest.count({ where: { partId } }),
        tx.siteStock.count({ where: { partId, qty: { gt: 0 } } }),
      ]);
      if (moves + used + transfers + requests + held > 0) {
        await tx.part.update({ where: { id: partId }, data: { isActive: false } });
        return { before, outcome: 'retired' as const };
      }
      await tx.siteStock.deleteMany({ where: { partId } });
      await tx.part.delete({ where: { id: partId } });
      return { before, outcome: 'deleted' as const };
    });
    await this.audit.log({
      companyId: me.companyId, actorUserId: me.id, action: result.outcome === 'deleted' ? 'part.deleted' : 'part.retired',
      entityType: 'part', entityId: partId, before: result.before, ip: req.ip,
    });
    return { outcome: result.outcome };
  }

  /** Stock rows this user may see; with siteId, only that site (and nothing if it is not one of theirs). */
  private stockWhere(me: AuthUser, siteId?: string) {
    if (siteId) return { siteId: me.siteIds === null || me.siteIds.includes(siteId) ? siteId : { in: [] as string[] } };
    return me.siteIds === null ? {} : { siteId: { in: me.siteIds } };
  }

  /** The shared list plus the company's own models (RLS hides other companies' models). */
  private async assertModels(me: AuthUser, ids?: string[]) {
    if (!ids?.length) return;
    const found = await this.db.tenant(me).minerModel.count({ where: { id: { in: ids } } });
    if (found !== new Set(ids).size) throw notFound('Miner model');
  }
}
