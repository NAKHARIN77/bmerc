import 'dotenv/config';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/main.js';

// Relies on the demo seed. Read-only checks; tests that change data live with their own cleanup.
const PW = 'Demo1234!';
const ADMIN = 'admin@siamhash.demo';
const TECH = 'tech@siamhash.demo';
const STOCK = 'stock@siamhash.demo';
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATE_DATABASE_URL }) });

describe('Company reports (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const tokens: Record<string, string> = {};
  const get = (who: string, path: string) => http().get(`/api/v1${path}`).set({ Authorization: `Bearer ${tokens[who]}` });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    for (const email of [ADMIN, TECH, STOCK]) {
      tokens[email] = (await http().post('/api/v1/auth/login').send({ email, password: PW }).expect(200)).body.accessToken;
    }
  });
  afterAll(() => app.close());

  it('returns the completed-jobs chart and CSV', async () => {
    expect((await get(ADMIN, '/reports/completed?period=day').expect(200)).body).toHaveLength(7);
    const csv = await get(ADMIN, '/reports/completed?period=week&format=csv').expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Period,Jobs passed QC');
  });

  it('turnaround, parts usage and jobs by technician', async () => {
    const t = (await get(ADMIN, '/reports/turnaround?period=month').expect(200)).body;
    expect(t.periods).toHaveLength(3);
    expect((await get(ADMIN, '/reports/jobs-by-technician').expect(200)).body.rows).toEqual(expect.any(Array));
    expect((await get(STOCK, '/reports/parts-usage').expect(200)).body.rows).toEqual(expect.any(Array));
  });

  it('is not for technicians; stock keepers only see parts usage', async () => {
    await get(TECH, '/reports/completed').expect(403);
    await get(STOCK, '/reports/turnaround').expect(403);
  });
});

describe('Plan billing: checkout, report a transfer, owner confirms (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const tokens: Record<string, string> = {};
  const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const RAYONG = 'admin@rayong.demo';
  const OWNER = 'owner@bmerc.demo';
  let before: { companyId: string; planId: string; status: string; currentPeriodStart: Date; currentPeriodEnd: Date };
  const made: string[] = [];
  let starter: { id: string };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    // Basic has no monthly fee, so it is not on sale; a second paid plan stands in for "another plan".
    starter = await db.plan.create({ data: { code: `starter-${Date.now()}`, name: 'Starter (test)', priceCents: 4900, maxJobsPerMonth: 100 }, select: { id: true } });
    for (const email of [RAYONG, OWNER, ADMIN]) {
      tokens[email] = (await http().post('/api/v1/auth/login').send({ email, password: PW }).expect(200)).body.accessToken;
    }
    const co = await db.company.findFirstOrThrow({ where: { name: 'Rayong Mining Solutions' }, select: { id: true } });
    before = await db.subscription.findUniqueOrThrow({ where: { companyId: co.id }, select: { companyId: true, planId: true, status: true, currentPeriodStart: true, currentPeriodEnd: true } });
  });

  afterAll(async () => {
    await db.subscription.update({ where: { companyId: before.companyId }, data: { planId: before.planId, status: before.status as never, currentPeriodStart: before.currentPeriodStart, currentPeriodEnd: before.currentPeriodEnd } });
    await db.invoice.deleteMany({ where: { id: { in: made } } });
    await db.plan.delete({ where: { id: starter.id } });
    await db.$disconnect();
    await app.close();
  });

  it('choosing another plan voids the earlier unpaid choice, but not one already reported as paid', async () => {
    const sub = (await http().get('/api/v1/billing/subscription').set(as(RAYONG)).expect(200)).body;
    const pro = sub.plans.find((p: { code: string }) => p.code === 'pro');
    // Basic is shown (it is what a company has without Pro) but has no fee, so there is nothing to buy.
    const free = sub.plans.find((p: { code: string }) => p.code === 'basic');
    expect(free.priceCents).toBe(0);
    await http().post('/api/v1/billing/checkout').set(as(RAYONG)).send({ planId: free.id }).expect(404);
    const basic = { id: starter.id };
    const first = (await http().post('/api/v1/billing/checkout').set(as(RAYONG)).send({ planId: basic.id }).expect(201)).body;
    made.push(first.id);
    const second = (await http().post('/api/v1/billing/checkout').set(as(RAYONG)).send({ planId: pro.id }).expect(201)).body;
    made.push(second.id);
    expect(second.voided).toHaveLength(1);
    expect((await db.invoice.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('void');

    // Once a transfer is reported on the Pro invoice, switching back to Basic must leave it alone.
    await http().post(`/api/v1/billing/invoices/${second.id}/notify`).set(as(RAYONG)).send({ method: 'bank_transfer', reference: 'KBank 1' }).expect(201);
    const third = (await http().post('/api/v1/billing/checkout').set(as(RAYONG)).send({ planId: basic.id }).expect(201)).body;
    made.push(third.id);
    expect(third.voided).toEqual([]);
    expect((await db.invoice.findUniqueOrThrow({ where: { id: second.id } })).status).toBe('open');
    await db.invoice.updateMany({ where: { id: { in: [second.id, third.id] } }, data: { status: 'void' } }); // leave the next test a clean start
  });

  it('moves the company to the paid plan', async () => {
    const sub = (await http().get('/api/v1/billing/subscription').set(as(RAYONG)).expect(200)).body;
    const pro = sub.plans.find((p: { code: string }) => p.code === 'pro');
    expect(sub.vatBps).toBe(700); // Thailand
    const a = (await http().post('/api/v1/billing/checkout').set(as(RAYONG)).send({ planId: pro.id }).expect(201)).body;
    made.push(a.id);
    const again = (await http().post('/api/v1/billing/checkout').set(as(RAYONG)).send({ planId: pro.id }).expect(201)).body;
    expect(again.id).toBe(a.id); // an unpaid invoice is reused
    const inv = (await http().get(`/api/v1/billing/invoices/${a.id}`).set(as(RAYONG)).expect(200)).body;
    expect(inv).toMatchObject({ amountCents: pro.priceCents, taxCents: Math.round(pro.priceCents * 0.07), status: 'open', reported: false });
    await http().get(`/api/v1/billing/invoices/${a.id}`).set(as(ADMIN)).expect(404); // another company's invoice

    await http().post(`/api/v1/billing/invoices/${a.id}/notify`).set(as(RAYONG)).send({ method: 'bank_transfer', reference: 'KBank 8812' }).expect(201);
    const pending = (await http().get('/api/v1/platform/invoices?status=open').set(as(OWNER)).expect(200)).body.items;
    expect(pending.find((p: { id: string }) => p.id === a.id)).toMatchObject({ paymentRef: 'Bank transfer · KBank 8812' });

    await http().post(`/api/v1/platform/invoices/${a.id}/mark-paid`).set(as(OWNER)).send({ paymentRef: 'Bank transfer KBank 8812' }).expect(201);
    const after = await db.subscription.findUniqueOrThrow({ where: { companyId: before.companyId }, select: { planId: true, status: true } });
    expect(after).toEqual({ planId: pro.id, status: 'active' });
  });
});
