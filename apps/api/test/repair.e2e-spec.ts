import 'dotenv/config';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/main.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

// Relies on the demo seed. Jobs, devices and stock changes made here are undone in afterAll.
const PW = 'Demo1234!';
const ADMIN = 'admin@siamhash.demo';
const MANAGER = 'manager@siamhash.demo'; // Chonburi only
const TECH = 'tech@siamhash.demo'; // Team Alpha, Bangkok
const STOCK = 'stock@siamhash.demo'; // Bangkok
const OTHER = 'admin@rayong.demo'; // another company
const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATE_DATABASE_URL }) });

describe('Repair workflow, stock and device history (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const tokens: Record<string, string> = {};
  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const get = (who: string, path: string) => http().get(`/api/v1${path}`).set(auth(who));
  const post = (who: string, path: string, body?: object) => http().post(`/api/v1${path}`).set(auth(who)).send(body);
  const put = (who: string, path: string, body: object) => http().put(`/api/v1${path}`).set(auth(who)).send(body);
  const del = (who: string, path: string) => http().delete(`/api/v1${path}`).set(auth(who));

  const tag = Date.now();
  const jobs: string[] = [];
  let bangkok: string, customer: string, part: string, stockBefore: number;
  let counter: { companyId: string; key: string; value: number } | null = null;
  const qty = async () => (await owner.siteStock.findUnique({ where: { siteId_partId: { siteId: bangkok, partId: part } } }))?.qty ?? 0;
  const receive = (who: string, serialNo: string, extra: object = {}) =>
    post(who, '/jobs', { customerId: customer, siteId: bangkok, kind: 'miner', model: 'Antminer S19 Pro', serialNo, reportedFault: 'No hashrate', ...extra });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    for (const email of [ADMIN, MANAGER, TECH, STOCK, OTHER, 'head@siamhash.demo']) {
      tokens[email] = (await http().post('/api/v1/auth/login').send({ email, password: PW }).expect(200)).body.accessToken;
    }
    const sites = (await get(ADMIN, '/sites').expect(200)).body as Array<{ id: string; name: string }>;
    bangkok = sites.find((s) => s.name === 'Bangkok Hash Lab 01')!.id;
    customer = (await get(ADMIN, '/customers?limit=1').expect(200)).body.items[0].id;
    const row = (await get(ADMIN, `/stock?siteId=${bangkok}&limit=100`).expect(200)).body.items.find((r: { qty: number }) => r.qty >= 3);
    part = row.part.id;
    stockBefore = row.qty;
    const companyId = (await owner.site.findUniqueOrThrow({ where: { id: bangkok } })).companyId;
    counter = await owner.counter.findFirst({ where: { companyId, key: `job:${new Date().getFullYear()}` } });
  });

  afterAll(async () => {
    const devices = (await owner.job.findMany({ where: { id: { in: jobs } }, select: { deviceId: true } })).map((j) => j.deviceId);
    // The stock ledger is append-only (trigger). Lift it only to remove this test's own rows, in one transaction.
    await owner.$transaction(async (tx) => {
      await tx.$executeRaw`ALTER TABLE stock_movements DISABLE TRIGGER stock_movements_append_only`;
      await tx.jobPart.deleteMany({ where: { jobId: { in: jobs } } });
      await tx.jobTest.deleteMany({ where: { jobId: { in: jobs } } });
      await tx.qrPrintLog.deleteMany({ where: { jobId: { in: jobs } } });
      await tx.jobComponent.deleteMany({ where: { jobId: { in: jobs } } });
      await tx.jobEvent.deleteMany({ where: { jobId: { in: jobs } } });
      await tx.stockMovement.deleteMany({ where: { OR: [{ jobId: { in: jobs } }, { reason: { contains: String(tag) } }] } });
      await tx.job.deleteMany({ where: { id: { in: jobs } } });
      await tx.device.deleteMany({ where: { id: { in: devices } } });
      await tx.siteStock.update({ where: { siteId_partId: { siteId: bangkok, partId: part } }, data: { qty: stockBefore } });
      await tx.$executeRaw`ALTER TABLE stock_movements ENABLE TRIGGER stock_movements_append_only`;
      // Give back the job numbers this file used, so the demo keeps numbering in order.
      if (counter) await tx.counter.update({ where: { companyId_key: { companyId: counter.companyId, key: counter.key } }, data: { value: counter.value } });
    });
    await owner.$disconnect();
    await app.close();
  });

  it('only staff of the site can receive a device; numbers are TK-<year>-nnnn', async () => {
    await receive(TECH, `T-${tag}-x`).expect(403);
    await receive(MANAGER, `T-${tag}-x`).expect(403);
    const r = await receive(ADMIN, `T-${tag}-1`).expect(201);
    jobs.push(r.body.id);
    expect(r.body.number).toMatch(/^TK-\d{4}-\d{4,}$/);
    const again = await receive(ADMIN, `T-${tag}-1`).expect(409);
    expect(again.body.code).toBe('DEVICE_IN_REPAIR');
  });

  it('follows the board order and records each step', async () => {
    const id = jobs[0];
    expect((await post(ADMIN, `/jobs/${id}/transition`, { to: 'qc_passed' }).expect(409)).body.code).toBe('BAD_TRANSITION');
    expect((await post(ADMIN, `/jobs/${id}/transition`, { to: 'in_repair' }).expect(409)).body.code).toBe('ASSIGNEE_REQUIRED');
    // A technician picks up an unassigned job and becomes its assignee.
    const start = await post(TECH, `/jobs/${id}/transition`, { to: 'in_repair' }).expect(201);
    expect(start.body.assigneeId).toBeTruthy();
    expect((await post(TECH, `/jobs/${id}/transition`, { to: 'waiting_parts' }).expect(409)).body.code).toBe('NOTE_REQUIRED');
    await post(TECH, `/jobs/${id}/transition`, { to: 'waiting_parts', note: 'BM1398 chips' }).expect(201);
    await post(TECH, `/jobs/${id}/transition`, { to: 'in_repair' }).expect(201);
  });

  it('uses parts from site stock, refuses more than is left, and returns them with a reverse movement', async () => {
    const id = jobs[0];
    const left = await qty();
    const over = await post(TECH, `/jobs/${id}/parts`, { partId: part, qty: left + 1 }).expect(409);
    expect(over.body).toMatchObject({ code: 'STOCK_INSUFFICIENT', details: { available: left } });
    const used = await post(TECH, `/jobs/${id}/parts`, { partId: part, qty: 1 }).expect(201);
    expect(await qty()).toBe(left - 1);
    await del(TECH, `/jobs/${id}/parts/${used.body.id}`).expect(204);
    expect(await qty()).toBe(left);
    const moves = await owner.stockMovement.findMany({ where: { jobId: id }, orderBy: { id: 'asc' } });
    expect(moves.map((m) => m.qty)).toEqual([-1, 1]);
  });

  it('never lets two people take the last parts at once', async () => {
    const id = jobs[0];
    const left = await qty();
    const [a, b] = await Promise.all([post(TECH, `/jobs/${id}/parts`, { partId: part, qty: left }), post(STOCK, `/jobs/${id}/parts`, { partId: part, qty: left })]);
    expect([a.status, b.status].sort((x, y) => x - y)).toEqual([201, 409]);
    expect(await qty()).toBe(0);
  });

  it('passes QC with a random QR code; only customer-facing staff return it; closed jobs are locked', async () => {
    const id = jobs[0];
    await put(TECH, `/jobs/${id}/components`, [
      { component: 'Hashboard 2', serialNo: `HB-${tag}`, replacementSerialNo: `HBN-${tag}`, workDone: 'Swapped board', result: 'replaced' },
    ]).expect(200);
    const qc = await post(TECH, `/jobs/${id}/transition`, { to: 'qc_passed' }).expect(201);
    expect(qc.body.qrCode).toMatch(/^BMERC-[A-Z0-9]{8}$/);
    await post(TECH, `/jobs/${id}/transition`, { to: 'dispatched' }).expect(403);
    await post(ADMIN, `/jobs/${id}/transition`, { to: 'dispatched' }).expect(201);
    await post(ADMIN, `/jobs/${id}/parts`, { partId: part, qty: 1 }).expect(403);
    const job = (await get(ADMIN, `/jobs/${id}`).expect(200)).body;
    expect(job.events.map((e: { toStatus: string }) => e.toStatus)).toEqual(['todo', 'in_repair', 'waiting_parts', 'in_repair', 'qc_passed', 'dispatched']);
    expect(job.can).toEqual({ assign: false, work: false, dispatch: false, parts: false });

    const dev = (await get(TECH, `/devices/by-qr/${qc.body.qrCode}`).expect(200)).body;
    await get(OTHER, `/devices/by-qr/${qc.body.qrCode}`).expect(404);
    const hits = (await get(STOCK, `/devices/search?serial=HBN-${tag}`).expect(200)).body;
    expect(hits.map((h: { id: string }) => h.id)).toEqual([dev.id]);
    const history = (await get(TECH, `/devices/${dev.id}/history`).expect(200)).body;
    expect(history.jobs[0].components[0].replacementSerialNo).toBe(`HBN-${tag}`);
  });

  it('keeps the QR code when the device comes back', async () => {
    const code = (await owner.device.findFirstOrThrow({ where: { serialNo: `T-${tag}-1` } })).qrCode;
    const r = await receive(ADMIN, `T-${tag}-1`).expect(201);
    jobs.push(r.body.id);
    expect((await get(ADMIN, `/jobs/${r.body.id}`).expect(200)).body.device.qrCode).toBe(code);
  });

  it('a bench test passes the job to QC only when every item passes, and label prints are logged', async () => {
    const r = await receive(ADMIN, `T-${tag}-2`).expect(201);
    jobs.push(r.body.id);
    const id = r.body.id;
    const results = { hb1: 'pass', hb2: 'pass', hb3: 'pass', ctrl: 'pass', psu: 'pass', fan: 'pass' };
    await post(ADMIN, `/jobs/${id}/tests`, { testedOn: '2026-11-23', results }).expect(409); // still To Do
    await post(TECH, `/jobs/${id}/transition`, { to: 'in_repair' }).expect(201);
    await post(TECH, `/jobs/${id}/label/printed`, {}).expect(409); // no QC yet
    const fail = await post(TECH, `/jobs/${id}/tests`, { testedOn: '2026-11-23', results: { ...results, hb2: 'fail' } }).expect(201);
    expect(fail.body).toMatchObject({ passed: false, status: 'in_repair', qrCode: null });
    const pass = await post(TECH, `/jobs/${id}/tests`, { testedOn: '2026-11-23', workDone: 'Reflowed hb2', results }).expect(201);
    expect(pass.body.status).toBe('qc_passed');
    expect(pass.body.qrCode).toMatch(/^BMERC-/);
    await post(TECH, `/jobs/${id}/label/printed`, { copies: 2 }).expect(201);
    const job = (await get(TECH, `/jobs/${id}`).expect(200)).body;
    expect(job.tests.map((t: { passed: boolean }) => t.passed)).toEqual([true, false]);
    expect(job.qrPrintLogs[0]).toMatchObject({ copies: 2, by: expect.any(String) });
  });

  it('customer emails show in the list for admins only', async () => {
    const admin = (await get(ADMIN, '/customers?limit=5').expect(200)).body.items;
    expect(admin[0]).toHaveProperty('email');
    const head = (await get('head@siamhash.demo', '/customers?limit=5').expect(200)).body.items;
    expect(head[0]).not.toHaveProperty('email');
  });

  it('shows how many jobs each technician holds, only within what the viewer oversees', async () => {
    const people = (await get(ADMIN, `/jobs/assignees?siteId=${bangkok}`).expect(200)).body;
    expect(people[0]).toMatchObject({ openJobs: expect.any(Number) });
    const all = (await get(ADMIN, '/jobs/technicians').expect(200)).body as Array<{ team: { id: string }; openJobs: number; atQc: number }>;
    expect(all.length).toBeGreaterThan(0);
    const head = (await get('head@siamhash.demo', '/jobs/technicians').expect(200)).body as Array<{ team: { id: string } }>;
    expect(new Set(head.map((t) => t.team.id)).size).toBe(1);
    await get(TECH, '/jobs/technicians').expect(403);
    await get(STOCK, '/jobs/technicians').expect(403);
  });

  it('a site lists the customers who sent devices there, with what they sent', async () => {
    const list = (await get(ADMIN, `/sites/${bangkok}/customers`).expect(200)).body as Array<{ id: string; email: unknown; jobs: Array<{ device: { serialNo: string } }> }>;
    const mine = list.find((c) => c.id === customer)!;
    expect(mine).toHaveProperty('email');
    expect(mine.jobs.some((j) => j.device.serialNo === `T-${tag}-1`)).toBe(true);
    await get(TECH, `/sites/${bangkok}/customers`).expect(403);
    await get(MANAGER, `/sites/${bangkok}/customers`).expect(404); // not one of the manager's sites
  });

  it('stock in and adjust need the right role; adjust needs a reason', async () => {
    await post(TECH, '/stock/in', { siteId: bangkok, partId: part, qty: 5 }).expect(403);
    await post(STOCK, '/stock/in', { siteId: bangkok, partId: part, qty: 5, reason: `test ${tag}` }).expect(201);
    expect(await qty()).toBe(5);
    await post(STOCK, '/stock/adjust', { siteId: bangkok, partId: part, countedQty: 2 }).expect(400);
    const r = await post(STOCK, '/stock/adjust', { siteId: bangkok, partId: part, countedQty: 2, reason: `count ${tag}` }).expect(201);
    expect(r.body.qty).toBe(2);
    await post(MANAGER, '/stock/in', { siteId: bangkok, partId: part, qty: 1, reason: `test ${tag}` }).expect(403);
  });
});
