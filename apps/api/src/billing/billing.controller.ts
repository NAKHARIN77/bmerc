import { Body, Controller, Get, HttpStatus, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { DbService } from '../db/db.service.js';
import { AuditService } from '../audit/audit.service.js';
import { LogView } from '../audit/log-view.js';
import { ApiError, conflict, notFound, parse } from '../common/http.js';
import { uuid } from '../common/paging.js';
import { limitsFor, usageFor } from '../common/limits.js';
import { planVatBps, taxOn } from '../common/region.js';
import { AllowSuspended, CurrentUser, Roles } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth-user.js';
import { Prisma } from '../generated/prisma/client.js';
import { cardPaymentsOn, stripe } from './stripe.js';

// Company side of plan billing (prototype Subscription, Checkout, Choose payment method, Receipt).
// Two ways to pay: report a bank transfer (the platform owner confirms it in Pending payments), or pay by card
// through Stripe Checkout when STRIPE_SECRET_KEY is set (the Stripe webhook confirms it). Paying an invoice
// for another plan moves the company to it.

const CheckoutBody = z.object({ planId: z.uuid() });
const NotifyBody = z.object({ method: z.enum(['bank_transfer']), reference: z.string().trim().min(3).max(200) });
const DAY = 86_400_000;

const invoiceSelect = {
  id: true, number: true, periodStart: true, periodEnd: true, amountCents: true, taxRateBps: true, taxCents: true, currency: true,
  status: true, dueAt: true, paidAt: true, paymentRef: true, slipUploadedAt: true, createdAt: true,
  plan: { select: { id: true, name: true } },
} as const;
type InvoiceRow = Prisma.InvoiceGetPayload<{ select: typeof invoiceSelect }>;
const view = (i: InvoiceRow, now = new Date()) => ({ ...i, totalCents: i.amountCents + i.taxCents, overdue: i.status === 'open' && i.dueAt < now, reported: !!i.slipUploadedAt });

@Controller('billing')
@Roles('company_admin')
@AllowSuspended() // a suspended company must still be able to pay
export class BillingController {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  /** Current plan, usage, the plans on offer and the billing details printed on invoices. */
  @Get('subscription')
  async subscription(@CurrentUser() me: AuthUser) {
    const companyId = me.companyId!;
    const [company, plans, limits, usage] = await Promise.all([
      this.db.raw.company.findUniqueOrThrow({
        where: { id: companyId },
        select: {
          name: true, legalName: true, taxId: true, billingEmail: true, billingAddress: true, country: true, status: true,
          subscription: { select: { status: true, currentPeriodStart: true, currentPeriodEnd: true, plan: { select: { id: true, code: true, name: true, priceCents: true } } } },
        },
      }),
      this.db.raw.plan.findMany({ where: { isActive: true, priceCents: { gt: 0 } }, orderBy: { priceCents: 'asc' } }),
      limitsFor(this.db.raw, companyId),
      usageFor(this.db.raw, companyId),
    ]);
    return {
      company,
      vatBps: planVatBps(company.country),
      plans,
      creditWeights: limits.creditWeights, // the weights this company bought
      cardPayments: cardPaymentsOn(),
      usage: {
        creditsThisMonth: { used: usage.creditsThisMonth, limit: limits.maxJobsPerMonth },
        sites: { used: usage.sites, limit: limits.maxSites },
        users: { used: usage.users, limit: limits.maxUsers },
      },
    };
  }

  @LogView('billing_invoices')
  @Get('invoices')
  async invoices(@CurrentUser() me: AuthUser) {
    const rows = await this.db.raw.invoice.findMany({ where: { companyId: me.companyId! }, orderBy: { createdAt: 'desc' }, select: invoiceSelect });
    return rows.map((i) => view(i));
  }

  /** One invoice, for the payment page and the receipt. */
  @LogView('billing_invoice')
  @Get('invoices/:id')
  async invoice(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const i = await this.db.raw.invoice.findFirst({ where: { id: parse(uuid, id), companyId: me.companyId! }, select: invoiceSelect });
    if (!i) throw notFound('Invoice');
    const company = await this.db.raw.company.findUniqueOrThrow({ where: { id: me.companyId! }, select: { name: true, legalName: true, taxId: true, billingEmail: true, billingAddress: true } });
    return { ...view(i), company, cardPayments: cardPaymentsOn() };
  }

  /** Pay by card: a Stripe Checkout page for exactly this invoice's total. The webhook marks it paid. */
  @Post('invoices/:id/pay-card')
  async payCard(@CurrentUser() me: AuthUser, @Param('id') id: string, @Req() req: Request) {
    const s = stripe();
    if (!s) throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'CARD_PAYMENTS_OFF', 'Card payments are not set up yet. Pay by bank transfer');
    const i = await this.db.raw.invoice.findFirst({ where: { id: parse(uuid, id), companyId: me.companyId! }, select: invoiceSelect });
    if (!i) throw notFound('Invoice');
    if (i.status !== 'open') throw conflict('INVOICE_NOT_OPEN', 'This invoice is already settled');
    const company = await this.db.raw.company.findUniqueOrThrow({ where: { id: me.companyId! }, select: { billingEmail: true } });
    const site = (process.env.WEB_ORIGIN?.split(',')[0] ?? 'http://localhost:3000').replace(/\/$/, '');
    const back = `${site}/subscription/invoices/${i.id}`;
    const day = (d: Date) => d.toISOString().slice(0, 10);
    const session = await s.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: i.id,
      customer_email: company.billingEmail ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: i.currency.toLowerCase(),
            unit_amount: i.amountCents + i.taxCents,
            product_data: { name: `BMERC ${i.plan?.name ?? 'plan'} · ${i.number}`, description: `${day(i.periodStart)} to ${day(i.periodEnd)}, VAT included` },
          },
        },
      ],
      metadata: { invoiceId: i.id, companyId: me.companyId! },
      payment_intent_data: { description: `BMERC invoice ${i.number}`, metadata: { invoiceId: i.id, companyId: me.companyId! } },
      success_url: `${back}?card=done`,
      cancel_url: back,
    });
    await this.audit.log({ companyId: me.companyId, actorUserId: me.id, action: 'billing.card_checkout', entityType: 'invoice', entityId: i.id, after: { session: session.id }, ip: req.ip });
    return { url: session.url };
  }

  /** Checkout: an invoice for one month of the chosen plan, VAT by the company's country. Reuses an unpaid one. */
  @Post('checkout')
  async checkout(@CurrentUser() me: AuthUser, @Body() body: unknown, @Req() req: Request) {
    const { planId } = parse(CheckoutBody, body);
    const companyId = me.companyId!;
    const plan = await this.db.raw.plan.findFirst({ where: { id: planId, isActive: true, priceCents: { gt: 0 } } });
    if (!plan) throw notFound('Plan');
    const open = await this.db.raw.invoice.findFirst({ where: { companyId, planId, status: 'open' }, select: { id: true } });
    if (open) return { id: open.id };

    const company = await this.db.raw.company.findUniqueOrThrow({ where: { id: companyId }, select: { country: true } });
    const bps = planVatBps(company.country);
    const now = new Date();
    const year = now.getUTCFullYear();
    for (let attempt = 0; attempt < 5; attempt++) {
      // Invoice numbers are unique across the platform: INV-<year>-nnnn.
      const last = await this.db.raw.invoice.findFirst({ where: { number: { startsWith: `INV-${year}-` } }, orderBy: { number: 'desc' }, select: { number: true } });
      const n = (Number(last?.number.split('-')[2]) || 0) + 1 + attempt; // seed numbers such as INV-2026-A4B7 count as 0
      try {
        const inv = await this.db.raw.invoice.create({
          data: {
            companyId, planId, number: `INV-${year}-${String(n).padStart(4, '0')}`,
            periodStart: now, periodEnd: new Date(now.getTime() + 30 * DAY),
            amountCents: plan.priceCents, taxRateBps: bps, taxCents: taxOn(plan.priceCents, bps), currency: plan.currency,
            dueAt: new Date(now.getTime() + 7 * DAY),
          },
          select: { id: true, number: true },
        });
        await this.audit.log({ companyId, actorUserId: me.id, action: 'billing.checkout', entityType: 'invoice', entityId: inv.id, after: { plan: plan.code, number: inv.number }, ip: req.ip });
        return { id: inv.id };
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      }
    }
    throw conflict('INVOICE_NUMBER', 'Could not number the invoice. Try again');
  }

  /** "I have sent the payment": the transfer reference goes to the platform owner's Pending payments. */
  @Post('invoices/:id/notify')
  async notify(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const b = parse(NotifyBody, body);
    const i = await this.db.raw.invoice.findFirst({ where: { id: parse(uuid, id), companyId: me.companyId! }, select: { id: true, status: true } });
    if (!i) throw notFound('Invoice');
    if (i.status !== 'open') throw conflict('INVOICE_NOT_OPEN', 'This invoice is already settled');
    await this.db.raw.invoice.update({ where: { id: i.id }, data: { paymentRef: `Bank transfer · ${b.reference}`, slipUploadedAt: new Date() } });
    await this.audit.log({ companyId: me.companyId, actorUserId: me.id, action: 'billing.payment_reported', entityType: 'invoice', entityId: i.id, after: b, ip: req.ip });
    return { ok: true };
  }
}
