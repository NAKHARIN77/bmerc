import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { DbService } from '../db/db.service.js';
import { AuditService } from '../audit/audit.service.js';
import { LogView } from '../audit/log-view.js';
import { conflict, forbidden, notFound, parse } from '../common/http.js';
import { uuid } from '../common/paging.js';
import { taxOn } from '../common/region.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth-user.js';
import { jobScope } from '../auth/scope.js';
import type { TenantTx } from '../prisma/tenant.js';

// Repair invoices from a company to its own customer (design doc: POST /jobs/:id/invoice, /job-invoices/:id,
// payments). Currency and tax rate come from Company settings and are copied onto the invoice when issued.
// Customers never log in, so staff record the payments they receive. Invoices are never deleted; void instead.

const Line = z.object({
  kind: z.enum(['labor', 'part', 'other']),
  description: z.string().trim().min(1).max(300),
  qty: z.number().positive().max(100_000),
  unitPriceCents: z.number().int().min(0).max(1_000_000_000),
  jobPartId: z.uuid().nullable().optional(),
});
const InvoiceBody = z.object({
  lines: z.array(Line).min(1).max(100),
  dueDays: z.number().int().min(0).max(365).default(7),
  note: z.string().trim().max(1000).nullable().optional(),
});
const PaymentBody = z.object({
  amountCents: z.number().int().positive(),
  method: z.enum(['bank_transfer', 'cash', 'other']),
  paidAt: z.iso.date().optional(),
  reference: z.string().trim().max(200).optional(),
});
const VoidBody = z.object({ reason: z.string().trim().min(3).max(500) });
const DAY = 86_400_000;

const amountOf = (qty: number, unit: number) => Math.round(qty * unit);
const totals = (lines: Array<{ qty: number; unitPriceCents: number }>, bps: number) => {
  const subtotalCents = lines.reduce((a, l) => a + amountOf(l.qty, l.unitPriceCents), 0);
  const taxCents = taxOn(subtotalCents, bps);
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
};

@Controller()
@Roles('company_admin', 'site_manager')
export class JobBillingController {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  /** Issue the job's invoice. One per job. */
  @Post('jobs/:id/invoice')
  async create(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const b = parse(InvoiceBody, body);
    const companyId = me.companyId!;
    const company = await this.db.raw.company.findUniqueOrThrow({ where: { id: companyId }, select: { currency: true, taxRateBps: true, timezone: true } });
    const year = Number(new Intl.DateTimeFormat('en', { timeZone: company.timezone, year: 'numeric' }).format(new Date()));
    const inv = await this.db.tenantTx(me, async (tx) => {
      const job = await tx.job.findFirst({ where: { AND: [{ id: parse(uuid, id) }, jobScope(me)] }, select: { id: true, number: true, invoice: { select: { id: true } } } });
      if (!job) throw notFound('Job');
      if (job.invoice) throw conflict('INVOICE_EXISTS', 'This job already has an invoice', { id: job.invoice.id });
      await this.checkParts(tx, job.id, b.lines);
      const [{ value }] = await tx.$queryRaw<Array<{ value: number }>>`
        INSERT INTO counters (company_id, key, value) VALUES (${companyId}::uuid, ${`rinv:${year}`}, 1)
        ON CONFLICT (company_id, key) DO UPDATE SET value = counters.value + 1
        RETURNING value`;
      const t = totals(b.lines, company.taxRateBps);
      return tx.jobInvoice.create({
        data: {
          companyId, jobId: job.id, number: `RI-${year}-${String(value).padStart(4, '0')}`, currency: company.currency, taxRateBps: company.taxRateBps,
          subtotalCents: t.subtotalCents, taxCents: t.taxCents, totalCents: t.totalCents, dueAt: new Date(Date.now() + b.dueDays * DAY), note: b.note ?? null, createdById: me.id,
          lines: { create: b.lines.map((l, i) => ({ companyId, kind: l.kind, description: l.description, qty: l.qty, unitPriceCents: l.unitPriceCents, amountCents: amountOf(l.qty, l.unitPriceCents), jobPartId: l.jobPartId ?? null, sortOrder: i })) },
        },
        select: { id: true, number: true, totalCents: true },
      });
    });
    await this.audit.log({ companyId, actorUserId: me.id, action: 'repair_invoice.created', entityType: 'job_invoice', entityId: inv.id, after: inv, ip: req.ip });
    return inv;
  }

  /** Change the lines while nothing has been paid. */
  @Patch('job-invoices/:id')
  async update(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const b = parse(InvoiceBody, body);
    const out = await this.db.tenantTx(me, async (tx) => {
      const inv = await this.load(tx, me, id);
      if (inv.status === 'void') throw conflict('INVOICE_VOID', 'This invoice was voided');
      if (inv.paidCents > 0) throw conflict('INVOICE_PAID', 'A payment is recorded, so the lines can no longer change');
      await this.checkParts(tx, inv.jobId, b.lines);
      const t = totals(b.lines, inv.taxRateBps);
      await tx.jobInvoiceLine.deleteMany({ where: { invoiceId: inv.id } });
      return tx.jobInvoice.update({
        where: { id: inv.id },
        data: {
          ...t, dueAt: new Date(inv.issuedAt.getTime() + b.dueDays * DAY), note: b.note ?? null,
          lines: { create: b.lines.map((l, i) => ({ companyId: me.companyId!, kind: l.kind, description: l.description, qty: l.qty, unitPriceCents: l.unitPriceCents, amountCents: amountOf(l.qty, l.unitPriceCents), jobPartId: l.jobPartId ?? null, sortOrder: i })) },
        },
        select: { id: true, totalCents: true },
      });
    });
    await this.audit.log({ companyId: me.companyId, actorUserId: me.id, action: 'repair_invoice.updated', entityType: 'job_invoice', entityId: out.id, after: out, ip: req.ip });
    return out;
  }

