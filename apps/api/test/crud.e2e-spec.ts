import 'dotenv/config';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/main.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

// Relies on the demo seed. Everything this file creates is removed in afterAll.
const PW = 'Demo1234!';
const WHO = ['admin@siamhash.demo', 'manager@siamhash.demo', 'head@siamhash.demo', 'tech@siamhash.demo', 'stock@siamhash.demo', 'admin@rayong.demo'];
const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATE_DATABASE_URL }) });

describe('Company, customers, sites, teams, parts (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const tokens: Record<string, string> = {};
  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const get = (who: string, path: string) => http().get(`/api/v1${path}`).set(auth(who));
  const post = (who: string, path: string, body?: object) => http().post(`/api/v1${path}`).set(auth(who)).send(body);
  const patch = (who: string, path: string, body: object) => http().patch(`/api/v1${path}`).set(auth(who)).send(body);
  const put = (who: string, path: string, body: object) => http().put(`/api/v1${path}`).set(auth(who)).send(body);
  const del = (who: string, path: string) => http().delete(`/api/v1${path}`).set(auth(who));

  const tag = Date.now();
  const made = { customers: [] as string[], sites: [] as string[], teams: [] as string[], parts: [] as string[], users: [] as string[] };
  let siam: string, bangkok: string, chonburi: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    for (const email of WHO) {
      tokens[email] = (await http().post('/api/v1/auth/login').send({ email, password: PW }).expect(200)).body.accessToken;
    }
    const sites = (await get('admin@siamhash.demo', '/sites').expect(200)).body as Array<{ id: string; name: string }>;
    bangkok = sites.find((s) => s.name === 'Bangkok Hash Lab 01')!.id;
    chonburi = sites.find((s) => s.name === 'Chonburi Repair Hub')!.id;
    siam = (await owner.site.findUniqueOrThrow({ where: { id: bangkok } })).companyId;
  });

  afterAll(async () => {
    await owner.user.updateMany({ where: { id: { in: made.users } }, data: { teamId: null } });
    await owner.team.deleteMany({ where: { id: { in: made.teams } } });
    await owner.user.deleteMany({ where: { id: { in: made.users } } });
    await owner.site.deleteMany({ where: { id: { in: made.sites } } });
    await owner.customer.deleteMany({ where: { id: { in: made.customers } } });
    await owner.part.deleteMany({ where: { id: { in: made.parts } } });
    await owner.$disconnect();
    await app.close();
  });

  describe('company', () => {
    it('admin reads and updates settings; bad time zone is rejected', async () => {
      const before = (await get('admin@siamhash.demo', '/company').expect(200)).body;
      const r = await patch('admin@siamhash.demo', '/company', { billingAddress: `Test ${tag}`, timezone: 'Asia/Ho_Chi_Minh' }).expect(200);
      expect(r.body).toMatchObject({ billingAddress: `Test ${tag}`, timezone: 'Asia/Ho_Chi_Minh' });
      await patch('admin@siamhash.demo', '/company', { timezone: 'Mars/Olympus' }).expect(400);
      const money = await patch('admin@siamhash.demo', '/company', { country: 'MY', currency: 'MYR', taxRateBps: 800 }).expect(200);
      expect(money.body).toMatchObject({ country: 'MY', currency: 'MYR', taxRateBps: 800 });
      await patch('admin@siamhash.demo', '/company', { country: 'EU' }).expect(400);
      await patch('admin@siamhash.demo', '/company', { currency: 'BAHT' }).expect(400);
      await patch('admin@siamhash.demo', '/company', { taxRateBps: 10_001 }).expect(400);
      await patch('admin@siamhash.demo', '/company', {
        billingAddress: before.billingAddress, timezone: before.timezone, country: before.country, currency: before.currency, taxRateBps: before.taxRateBps,
      }).expect(200);
    });

    it('only admins see company settings', async () => {
      await get('manager@siamhash.demo', '/company').expect(403);
      await patch('stock@siamhash.demo', '/company', { name: 'Nope' }).expect(403);
    });

    it('usage shows plan limits next to what is used', async () => {
      const r = await get('admin@rayong.demo', '/company/usage').expect(200);
      expect(r.body).toMatchObject({ plan: { code: 'basic' }, sites: { used: 1, limit: 2 }, users: { used: 1, limit: 5 } });
    });
  });

  describe('customers', () => {
    let id: string;

    it('admin creates, edits and reads a customer; reading the detail is logged', async () => {
      const c = await post('admin@siamhash.demo', '/customers', { name: `Cust ${tag}`, email: `c-${tag}@x.demo`, country: 'Vietnam' }).expect(201);
      id = c.body.id;
      made.customers.push(id);
      await patch('admin@siamhash.demo', `/customers/${id}`, { phone: '+84 1' }).expect(200);
      const d = await get('head@siamhash.demo', `/customers/${id}`).expect(200);
      expect(d.body).toMatchObject({ name: `Cust ${tag}`, phone: '+84 1', country: 'Vietnam', devices: [] });
      const logs = (await get('admin@siamhash.demo', '/audit-logs?action=view.customer&limit=1').expect(200)).body.items;
      expect(logs[0]).toMatchObject({ entityId: id, actor: { email: 'head@siamhash.demo' } });
    });

    it('list has counts but no contact details', async () => {
      const r = await get('admin@siamhash.demo', '/customers?q=BitFarm').expect(200);
      expect(r.body.items[0]).toMatchObject({ name: 'BitFarm Siam' });
      expect(r.body.items[0].devices).toBeGreaterThan(0);
      expect(r.body.items[0].openJobs).toBeGreaterThan(0);
      expect(r.body.items[0]).not.toHaveProperty('email');
    });

    it('validates input and role', async () => {
      await post('admin@siamhash.demo', '/customers', { name: 'X' }).expect(400);
      await post('admin@siamhash.demo', '/customers', { name: 'Good name', email: 'not-an-email' }).expect(400);
      await post('head@siamhash.demo', '/customers', { name: 'Head cannot' }).expect(403);
      await get('tech@siamhash.demo', '/customers').expect(403);
    });

    it('a customer with history cannot be deleted; an unused one can', async () => {
      const bitfarm = (await get('admin@siamhash.demo', '/customers?q=BitFarm').expect(200)).body.items[0];
      const r = await del('admin@siamhash.demo', `/customers/${bitfarm.id}`).expect(409);
      expect(r.body.code).toBe('IN_USE');
      await del('admin@siamhash.demo', `/customers/${id}`).expect(204);
      await get('admin@siamhash.demo', `/customers/${id}`).expect(404);
    });

    it("another company's customer is invisible", async () => {
      const bitfarm = (await get('admin@siamhash.demo', '/customers?q=BitFarm').expect(200)).body.items[0];
      await get('admin@rayong.demo', `/customers/${bitfarm.id}`).expect(404);
      await patch('admin@rayong.demo', `/customers/${bitfarm.id}`, { name: 'Hijack' }).expect(404);
    });
  });

  describe('sites', () => {
    it('a site has no customer: customers ship devices in', async () => {
      const r = await post('admin@rayong.demo', '/sites', { name: `Plain ${tag}`, status: 'inactive', customerId: '00000000-0000-4000-8000-000000000000' }).expect(201);
      made.sites.push(r.body.id);
      expect(r.body).not.toHaveProperty('customer');
      expect(r.body).not.toHaveProperty('customerId');
    });

    it('enforces the plan site limit; inactive sites do not count', async () => {
      const a = await post('admin@rayong.demo', '/sites', { name: `Rayong B ${tag}`, status: 'active' }).expect(201);
      made.sites.push(a.body.id);
      const full = await post('admin@rayong.demo', '/sites', { name: `Rayong C ${tag}` }).expect(409);
      expect(full.body.code).toBe('QUOTA_SITES');
      const off = await post('admin@rayong.demo', '/sites', { name: `Rayong D ${tag}`, status: 'inactive' }).expect(201);
      made.sites.push(off.body.id);
      await patch('admin@rayong.demo', `/sites/${off.body.id}`, { status: 'active' }).expect(409);
      await patch('admin@rayong.demo', `/sites/${a.body.id}`, { status: 'inactive' }).expect(200);
      await patch('admin@rayong.demo', `/sites/${off.body.id}`, { status: 'active' }).expect(200);
    });

    it('only admins create or edit sites', async () => {
      await post('manager@siamhash.demo', '/sites', { name: `Mgr ${tag}` }).expect(403);
      await patch('manager@siamhash.demo', `/sites/${chonburi}`, { name: 'Renamed' }).expect(403);
    });
  });

  describe('teams', () => {
    let teamId: string, t1: string, t2: string, headId: string;

    beforeAll(async () => {
      const mk = async (n: string, role: 'technician' | 'head_technician') =>
        (await owner.user.create({ data: { companyId: siam, email: `${n}-${tag}@siamhash.demo`, fullName: n, role } })).id;
      t1 = await mk('t1', 'technician');
      t2 = await mk('t2', 'technician');
      headId = await mk('hd', 'head_technician');
      made.users.push(t1, t2, headId);
    });

    it('a site manager creates teams only at their own sites', async () => {
      await post('manager@siamhash.demo', '/teams', { siteId: bangkok, name: `Bkk ${tag}` }).expect(403);
      const r = await post('manager@siamhash.demo', '/teams', { siteId: chonburi, name: `Night ${tag}` }).expect(201);
      teamId = r.body.id;
      made.teams.push(teamId);
      expect(r.body).toMatchObject({ siteId: chonburi, members: [] });
    });

    it('sets members; admins, site managers and staff from other sites are refused', async () => {
      const r = await put('manager@siamhash.demo', `/teams/${teamId}/members`, { userIds: [t1, t2] }).expect(200);
      expect(r.body.members.map((m: { id: string }) => m.id).sort()).toEqual([t1, t2].sort());

      const mgr = (await get('manager@siamhash.demo', '/me').expect(200)).body.id;
      await put('manager@siamhash.demo', `/teams/${teamId}/members`, { userIds: [t1, mgr] }).expect(400);

      const bangkokTech = (await get('tech@siamhash.demo', '/me').expect(200)).body.id;
      await put('manager@siamhash.demo', `/teams/${teamId}/members`, { userIds: [t1, bangkokTech] }).expect(403);
    });

    it('the new member immediately sees Chonburi jobs', async () => {
      await owner.user.update({ where: { id: t1 }, data: { passwordHash: (await owner.user.findFirstOrThrow({ where: { email: 'tech@siamhash.demo' } })).passwordHash } });
      const tok = (await http().post('/api/v1/auth/login').send({ email: `t1-${tag}@siamhash.demo`, password: PW }).expect(200)).body.accessToken;
      const jobs = await http().get('/api/v1/jobs').set('Authorization', `Bearer ${tok}`).expect(200);
      expect(new Set(jobs.body.items.map((j: { site: { id: string } }) => j.site.id))).toEqual(new Set([chonburi]));
    });

    it('team head must be a head technician', async () => {
      await patch('manager@siamhash.demo', `/teams/${teamId}`, { headUserId: t1 }).expect(400);
      const r = await patch('manager@siamhash.demo', `/teams/${teamId}`, { headUserId: headId }).expect(200);
      expect(r.body.headUserId).toBe(headId);
      expect(r.body.members.map((m: { id: string }) => m.id)).toContain(headId);
    });

    it('only an admin can move a team to another site', async () => {
      await patch('manager@siamhash.demo', `/teams/${teamId}`, { siteId: bangkok }).expect(403);
    });

    it('a team with members cannot be deleted; an empty one can', async () => {
      const r = await del('manager@siamhash.demo', `/teams/${teamId}`).expect(409);
      expect(r.body.code).toBe('IN_USE');
      const emptied = await put('manager@siamhash.demo', `/teams/${teamId}/members`, { userIds: [] }).expect(200);
      expect(emptied.body.headUserId).toBeNull();
      await del('manager@siamhash.demo', `/teams/${teamId}`).expect(204);
    });

    it("a site manager cannot touch a team at someone else's site", async () => {
      const alpha = (await get('admin@siamhash.demo', '/teams').expect(200)).body.find((t: { name: string }) => t.name === 'Team Alpha');
      await patch('manager@siamhash.demo', `/teams/${alpha.id}`, { name: 'Taken over' }).expect(404);
      await get('manager@siamhash.demo', `/teams/${alpha.id}`).expect(404);
    });
  });

  describe('parts catalog', () => {
    let id: string;
    const sku = `TST-${tag}`;

    it('stock keeper adds a part; duplicate SKU is a 409', async () => {
      const r = await post('stock@siamhash.demo', '/parts', { sku, name: 'Test chip', category: 'Chips', minQty: 5 }).expect(201);
      id = r.body.id;
      made.parts.push(id);
      const dup = await post('admin@siamhash.demo', '/parts', { sku, name: 'Same SKU' }).expect(409);
      expect(dup.body.code).toBe('SKU_TAKEN');
      await post('admin@siamhash.demo', '/parts', { sku: 'bad sku!', name: 'Bad' }).expect(400);
    });

    it('technicians can read the catalog but not change it', async () => {
      await get('tech@siamhash.demo', '/parts').expect(200);
      await post('tech@siamhash.demo', '/parts', { sku: `T2-${tag}`, name: 'Nope' }).expect(403);
      await patch('manager@siamhash.demo', `/parts/${id}`, { name: 'Nope' }).expect(403);
    });

    it('stock is shown only for sites the user may see', async () => {
      const any = (await get('admin@siamhash.demo', '/parts?limit=100').expect(200)).body.items.find((p: { totalQty: number }) => p.totalQty > 0);
      const asAdmin = (await get('admin@siamhash.demo', `/parts/${any.id}`).expect(200)).body.stock;
      const asTech = (await get('tech@siamhash.demo', `/parts/${any.id}`).expect(200)).body.stock;
      expect(asAdmin.length).toBe(2);
      expect(asTech.map((s: { site: { id: string } }) => s.site.id)).toEqual([bangkok]);
    });

    it('a deactivated part drops out of the default list', async () => {
      await patch('stock@siamhash.demo', `/parts/${id}`, { isActive: false }).expect(200);
      const active = (await get('admin@siamhash.demo', `/parts?q=${sku}`).expect(200)).body.items;
      expect(active).toHaveLength(0);
      const all = (await get('admin@siamhash.demo', `/parts?q=${sku}&active=all`).expect(200)).body.items;
      expect(all).toHaveLength(1);
    });
  });
});
