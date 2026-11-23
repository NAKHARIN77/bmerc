import 'dotenv/config';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/main.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

// Relies on the demo seed. Every change made here is put back in afterAll.
const PW = 'Demo1234!';
const OWNER = 'owner@bmerc.demo';
const ADMIN = 'admin@siamhash.demo';
const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATE_DATABASE_URL }) });

const appDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

describe('Platform owner console (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const tokens: Record<string, string> = {};
  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const get = (who: string, path: string) => http().get(`/api/v1${path}`).set(auth(who));
  const post = (who: string, path: string, body: object = {}) => http().post(`/api/v1${path}`).set(auth(who)).send(body);
  const patch = (who: string, path: string, body: object) => http().patch(`/api/v1${path}`).set(auth(who)).send(body);

  let eastern: { id: string; status: 'active' | 'suspended' | 'closed' };
  let basic: { id: string; priceCents: number; features: unknown };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    for (const email of [OWNER, ADMIN]) {
      tokens[email] = (await http().post('/api/v1/auth/login').send({ email, password: PW }).expect(200)).body.accessToken;
    }
    eastern = await owner.company.findFirstOrThrow({ where: { name: 'Eastern ASIC Lab' }, select: { id: true, status: true } });
    basic = await owner.plan.findUniqueOrThrow({ where: { code: 'basic' }, select: { id: true, priceCents: true, features: true } });
  });

  afterAll(async () => {
    await owner.company.update({ where: { id: eastern.id }, data: { status: eastern.status } });
    await owner.subscription.update({ where: { companyId: eastern.id }, data: { status: 'trialing' } });
    await owner.$executeRaw`UPDATE subscriptions SET override_limits = NULL WHERE company_id = ${eastern.id}::uuid`;
    await owner.plan.update({ where: { id: basic.id }, data: { priceCents: basic.priceCents, features: basic.features as string[] } });
    await owner.$disconnect();
    await appDb.$disconnect();
    await app.close();
  });

  it('is for the platform owner only', async () => {
    for (const path of ['/platform/overview', '/platform/companies', '/platform/plans', '/platform/invoices', '/platform/audit-logs', '/platform/health']) {
      await get(ADMIN, path).expect(403);
    }
  });

  it('shows job numbers per company but never the jobs themselves', async () => {
    const list = (await get(OWNER, '/platform/companies').expect(200)).body as Array<{ name: string; jobs: { open: number } }>;
    const siam = list.find((c) => c.name === 'Siam Hash Repair Co.')!;
    expect(siam.jobs.open).toBeGreaterThan(0);
    await get(OWNER, '/jobs').expect(403);
    const overview = (await get(OWNER, '/platform/overview').expect(200)).body;
    expect(overview.jobs.open).toBeGreaterThan(0);
    expect(overview.revenue).toHaveLength(6);
  });

  it('overrides limits with a reason, logs it, and can go back to the plan', async () => {
    await patch(OWNER, `/platform/companies/${eastern.id}/limits`, { maxJobsPerMonth: 75 }).expect(400); // no reason
    await patch(OWNER, `/platform/companies/${eastern.id}/limits`, { maxJobsPerMonth: 75, reason: 'Agreed pilot' }).expect(200);
    let c = (await get(OWNER, `/platform/companies/${eastern.id}`).expect(200)).body;
    expect(c.limits.jobsPerMonth).toBe(75);
    const log = await owner.auditLog.findFirst({ where: { action: 'platform.limits_changed', entityId: eastern.id }, orderBy: { id: 'desc' } });
    expect(log?.after).toMatchObject({ reason: 'Agreed pilot' });
    await patch(OWNER, `/platform/companies/${eastern.id}/limits`, { reset: true, reason: 'Back to plan' }).expect(200);
    c = (await get(OWNER, `/platform/companies/${eastern.id}`).expect(200)).body;
    expect(c.limits.jobsPerMonth).toBe(50); // Trial plan
  });

  it('suspends and activates a company', async () => {
    await post(OWNER, `/platform/companies/${eastern.id}/suspend`, { reason: 'test' }).expect(201);
    expect((await owner.company.findUniqueOrThrow({ where: { id: eastern.id } })).status).toBe('suspended');
    const admin = (await http().post('/api/v1/auth/login').send({ email: 'admin@easternasic.demo', password: PW }).expect(200)).body.accessToken;
    await http().get('/api/v1/customers').set({ Authorization: `Bearer ${admin}` }).expect(403);
    await post(OWNER, `/platform/companies/${eastern.id}/activate`).expect(201);
    await http().get('/api/v1/customers').set({ Authorization: `Bearer ${admin}` }).expect(200);
    // A trial company goes back to trialing, not to a paid "active" subscription.
    expect((await owner.subscription.findUniqueOrThrow({ where: { companyId: eastern.id } })).status).toBe('trialing');
  });

  it('edits a plan and refuses to mark a paid invoice as paid again', async () => {
    const r = await patch(OWNER, `/platform/plans/${basic.id}`, { priceCents: 12_300, features: ['One', 'Two'] }).expect(200);
    expect(r.body).toMatchObject({ priceCents: 12_300, features: ['One', 'Two'] });
    const paid = (await get(OWNER, '/platform/invoices?status=paid').expect(200)).body.items[0];
    await post(OWNER, `/platform/invoices/${paid.id}/mark-paid`, { paymentRef: 'again' }).expect(409);
    await post(OWNER, `/platform/invoices/${paid.id}/reject`).expect(409);
  });

  it('lists sites, revenue, reports and health', async () => {
    const sites = (await get(OWNER, '/platform/sites').expect(200)).body;
    expect(sites.length).toBeGreaterThan(0);
    expect(sites[0]).not.toHaveProperty('partsInStock');
    expect((await get(OWNER, '/platform/revenue?period=week').expect(200)).body.rows).toHaveLength(4);
    expect((await get(OWNER, '/platform/reports?period=day').expect(200)).body.newCompanies).toHaveLength(7);
    expect((await get(OWNER, '/platform/health').expect(200)).body.database.ok).toBe(true);
  });
  it("has no access to a company's parts, stock or customers (decided 2026-11-24)", async () => {
    await get(OWNER, '/platform/stock').expect(404);
    const companies = (await get(OWNER, '/platform/companies').expect(200)).body;
    expect(companies[0]).not.toHaveProperty('lowStock');
    expect((await get(OWNER, '/platform/overview').expect(200)).body).not.toHaveProperty('lowStock');
    // The database refuses too: with the platform flag on, the app role reads sites but no stock or customer rows.
    const rows = await appDb.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.platform_admin', 'on', true)`;
      return tx.$queryRaw<Array<Record<string, bigint>>>`SELECT
        (SELECT count(*) FROM sites) AS sites, (SELECT count(*) FROM parts) AS parts, (SELECT count(*) FROM site_stock) AS stock,
        (SELECT count(*) FROM stock_movements) AS movements, (SELECT count(*) FROM stock_transfers) AS transfers, (SELECT count(*) FROM customers) AS customers`;
    });
    expect(Number(rows[0].sites)).toBeGreaterThan(0);
    expect(rows[0]).toMatchObject({ parts: 0n, stock: 0n, movements: 0n, transfers: 0n, customers: 0n });
  });
});