  /** Includes the customer's contact details, so every view is logged. */
  @LogView('job_invoice')
  @Get('job-invoices/:id')
  async get(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const db = this.db.tenant(me);
    const inv = await db.jobInvoice.findFirst({
      where: { id: parse(uuid, id), job: jobScope(me) },
      select: {
        id: true, number: true, currency: true, taxRateBps: true, subtotalCents: true, taxCents: true, totalCents: true, paidCents: true,
        status: true, issuedAt: true, dueAt: true, note: true,
        lines: { orderBy: { sortOrder: 'asc' }, select: { id: true, kind: true, description: true, qty: true, unitPriceCents: true, amountCents: true, jobPartId: true } },
        payments: { orderBy: { createdAt: 'asc' }, select: { id: true, method: true, amountCents: true, paidAt: true, reference: true, status: true } },
        job: {
          select: {
            id: true, number: true, status: true, site: { select: { name: true, address: true } },
            device: { select: { model: true, serialNo: true } },
            customer: { select: { name: true, contactName: true, email: true, phone: true } },
          },
        },
      },
    });
    if (!inv) throw notFound('Invoice');
    const company = await this.db.raw.company.findUniqueOrThrow({ where: { id: me.companyId! }, select: { name: true, legalName: true, taxId: true, billingAddress: true } });
    return { ...inv, lines: inv.lines.map((l) => ({ ...l, qty: Number(l.qty) })), company };
  }

  /** Record money received from the customer (cash or transfer). Refuses more than the balance. */
  @Post('job-invoices/:id/payments')
  async pay(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const b = parse(PaymentBody, body);
    const out = await this.db.tenantTx(me, async (tx) => {
      const inv = await this.load(tx, me, id);
      if (inv.status === 'void') throw conflict('INVOICE_VOID', 'This invoice was voided');
      const balance = inv.totalCents - inv.paidCents;
      if (b.amountCents > balance) throw conflict('OVERPAYMENT', `Only ${balance} is left to pay on this invoice`, { balance });
      await tx.jobPayment.create({
        data: {
          companyId: me.companyId!, invoiceId: inv.id, method: b.method, amountCents: b.amountCents, paidAt: b.paidAt ? new Date(b.paidAt) : new Date(),
          reference: b.reference || null, status: 'confirmed', submittedById: me.id, reviewedById: me.id, reviewedAt: new Date(),
        },
      });
      const paid = inv.paidCents + b.amountCents;
      return tx.jobInvoice.update({ where: { id: inv.id }, data: { paidCents: paid, status: paid >= inv.totalCents ? 'paid' : 'partial' }, select: { id: true, status: true, paidCents: true } });
    });
    await this.audit.log({ companyId: me.companyId, actorUserId: me.id, action: 'repair_invoice.payment', entityType: 'job_invoice', entityId: out.id, after: { ...b, status: out.status }, ip: req.ip });
    return out;
  }

  /** Cancel an invoice that has no payments. It stays on record as void. */
  @Post('job-invoices/:id/void')
  async void(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const { reason } = parse(VoidBody, body);
    await this.db.tenantTx(me, async (tx) => {
      const inv = await this.load(tx, me, id);
      if (inv.paidCents > 0) throw conflict('INVOICE_PAID', 'A payment is recorded on this invoice, so it cannot be voided');
      await tx.jobInvoice.update({ where: { id: inv.id }, data: { status: 'void', note: `${inv.note ? `${inv.note}\n` : ''}Voided: ${reason}` } });
    });
    await this.audit.log({ companyId: me.companyId, actorUserId: me.id, action: 'repair_invoice.voided', entityType: 'job_invoice', entityId: id, after: { reason }, ip: req.ip });
    return { ok: true };
  }

  private async load(tx: TenantTx, me: AuthUser, id: string) {
    const invId = parse(uuid, id);
    await tx.$queryRaw`SELECT id FROM job_invoices WHERE id = ${invId}::uuid FOR UPDATE`;
    const inv = await tx.jobInvoice.findFirst({
      where: { id: invId, job: jobScope(me) },
      select: { id: true, jobId: true, status: true, totalCents: true, paidCents: true, taxRateBps: true, issuedAt: true, note: true },
    });
    if (!inv) throw notFound('Invoice');
    return inv;
  }

  /** A part line may only point at a part used on this job. */
  private async checkParts(tx: TenantTx, jobId: string, lines: Array<{ jobPartId?: string | null }>) {
    const ids = lines.map((l) => l.jobPartId).filter((x): x is string => !!x);
    if (!ids.length) return;
    const found = await tx.jobPart.count({ where: { id: { in: ids }, jobId } });
    if (found !== new Set(ids).size) throw forbidden('A line refers to a part that is not on this job');
  }
}
