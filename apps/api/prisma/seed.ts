// Demo data modelled on the clickable prototype. Runs as the table owner (bypasses RLS).
// Safe to re-run: it wipes tenant data first. NEVER run against production.
import 'dotenv/config';
import argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type JobStatus } from '../src/generated/prisma/client.js';

const url = process.env.MIGRATE_DATABASE_URL;
if (!url) throw new Error('MIGRATE_DATABASE_URL is not set');
if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_DEMO_SEED) {
  throw new Error('Refusing to seed demo data in production (set ALLOW_DEMO_SEED=1 for a demo environment)');
}
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

// A demo site on the internet must not use the password printed in the README: set SEED_PASSWORD there.
export const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'Demo1234!';
if (process.env.ALLOW_DEMO_SEED && !process.env.SEED_PASSWORD) {
  throw new Error('Set SEED_PASSWORD when seeding a demo environment, so the demo accounts do not use the public password');
}

async function wipe() {
  await db.$executeRawUnsafe('ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_append_only');
  await db.$executeRawUnsafe('ALTER TABLE stock_movements DISABLE TRIGGER stock_movements_append_only');
  await db.$executeRawUnsafe(`TRUNCATE job_payments, job_invoice_lines, job_invoices, user_sites, user_tokens,
    part_requests, job_parts, stock_transfers, stock_movements, site_stock, qr_print_logs, job_tests, job_components, job_events,
    jobs, devices, parts, counters, refresh_tokens, audit_logs, invoices, subscriptions, users, teams, sites, customers,
    companies, plans RESTART IDENTITY CASCADE`);
  await db.$executeRawUnsafe('ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_append_only');
  await db.$executeRawUnsafe('ALTER TABLE stock_movements ENABLE TRIGGER stock_movements_append_only');
}

const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 3600 * 1000);

