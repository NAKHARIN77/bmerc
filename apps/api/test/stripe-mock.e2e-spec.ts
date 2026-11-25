import 'dotenv/config';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/main.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

// Runs only when STRIPE_API_URL points at stripe-mock: checks the Checkout request against Stripe's API schema.
const run = process.env.STRIPE_API_URL ? describe : describe.skip;
const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATE_DATABASE_URL }) });

run('Card checkout against stripe-mock (e2e)', () => {
  let app: INestApplication;
  let invoiceId = '';
  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
    const admin = await owner.user.findUniqueOrThrow({ where: { email: 'admin@siamhash.demo' }, select: { companyId: true } });
    const sub = await owner.subscription.findUniqueOrThrow({ where: { companyId: admin.companyId! }, select: { planId: true } });
    const now = new Date();
    invoiceId = (await owner.invoice.create({ data: { companyId: admin.companyId!, planId: sub.planId, number: `INV-MOCK-${Date.now()}`, periodStart: now, periodEnd: now, amountCents: 9900, taxRateBps: 0, taxCents: 0, currency: 'USD', dueAt: now } })).id;
  });
  afterAll(async () => {
    await owner.invoice.delete({ where: { id: invoiceId } }).catch(() => {});
    await owner.$disconnect();
    await app.close();
  });
  it('creates a Checkout session Stripe accepts and returns its URL', async () => {
    const http = request(app.getHttpServer());
    const token = (await http.post('/api/v1/auth/login').send({ email: 'admin@siamhash.demo', password: 'Demo1234!' }).expect(200)).body.accessToken;
    const r = await request(app.getHttpServer()).post(`/api/v1/billing/invoices/${invoiceId}/pay-card`).set('Authorization', `Bearer ${token}`);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.url).toMatch(/^https:\/\//);
  });
});
