import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { DbService } from '../db/db.service.js';
import { AuditService } from '../audit/audit.service.js';
import { conflict, forbidden, notFound, parse } from '../common/http.js';
import { uuid } from '../common/paging.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth-user.js';
import { canSeeSite } from '../auth/scope.js';
import type { TenantTx } from '../prisma/tenant.js';
import { moveStock } from './ledger.js';

// Parts sent between sites (decided 2026-11-22): the sending site books them out at once, the receiving
// site books them in when they arrive. Cancelling while in transit books them back in at the sender.

const SendBody = z.object({
  fromSiteId: z.uuid(),
  toSiteId: z.uuid(),
  partId: z.uuid(),
  qty: z.number().int().min(1).max(1_000_000),
  note: z.string().trim().max(500).optional(),
});
const ListQuery = z.object({ status: z.enum(['in_transit', 'received', 'cancelled', 'all']).default('all') });

const select = {
  id: true, qty: true, status: true, note: true, sentAt: true, closedAt: true, sentById: true, closedById: true,
  fromSite: { select: { id: true, name: true } },
  toSite: { select: { id: true, name: true } },
  part: { select: { id: true, name: true, sku: true, unit: true } },
} as const;

@Controller('stock')
@Roles('company_admin', 'site_manager', 'stock_keeper')
export class TransfersController {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  /** Every active site of the company, so a site manager can send to a site they do not manage. */
  @Get('transfer-sites')
  sites(@CurrentUser() me: AuthUser) {
    return this.db.tenant(me).site.findMany({ where: { status: { not: 'inactive' } }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }

  /** Transfers into or out of the sites this user may see, newest first. */
  @Get('transfers')
  async list(@CurrentUser() me: AuthUser, @Query() query: unknown) {
    const { status } = parse(ListQuery, query);
    const mine = me.siteIds === null ? {} : { OR: [{ fromSiteId: { in: me.siteIds } }, { toSiteId: { in: me.siteIds } }] };
    const rows = await this.db.tenant(me).stockTransfer.findMany({ where: { ...mine, ...(status === 'all' ? {} : { status }) }, select, orderBy: { sentAt: 'desc' }, take: 200 });
    const ids = [...new Set(rows.flatMap((r) => [r.sentById, r.closedById]).filter((x): x is string => !!x))];
    const names = new Map((await this.db.raw.user.findMany({ where: { id: { in: ids }, companyId: me.companyId! }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]));
    return rows.map(({ sentById, closedById, ...r }) => ({
      ...r,
      sentBy: names.get(sentById) ?? null,
      closedBy: closedById ? (names.get(closedById) ?? null) : null,
      canReceive: r.status === 'in_transit' && canSeeSite(me, r.toSite.id),
      canCancel: r.status === 'in_transit' && canSeeSite(me, r.fromSite.id),
    }));
  }

  @Post('transfers')
  async send(@CurrentUser() me: AuthUser, @Body() body: unknown, @Req() req: Request) {
    const b = parse(SendBody, body);
    if (b.fromSiteId === b.toSiteId) throw conflict('SAME_SITE', 'Pick a different site to send to');
    if (!canSeeSite(me, b.fromSiteId)) throw forbidden('You can only send parts from your own sites');
    const t = await this.db.tenantTx(me, async (tx) => {
      const [from, to, part] = await Promise.all([
        tx.site.findUnique({ where: { id: b.fromSiteId }, select: { name: true } }),
        tx.site.findUnique({ where: { id: b.toSiteId }, select: { name: true, status: true } }),
        tx.part.findUnique({ where: { id: b.partId }, select: { isActive: true } }),
      ]);
      if (!from || !to) throw notFound('Site');
      if (to.status === 'inactive') throw conflict('SITE_INACTIVE', 'That site is inactive');
      if (!part) throw notFound('Part');
      await moveStock(tx, { companyId: me.companyId!, siteId: b.fromSiteId, partId: b.partId, type: 'out', delta: -b.qty, reason: `Transfer to ${to.name}`, actorId: me.id });
      return tx.stockTransfer.create({ data: { companyId: me.companyId!, ...b, note: b.note || null, sentById: me.id }, select: { id: true } });
    });
    await this.audit.log({ companyId: me.companyId, actorUserId: me.id, action: 'stock.transfer_sent', entityType: 'stock_transfer', entityId: t.id, after: b, ip: req.ip });
    return t;
  }

  /** The receiving site confirms the parts arrived; they are booked in there. */
  @Post('transfers/:id/receive')
  receive(@CurrentUser() me: AuthUser, @Param('id') id: string, @Req() req: Request) {
    return this.close(me, id, 'received', req);
  }

  /** The sender takes back a transfer still in transit; the parts return to the sending site. */
  @Post('transfers/:id/cancel')
  cancel(@CurrentUser() me: AuthUser, @Param('id') id: string, @Req() req: Request) {
    return this.close(me, id, 'cancelled', req);
  }

  private async close(me: AuthUser, id: string, to: 'received' | 'cancelled', req: Request) {
    await this.db.tenantTx(me, async (tx: TenantTx) => {
      const tid = parse(uuid, id);
      await tx.$queryRaw`SELECT id FROM stock_transfers WHERE id = ${tid}::uuid FOR UPDATE`;
      const t = await tx.stockTransfer.findUnique({ where: { id: tid }, select: { ...select, fromSiteId: true, toSiteId: true, partId: true } });
      if (!t || !(canSeeSite(me, t.fromSiteId) || canSeeSite(me, t.toSiteId))) throw notFound('Transfer');
      if (t.status !== 'in_transit') throw conflict('TRANSFER_CLOSED', 'This transfer is already closed');
      const site = to === 'received' ? t.toSiteId : t.fromSiteId;
      if (!canSeeSite(me, site)) throw forbidden(to === 'received' ? 'Only the receiving site can confirm arrival' : 'Only the sending site can cancel');
      await moveStock(tx, {
        companyId: me.companyId!, siteId: site, partId: t.partId, type: 'in', delta: t.qty, actorId: me.id,
        reason: to === 'received' ? `Transfer from ${t.fromSite.name}` : `Transfer to ${t.toSite.name} cancelled`,
      });
      await tx.stockTransfer.update({ where: { id: t.id }, data: { status: to, closedById: me.id, closedAt: new Date() } });
    });
    await this.audit.log({ companyId: me.companyId, actorUserId: me.id, action: `stock.transfer_${to}`, entityType: 'stock_transfer', entityId: id, ip: req.ip });
    return { status: to };
  }
}