async function main() {
  await wipe();
  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });

  // Plans (prices from the prototype's Plans page; Basic price still to be confirmed)
  const trial = await db.plan.create({
    data: { code: 'trial', name: 'Trial', priceCents: 0, maxJobsPerMonth: 50, maxSites: 1, maxUsers: 1, features: ['14-day trial'] },
  });
  const basic = await db.plan.create({
    data: {
      code: 'basic', name: 'Basic', priceCents: 9900, maxJobsPerMonth: 200, maxSites: 2, maxUsers: 5,
      features: ['200 credits per month (adjustable by admin)', 'Credits per job: inspection 1, chip replacement 3, board repair 5', 'Stock deduction included', 'Alert at 80% of monthly credits'],
    },
  });
  const pro = await db.plan.create({
    data: {
      code: 'pro', name: 'Pro', priceCents: 29900, maxJobsPerMonth: null, maxSites: null, maxUsers: null,
      features: ['Unlimited credits', 'Multiple repair-center sites', 'Roles: Site Manager, Head Technician, Technician, Stock Keeper', 'Head Technician assigns jobs to technicians', 'Audit log and QR labels'],
    },
  });

  // Platform owner
  await db.user.create({
    data: { email: 'owner@bmerc.demo', passwordHash, fullName: 'Platform Owner', isPlatformAdmin: true },
  });

  const periodStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const periodEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);

  // ── Main demo company: Siam Hash Repair Co. (Pro) ──
  const siam = await db.company.create({
    data: { name: 'Siam Hash Repair Co.', legalName: 'Siam Hash Repair Co., Ltd.', taxId: '0105560000000', billingEmail: 'admin@siamhash.demo',
      country: 'TH', currency: 'THB', taxRateBps: 700 },
  });
  await db.subscription.create({
    data: { companyId: siam.id, planId: pro.id, status: 'active', currentPeriodStart: periodStart, currentPeriodEnd: periodEnd },
  });
  const C = siam.id;

  const bitfarm = await db.customer.create({
    data: { companyId: C, name: 'BitFarm Siam', contactName: 'Krit S.', email: 'ops@bitfarm.th', phone: '+66 81 000 1111', country: 'Thailand' },
  });
  const bkk = await db.customer.create({
    data: { companyId: C, name: 'Bangkok Miner Co.', contactName: 'Nok P.', email: 'admin@bkkminer.th', phone: '+66 82 000 2222', country: 'Thailand' },
  });

  const site1 = await db.site.create({
    data: { companyId: C, name: 'Bangkok Hash Lab 01', country: 'Thailand', province: 'Bangkok', status: 'active' },
  });
  const site2 = await db.site.create({
    data: { companyId: C, name: 'Chonburi Repair Hub', country: 'Thailand', province: 'Chonburi', status: 'active' },
  });

  const admin = await db.user.create({
    data: { companyId: C, email: 'admin@siamhash.demo', passwordHash, fullName: 'Anan W.', role: 'company_admin' },
  });
  const alpha = await db.team.create({ data: { companyId: C, siteId: site1.id, name: 'Team Alpha' } });
  const beta = await db.team.create({ data: { companyId: C, siteId: site2.id, name: 'Team Beta' } });
  const head = await db.user.create({
    data: { companyId: C, email: 'head@siamhash.demo', passwordHash, fullName: 'Tanawat K.', role: 'head_technician', teamId: alpha.id },
  });
  const tech1 = await db.user.create({
    data: { companyId: C, email: 'tech@siamhash.demo', passwordHash, fullName: 'Somsak P.', role: 'technician', teamId: alpha.id },
  });
  const tech2 = await db.user.create({
    data: { companyId: C, email: 'tech2@siamhash.demo', passwordHash, fullName: 'Wichai R.', role: 'technician', teamId: beta.id },
  });
  // Stock keeper for Bangkok only: stock and jobs of site1.
  const keeper = await db.user.create({
    data: { companyId: C, email: 'stock@siamhash.demo', passwordHash, fullName: 'Malee T.', role: 'stock_keeper' },
  });
  await db.userSite.create({ data: { companyId: C, userId: keeper.id, siteId: site1.id } });
  await db.team.update({ where: { id: alpha.id }, data: { headUserId: head.id } });
  // Site manager for Chonburi only: sees site2's jobs and staff, not Bangkok's.
  const manager = await db.user.create({
    data: { companyId: C, email: 'manager@siamhash.demo', passwordHash, fullName: 'Pranee S.', role: 'site_manager' },
  });
  await db.userSite.create({ data: { companyId: C, userId: manager.id, siteId: site2.id } });

  // Parts + stock per site (some below minimum to show "Low")
  // Which miner models each part fits (names from the miner_models list).
  const S19_SERIES = ['Antminer S19', 'Antminer S19 Pro', 'Antminer S19j Pro', 'Antminer S19 XP', 'Antminer T19'];
  const ALL_MODELS = [...S19_SERIES, 'Antminer S21', 'Antminer T21'];
  const partDefs = [
    { sku: 'CHIP-BM1398', name: 'Hash chip BM1398', category: 'Chips', minQty: 50, s1: 120, s2: 30, fits: ['Antminer S19', 'Antminer S19 Pro', 'Antminer T19'] },
    { sku: 'CHIP-BM1362', name: 'Hash chip BM1362', category: 'Chips', minQty: 40, s1: 25, s2: 60, fits: ['Antminer S19j Pro'] },
    { sku: 'PSU-APW12', name: 'Power supply APW12', category: 'Power', minQty: 3, s1: 6, s2: 2, fits: S19_SERIES },
    { sku: 'FAN-12038', name: 'Fan 12038 12V', category: 'Cooling', minQty: 20, s1: 44, s2: 18, fits: ALL_MODELS },
    { sku: 'CB-S19', name: 'Control board S19', category: 'Boards', minQty: 2, s1: 4, s2: 0, fits: ['Antminer S19', 'Antminer S19 Pro', 'Antminer S19j Pro', 'Antminer T19'] },
    { sku: 'TP-GEL', name: 'Thermal gel (100g)', category: 'Consumables', minQty: 5, s1: 12, s2: 7, fits: ALL_MODELS },
  ];
  const modelIdByName = new Map((await db.minerModel.findMany({ select: { id: true, name: true } })).map((m) => [m.name, m.id]));
  const parts: Record<string, string> = {};
  for (const p of partDefs) {
    const part = await db.part.create({ data: { companyId: C, sku: p.sku, name: p.name, category: p.category, minQty: p.minQty, modelIds: p.fits.flatMap((n) => modelIdByName.get(n) ?? []) } });
    parts[p.sku] = part.id;
    for (const [siteId, qty] of [[site1.id, p.s1], [site2.id, p.s2]] as const) {
      await db.siteStock.create({ data: { companyId: C, siteId, partId: part.id, qty } });
      if (qty > 0) {
        await db.stockMovement.create({
          data: { companyId: C, siteId, partId: part.id, type: 'in', qty, reason: 'Opening balance', actorId: admin.id, createdAt: daysAgo(30) },
        });
      }
    }
  }

  // Devices + jobs across every board column
  const jobDefs: Array<{ model: string; serial: string; cust: string; site: string; status: JobStatus; who?: string; fault: string; days: number; qr?: string; reason?: string }> = [
    { model: 'Antminer S19 Pro', serial: 'S19P-220410-0113', cust: bitfarm.id, site: site1.id, status: 'in_repair', who: tech1.id, fault: 'Hashboard 2 not detected', days: 3 },
    { model: 'Antminer S19j Pro', serial: 'S19JP-221102-0451', cust: bitfarm.id, site: site1.id, status: 'waiting_parts', who: tech1.id, fault: 'PSU fails under load', days: 5 },
    { model: 'Antminer S19 XP', serial: 'S19XP-230115-0078', cust: bkk.id, site: site2.id, status: 'todo', fault: 'Low hashrate on chain 0', days: 1 },
    { model: 'Antminer T19', serial: 'T19-210908-0332', cust: bkk.id, site: site2.id, status: 'unrepairable', who: tech2.id, fault: 'Burnt control board', days: 9, reason: 'Control board and two hashboards burnt; repair cost exceeds device value' },
    { model: 'Antminer S19 Pro', serial: 'S19P-220410-0120', cust: bitfarm.id, site: site1.id, status: 'qc_passed', who: tech1.id, fault: 'Fan error', days: 7, qr: 'BMERC-7K3QX9MD' },
    { model: 'Whatsminer M30S', serial: 'M30S-211230-0999', cust: bitfarm.id, site: site1.id, status: 'todo', fault: 'No network connection', days: 0 },
    { model: 'Antminer S19 Pro', serial: 'S19P-220410-0188', cust: bkk.id, site: site2.id, status: 'in_repair', who: tech2.id, fault: 'Temperature sensor error', days: 2 },
  ];
  let n = 100;
  for (const j of jobDefs) {
    n += 1;
    const device = await db.device.create({
      data: { companyId: C, customerId: j.cust, model: j.model, serialNo: j.serial, hashrateTh: 104, qrCode: j.qr ?? null },
    });
    const job = await db.job.create({
      data: {
        companyId: C, number: `TK-2026-${String(n).padStart(4, '0')}`, deviceId: device.id, customerId: j.cust, siteId: j.site,
        assigneeId: j.who ?? null, status: j.status, reportedFault: j.fault, unrepairableReason: j.reason ?? null,
        receivedAt: daysAgo(j.days), qcPassedAt: j.status === 'qc_passed' ? daysAgo(1) : null,
      },
    });
    await db.jobEvent.create({ data: { companyId: C, jobId: job.id, toStatus: 'todo', actorId: admin.id, note: 'Device received', createdAt: daysAgo(j.days) } });
    if (j.status !== 'todo') {
      await db.jobEvent.create({ data: { companyId: C, jobId: job.id, fromStatus: 'todo', toStatus: j.status, actorId: j.who ?? head.id, createdAt: daysAgo(Math.max(0, j.days - 1)) } });
    }
    if (j.status === 'qc_passed') {
      await db.jobComponent.create({ data: { companyId: C, jobId: job.id, component: 'Fan', workDone: 'Replaced 2 fans', result: 'replaced' } });
      const mv = await db.stockMovement.create({
        data: { companyId: C, siteId: j.site, partId: parts['FAN-12038'], type: 'out', qty: -2, jobId: job.id, actorId: j.who, reason: 'Used in job', createdAt: daysAgo(2) },
      });
      await db.jobPart.create({ data: { companyId: C, jobId: job.id, partId: parts['FAN-12038'], qty: 2, movementId: mv.id } });
    }
  }
  await db.counter.create({ data: { companyId: C, key: 'job:2026', value: n } });

  // ── Other companies for the platform-owner views ──
  const others = [
    { name: 'Rayong Mining Solutions', plan: basic.id, sub: 'active' as const, status: 'active' as const, email: 'admin@rayong.demo' },
    { name: 'Eastern ASIC Lab', plan: trial.id, sub: 'trialing' as const, status: 'active' as const, email: 'admin@easternasic.demo' },
    { name: 'North Miner Service', plan: basic.id, sub: 'suspended' as const, status: 'suspended' as const, email: 'admin@northminer.demo' },
  ];
  for (const o of others) {
    const co = await db.company.create({ data: { name: o.name, billingEmail: o.email, status: o.status, country: 'TH', currency: 'THB' } });
    await db.subscription.create({ data: { companyId: co.id, planId: o.plan, status: o.sub, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd } });
    await db.user.create({ data: { companyId: co.id, email: o.email, passwordHash, fullName: `${o.name} Admin`, role: 'company_admin' } });
    await db.customer.create({ data: { companyId: co.id, name: `${o.name.split(' ')[0]} Farm`, country: 'Thailand' } });
    await db.site.create({ data: { companyId: co.id, name: `${o.name.split(' ')[0]} Site 01`, country: 'Thailand', status: 'active' } });
    if (o.plan === basic.id) {
      await db.invoice.create({
        data: {
          companyId: co.id, number: `INV-2026-${co.id.slice(0, 4).toUpperCase()}`, periodStart, periodEnd, amountCents: 9900, taxRateBps: 700, taxCents: 693,
          status: o.status === 'suspended' ? 'open' : 'paid', dueAt: daysAgo(o.status === 'suspended' ? 15 : -7),
          paidAt: o.status === 'suspended' ? null : daysAgo(2),
        },
      });
    }
  }
  await db.invoice.create({
    data: { companyId: C, number: 'INV-2026-0011', periodStart, periodEnd, amountCents: 29900, taxRateBps: 700, taxCents: 2093, status: 'paid', dueAt: daysAgo(-7), paidAt: daysAgo(3), paymentRef: 'PayPal demo' },
  });

  // Miner models are platform reference data (migration 20261124120000), kept across reseeds: link to them.
  await db.$executeRawUnsafe(`UPDATE devices d SET miner_model_id = m.id FROM miner_models m WHERE lower(trim(d.model)) = lower(m.name)`);
  await db.$executeRawUnsafe(`UPDATE parts p SET model_ids = sub.ids FROM (
    SELECT p2.id, array_agg(m.id) AS ids FROM parts p2 JOIN miner_models m ON m.chip_model IS NOT NULL AND p2.name ~* ('\\m' || m.chip_model || '\\M') GROUP BY p2.id
  ) sub WHERE p.id = sub.id`);

  console.log(`Seeded. All demo accounts use password: ${process.env.SEED_PASSWORD ? '(the SEED_PASSWORD you set)' : DEMO_PASSWORD}`);
  console.log('  owner@bmerc.demo (platform owner) · admin@siamhash.demo (company admin) · manager@siamhash.demo (site manager, Chonburi)');
  console.log('  head@siamhash.demo (head technician) · tech@siamhash.demo (technician) · stock@siamhash.demo (stock keeper, Bangkok) · admin@northminer.demo (suspended company)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
