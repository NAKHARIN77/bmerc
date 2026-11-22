import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { forPlatformAdmin, forTenant } from '../src/prisma/tenant.js';

// owner = table owner (bypasses RLS, used only to set up fixtures); app = runtime role (RLS enforced)
const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.MIGRATE_DATABASE_URL }) });
const app = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

let a: string, b: string;

beforeAll(async () => {
  const tag = Date.now();
  a = (await owner.company.create({ data: { name: `RLS test A ${tag}` } })).id;
  b = (await owner.company.create({ data: { name: `RLS test B ${tag}` } })).id;
  await owner.customer.create({ data: { companyId: a, name: 'Customer of A' } });
  await owner.customer.create({ data: { companyId: b, name: 'Customer of B' } });
});

afterAll(async () => {
  await owner.$executeRawUnsafe('ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_append_only');
  await owner.auditLog.deleteMany({ where: { companyId: { in: [a, b] } } });
  await owner.$executeRawUnsafe('ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_append_only');
  await owner.customer.deleteMany({ where: { companyId: { in: [a, b] } } });
  await owner.company.deleteMany({ where: { id: { in: [a, b] } } });
  await owner.$disconnect();
  await app.$disconnect();
});

describe('Row-Level Security between companies', () => {
  it('a company sees only its own customers', async () => {
    const rows = await forTenant(app, a).customer.findMany({ where: { companyId: { in: [a, b] } } });
    expect(rows.map((r) => r.name)).toEqual(['Customer of A']);
  });

  it('even asking for another company by id returns nothing', async () => {
    const rows = await forTenant(app, a).customer.findMany({ where: { companyId: b } });
    expect(rows).toHaveLength(0);
  });

  it('cannot insert a row for another company', async () => {
    await expect(
      forTenant(app, a).customer.create({ data: { companyId: b, name: 'Sneaky' } }),
    ).rejects.toThrow();
  });

  it('without a tenant context, no tenant rows are visible', async () => {
    const rows = await app.customer.findMany({ where: { companyId: { in: [a, b] } } });
    expect(rows).toHaveLength(0);
  });

  it('platform admin can read across companies but not write', async () => {
    const admin = forPlatformAdmin(app);
    const rows = await admin.customer.findMany({ where: { companyId: { in: [a, b] } } });
    expect(rows).toHaveLength(2);
    await expect(admin.customer.create({ data: { companyId: a, name: 'Admin write' } })).rejects.toThrow();
  });

  it('audit log rows cannot be changed or deleted', async () => {
    const log = await owner.auditLog.create({ data: { companyId: a, action: 'test.event' } });
    await expect(owner.auditLog.update({ where: { id: log.id }, data: { action: 'edited' } })).rejects.toThrow(/append-only/);
    await expect(owner.auditLog.delete({ where: { id: log.id } })).rejects.toThrow(/append-only/);
  });
});
