import 'dotenv/config';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/main.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

// Relies on the demo seed and the miner model list from migration 20261124120000. Everything made here is removed in afterAll.
const PW = 'Demo1234!';
const OWNER = 'owner@bmerc.demo';
const ADMIN = 'admin@siamhash.demo';
const STOCK = 'stock@siamhash.demo';
const TECH = 'tech@siamhash.demo';
const OTHER = 'admin@rayong.demo'; // another company (active)
const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATE_DATABASE_URL }) });

describe('Miner models (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const tokens: Record<string, string> = {};
  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const get = (who: string, path: string) => http().get(`/api/v1${path}`).set(auth(who));
  const post = (who: string, path: string, body: object) => http().post(`/api/v1${path}`).set(auth(who)).send(body);
  const patch = (who: string, path: string, body: object) => http().patch(`/api/v1${path}`).set(auth(who)).send(body);
  const del = (who: string, path: string) => http().delete(`/api/v1${path}`).set(auth(who));
  const tag = Date.now().toString(36);
  const made = { models: [] as string[], parts: [] as string[] };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    for (const email of [OWNER, ADMIN, OTHER, STOCK, TECH]) {
      tokens[email] = (await http().post('/api/v1/auth/login').send({ email, password: PW }).expect(200)).body.accessToken;
    }
  });

  afterAll(async () => {
    await owner.part.deleteMany({ where: { id: { in: made.parts } } });
    await owner.minerModel.deleteMany({ where: { id: { in: made.models } } });
    await owner.$disconnect();
    await app.close();
  });

  it('companies read the list with hashboards and chips', async () => {
    const list = (await get(ADMIN, '/miner-models').expect(200)).body as Array<{ name: string; hashboards: number; chipModel: string | null; chipsPerBoard: number | null }>;
    expect(list.find((m) => m.name === 'Antminer S19j Pro')).toMatchObject({ hashboards: 3, chipModel: 'BM1362', chipsPerBoard: 126 });
    await get(ADMIN, '/platform/miner-models').expect(403);
  });

  it('a job shows the model of its device', async () => {
    const jobs = (await get(ADMIN, '/jobs?limit=100').expect(200)).body.items as Array<{ id: string; device: { model: string } }>;
    // Models on the list (Antminer) link to it; a model not on the list (Whatsminer, removed) keeps only its name.
    const listed = jobs.find((j) => j.device.model.startsWith('Antminer'))!;
    const detail = (await get(ADMIN, `/jobs/${listed.id}`).expect(200)).body;
    expect(detail.device.minerModel?.name).toBe(detail.device.model);
    const unlisted = jobs.find((j) => j.device.model.startsWith('Whatsminer'));
    if (unlisted) expect((await get(ADMIN, `/jobs/${unlisted.id}`).expect(200)).body.device.minerModel).toBeNull();
  });

  it('the platform owner adds, corrects and checks a model', async () => {
    const m = (await post(OWNER, '/platform/miner-models', { brand: 'Test', name: `Test Miner ${tag}`, hashboards: 4, chipModel: 'BM9999', chipsPerBoard: 60 }).expect(201)).body;
    made.models.push(m.id);
    expect(m).toMatchObject({ verified: false, isActive: true, hashboards: 4 });
    await post(OWNER, '/platform/miner-models', { brand: 'Test', name: `Test Miner ${tag}`, hashboards: 3 }).expect(409);
    await post(OWNER, '/platform/miner-models', { brand: 'Test', name: `Bad ${tag}`, hashboards: 0 }).expect(400);
    const after = (await patch(OWNER, `/platform/miner-models/${m.id}`, { verified: true, chipsPerBoard: 62 }).expect(200)).body;
    expect(after).toMatchObject({ verified: true, chipsPerBoard: 62 });
    await post(ADMIN, '/platform/miner-models', { brand: 'X', name: `Nope ${tag}`, hashboards: 3 }).expect(403);
  });

  it('a part records the models it fits; unknown models are refused', async () => {
    const modelId = made.models[0];
    const p = (await post(ADMIN, '/parts', { sku: `T-${tag}`, name: `Hash chip BM9999 ${tag}`, category: 'Chips', modelIds: [modelId] }).expect(201)).body;
    made.parts.push(p.id);
    expect(p.modelIds).toEqual([modelId]);
    await post(ADMIN, '/parts', { sku: `U-${tag}`, name: 'Unknown fit', modelIds: ['00000000-0000-4000-8000-000000000000'] }).expect(404);
    const cleared = (await patch(ADMIN, `/parts/${p.id}`, { modelIds: [] }).expect(200)).body;
    expect(cleared.modelIds).toEqual([]);
  });

  it('a company adds, edits and deletes its own models; other companies never see them', async () => {
    const name = `Own Miner ${tag}`;
    await post(TECH, '/miner-models', { brand: 'Bitmain', name, hashboards: 3 }).expect(403);
    const m = (await post(STOCK, '/miner-models', { brand: 'Bitmain', name, hashboards: 3, chipModel: 'BM1398' }).expect(201)).body;
    made.models.push(m.id);
    expect(m.own).toBe(true);
    // Same name again, or the name of a shared model: 409.
    expect((await post(ADMIN, '/miner-models', { brand: 'Bitmain', name: name.toUpperCase(), hashboards: 3 }).expect(409)).body.code).toBe('MODEL_TAKEN');
    await post(ADMIN, '/miner-models', { brand: 'Bitmain', name: 'antminer s19', hashboards: 3 }).expect(409);

    const mine = (await get(ADMIN, '/miner-models').expect(200)).body as Array<{ id: string; own: boolean; name: string }>;
    expect(mine.find((x) => x.id === m.id)?.own).toBe(true);
    expect(mine.find((x) => x.name === 'Antminer S19')?.own).toBe(false);
    const theirs = (await get(OTHER, '/miner-models').expect(200)).body as Array<{ id: string }>;
    expect(theirs.some((x) => x.id === m.id)).toBe(false);
    await patch(OTHER, `/miner-models/${m.id}`, { hashboards: 4 }).expect(404);
    await del(OTHER, `/miner-models/${m.id}`).expect(404);
    expect((await get(OWNER, '/platform/miner-models').expect(200)).body.some((x: { id: string }) => x.id === m.id)).toBe(false);

    // A part may fit the company's own model; another company cannot use it.
    const part = (await post(ADMIN, '/parts', { sku: `OWN-${tag}`, name: 'Own board', modelIds: [m.id] }).expect(201)).body;
    made.parts.push(part.id);
    await post(OTHER, '/parts', { sku: `OWN-${tag}`, name: 'Nope', modelIds: [m.id] }).expect(404);

    // Shared models cannot be changed by a company.
    const shared = mine.find((x) => x.name === 'Antminer S19')!;
    expect((await patch(ADMIN, `/miner-models/${shared.id}`, { hashboards: 4 }).expect(409)).body.code).toBe('SHARED_MODEL');
    await del(ADMIN, `/miner-models/${shared.id}`).expect(409);

    expect((await patch(STOCK, `/miner-models/${m.id}`, { hashboards: 4 }).expect(200)).body.hashboards).toBe(4);
    expect((await del(ADMIN, `/miner-models/${m.id}`).expect(200)).body).toEqual({ outcome: 'deleted' });
    expect((await get(ADMIN, `/parts/${part.id}`).expect(200)).body.modelIds).toEqual([]);
  });
});
