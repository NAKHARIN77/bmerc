import type { StockMovementType } from '../generated/prisma/enums.js';
import type { TenantTx } from '../prisma/tenant.js';
import { conflict } from '../common/http.js';

export interface Move {
  companyId: string;
  siteId: string;
  partId: string;
  type: StockMovementType;
  /** Signed: + in, - out. For adjust, the difference between counted and current. */
  delta: number;
  jobId?: string | null;
  reason?: string | null;
  actorId: string;
}

/**
 * One stock movement (design doc section 7): lock the site_stock row, write the ledger entry, update the balance.
 * Must run inside a tenant transaction. Refuses to go below zero and says how many are left.
 */
export async function moveStock(tx: TenantTx, m: Move) {
  // Make sure the row exists, then lock it so two people cannot take the last part at once.
  await tx.$executeRaw`
    INSERT INTO site_stock (company_id, site_id, part_id, qty) VALUES (${m.companyId}::uuid, ${m.siteId}::uuid, ${m.partId}::uuid, 0)
    ON CONFLICT (site_id, part_id) DO NOTHING`;
  const [row] = await tx.$queryRaw<Array<{ qty: number }>>`
    SELECT qty FROM site_stock WHERE site_id = ${m.siteId}::uuid AND part_id = ${m.partId}::uuid FOR UPDATE`;
  const before = row?.qty ?? 0;
  const after = before + m.delta;
  if (after < 0) {
    throw conflict('STOCK_INSUFFICIENT', `Only ${before} left at this site`, { available: before, requested: -m.delta });
  }
  const movement = await tx.stockMovement.create({
    data: {
      companyId: m.companyId, siteId: m.siteId, partId: m.partId, type: m.type, qty: m.delta,
      jobId: m.jobId ?? null, reason: m.reason ?? null, actorId: m.actorId,
    },
    select: { id: true },
  });
  await tx.siteStock.update({ where: { siteId_partId: { siteId: m.siteId, partId: m.partId } }, data: { qty: after } });
  return { movementId: movement.id, before, after };
}
