import type { PrismaClient } from '../generated/prisma/client.js';

/**
 * Marks a plan invoice paid and applies what it pays for, in one transaction:
 * the plan and period it covers (a new plan brings its credit weights; a renewal keeps the old ones),
 * and a suspended company becomes active again when nothing else is overdue.
 * Used by the platform owner's "Confirm payment" and by the Stripe webhook.
 * Returns null when the invoice is not open (already paid or void), so a repeated webhook does nothing.
 */
export async function settleInvoice(
  db: PrismaClient,
  invoiceId: string,
  payment: { paymentRef: string; confirmedById: string | null },
): Promise<{ companyId: string; planId: string | null; reactivated: boolean } | null> {
  return db.$transaction(async (tx) => {
    // Lock the row so two confirmations (owner click + webhook, or a retried webhook) cannot both apply it.
    const locked = await tx.$queryRaw<Array<{ status: string }>>`SELECT status::text FROM invoices WHERE id = ${invoiceId}::uuid FOR UPDATE`;
    if (locked[0]?.status !== 'open') return null;
    const inv = await tx.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      select: { id: true, companyId: true, planId: true, periodStart: true, periodEnd: true, company: { select: { status: true } } },
    });
    const now = new Date();
    const stillOverdue = await tx.invoice.count({ where: { companyId: inv.companyId, status: 'open', dueAt: { lt: now }, id: { not: inv.id } } });
    const reactivated = inv.company.status === 'suspended' && stillOverdue === 0;
    const sub = await tx.subscription.findUnique({ where: { companyId: inv.companyId }, select: { planId: true } });
    const newPlan = inv.planId && sub?.planId !== inv.planId ? await tx.plan.findUnique({ where: { id: inv.planId }, select: { creditWeights: true } }) : null;

    await tx.invoice.update({ where: { id: inv.id }, data: { status: 'paid', paidAt: now, paymentRef: payment.paymentRef, confirmedById: payment.confirmedById } });
    if (inv.planId) {
      await tx.subscription.update({
        where: { companyId: inv.companyId },
        data: { planId: inv.planId, status: 'active', currentPeriodStart: inv.periodStart, currentPeriodEnd: inv.periodEnd, ...(newPlan ? { creditWeights: newPlan.creditWeights ?? undefined } : {}) },
      });
    }
    if (reactivated) await tx.company.update({ where: { id: inv.companyId }, data: { status: 'active' } });
    return { companyId: inv.companyId, planId: inv.planId, reactivated };
  });
}
