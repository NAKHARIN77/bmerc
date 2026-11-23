import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/main.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

// Relies on the demo seed (npm run db:seed).
const PW = 'Demo1234!';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterAll(() => app.close());

  it('anyone can read the plans on sale, without the trial plan', async () => {
    const r = await http().get('/api/v1/plans').expect(200);
    const codes = (r.body as Array<{ code: string; currency: string }>).map((p) => p.code);
    expect(codes).toEqual(expect.arrayContaining(['basic', 'pro']));
    expect(codes).not.toContain('trial');
    expect(r.body[0]).toMatchObject({ currency: 'USD', features: expect.any(Array) });
  });

  it('a new company starts on the Basic plan, in the currency of its country', async () => {
    const email = `signup-${Date.now()}@new.demo`;
    const body = { companyName: 'Signup Test Co', fullName: 'New Admin', email, password: 'Signup-1234' };
    const noCountry = await http().post('/api/v1/auth/register').send(body).expect(400);
    expect(noCountry.body.details.map((d: { path: string[] }) => d.path[0])).toContain('country');
    const r = await http().post('/api/v1/auth/register').send({ ...body, country: 'VN' }).expect(201);
    const me = await http().get('/api/v1/me').set('Authorization', `Bearer ${r.body.accessToken}`).expect(200);
    expect(me.body).toMatchObject({ role: 'company_admin', company: { name: 'Signup Test Co', status: 'active', subscription: { status: 'active', plan: { code: 'basic' } } } });

    const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATE_DATABASE_URL }) });
    try {
      const companyId = me.body.companyId as string;
      expect(await owner.company.findUnique({ where: { id: companyId } })).toMatchObject({ country: 'VN', currency: 'VND', taxRateBps: 0 });
      await owner.$executeRawUnsafe('ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_append_only');
      await owner.auditLog.deleteMany({ where: { companyId } });
      await owner.$executeRawUnsafe('ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_append_only');
      await owner.user.deleteMany({ where: { companyId } });
      await owner.subscription.deleteMany({ where: { companyId } });
      await owner.company.delete({ where: { id: companyId } });
    } finally {
      await owner.$disconnect();
    }
  });

  const login = (email: string, password = PW) => http().post('/api/v1/auth/login').send({ email, password });

  it('health is public', () => http().get('/api/v1/health').expect(200));

  it('protected routes need a login', async () => {
    const r = await http().get('/api/v1/me').expect(401);
    expect(r.body.code).toBe('UNAUTHORIZED');
  });

  it('rejects a wrong password with a generic message', async () => {
    const r = await login('admin@siamhash.demo', 'wrong-password').expect(401);
    expect(r.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('validates the body', async () => {
    const r = await http().post('/api/v1/auth/login').send({ email: 'not-an-email' }).expect(400);
    expect(r.body.code).toBe('VALIDATION_FAILED');
  });

  it('logs in with cookies and returns the profile', async () => {
    const r = await login('admin@siamhash.demo').expect(200);
    const cookies = r.headers['set-cookie'] as unknown as string[];
    expect(cookies.join(';')).toMatch(/bmerc_at=.*HttpOnly/);
    expect(cookies.join(';')).toMatch(/bmerc_rt=.*HttpOnly/);
    expect(cookies.join(';')).toMatch(/bmerc_session=1; Path=\//);

    const me = await http().get('/api/v1/me').set('Cookie', cookies).expect(200);
    expect(me.body.role).toBe('company_admin');
    expect(me.body.company.name).toBe('Siam Hash Repair Co.');
    expect(me.body.company.subscription.plan.code).toBe('pro');
    expect(me.body).not.toHaveProperty('passwordHash');
  });

  it('accepts a bearer token too', async () => {
    const r = await login('tech@siamhash.demo').expect(200);
    const me = await http().get('/api/v1/me').set('Authorization', `Bearer ${r.body.accessToken}`).expect(200);
    expect(me.body.role).toBe('technician');
  });

  it('refresh rotates the token; the old one stops working', async () => {
    const r = await login('head@siamhash.demo').expect(200);
    const rt = (r.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('bmerc_rt='))!.split(';')[0];
    await http().post('/api/v1/auth/refresh').set('Cookie', rt).expect(200);
    await http().post('/api/v1/auth/refresh').set('Cookie', rt).expect(401);
  });

  it('platform owner has no company', async () => {
    const r = await login('owner@bmerc.demo').expect(200);
    const me = await http().get('/api/v1/me').set('Authorization', `Bearer ${r.body.accessToken}`).expect(200);
    expect(me.body.isPlatformAdmin).toBe(true);
    expect(me.body.company).toBeNull();
  });

  it('a suspended company can still log in and see its status', async () => {
    const r = await login('admin@northminer.demo').expect(200);
    const me = await http().get('/api/v1/me').set('Authorization', `Bearer ${r.body.accessToken}`).expect(200);
    expect(me.body.company.status).toBe('suspended');
  });
});
