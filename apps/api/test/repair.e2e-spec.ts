import 'dotenv/config';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/main.js';
import { Prisma, PrismaClient } from '../src/generated/prisma/client.js';

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
  const patch = (who: string, path: string, body: object) => http().patch(`/api/v1${path}`).set(auth(who)).send(body);
  const credits = async () => (await get(ADMIN, '/company/usage').expect(200)).body.creditsThisMonth.used as number;
  let creditsBefore = 0;
  const del = (who: string, path: string) => http().delete(`/api/v1${path}`).set(auth(who));

  const tag = Date.now();
  const jobs: string[] = [];
  let bangkok: string, customer: string, part: string, stockBefore: number;
  let counter: { companyId: string; key: string; value: number } | null = null;
  let chonburi: string, chonburiBefore = 0;
  const started = new Date();
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
    chonburi = sites.find((s) => s.name === 'Chonburi Repair Hub')!.id;
    chonburiBefore = (await owner.siteStock.findUnique({ where: { siteId_partId: { siteId: chonburi, partId: part } } }))?.qty ?? 0;
    const companyId = (await owner.site.findUniqueOrThrow({ where: { id: bangkok } })).companyId;
    counter = await owner.counter.findFirst({ where: { companyId, key: `job:${new Date().getFullYear()}` } });
  });

  afterAll(async () => {
    const devices = (await owner.job.findMany({ where: { id: { in: jobs } }, select: { deviceId: true } })).map((j) => j.deviceId);
    // The stock ledger is append-only (trigger). Lift it only to remove this test's own rows, in one transaction.
    await owner.$transaction(async (tx) => {
      await tx.$executeRaw`ALTER TABLE stock_movements DISABLE TRIGGER stock_movements_append_only`;
      await tx.jobPayment.deleteMany({ where: { invoice: { jobId: { in: jobs } } } });
      await tx.jobInvoiceLine.deleteMany({ where: { invoice: { jobId: { in: jobs } } } });
      await tx.jobInvoice.deleteMany({ where: { jobId: { in: jobs } } });
      await tx.partRequest.deleteMany({ where: { jobId: { in: jobs } } });
      await tx.jobPart.deleteMany({ where: { jobId: { in: jobs } } });
      await tx.jobTest.deleteMany({ where: { jobId: { in: jobs } } });
      await tx.qrPrintLog.deleteMany({ where: { jobId: { in: jobs } } });
      await tx.jobComponent.deleteMany({ where: { jobId: { in: jobs } } });
      await tx.jobEvent.deleteMany({ where: { jobId: { in: jobs } } });
      await tx.stockTransfer.deleteMany({ where: { sentAt: { gte: started }, partId: part } });
      await tx.stockMovement.deleteMany({ where: { OR: [{ jobId: { in: jobs } }, { reason: { contains: String(tag) } }, { reason: { startsWith: 'Transfer' }, createdAt: { gte: started }, partId: part }] } });
      await tx.siteStock.upsert({ where: { siteId_partId: { siteId: chonburi, partId: part } }, update: { qty: chonburiBefore }, create: { companyId: counter!.companyId, siteId: chonburi, partId: part, qty: chonburiBefore } });
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
    const over = await post(STOCK, `/jobs/${id}/parts`, { partId: part, qty: left + 1 }).expect(409);
    expect(over.body).toMatchObject({ code: 'STOCK_INSUFFICIENT', details: { available: left } });
    const used = await post(STOCK, `/jobs/${id}/parts`, { partId: part, qty: 1 }).expect(201);
    expect(await qty()).toBe(left - 1);
    await del(STOCK, `/jobs/${id}/parts/${used.body.id}`).expect(204);
    expect(await qty()).toBe(left);
    const moves = await owner.stockMovement.findMany({ where: { jobId: id }, orderBy: { id: 'asc' } });
    expect(moves.map((m) => m.qty)).toEqual([-1, 1]);
  });

  it('technicians ask for parts; the stock keeper approves, rejects, or the technician cancels', async () => {
    const id = jobs[0];
    const left = await qty();
    await post(TECH, `/jobs/${id}/parts`, { partId: part, qty: 1 }).expect(403); // no direct taking any more
    const r1 = (await post(TECH, `/jobs/${id}/part-requests`, { partId: part, qty: 1, note: 'chain 2' }).expect(201)).body;
    expect((await get(ADMIN, `/jobs/${id}`).expect(200)).body.status).toBe('waiting_parts');
    const mine = (await get(TECH, `/part-requests?jobId=${id}`).expect(200)).body;
    expect(mine[0]).toMatchObject({ id: r1.id, status: 'pending', canCancel: true, canDecide: false, inStock: left });
    await post(TECH, `/part-requests/${r1.id}/approve`).expect(403);
    expect((await get(STOCK, '/part-requests/pending-count').expect(200)).body.count).toBeGreaterThanOrEqual(1);
    await post(STOCK, `/part-requests/${r1.id}/approve`).expect(201);
    expect(await qty()).toBe(left - 1);
    const job = (await get(ADMIN, `/jobs/${id}`).expect(200)).body;
    expect(job.status).toBe('in_repair');
    expect(job.parts.some((p: { part: { id: string } }) => p.part.id === part)).toBe(true);
    await post(STOCK, `/part-requests/${r1.id}/approve`).expect(409); // already decided

    const r2 = (await post(TECH, `/jobs/${id}/part-requests`, { partId: part, qty: left + 50 }).expect(201)).body;
    expect((await post(STOCK, `/part-requests/${r2.id}/approve`).expect(409)).body.code).toBe('STOCK_INSUFFICIENT');
    await post(STOCK, `/part-requests/${r2.id}/reject`, { reason: 'x' }).expect(400);
    await post(STOCK, `/part-requests/${r2.id}/reject`, { reason: 'Not enough in stock' }).expect(201);
    expect((await get(ADMIN, `/jobs/${id}`).expect(200)).body.status).toBe('in_repair');

    const r3 = (await post(TECH, `/jobs/${id}/part-requests`, { partId: part, qty: 1 }).expect(201)).body;
    await post(STOCK, `/part-requests/${r3.id}/cancel`).expect(403);
    await post(TECH, `/part-requests/${r3.id}/cancel`).expect(201);
    expect((await get(TECH, `/part-requests?jobId=${id}&status=all`).expect(200)).body.map((r: { status: string }) => r.status).sort()).toEqual(['approved', 'cancelled', 'rejected']);
    expect((await get(ADMIN, `/jobs/${id}`).expect(200)).body.status).toBe('in_repair');

    // Put the approved part back so the next tests start from the same stock.
    const jp = job.parts.find((p: { part: { id: string } }) => p.part.id === part);
    await del(STOCK, `/jobs/${id}/parts/${jp.id}`).expect(204);
    expect(await qty()).toBe(left);
  });

  it('never lets two people take the last parts at once', async () => {
    const id = jobs[0];
    const left = await qty();
    const [a, b] = await Promise.all([post(ADMIN, `/jobs/${id}/parts`, { partId: part, qty: left }), post(STOCK, `/jobs/${id}/parts`, { partId: part, qty: left })]);
    expect([a.status, b.status].sort((x, y) => x - y)).toEqual([201, 409]);
    expect(await qty()).toBe(0);
  });

  it('passes QC with a random QR code; only customer-facing staff return it; closed jobs are locked', async () => {
    const id = jobs[0];
    creditsBefore = await credits();
    // The work type sets the credits; it can change until QC. Board repair = 5 under the default weights.
    expect((await get(ADMIN, `/jobs/${id}`).expect(200)).body.workType).toBe('inspection');
    await patch(TECH, `/jobs/${id}/work-type`, { workType: 'warp_drive' }).expect(400);
    await patch(TECH, `/jobs/${id}/work-type`, { workType: 'board_repair' }).expect(200);
    await put(TECH, `/jobs/${id}/components`, [
      { component: 'Hashboard 2', serialNo: `HB-${tag}`, replacementSerialNo: `HBN-${tag}`, workDone: 'Swapped board', result: 'replaced' },
    ]).expect(200);
    const qc = await post(TECH, `/jobs/${id}/transition`, { to: 'qc_passed' }).expect(201);
    expect(qc.body.qrCode).toMatch(/^BMERC-[A-Z0-9]{8}$/);
    await post(TECH, `/jobs/${id}/transition`, { to: 'dispatched' }).expect(403);
    await post(ADMIN, `/jobs/${id}/transition`, { to: 'dispatched' }).expect(201);
    await post(ADMIN, `/jobs/${id}/parts`, { partId: part, qty: 1 }).expect(403);
    expect((await patch(ADMIN, `/jobs/${id}/work-type`, { workType: 'inspection' }).expect(409)).body.code).toBe('JOB_CHARGED');
    const job = (await get(ADMIN, `/jobs/${id}`).expect(200)).body;
    expect(job.creditsCharged).toBe(5);
    expect(await credits()).toBe(creditsBefore + 5);
    const changes = job.events.filter((e: { fromStatus: string | null; toStatus: string }) => e.fromStatus !== e.toStatus).map((e: { toStatus: string }) => e.toStatus);
    expect(changes).toEqual(['todo', 'in_repair', 'waiting_parts', 'in_repair', 'waiting_parts', 'in_repair', 'waiting_parts', 'in_repair', 'waiting_parts', 'in_repair', 'qc_passed', 'dispatched']);
    expect(job.can).toMatchObject({ assign: false, work: false, dispatch: false, parts: false });

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

  it('the same device again within 7 days counts as one job; cannot-repair jobs are free', async () => {
    const again = jobs[1]; // same device as jobs[0], which used 5 credits
    await post(TECH, `/jobs/${again}/transition`, { to: 'in_repair' }).expect(201);
    await post(TECH, `/jobs/${again}/transition`, { to: 'qc_passed' }).expect(201);
    expect((await get(ADMIN, `/jobs/${again}`).expect(200)).body.creditsCharged).toBe(0);

    const r = await receive(ADMIN, `T-${tag}-3`, { workType: 'chip_replacement' }).expect(201);
    jobs.push(r.body.id);
    await post(TECH, `/jobs/${r.body.id}/transition`, { to: 'in_repair' }).expect(201);
    await post(TECH, `/jobs/${r.body.id}/transition`, { to: 'unrepairable', reason: 'Board burnt' }).expect(201);
    expect((await get(ADMIN, `/jobs/${r.body.id}`).expect(200)).body.creditsCharged).toBe(0);
    expect(await credits()).toBe(creditsBefore + 5);
  });

  it('when the credits for the month are used up, no new devices come in', async () => {
    const sub = await owner.subscription.findFirstOrThrow({ where: { companyId: counter!.companyId }, select: { overrideLimits: true } });
    const used = await credits();
    await owner.subscription.update({ where: { companyId: counter!.companyId }, data: { overrideLimits: { maxJobsPerMonth: used } } });
    try {
      const blocked = await receive(ADMIN, `T-${tag}-q`).expect(409);
      expect(blocked.body).toMatchObject({ code: 'QUOTA_CREDITS', details: { limit: used, used } });
    } finally {
      await owner.subscription.update({ where: { companyId: counter!.companyId }, data: { overrideLimits: sub.overrideLimits ?? Prisma.DbNull } });
    }
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

  it('bills the customer with tax, records payments and refuses overpayment', async () => {
    const id = jobs[0];
    const body = { lines: [{ kind: 'labor', description: 'Repair labor', qty: 1, unitPriceCents: 150_000 }, { kind: 'other', description: 'Cleaning', qty: 2, unitPriceCents: 25_000 }] };
    await post(TECH, `/jobs/${id}/invoice`, body).expect(403);
    const inv = (await post(ADMIN, `/jobs/${id}/invoice`, body).expect(201)).body;
    expect(inv.number).toMatch(/^RI-\d{4}-\d{4}$/);
    expect((await post(ADMIN, `/jobs/${id}/invoice`, body).expect(409)).body.code).toBe('INVOICE_EXISTS');
    const full = (await get(ADMIN, `/job-invoices/${inv.id}`).expect(200)).body;
    expect(full).toMatchObject({ subtotalCents: 200_000, taxCents: 14_000, totalCents: 214_000, status: 'unpaid' }); // Siam Hash: 7%
    await post(ADMIN, `/job-invoices/${inv.id}/payments`, { amountCents: 300_000, method: 'cash' }).expect(409);
    expect((await post(ADMIN, `/job-invoices/${inv.id}/payments`, { amountCents: 100_000, method: 'cash' }).expect(201)).body.status).toBe('partial');
    await post(ADMIN, `/job-invoices/${inv.id}/void`, { reason: 'test' }).expect(409); // has a payment
    expect((await post(ADMIN, `/job-invoices/${inv.id}/payments`, { amountCents: 114_000, method: 'bank_transfer', reference: 'KB 1' }).expect(201)).body.status).toBe('paid');
    expect((await get(ADMIN, `/jobs/${id}`).expect(200)).body.invoice).toMatchObject({ status: 'paid', paidCents: 214_000 });
    await get(MANAGER, `/job-invoices/${inv.id}`).expect(404); // not the manager's site
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

  it('sends parts to another site; only the receiving site confirms; the sender can cancel', async () => {
    const at = async (siteId: string) => (await owner.siteStock.findUnique({ where: { siteId_partId: { siteId, partId: part } } }))?.qty ?? 0;
    const bkk = await at(bangkok);
    const t1 = (await post(ADMIN, '/stock/transfers', { fromSiteId: bangkok, toSiteId: chonburi, partId: part, qty: 1 }).expect(201)).body;
    expect(await at(bangkok)).toBe(bkk - 1);
    await post(STOCK, `/stock/transfers/${t1.id}/receive`).expect(403); // Bangkok stock keeper is not at Chonburi
    await post(MANAGER, `/stock/transfers/${t1.id}/receive`).expect(201); // Chonburi site manager
    expect(await at(chonburi)).toBe(chonburiBefore + 1);
    await post(MANAGER, `/stock/transfers/${t1.id}/receive`).expect(409);

    const t2 = (await post(STOCK, '/stock/transfers', { fromSiteId: bangkok, toSiteId: chonburi, partId: part, qty: 1 }).expect(201)).body;
    await post(STOCK, `/stock/transfers/${t2.id}/cancel`).expect(201);
    expect(await at(bangkok)).toBe(bkk - 1);
    await post(MANAGER, '/stock/transfers', { fromSiteId: bangkok, toSiteId: chonburi, partId: part, qty: 1 }).expect(403); // not the manager's site
    expect((await post(ADMIN, '/stock/transfers', { fromSiteId: bangkok, toSiteId: chonburi, partId: part, qty: 10_000 }).expect(409)).body.code).toBe('STOCK_INSUFFICIENT');
  });
});
