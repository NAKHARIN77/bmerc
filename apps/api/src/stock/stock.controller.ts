import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { DbService } from '../db/db.service.js';
import { AuditService } from '../audit/audit.service.js';
import { conflict, forbidden, notFound, parse } from '../common/http.js';
import { PageQuery, paged } from '../common/paging.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { COMPANY_ROLES, type AuthUser } from '../auth/auth-user.js';
import { canSeeSite } from '../auth/scope.js';
import type { StockMovementType } from '../generated/prisma/enums.js';
import { moveStock } from './ledger.js';

const StockQuery = PageQuery.extend({
  siteId: z.uuid().optional(),
  q: z.string().trim().max(100).optional(), // part name or SKU
  level: z.enum(['all', 'low', 'out']).default('all'),
});
const Base = z.object({ siteId: z.uuid(), partId: z.uuid() });
const InBody = Base.extend({ qty: z.number().int().min(1).max(1_000_000), reason: z.string().trim().max(500).optional() });
const OutBody = Base.extend({ qty: z.number().int().min(1).max(1_000_000), reason: z.string().trim().min(3).max(500) });
const AdjustBody = Base.extend({ countedQty: z.number().int().min(0).max(1_000_000), reason: z.string().trim().min(3).max(500) });

type Level = 'ok' | 'low' | 'out';
const levelOf = (qty: number, min: number): Level => (qty <= 0 ? 'out' : qty < min ? 'low' : 'ok');

/** Stock per site. Using parts in a job goes through POST /jobs/:id/parts so the job records them. */
@Controller('stock')
export class StockController {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  @Roles(...COMPANY_ROLES)
  @Get()
  async list(@CurrentUser() me: AuthUser, @Query() query: unknown) {
    const q = parse(StockQuery, query);
    const siteWhere = q.siteId ? (canSeeSite(me, q.siteId) ? { siteId: q.siteId } : { siteId: { in: [] as string[] } }) : me.siteIds === null ? {} : { siteId: { in: me.siteIds } };
    const rows = await this.db.tenant(me).siteStock.findMany({
      where: {
        ...siteWhere,
        part: { isActive: true, ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' as const } }, { sku: { contains: q.q, mode: 'insensitive' as const } }] } : {}) },
      },
      select: { qty: true, site: { select: { id: true, name: true } }, part: { select: { id: true, name: true, sku: true, unit: true, minQty: true, category: true, modelIds: true } } },
      orderBy: [{ part: { name: 'asc' } }, { site: { name: 'asc' } }],
    });
    const all = rows.map((r) => ({ ...r, level: levelOf(r.qty, r.part.minQty) }));
    const shown = q.level === 'all' ? all : all.filter((r) => r.level === q.level);
    const start = (q.page - 1) * q.limit;
    return {
      ...paged(shown.slice(start, start + q.limit), shown.length, q),
      counts: { skus: new Set(all.map((r) => r.part.id)).size, low: all.filter((r) => r.level === 'low').length, out: all.filter((r) => r.level === 'out').length },
    };
  }

  @Roles('company_admin', 'site_manager', 'stock_keeper')
  @Post('in')
  stockIn(@CurrentUser() me: AuthUser, @Body() body: unknown, @Req() req: Request) {
    const b = parse(InBody, body);
    return this.move(me, req, b.siteId, b.partId, 'in', () => b.qty, b.reason || 'Stock received');
  }

  @Roles('company_admin', 'site_manager', 'stock_keeper')
  @Post('out')
  stockOut(@CurrentUser() me: AuthUser, @Body() body: unknown, @Req() req: Request) {
    const b = parse(OutBody, body);
    return this.move(me, req, b.siteId, b.partId, 'out', () => -b.qty, b.reason);
  }

  /** Set the count after a physical check. The reason is required. */
  @Roles('company_admin', 'site_manager', 'stock_keeper')
  @Post('adjust')
  adjust(@CurrentUser() me: AuthUser, @Body() body: unknown, @Req() req: Request) {
    const b = parse(AdjustBody, body);
    return this.move(me, req, b.siteId, b.partId, 'adjust', (current) => b.countedQty - current, b.reason);
  }

  private async move(me: AuthUser, req: Request, siteId: string, partId: string, type: StockMovementType, delta: (current: number) => number, reason: string) {
    if (!canSeeSite(me, siteId)) throw forbidden('You cannot change stock at this site');
    const out = await this.db.tenantTx(me, async (tx) => {
      const [site, part] = await Promise.all([
        tx.site.findUnique({ where: { id: siteId }, select: { id: true } }),
        tx.part.findUnique({ where: { id: partId }, select: { id: true, isActive: true } }),
      ]);
      if (!site) throw notFound('Site');
      if (!part) throw notFound('Part');
      if (!part.isActive && type === 'in') throw conflict('PART_INACTIVE', 'This part is no longer in the catalog');
      // Lock before reading, so an adjustment is computed from the count nobody else is changing.
      const [row] = await tx.$queryRaw<Array<{ qty: number }>>`SELECT qty FROM site_stock WHERE site_id = ${siteId}::uuid AND part_id = ${partId}::uuid FOR UPDATE`;
      const current = row?.qty ?? 0;
      const d = delta(current);
      if (d === 0) return { before: current, after: current, movementId: null };
      return moveStock(tx, { companyId: me.companyId!, siteId, partId, type, delta: d, reason, actorId: me.id });
    });
    if (out.movementId !== null) {
      await this.audit.log({
        companyId: me.companyId, actorUserId: me.id, action: `stock.${type}`, entityType: 'part', entityId: partId,
        before: { siteId, qty: out.before }, after: { siteId, qty: out.after, reason }, ip: req.ip,
      });
    }
    return { qty: out.after };
  }
}
