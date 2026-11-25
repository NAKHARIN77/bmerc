import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { DbService } from '../db/db.service.js';
import { AuditService } from '../audit/audit.service.js';
import { LogView } from '../audit/log-view.js';
import { conflict, notFound, parse } from '../common/http.js';
import { PageQuery, pageArgs, paged, uuid } from '../common/paging.js';
import { limitsFor, usageFor } from '../common/limits.js';
import { CurrentUser, PlatformOnly } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth-user.js';
import type { JobStatus } from '../generated/prisma/enums.js';
import { Prisma } from '../generated/prisma/client.js';
import { monthStartUtc, periods } from '../common/periods.js';
import { settleInvoice } from '../billing/settle.js';

// Platform owner console (prototype owner screens). The owner runs the service: companies, plans, billing and sites.
// No access to a company's parts, stock, customers or repair work (decided 2026-11-24); job numbers come from
// platform_job_counts(), which returns counts only.

type Counts = { company_id: string; site_id: string; status: JobStatus; jobs: bigint; received_this_month: bigint; credits_this_month: bigint };
const OPEN: JobStatus[] = ['todo', 'in_repair', 'waiting_parts'];

const LimitsBody = z.object({
  maxJobsPerMonth: z.number().int().min(0).max(1_000_000).nullable().optional(),
  maxSites: z.number().int().min(1).max(10_000).nullable().optional(),
  maxUsers: z.number().int().min(1).max(100_000).nullable().optional(),
  reset: z.boolean().optional(), // back to the plan's limits
  reason: z.string().trim().min(3).max(500),
});
const PlanBody = z
  .object({
    priceCents: z.number().int().min(0).max(100_000_000).optional(),
    features: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
    maxJobsPerMonth: z.number().int().min(0).nullable().optional(),
    maxSites: z.number().int().min(1).nullable().optional(),
    maxUsers: z.number().int().min(1).nullable().optional(),
    // Applies to companies that buy the plan from now on; existing companies keep the weights they bought.
    creditWeights: z.object({ inspection: z.number().int().min(0).max(100), chip_replacement: z.number().int().min(0).max(100), board_repair: z.number().int().min(0).max(100) }).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update');
const ReasonBody = z.object({ reason: z.string().trim().max(500).optional() });
const InvoiceQuery = PageQuery.extend({
  status: z.enum(['open', 'paid', 'void', 'overdue']).optional(),
  q: z.string().trim().max(100).optional(),
});
const MarkPaidBody = z.object({ paymentRef: z.string().trim().min(2).max(200) });
const AuditQuery = PageQuery.extend({ action: z.string().max(100).optional(), companyId: z.uuid().optional(), q: z.string().trim().max(100).optional() });

const PeriodQuery = z.object({ period: z.enum(['day', 'week', 'month']).default('month') });
const startedAt = new Date();

const total = (i: { amountCents: number; taxCents: number }) => i.amountCents + i.taxCents;


@Controller('platform')
@PlatformOnly()
export class PlatformController {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  private async jobCounts() {
    return this.db.raw.$queryRaw<Counts[]>`SELECT * FROM platform_job_counts()`;
  }

  /** Payment state for the Quotas / Companies tables: overdue beats open beats paid. */
  private paymentOf(invoices: Array<{ status: string; dueAt: Date }>, plan: string | null) {
    const now = Date.now();
    if (invoices.some((i) => i.status === 'open' && i.dueAt.getTime() < now)) return 'Overdue';
    if (invoices.some((i) => i.status === 'open')) return 'Due';
    if (invoices.some((i) => i.status === 'paid')) return 'Paid';
    return plan === 'trial' ? 'Trial' : 'No invoice';
  }

  /** Every company with plan, limits, usage, payment and job numbers (Platform dashboard, Companies, Quotas). */
  @Get('companies')
  async companies() {
    const [companies, counts] = await Promise.all([
      this.db.raw.company.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true, name: true, country: true, status: true, billingEmail: true, createdAt: true,
          subscription: { select: { status: true, overrideLimits: true, plan: { select: { code: true, name: true, priceCents: true } } } },
          invoices: { select: { status: true, dueAt: true }, where: { status: { in: ['open', 'paid'] } } },
          _count: { select: { users: { where: { isActive: true } } } },
        },
      }),
      this.jobCounts(),
    ]);
    const sites = await this.db.platform().site.groupBy({ by: ['companyId', 'status'], _count: { _all: true } });
    return Promise.all(
      companies.map(async (c) => {
        const mine = counts.filter((r) => r.company_id === c.id);
        const n = (pred: (r: Counts) => boolean, k: 'jobs' | 'received_this_month' | 'credits_this_month' = 'jobs') => mine.filter(pred).reduce((a, r) => a + Number(r[k]), 0);
        const limits = await limitsFor(this.db.raw, c.id);
        const siteRows = sites.filter((s) => s.companyId === c.id);
        return {
          id: c.id, name: c.name, country: c.country, status: c.status, billingEmail: c.billingEmail, createdAt: c.createdAt,
          plan: c.subscription?.plan ?? null,
          subscriptionStatus: c.subscription?.status ?? null,
          hasOverride: !!c.subscription?.overrideLimits,
          payment: this.paymentOf(c.invoices, c.subscription?.plan.code ?? null),
          limits: { jobsPerMonth: limits.maxJobsPerMonth, sites: limits.maxSites, users: limits.maxUsers },
          usage: {
            creditsThisMonth: n(() => true, 'credits_this_month'),
            sites: siteRows.filter((s) => s.status !== 'inactive').reduce((a, s) => a + s._count._all, 0),
            users: c._count.users,
          },
          sites: siteRows.reduce((a, s) => a + s._count._all, 0),
          jobs: { open: n((r) => OPEN.includes(r.status)), waitingParts: n((r) => r.status === 'waiting_parts'), cannotRepair: n((r) => r.status === 'unrepairable'), atQc: n((r) => r.status === 'qc_passed') },
        };
      }),
    );
  }

  /** Totals for the platform dashboard: revenue, payments, job status mix. */
  @Get('overview')
  async overview() {
    const now = new Date();
    const since = monthStartUtc(now, 5);
    const [paid, open, counts] = await Promise.all([
      this.db.raw.invoice.findMany({ where: { status: 'paid', paidAt: { gte: since } }, select: { paidAt: true, amountCents: true, taxCents: true, currency: true } }),
      this.db.raw.invoice.findMany({ where: { status: 'open' }, select: { amountCents: true, taxCents: true, dueAt: true, slipUploadedAt: true } }),
      this.jobCounts(),
    ]);
    const months = Array.from({ length: 6 }, (_, i) => monthStartUtc(now, 5 - i));
    const revenue = months.map((m, i) => {
      const end = months[i + 1] ?? monthStartUtc(now, -1);
      return { month: m.toISOString().slice(0, 7), collectedCents: paid.filter((p) => p.paidAt! >= m && p.paidAt! < end).reduce((a, p) => a + total(p), 0) };
    });
    const byStatus: Record<string, number> = {};
    for (const r of counts) byStatus[r.status] = (byStatus[r.status] ?? 0) + Number(r.jobs);
    const companies = await this.db.raw.company.groupBy({ by: ['status'], _count: { _all: true } });
    return {
      currency: 'USD',
      collectedThisMonthCents: revenue[5].collectedCents,
      outstandingCents: open.filter((i) => i.dueAt < now).reduce((a, i) => a + total(i), 0),
      pendingPayments: open.length,
      companies: Object.fromEntries(companies.map((c) => [c.status, c._count._all])),
      jobs: { byStatus, open: OPEN.reduce((a, s) => a + (byStatus[s] ?? 0), 0) },
      revenue,
    };
  }

  /** One company: details, plan and its sites with teams, technicians and open jobs (prototype "Company sites"). */
  @Get('companies/:id')
  async company(@Param('id') id: string) {
    const companyId = parse(uuid, id);
    const c = await this.db.raw.company.findUnique({
      where: { id: companyId },
      select: {
        id: true, name: true, legalName: true, country: true, status: true, billingEmail: true, createdAt: true,
        subscription: { select: { status: true, overrideLimits: true, currentPeriodEnd: true, plan: { select: { id: true, code: true, name: true, priceCents: true, maxJobsPerMonth: true, maxSites: true, maxUsers: true } } } },
      },
    });
    if (!c) throw notFound('Company');
    const [sites, techs, counts, limits, usage] = await Promise.all([
      this.db.platform().site.findMany({
        where: { companyId },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, country: true, province: true, status: true, teams: { select: { id: true } } },
      }),
      this.db.raw.user.findMany({ where: { companyId, isActive: true, role: { in: ['technician', 'head_technician'] } }, select: { team: { select: { siteId: true } } } }),
      this.jobCounts(),
      limitsFor(this.db.raw, companyId),
      usageFor(this.db.raw, companyId),
    ]);
    const mine = counts.filter((r) => r.company_id === companyId);
    return {
      ...c,
      limits: { jobsPerMonth: limits.maxJobsPerMonth, sites: limits.maxSites, users: limits.maxUsers },
      usage,
      sites: sites.map((s) => ({
        id: s.id, name: s.name, country: s.country, province: s.province, status: s.status,
        teams: s.teams.length,
        technicians: techs.filter((t) => t.team?.siteId === s.id).length,
        openJobs: mine.filter((r) => r.site_id === s.id && OPEN.includes(r.status)).reduce((a, r) => a + Number(r.jobs), 0),
      })),
    };
  }

  /** "Edit limits": an override on top of the plan, for agreed exceptions. A reason is required. */
  @Patch('companies/:id/limits')
  async setLimits(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const b = parse(LimitsBody, body);
    const companyId = parse(uuid, id);
    const sub = await this.db.raw.subscription.findUnique({ where: { companyId }, select: { overrideLimits: true } });
    if (!sub) throw notFound('Subscription');
    const next = b.reset
      ? null
      : Object.fromEntries((['maxJobsPerMonth', 'maxSites', 'maxUsers'] as const).filter((k) => k in b).map((k) => [k, b[k] ?? null]));
    await this.db.raw.subscription.update({ where: { companyId }, data: { overrideLimits: next ?? Prisma.DbNull } });
    await this.audit.log({ companyId, actorUserId: me.id, action: 'platform.limits_changed', entityType: 'company', entityId: companyId, before: { overrideLimits: sub.overrideLimits }, after: { overrideLimits: next, reason: b.reason }, ip: req.ip });
    return { ok: true };
  }

  /** Suspend: staff can still log in but only see the "Account suspended" page and billing. Data is kept. */
  @Post('companies/:id/suspend')
  suspend(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    return this.setStatus(me, id, 'suspended', parse(ReasonBody, body ?? {}).reason, req);
  }

  @Post('companies/:id/activate')
  activate(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    return this.setStatus(me, id, 'active', parse(ReasonBody, body ?? {}).reason, req);
  }

  private async setStatus(me: AuthUser, id: string, status: 'active' | 'suspended', reason: string | undefined, req: Request) {
    const companyId = parse(uuid, id);
    const c = await this.db.raw.company.findUnique({ where: { id: companyId }, select: { status: true, subscription: { select: { plan: { select: { code: true } } } } } });
    if (!c) throw notFound('Company');
    if (c.status === 'closed') throw conflict('COMPANY_CLOSED', 'This company is closed');
    // Back to the state its plan implies: a trial stays a trial.
    const subStatus = status === 'suspended' ? 'suspended' : c.subscription?.plan.code === 'trial' ? 'trialing' : 'active';
    await this.db.raw.$transaction([
      this.db.raw.company.update({ where: { id: companyId }, data: { status } }),
      this.db.raw.subscription.updateMany({ where: { companyId }, data: { status: subStatus } }),
    ]);
    await this.audit.log({ companyId, actorUserId: me.id, action: status === 'suspended' ? 'platform.company_suspended' : 'platform.company_activated', entityType: 'company', entityId: companyId, before: { status: c.status }, after: { status, reason: reason ?? null }, ip: req.ip });
    return { status };
  }

  /** Every site of every company, with teams, technicians and open jobs (owner "Sites"). */
  @Get('sites')
  async sites() {
    const [sites, techs, counts] = await Promise.all([
      this.db.platform().site.findMany({
        orderBy: [{ company: { name: 'asc' } }, { name: 'asc' }],
        select: { id: true, name: true, country: true, province: true, status: true, company: { select: { id: true, name: true } }, teams: { select: { id: true } } },
      }),
      this.db.raw.user.findMany({ where: { isActive: true, role: { in: ['technician', 'head_technician'] }, teamId: { not: null } }, select: { team: { select: { siteId: true } } } }),
      this.jobCounts(),
    ]);
    return sites.map(({ teams, ...s }) => ({
      ...s,
      teams: teams.length,
      technicians: techs.filter((t) => t.team?.siteId === s.id).length,
      openJobs: counts.filter((c) => c.site_id === s.id && OPEN.includes(c.status)).reduce((a, c) => a + Number(c.jobs), 0),
    }));
  }

  /** Billed, collected and outstanding per day, week or month (owner "Monthly revenue"). */
  @LogView('platform_revenue')
  @Get('revenue')
  async revenue(@Query() query: unknown) {
    const { period } = parse(PeriodQuery, query);
    const list = periods(period);
    const invoices = await this.db.raw.invoice.findMany({
      where: { status: { not: 'void' }, OR: [{ createdAt: { gte: list[0].from } }, { paidAt: { gte: list[0].from } }, { status: 'open' }] },
      select: { amountCents: true, taxCents: true, status: true, createdAt: true, paidAt: true, dueAt: true },
    });
    const now = new Date();
    const sum = (rows: typeof invoices) => rows.reduce((a, i) => a + total(i), 0);
    return {
      currency: 'USD',
      rows: list.map((p) => ({
        label: p.label,
        billedCents: sum(invoices.filter((i) => i.createdAt >= p.from && i.createdAt < p.to)),
        collectedCents: sum(invoices.filter((i) => i.paidAt && i.paidAt >= p.from && i.paidAt < p.to)),
        // Invoices that fell due in this period and are still unpaid.
        outstandingCents: sum(invoices.filter((i) => i.status === 'open' && i.dueAt >= p.from && i.dueAt < p.to && i.dueAt < now)),
      })),
    };
  }

  /** Owner reports: companies by plan and new companies per day, week or month. */
  @Get('reports')
  async reports(@Query() query: unknown) {
    const { period } = parse(PeriodQuery, query);
    const list = periods(period);
    const [plans, companies] = await Promise.all([
      this.db.raw.plan.findMany({
        orderBy: { priceCents: 'asc' },
        select: { name: true, priceCents: true, subscriptions: { select: { company: { select: { status: true } } } } },
      }),
      this.db.raw.company.findMany({ where: { createdAt: { gte: list[0].from } }, select: { createdAt: true } }),
    ]);
    return {
      byPlan: plans.map((p) => {
        const active = p.subscriptions.filter((s) => s.company.status === 'active').length;
        return { plan: p.name, companies: p.subscriptions.length, active, monthlyBilledCents: active * p.priceCents };
      }),
      newCompanies: list.map((p) => ({ label: p.label, count: companies.filter((c) => c.createdAt >= p.from && c.createdAt < p.to).length })),
    };
  }

  /** Platform health from real signals: database, API uptime, sign-ins and activity in the last 24 hours. */
  @Get('health')
  async health() {
    const t0 = performance.now();
    await this.db.raw.$queryRaw`SELECT 1`;
    const dbMs = Math.round(performance.now() - t0);
    const since = new Date(Date.now() - 86_400_000);
    const [failed, logins, events, size] = await Promise.all([
      this.db.raw.auditLog.count({ where: { action: 'auth.login_failed', createdAt: { gte: since } } }),
      this.db.raw.auditLog.count({ where: { action: 'auth.login', createdAt: { gte: since } } }),
      this.db.raw.auditLog.count({ where: { createdAt: { gte: since } } }),
      this.db.raw.$queryRaw<Array<{ bytes: bigint }>>`SELECT pg_database_size(current_database())::bigint AS bytes`,
    ]);
    return {
      apiStartedAt: startedAt,
      uptimeSeconds: Math.round(process.uptime()),
      database: { ok: true, latencyMs: dbMs, sizeBytes: Number(size[0].bytes) },
      last24h: { logins, failedLogins: failed, auditEvents: events },
      // Invites and password resets are sent by email only when SMTP_URL is set (see MailService).
      mail: { configured: !!process.env.SMTP_URL && process.env.SMTP_URL !== 'json', from: process.env.MAIL_FROM ?? null },
      node: process.version,
    };
  }

  @Get('plans')
  async plans() {
    const plans = await this.db.raw.plan.findMany({ orderBy: { priceCents: 'asc' }, include: { _count: { select: { subscriptions: true } } } });
    return plans.map(({ _count, ...p }) => ({ ...p, companies: _count.subscriptions }));
  }

  /** Price and what is included. Shown on the pricing page, landing page and company subscription page. */
  @Patch('plans/:id')
  async updatePlan(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const b = parse(PlanBody, body);
    const before = await this.db.raw.plan.findUnique({ where: { id: parse(uuid, id) } });
    if (!before) throw notFound('Plan');
    const after = await this.db.raw.plan.update({ where: { id }, data: b });
    await this.audit.log({ actorUserId: me.id, action: 'platform.plan_changed', entityType: 'plan', entityId: id, before, after, ip: req.ip });
    return after;
  }

  /** Subscription invoices across companies (Payments; status=open is "Pending payments"). */
  @LogView('platform_invoices')
  @Get('invoices')
  async invoices(@Query() query: unknown) {
    const q = parse(InvoiceQuery, query);
    const where = {
      ...(q.status === 'overdue' ? { status: 'open' as const, dueAt: { lt: new Date() } } : q.status ? { status: q.status } : {}),
      ...(q.q ? { OR: [{ number: { contains: q.q, mode: 'insensitive' as const } }, { company: { name: { contains: q.q, mode: 'insensitive' as const } } }] } : {}),
    };
    const [rows, count] = await Promise.all([
      this.db.raw.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(q),
        select: {
          id: true, number: true, periodStart: true, periodEnd: true, amountCents: true, taxCents: true, taxRateBps: true, currency: true,
          status: true, dueAt: true, paidAt: true, paymentRef: true, slipUploadedAt: true, createdAt: true,
          plan: { select: { name: true } },
          company: { select: { id: true, name: true, subscription: { select: { plan: { select: { name: true } } } } } },
        },
      }),
      this.db.raw.invoice.count({ where }),
    ]);
    const now = new Date();
    return paged(rows.map(({ company, plan, ...i }) => ({ ...i, totalCents: total(i), overdue: i.status === 'open' && i.dueAt < now, company: { id: company.id, name: company.name }, plan: plan?.name ?? company.subscription?.plan.name ?? null })), count, q);
  }

  /** Confirm a payment by hand (bank transfer, or until the payment provider is connected). */
  @Post('invoices/:id/mark-paid')
  async markPaid(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const { paymentRef } = parse(MarkPaidBody, body);
    const inv = await this.db.raw.invoice.findUnique({ where: { id: parse(uuid, id) }, select: { id: true, status: true } });
    if (!inv) throw notFound('Invoice');
    if (inv.status !== 'open') throw conflict('INVOICE_NOT_OPEN', 'Only an open invoice can be marked as paid');
    const done = await settleInvoice(this.db.raw, inv.id, { paymentRef, confirmedById: me.id });
    if (!done) throw conflict('INVOICE_NOT_OPEN', 'Only an open invoice can be marked as paid');
    await this.audit.log({
      companyId: done.companyId, actorUserId: me.id, action: 'platform.invoice_paid', entityType: 'invoice', entityId: inv.id,
      before: { status: 'open' }, after: { status: 'paid', paymentRef, planId: done.planId, reactivated: done.reactivated }, ip: req.ip,
    });
    return { ok: true, reactivated: done.reactivated };
  }

  /** Pending payments → Reject: the uploaded slip does not match, so it is cleared and the invoice stays open. */
  @Post('invoices/:id/reject')
  async rejectSlip(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const { reason } = parse(ReasonBody, body ?? {});
    const inv = await this.db.raw.invoice.findUnique({ where: { id: parse(uuid, id) }, select: { id: true, status: true, companyId: true } });
    if (!inv) throw notFound('Invoice');
    if (inv.status !== 'open') throw conflict('INVOICE_NOT_OPEN', 'Only an open invoice can be rejected');
    await this.db.raw.invoice.update({ where: { id: inv.id }, data: { slipUrl: null, slipUploadedAt: null } });
    await this.audit.log({ companyId: inv.companyId, actorUserId: me.id, action: 'platform.payment_rejected', entityType: 'invoice', entityId: inv.id, after: { reason: reason ?? null }, ip: req.ip });
    return { ok: true };
  }

  /** Audit log across every company (the company admin sees only their own). */
  @LogView('audit_log')
  @Get('audit-logs')
  async auditLogs(@Query() query: unknown) {
    const q = parse(AuditQuery, query);
    const where = {
      ...(q.companyId ? { companyId: q.companyId } : {}),
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.q ? { OR: [{ action: { contains: q.q, mode: 'insensitive' as const } }, { entityType: { contains: q.q, mode: 'insensitive' as const } }] } : {}),
    };
    const [rows, count] = await Promise.all([
      this.db.raw.auditLog.findMany({ where, orderBy: { id: 'desc' }, ...pageArgs(q), select: { id: true, action: true, entityType: true, entityId: true, ip: true, createdAt: true, actorUserId: true, company: { select: { id: true, name: true } } } }),
      this.db.raw.auditLog.count({ where }),
    ]);
    const actors = new Map(
      (await this.db.raw.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.actorUserId).filter((x): x is string => !!x))] } }, select: { id: true, fullName: true, email: true } })).map((u) => [u.id, u]),
    );
    return paged(rows.map(({ actorUserId, ...r }) => ({ ...r, id: r.id.toString(), actor: actorUserId ? (actors.get(actorUserId) ?? null) : null })), count, q);
  }
}
