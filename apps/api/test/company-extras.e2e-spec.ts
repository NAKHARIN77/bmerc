import 'dotenv/config';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/main.js';

// Relies on the demo seed. Read-only checks; tests that change data live with their own cleanup.
const PW = 'Demo1234!';
const ADMIN = 'admin@siamhash.demo';
const TECH = 'tech@siamhash.demo';
const STOCK = 'stock@siamhash.demo';

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
