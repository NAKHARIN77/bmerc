import { Controller, Headers, HttpCode, HttpStatus, Post, Req, type RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type Stripe from 'stripe';
import { DbService } from '../db/db.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ApiError } from '../common/http.js';
import { Public } from '../auth/decorators.js';
import { settleInvoice } from './settle.js';
import { verifyWebhook } from './stripe.js';

/**
 * Stripe calls this when a Checkout payment finishes. The signature is checked against the raw body,
 * the amount must match the invoice, and a repeated event changes nothing. Answers 200 to anything it
 * does not act on, so Stripe stops retrying.
 */
@Controller('billing/stripe')
export class StripeWebhookController {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'CARD_PAYMENTS_OFF', 'Card payments are not set up');
    if (!req.rawBody || !signature) throw new ApiError(HttpStatus.BAD_REQUEST, 'BAD_SIGNATURE', 'Missing Stripe signature');
    let event: Stripe.Event;
    try {
      event = verifyWebhook(req.rawBody, signature, secret);
    } catch {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'BAD_SIGNATURE', 'Invalid Stripe signature');
    }

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        if (event.data.object.payment_status === 'paid') await this.paid(event.data.object, event.id);
        break;
      case 'checkout.session.async_payment_failed':
        await this.failed(event.data.object, event.id);
        break;
    }
    return { received: true };
  }

  private invoiceId(s: Stripe.Checkout.Session) {
    const id = s.metadata?.invoiceId ?? s.client_reference_id ?? '';
    return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  }

  private async paid(s: Stripe.Checkout.Session, eventId: string) {
    const id = this.invoiceId(s);
    const inv = id ? await this.db.raw.invoice.findUnique({ where: { id }, select: { id: true, companyId: true, status: true, amountCents: true, taxCents: true, currency: true } }) : null;
    if (!inv || inv.status !== 'open') return; // unknown, or already settled (repeated event)
    const total = inv.amountCents + inv.taxCents;
    if (s.amount_total !== total || s.currency?.toUpperCase() !== inv.currency.toUpperCase()) {
      // Never settle on a different amount; the owner sees this in the audit log and checks Stripe.
      await this.audit.log({ companyId: inv.companyId, action: 'billing.card_amount_mismatch', entityType: 'invoice', entityId: inv.id, after: { expected: total, currency: inv.currency, paid: s.amount_total, paidCurrency: s.currency, session: s.id, event: eventId } });
      return;
    }
    const intent = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id;
    const done = await settleInvoice(this.db.raw, inv.id, { paymentRef: `Card (Stripe) · ${intent ?? s.id}`, confirmedById: null });
    if (done) {
      await this.audit.log({ companyId: inv.companyId, action: 'billing.paid_by_card', entityType: 'invoice', entityId: inv.id, after: { session: s.id, paymentIntent: intent ?? null, event: eventId, planId: done.planId, reactivated: done.reactivated } });
    }
  }

  private async failed(s: Stripe.Checkout.Session, eventId: string) {
    const id = this.invoiceId(s);
    const inv = id ? await this.db.raw.invoice.findUnique({ where: { id }, select: { id: true, companyId: true } }) : null;
    if (inv) await this.audit.log({ companyId: inv.companyId, action: 'billing.card_payment_failed', entityType: 'invoice', entityId: inv.id, after: { session: s.id, event: eventId } });
  }
}
