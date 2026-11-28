import 'dotenv/config';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/main.js';
import { MailService } from '../src/mail/mail.service.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

// Relies on the demo seed (npm run db:seed):
//   Bangkok Hash Lab 01: Team Alpha (head, tech, stock), 4 jobs
//   Chonburi Repair Hub: Team Beta (tech2), 3 jobs; manager@ manages this site only
const PW = 'Demo1234!';
const DEMO_USERS = ['admin@siamhash.demo', 'manager@siamhash.demo', 'head@siamhash.demo', 'tech@siamhash.demo',
  'tech2@siamhash.demo', 'stock@siamhash.demo', 'owner@bmerc.demo', 'admin@easternasic.demo'];
const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATE_DATABASE_URL }) });

describe('Access scope, invites, password reset, view logging (e2e)', () => {
  let app: INestApplication;
  let mail: MailService;
  const http = () => request(app.getHttpServer());
  const tag = Date.now();
  const created: string[] = [];
  const tokens: Record<string, string> = {};

  const login = (email: string, password = PW) => http().post('/api/v1/auth/login').send({ email, password });
  const auth = (email: string) => {
    if (!tokens[email]) throw new Error(`${email} is not logged in; add it to DEMO_USERS`);
    return { Authorization: `Bearer ${tokens[email]}` };
  };
  const get = (who: string, path: string) => http().get(`/api/v1${path}`).set(auth(who));
  const post = (who: string, path: string, body?: object) => http().post(`/api/v1${path}`).set(auth(who)).send(body);
  const patch = (who: string, path: string, body: object) => http().patch(`/api/v1${path}`).set(auth(who)).send(body);
  const put = (who: string, path: string, body: object) => http().put(`/api/v1${path}`).set(auth(who)).send(body);
  const lastToken = (to: string, path: string) => {
    const m = [...mail.sent].reverse().find((x) => x.to === to);
    const link = m?.text.match(new RegExp(`${path}\\?token=([\\w%-]+)`));
    if (!link) throw new Error(`No ${path} email for ${to}`);
    return decodeURIComponent(link[1]);
  };

  let bangkok: string, chonburi: string, alphaId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    mail = app.get(MailService);
    for (const email of DEMO_USERS) tokens[email] = (await login(email).expect(200)).body.accessToken;
    const sites = (await get('admin@siamhash.demo', '/sites').expect(200)).body as Array<{ id: string; name: string; teams: Array<{ id: string; name: string }> }>;
    bangkok = sites.find((s) => s.name === 'Bangkok Hash Lab 01')!.id;
    chonburi = sites.find((s) => s.name === 'Chonburi Repair Hub')!.id;
    alphaId = sites.find((s) => s.id === bangkok)!.teams.find((t) => t.name === 'Team Alpha')!.id;
  });

  afterAll(async () => {
    if (created.length) await owner.user.deleteMany({ where: { id: { in: created } } });
    await owner.$disconnect();
    await app.close();
  });

  describe('who sees which jobs and sites', () => {
    const jobSites = async (who: string) => {
      const r = await get(who, '/jobs?limit=100').expect(200);
      return (r.body.items as Array<{ site: { id: string } }>).map((j) => j.site.id);
    };

    it('company admin sees every job', async () => {
      expect(await jobSites('admin@siamhash.demo')).toHaveLength(7);
    });

    it('a stock keeper sees only the sites linked to them', async () => {
      const s = await jobSites('stock@siamhash.demo');
      expect(s).toHaveLength(4);
      expect(new Set(s)).toEqual(new Set([bangkok]));
      const me = (await get('stock@siamhash.demo', '/me').expect(200)).body;
      expect(me.siteIds).toEqual([bangkok]);
    });

    it('technicians see only their team site', async () => {
      const alpha = await jobSites('tech@siamhash.demo');
      expect(alpha).toHaveLength(4);
      expect(new Set(alpha)).toEqual(new Set([bangkok]));
      const beta = await jobSites('tech2@siamhash.demo');
      expect(beta).toHaveLength(3);
      expect(new Set(beta)).toEqual(new Set([chonburi]));
    });

    it('a site manager sees only the sites linked to them', async () => {
      expect(new Set(await jobSites('manager@siamhash.demo'))).toEqual(new Set([chonburi]));
      const sites = (await get('manager@siamhash.demo', '/sites').expect(200)).body;
      expect(sites.map((s: { id: string }) => s.id)).toEqual([chonburi]);
      await get('manager@siamhash.demo', `/sites/${bangkok}`).expect(404);
      const me = (await get('manager@siamhash.demo', '/me').expect(200)).body;
      expect(me.siteIds).toEqual([chonburi]);
    });

    it('opening a job outside your scope returns 404, not 403', async () => {
      const other = (await get('tech2@siamhash.demo', '/jobs?limit=1').expect(200)).body.items[0];
      const r = await get('tech@siamhash.demo', `/jobs/${other.id}`).expect(404);
      expect(r.body.code).toBe('NOT_FOUND');
    });

    it("a job held by another team at the same site is hidden from this team", async () => {
      const team = await owner.team.create({ data: { companyId: (await owner.site.findUniqueOrThrow({ where: { id: bangkok } })).companyId, siteId: bangkok, name: `Night ${tag}` } });
      const night = await owner.user.create({
        data: { companyId: team.companyId, email: `night-${tag}@siamhash.demo`, fullName: 'Night Tech', role: 'technician', teamId: team.id },
      });
      created.push(night.id);
      const job = await owner.job.findFirstOrThrow({ where: { siteId: bangkok, assigneeId: null } });
      await owner.job.update({ where: { id: job.id }, data: { assigneeId: night.id } });
      try {
        await get('tech@siamhash.demo', `/jobs/${job.id}`).expect(404);
        await get('head@siamhash.demo', `/jobs/${job.id}`).expect(404);
        await get('admin@siamhash.demo', `/jobs/${job.id}`).expect(200);
      } finally {
        await owner.job.update({ where: { id: job.id }, data: { assigneeId: null } });
        await owner.user.delete({ where: { id: night.id } });
        created.splice(created.indexOf(night.id), 1);
        await owner.team.delete({ where: { id: team.id } });
      }
    });

    it('the platform owner cannot read company jobs through tenant endpoints', async () => {
      await get('owner@bmerc.demo', '/jobs').expect(403);
      await get('owner@bmerc.demo', '/jobs/summary').expect(403);
    });

    it('job counts follow the same scope as the job list', async () => {
      const all = (await get('admin@siamhash.demo', '/jobs/summary').expect(200)).body;
      expect(all.total).toBe(7);
      expect(Object.values(all.byStatus as Record<string, number>).reduce((a, n) => a + n, 0)).toBe(7);
      expect((await get('stock@siamhash.demo', '/jobs/summary').expect(200)).body.total).toBe(4);
      const listed = (await get('tech@siamhash.demo', '/jobs?limit=100').expect(200)).body.total;
      expect((await get('tech@siamhash.demo', '/jobs/summary').expect(200)).body.total).toBe(listed);
    });

    it('a stock keeper asking for stock at a site they do not hold gets none', async () => {
      const parts = (await get('stock@siamhash.demo', `/parts?siteId=${chonburi}&limit=100`).expect(200)).body.items as Array<{ totalQty: number }>;
      expect(parts.every((p) => p.totalQty === 0)).toBe(true);
      const own = (await get('stock@siamhash.demo', `/parts?siteId=${bangkok}&limit=100`).expect(200)).body.items as Array<{ totalQty: number }>;
      expect(own.some((p) => p.totalQty > 0)).toBe(true);
    });
  });

  describe('view logging', () => {
    it('opening a job writes view.job with the job id', async () => {
      const job = (await get('admin@siamhash.demo', '/jobs?limit=1').expect(200)).body.items[0];
      await get('admin@siamhash.demo', `/jobs/${job.id}`).expect(200);
      const logs = (await get('admin@siamhash.demo', '/audit-logs?action=view.job&limit=5').expect(200)).body.items;
      expect(logs[0]).toMatchObject({ action: 'view.job', entityType: 'job', entityId: job.id, actor: { email: 'admin@siamhash.demo' } });
    });

    it('reading the audit log is itself logged, and only admins can read it', async () => {
      await get('admin@siamhash.demo', '/audit-logs?limit=1').expect(200);
      const logs = (await get('admin@siamhash.demo', '/audit-logs?action=view.audit_log&limit=1').expect(200)).body.items;
      expect(logs).toHaveLength(1);
      await get('tech@siamhash.demo', '/audit-logs').expect(403);
      await get('manager@siamhash.demo', '/audit-logs').expect(403);
    });
  });

  describe('invites and user management', () => {
    const email = `invitee-${tag}@siamhash.demo`;
    let userId: string;

    it('only company admins can invite', async () => {
      await post('manager@siamhash.demo', '/users', { email: `x-${tag}@x.demo`, fullName: 'X Y', role: 'technician', teamId: alphaId }).expect(403);
    });

    it('checks role rules before creating anyone', async () => {
      const a = await post('admin@siamhash.demo', '/users', { email: `t-${tag}@x.demo`, fullName: 'No Team', role: 'technician' }).expect(400);
      expect(a.body.details[0].path).toEqual(['teamId']);
      const b = await post('admin@siamhash.demo', '/users', { email: `m-${tag}@x.demo`, fullName: 'No Sites', role: 'site_manager' }).expect(400);
      expect(b.body.details[0].path).toEqual(['siteIds']);
      const otherCompanySite = await owner.site.findFirstOrThrow({ where: { name: 'Rayong Site 01' } });
      await post('admin@siamhash.demo', '/users', { email: `m2-${tag}@x.demo`, fullName: 'Wrong Site', role: 'site_manager', siteIds: [otherCompanySite.id] }).expect(400);
      await post('admin@siamhash.demo', '/users', { email: 'tech@siamhash.demo', fullName: 'Dup', role: 'stock_keeper' }).expect(409);
    });

    it('invites a technician; they cannot log in until they accept', async () => {
      const r = await post('admin@siamhash.demo', '/users', { email, fullName: 'New Tech', role: 'technician', teamId: alphaId }).expect(201);
      userId = r.body.id;
      created.push(userId);
      expect(r.body).toMatchObject({ status: 'invited', role: 'technician', teamId: alphaId });
      expect(r.body).not.toHaveProperty('passwordHash');
      await login(email, 'anything-123').expect(401);
    });

    it('accepting the invite sets the password and signs in; the link works once', async () => {
      const token = lastToken(email, '/accept-invite');
      const info = await http().get(`/api/v1/auth/invites/${token}`).expect(200);
      expect(info.body).toEqual({ email, fullName: 'New Tech', companyName: 'Siam Hash Repair Co.' });

      const r = await http().post('/api/v1/auth/accept-invite').send({ token, password: 'FirstPass-123' }).expect(200);
      const me = await http().get('/api/v1/me').set('Authorization', `Bearer ${r.body.accessToken}`).expect(200);
      expect(me.body).toMatchObject({ email, role: 'technician', siteIds: [bangkok] });

      const again = await http().post('/api/v1/auth/accept-invite').send({ token, password: 'Other-123456' }).expect(400);
      expect(again.body.code).toBe('INVALID_TOKEN');
      await post('admin@siamhash.demo', `/users/${userId}/resend-invite`).expect(409);
    });

    it('changing the role to site manager changes what they see right away', async () => {
      const r = await patch('admin@siamhash.demo', `/users/${userId}`, { role: 'site_manager', teamId: null, siteIds: [bangkok] }).expect(200);
      expect(r.body).toMatchObject({ role: 'site_manager', siteIds: [bangkok] });
      const t = (await login(email, 'FirstPass-123').expect(200)).body.accessToken;
      const sites = await http().get('/api/v1/sites').set('Authorization', `Bearer ${t}`).expect(200);
      expect(sites.body.map((s: { id: string }) => s.id)).toEqual([bangkok]);
    });

    it('an admin cannot change their own role or deactivate themselves', async () => {
      const me = (await get('admin@siamhash.demo', '/me').expect(200)).body;
      await patch('admin@siamhash.demo', `/users/${me.id}`, { role: 'technician', teamId: alphaId }).expect(403);
      await post('admin@siamhash.demo', `/users/${me.id}/deactivate`).expect(403);
    });

    it('a deactivated user is signed out and cannot log in', async () => {
      const t = (await login(email, 'FirstPass-123').expect(200)).body.accessToken;
      await post('admin@siamhash.demo', `/users/${userId}/deactivate`).expect(200);
      await http().get('/api/v1/me').set('Authorization', `Bearer ${t}`).expect(401);
      await login(email, 'FirstPass-123').expect(401);
      await post('admin@siamhash.demo', `/users/${userId}/activate`).expect(200);
    });

    it('the plan seat limit blocks invites when full', async () => {
      // Eastern ASIC has one user; a one-seat limit makes it full.
      const eastern = await owner.company.findFirstOrThrow({ where: { name: 'Eastern ASIC Lab' }, select: { id: true } });
      await owner.subscription.update({ where: { companyId: eastern.id }, data: { overrideLimits: { maxUsers: 1 } } });
      try {
        const r = await post('admin@easternasic.demo', '/users', { email: `seat-${tag}@x.demo`, fullName: 'Seat Test', role: 'stock_keeper' }).expect(409);
        expect(r.body.code).toBe('QUOTA_USERS');
      } finally {
        await owner.$executeRaw`UPDATE subscriptions SET override_limits = NULL WHERE company_id = ${eastern.id}::uuid`;
      }
    });

    it('a site manager lists only staff at their sites', async () => {
      const list = (await get('manager@siamhash.demo', '/users').expect(200)).body as Array<{ email: string }>;
      const emails = list.map((u) => u.email);
      expect(emails).toContain('tech2@siamhash.demo');
      expect(emails).not.toContain('tech@siamhash.demo');
    });

    it('a site manager also sees technicians without a team, so they can add them to one', async () => {
      const email = `free-${tag}@x.demo`;
      const r = await post('admin@siamhash.demo', '/users', { email, fullName: 'Free Tech', role: 'technician', teamId: alphaId }).expect(201);
      created.push(r.body.id);
      const alpha = (await get('admin@siamhash.demo', `/teams/${alphaId}`).expect(200)).body as { members: Array<{ id: string }> };
      await put('admin@siamhash.demo', `/teams/${alphaId}/members`, { userIds: alpha.members.map((m) => m.id).filter((id) => id !== r.body.id) }).expect(200);
      const list = (await get('manager@siamhash.demo', '/users').expect(200)).body as Array<{ email: string }>;
      expect(list.map((u) => u.email)).toContain(email);
    });
  });

  describe('forgot and reset password', () => {
    const email = `reset-${tag}@siamhash.demo`;

    beforeAll(async () => {
      const r = await post('admin@siamhash.demo', '/users', { email, fullName: 'Reset Me', role: 'stock_keeper', siteIds: [bangkok] }).expect(201);
      created.push(r.body.id);
      await http().post('/api/v1/auth/accept-invite').send({ token: lastToken(email, '/accept-invite'), password: 'OldPass-1234' }).expect(200);
    });

    it('answers 204 for an unknown email and sends nothing', async () => {
      const before = mail.sent.length;
      await http().post('/api/v1/auth/forgot-password').send({ email: `nobody-${tag}@x.demo` }).expect(204);
      expect(mail.sent.length).toBe(before);
    });

    it('resets the password with the emailed link, once', async () => {
      await http().post('/api/v1/auth/forgot-password').send({ email }).expect(204);
      const token = lastToken(email, '/reset-password');
      await http().post('/api/v1/auth/reset-password').send({ token, password: 'NewPass-5678' }).expect(204);
      await login(email, 'OldPass-1234').expect(401);
      await login(email, 'NewPass-5678').expect(200);
      const again = await http().post('/api/v1/auth/reset-password').send({ token, password: 'Third-999999' }).expect(400);
      expect(again.body.code).toBe('INVALID_TOKEN');
    });

    it('a newer reset link replaces the older one', async () => {
      await http().post('/api/v1/auth/forgot-password').send({ email }).expect(204);
      const first = lastToken(email, '/reset-password');
      await http().post('/api/v1/auth/forgot-password').send({ email }).expect(204);
      await http().post('/api/v1/auth/reset-password').send({ token: first, password: 'Nope-1234567' }).expect(400);
    });

    it('limits repeated requests for the same email', async () => {
      const r = await http().post('/api/v1/auth/forgot-password').send({ email });
      expect(r.status).toBe(429);
    });
  });
});
