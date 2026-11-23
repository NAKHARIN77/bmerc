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
  const both = { companyId: { in: [a, b] } };
  await owner.jobPayment.deleteMany({ where: both });
  await owner.jobInvoice.deleteMany({ where: both }); // lines cascade
  await owner.job.deleteMany({ where: both });
  await owner.device.deleteMany({ where: both });
  await owner.userSite.deleteMany({ where: both });
  await owner.site.deleteMany({ where: both });
  await owner.user.deleteMany({ where: both });
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

  it("platform admin cannot read or write a company's customers", async () => {
    const admin = forPlatformAdmin(app);
    const rows = await admin.customer.findMany({ where: { companyId: { in: [a, b] } } });
    expect(rows).toHaveLength(0);
    await expect(admin.customer.create({ data: { companyId: a, name: 'Admin write' } })).rejects.toThrow();
  });

  it('repair invoices, payments and site managers are isolated per company', async () => {
    const tag = Date.now();
    const customer = await owner.customer.findFirstOrThrow({ where: { companyId: b } });
    const site = await owner.site.create({ data: { companyId: b, name: 'Site of B' } });
    const user = await owner.user.create({
      data: { companyId: b, email: `mgr-${tag}@rls.test`, passwordHash: 'x', fullName: 'Manager B', role: 'site_manager' },
    });
    await owner.userSite.create({ data: { companyId: b, userId: user.id, siteId: site.id } });
    const device = await owner.device.create({ data: { companyId: b, customerId: customer.id, model: 'S19', serialNo: `SN-${tag}` } });
    const job = await owner.job.create({
      data: { companyId: b, number: `TK-${tag}`, deviceId: device.id, customerId: customer.id, siteId: site.id },
    });
    const invoice = await owner.jobInvoice.create({
      data: {
        companyId: b, jobId: job.id, number: `RI-${tag}`, currency: 'THB', subtotalCents: 50000, totalCents: 50000,
        lines: { create: [{ companyId: b, kind: 'labor', description: 'Hashboard repair', unitPriceCents: 50000, amountCents: 50000 }] },
      },
    });
    await owner.jobPayment.create({ data: { companyId: b, invoiceId: invoice.id, amountCents: 50000, paidAt: new Date() } });

    const asA = forTenant(app, a);
    expect(await asA.jobInvoice.findMany({ where: { companyId: b } })).toHaveLength(0);
    expect(await asA.jobInvoiceLine.findMany({ where: { companyId: b } })).toHaveLength(0);
    expect(await asA.jobPayment.findMany({ where: { companyId: b } })).toHaveLength(0);
    expect(await asA.userSite.findMany({ where: { companyId: b } })).toHaveLength(0);
    expect(await forTenant(app, b).jobPayment.findMany({ where: { invoiceId: invoice.id } })).toHaveLength(1);

    await expect(
      owner.jobPayment.create({ data: { companyId: b, invoiceId: invoice.id, amountCents: 0, paidAt: new Date() } }),
    ).rejects.toThrow();

    // Platform owner: company data yes, repair work no (enforced by RLS, not only the API).
    const admin = forPlatformAdmin(app);
    expect(await admin.site.findMany({ where: { companyId: b } })).toHaveLength(1);
    expect(await admin.userSite.findMany({ where: { companyId: b } })).toHaveLength(1);
    expect(await admin.job.findMany({ where: { companyId: b } })).toHaveLength(0);
    expect(await admin.device.findMany({ where: { companyId: b } })).toHaveLength(0);
    expect(await admin.jobInvoice.findMany({ where: { companyId: b } })).toHaveLength(0);
    expect(await admin.jobPayment.findMany({ where: { companyId: b } })).toHaveLength(0);
  });

  it('audit log rows cannot be changed or deleted', async () => {
    const log = await owner.auditLog.create({ data: { companyId: a, action: 'test.event' } });
    await expect(owner.auditLog.update({ where: { id: log.id }, data: { action: 'edited' } })).rejects.toThrow(/append-only/);
    await expect(owner.auditLog.delete({ where: { id: log.id } })).rejects.toThrow(/append-only/);
  });
});
