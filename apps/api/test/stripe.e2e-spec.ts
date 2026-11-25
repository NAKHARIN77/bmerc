import 'dotenv/config';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/main.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { testSignature } from '../src/billing/stripe.js';

// Card payments through Stripe Checkout. No Stripe account is needed: webhooks are signed locally with a
// test secret, the same way Stripe signs them. Relies on the demo seed; changes are put back in afterAll.
const SECRET = 'whsec_test_bmerc_e2e';
const ADMIN = 'admin@siamhash.demo';
const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATE_DATABASE_URL }) });

describe('Card payments with Stripe (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  let token = '';
  let companyId = '';
  let invoiceId = '';
  let total = 0;
  let savedSub: { currentPeriodStart: Date; currentPeriodEnd: Date } | null = null;
  const before = { key: process.env.STRIPE_SECRET_KEY, secret: process.env.STRIPE_WEBHOOK_SECRET };

  const webhook = (event: object, secret = SECRET) => {
    const payload = JSON.stringify(event);
    return http().post('/api/v1/billing/stripe/webhook').set('content-type', 'application/json').set('stripe-signature', testSignature(payload, secret)).send(payload);
  };
  const completed = (over: Record<string, unknown> = {}) => ({
    id: `evt_test_${Date.now()}`,
    object: 'event',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_test_1', object: 'checkout.session', payment_status: 'paid', amount_total: total, currency: 'usd', client_reference_id: invoiceId, metadata: { invoiceId }, payment_intent: 'pi_test_bmerc', ...over } },
  });

  beforeAll(async () => {
    delete process.env.STRIPE_SECRET_KEY; // card checkout off; the webhook works with its secret alone
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
    token = (await http().post('/api/v1/auth/login').send({ email: ADMIN, password: 'Demo1234!' }).expect(200)).body.accessToken;

    const admin = await owner.user.findUniqueOrThrow({ where: { email: ADMIN }, select: { companyId: true } });
    companyId = admin.companyId!;
    const sub = await owner.subscription.findUniqueOrThrow({ where: { companyId }, select: { planId: true, currentPeriodStart: true, currentPeriodEnd: true } });
    savedSub = { currentPeriodStart: sub.currentPeriodStart, currentPeriodEnd: sub.currentPeriodEnd };
    const now = new Date();
    // A renewal of the current plan, so paying it does not change the company's plan.
    const inv = await owner.invoice.create({
      data: {
        companyId, planId: sub.planId, number: `INV-TEST-${Date.now()}`, periodStart: now, periodEnd: new Date(now.getTime() + 30 * 86_400_000),
        amountCents: 9900, taxRateBps: 700, taxCents: 693, currency: 'USD', dueAt: new Date(now.getTime() + 7 * 86_400_000),
      },
    });
    invoiceId = inv.id;
    total = 9900 + 693;
  });

  afterAll(async () => {
    await owner.invoice.delete({ where: { id: invoiceId } }).catch(() => {});
    if (savedSub) await owner.subscription.update({ where: { companyId }, data: savedSub });
    if (before.key === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = before.key;
    if (before.secret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = before.secret;
    await owner.$disconnect();
    await app.close();
  });

  it('says card payments are off until Stripe is set up', async () => {
    const sub = (await http().get('/api/v1/billing/subscription').set('Authorization', `Bearer ${token}`).expect(200)).body;
    expect(sub.cardPayments).toBe(false);
    const r = await http().post(`/api/v1/billing/invoices/${invoiceId}/pay-card`).set('Authorization', `Bearer ${token}`).expect(503);
    expect(r.body.code).toBe('CARD_PAYMENTS_OFF');
  });

  it('refuses a webhook that Stripe did not sign', async () => {
    await webhook(completed(), 'whsec_someone_else').expect(400);
    await http().post('/api/v1/billing/stripe/webhook').set('content-type', 'application/json').send(completed()).expect(400);
    expect((await owner.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).status).toBe('open');
  });

  it('does not settle when the amount paid differs from the invoice', async () => {
    await webhook(completed({ amount_total: total - 1 })).expect(200);
    expect((await owner.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).status).toBe('open');
    const log = await owner.auditLog.findFirst({ where: { entityId: invoiceId, action: 'billing.card_amount_mismatch' } });
    expect(log).not.toBeNull();
  });

  it('marks the invoice paid once, even when Stripe sends the event again', async () => {
    await webhook(completed()).expect(200);
    await webhook(completed()).expect(200);
    const inv = await owner.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(inv).toMatchObject({ status: 'paid', paymentRef: 'Card (Stripe) · pi_test_bmerc', confirmedById: null });
    expect(await owner.auditLog.count({ where: { entityId: invoiceId, action: 'billing.paid_by_card' } })).toBe(1);
  });

  it('ignores sessions for unknown invoices and other event types', async () => {
    await webhook(completed({ metadata: { invoiceId: '00000000-0000-0000-0000-000000000000' }, client_reference_id: null })).expect(200);
    await webhook({ id: 'evt_test_other', object: 'event', type: 'charge.refunded', data: { object: { id: 'ch_1', object: 'charge' } } }).expect(200);
  });
});
