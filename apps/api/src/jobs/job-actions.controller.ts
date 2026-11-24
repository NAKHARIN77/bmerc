import { Body, Controller, Delete, HttpCode, Param, Patch, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { DbService } from '../db/db.service.js';
import { AuditService } from '../audit/audit.service.js';
import { conflict, forbidden, notFound, parse } from '../common/http.js';
import { uuid } from '../common/paging.js';
import { limitsFor, monthStart } from '../common/limits.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { COMPANY_ROLES, TEAM_ROLES, type AuthUser } from '../auth/auth-user.js';
import { jobScope } from '../auth/scope.js';
import { DeviceKind, JobPriority, JobStatus, ComponentResult, WorkType } from '../generated/prisma/enums.js';
import { REPEAT_DAYS, creditsFor } from '../common/credits.js';
import type { TenantTx } from '../prisma/tenant.js';
import { moveStock } from '../stock/ledger.js';
import { canAssign, canDispatch, canReceive, canUseParts, canWork } from './permissions.js';
import { canMove, jobNumber, newQrCode } from './workflow.js';

const text = (max: number) => z.string().trim().max(max);

const ReceiveBody = z.object({
  customerId: z.uuid(),
  siteId: z.uuid(),
  kind: z.enum(DeviceKind),
  model: text(120).min(2),
  minerModelId: z.uuid().nullable().optional(), // picked from the miner model list; model is then its name
  serialNo: text(120).min(1),
  hashrateTh: z.number().min(0).max(100_000).nullable().optional(),
  reportedFault: text(2000).min(3),
  priority: z.enum(JobPriority).default('normal'),
  workType: z.enum(WorkType).default('inspection'), // sets the credits the job uses when it passes QC
  assigneeId: z.uuid().nullable().optional(),
});
const AssignBody = z.object({ assigneeId: z.uuid().nullable() });
const TransitionBody = z.object({ to: z.enum(JobStatus), note: text(2000).optional(), reason: text(2000).optional() });
const WorkTypeBody = z.object({ workType: z.enum(WorkType) });
const WORK_LABEL: Record<WorkType, string> = { inspection: 'Inspection', chip_replacement: 'Chip replacement', board_repair: 'Board repair' };
const NoteBody = z.object({ workNote: text(4000).nullable() });
const PartBody = z.object({ partId: z.uuid(), qty: z.number().int().min(1).max(10_000) });
const ComponentsBody = z
  .array(
    z.object({
      component: text(120).min(1),
      serialNo: text(120).nullable().optional(),
      replacementSerialNo: text(120).nullable().optional(),
      workDone: text(1000).nullable().optional(),
      result: z.enum(ComponentResult),
    }),
  )
  .max(30);

const Result = z.enum(['pass', 'fail', 'not_tested']);
// Hashboards 1-3, control board, power supply, cooling fans (prototype "Test record").
const TestBody = z.object({
  testedOn: z.iso.date(),
  testedById: z.uuid().optional(),
  workDone: text(2000).optional(),
  results: z.object({ hb1: Result, hb2: Result, hb3: Result, ctrl: Result, psu: Result, fan: Result }),
});
const PrintedBody = z.object({ copies: z.number().int().min(1).max(100).default(1) });

const MSG_REQUIRED = { waiting_parts: 'Say which parts you are waiting for', unrepairable: 'Give the reason it cannot be repaired' } as const;

@Controller('jobs')
export class JobActionsController {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  /** Receive a device at a site and open its job (Receive Work Order). */
  @Roles('company_admin', 'site_manager', 'head_technician')
  @Post()
  async receive(@CurrentUser() me: AuthUser, @Body() body: unknown, @Req() req: Request) {
    const b = parse(ReceiveBody, body);
    if (!canReceive(me, b.siteId)) throw forbidden('You cannot receive devices at this site');
    const companyId = me.companyId!;

    const { maxJobsPerMonth } = await limitsFor(this.db.raw, companyId);
    const company = await this.db.raw.company.findUniqueOrThrow({ where: { id: companyId }, select: { timezone: true } });
    // A model picked from the list wins; a typed name that matches the list is linked too.
    const listed = b.minerModelId
      ? await this.db.raw.minerModel.findUnique({ where: { id: b.minerModelId }, select: { id: true, name: true } })
      : await this.db.raw.minerModel.findFirst({ where: { name: { equals: b.model, mode: 'insensitive' } }, select: { id: true, name: true } });
    if (b.minerModelId && !listed) throw notFound('Miner model');
    const model = listed?.name ?? b.model;
    const minerModelId = listed?.id ?? null;
    const year = Number(new Intl.DateTimeFormat('en', { timeZone: company.timezone, year: 'numeric' }).format(new Date()));

    const job = await this.db.tenantTx(me, async (tx) => {
      const [site, customer] = await Promise.all([
        tx.site.findUnique({ where: { id: b.siteId }, select: { status: true } }),
        tx.customer.findUnique({ where: { id: b.customerId }, select: { id: true } }),
      ]);
      if (!site) throw notFound('Site');
      if (site.status === 'inactive') throw conflict('SITE_INACTIVE', 'This site is inactive. Pick another site');
      if (!customer) throw notFound('Customer');
      // Credits are taken when a job passes QC; when this month's credits are used up, no new devices come in.
      if (maxJobsPerMonth !== null) {
        const used = (await tx.job.aggregate({ where: { chargedAt: { gte: monthStart() } }, _sum: { creditsCharged: true } }))._sum.creditsCharged ?? 0;
        if (used >= maxJobsPerMonth) {
          throw conflict('QUOTA_CREDITS', `This month's ${maxJobsPerMonth} credits are used up. Upgrade the plan to receive more devices`, { limit: maxJobsPerMonth, used });
        }
      }
      const assigneeName = b.assigneeId ? await this.assertAssignee(tx, me, b.assigneeId, b.siteId) : null;

      // One device per serial and kind. A device sent in again keeps its history and QR code.
      let device = await tx.device.findUnique({
        where: { companyId_kind_serialNo: { companyId, kind: b.kind, serialNo: b.serialNo } },
        select: { id: true },
      });
      if (device) {
        const open = await tx.job.findFirst({ where: { deviceId: device.id, status: { not: 'dispatched' } }, select: { number: true } });
        if (open) throw conflict('DEVICE_IN_REPAIR', `This device is already in job ${open.number}`, { number: open.number });
        await tx.device.update({ where: { id: device.id }, data: { customerId: b.customerId, model, minerModelId, ...(b.hashrateTh != null ? { hashrateTh: b.hashrateTh } : {}) } });
      } else {
        device = await tx.device.create({
          data: { companyId, customerId: b.customerId, kind: b.kind, model, minerModelId, serialNo: b.serialNo, hashrateTh: b.hashrateTh ?? null },
          select: { id: true },
        });
      }

      const [{ value }] = await tx.$queryRaw<Array<{ value: number }>>`
        INSERT INTO counters (company_id, key, value) VALUES (${companyId}::uuid, ${`job:${year}`}, 1)
        ON CONFLICT (company_id, key) DO UPDATE SET value = counters.value + 1
        RETURNING value`;
      const created = await tx.job.create({
        data: {
          companyId, number: jobNumber(year, value), deviceId: device.id, customerId: b.customerId, siteId: b.siteId,
          assigneeId: b.assigneeId ?? null, priority: b.priority, workType: b.workType, reportedFault: b.reportedFault,
        },
        select: { id: true, number: true },
      });
      await tx.jobEvent.create({ data: { companyId, jobId: created.id, fromStatus: null, toStatus: 'todo', actorId: me.id, note: assigneeName ? `Device received, assigned to ${assigneeName}` : 'Device received' } });
      return created;
    });
    await this.audit.log({ companyId, actorUserId: me.id, action: 'job.created', entityType: 'job', entityId: job.id, after: { number: job.number, ...b }, ip: req.ip });
    return job;
  }

  @Roles('company_admin', 'site_manager', 'head_technician')
  @Post(':id/assign')
  async assign(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const { assigneeId } = parse(AssignBody, body);
    const result = await this.db.tenantTx(me, async (tx) => {
      const job = await this.lockJob(tx, me, id);
      if (!canAssign(me, job)) throw conflict('JOB_CLOSED', 'This job is closed');
      if (assigneeId === job.assigneeId) return { job, name: null };
      let name: string | null = null;
      if (assigneeId) name = await this.assertAssignee(tx, me, assigneeId, job.siteId);
      else if (job.status !== 'todo') throw conflict('ASSIGNEE_REQUIRED', 'A job in progress must stay assigned. Reassign it instead');
      await tx.job.update({ where: { id: job.id }, data: { assigneeId } });
      await tx.jobEvent.create({
        data: { companyId: me.companyId!, jobId: job.id, fromStatus: job.status, toStatus: job.status, actorId: me.id, note: name ? `Assigned to ${name}` : 'Unassigned' },
      });
      return { job, name };
    });
    await this.audit.log({
      companyId: me.companyId, actorUserId: me.id, action: 'job.assigned', entityType: 'job', entityId: result.job.id,
      before: { assigneeId: result.job.assigneeId }, after: { assigneeId }, ip: req.ip,
    });
    return { ok: true };
  }

  /** Change the kind of work (and so the credits it will use) until the job passes QC. */
  @Roles('company_admin', 'site_manager', 'head_technician', 'technician')
  @Patch(':id/work-type')
  async workType(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const { workType } = parse(WorkTypeBody, body);
    const job = await this.db.tenantTx(me, async (tx) => {
      const job = await this.lockJob(tx, me, id);
      if (!['todo', 'in_repair', 'waiting_parts'].includes(job.status)) throw conflict('JOB_CHARGED', 'The work type is fixed once the job has passed QC or closed');
      if (!canWork(me, job)) throw forbidden('You cannot change this job');
      if (job.workType !== workType) {
        await tx.job.update({ where: { id: job.id }, data: { workType } });
        await tx.jobEvent.create({ data: { companyId: me.companyId!, jobId: job.id, fromStatus: job.status, toStatus: job.status, actorId: me.id, note: `Work type: ${WORK_LABEL[workType]}` } });
      }
      return job;
    });
    await this.audit.log({ companyId: me.companyId, actorUserId: me.id, action: 'job.work_type_changed', entityType: 'job', entityId: job.id, before: { workType: job.workType }, after: { workType }, ip: req.ip });
    return { workType };
  }

  /** Move a job along the board. Not allowed moves return 409 so the card goes back. */
  @Roles('company_admin', 'site_manager', 'head_technician', 'technician')
  @Post(':id/transition')
  async transition(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const b = parse(TransitionBody, body);
    const weights = b.to === 'qc_passed' ? (await limitsFor(this.db.raw, me.companyId!)).creditWeights : null;
    const out = await this.db.tenantTx(me, async (tx) => {
      const job = await this.lockJob(tx, me, id);
      if (!canMove(job.status, b.to)) {
        throw conflict('BAD_TRANSITION', `A job cannot go from ${label(job.status)} to ${label(b.to)}`, { from: job.status, to: b.to });
      }
      if (b.to === 'dispatched' ? !canDispatch(me, job) : !canWork(me, job)) throw forbidden('You cannot change this job');

      const data: Record<string, unknown> = { status: b.to };
      let assignee = job.assigneeId;
      if (b.to === 'in_repair' && !assignee) {
        if (me.role !== 'technician' && me.role !== 'head_technician') {
          throw conflict('ASSIGNEE_REQUIRED', 'Assign a technician before starting the repair');
        }
        assignee = me.id; // picking up an unassigned job
        data.assigneeId = me.id;
      }
      const note = b.to === 'unrepairable' ? (b.reason ?? b.note) : b.note;
      if ((b.to === 'waiting_parts' || b.to === 'unrepairable') && !note) {
        throw conflict('NOTE_REQUIRED', MSG_REQUIRED[b.to]);
      }
      if (b.to === 'unrepairable') data.unrepairableReason = note;
      if (b.to === 'qc_passed') Object.assign(data, { qcPassedAt: new Date() }, await this.charge(tx, job, weights!));
      if (b.to === 'dispatched') data.dispatchedAt = new Date();

      let qrCode: string | null = null;
      if (b.to === 'qc_passed') qrCode = await this.ensureQr(tx, job.deviceId);

      const done = await tx.job.updateMany({ where: { id: job.id, status: job.status }, data });
      if (done.count !== 1) throw conflict('STALE', 'Someone else changed this job. Reload and try again');
      await tx.jobEvent.create({
        data: { companyId: me.companyId!, jobId: job.id, fromStatus: job.status, toStatus: b.to, actorId: me.id, note: note ?? null },
      });
      return { job, assignee, qrCode };
    });
    await this.audit.log({
      companyId: me.companyId, actorUserId: me.id, action: 'job.status_changed', entityType: 'job', entityId: out.job.id,
      before: { status: out.job.status }, after: { status: b.to, note: b.note ?? b.reason ?? null }, ip: req.ip,
    });
    return { status: b.to, assigneeId: out.assignee, qrCode: out.qrCode };
  }

  @Roles('company_admin', 'site_manager', 'head_technician', 'technician')
  @Patch(':id/note')
  async note(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const { workNote } = parse(NoteBody, body);
    await this.db.tenantTx(me, async (tx) => {
      const job = await this.lockJob(tx, me, id);
      if (!canWork(me, job) || (me.role === 'technician' && job.assigneeId !== me.id)) throw forbidden('You cannot change this job');
      await tx.job.update({ where: { id: job.id }, data: { workNote: workNote || null } });
    });
    return { ok: true };
  }

  /** Use parts from the job's site stock. Refused when not enough are left. */
  @Roles(...COMPANY_ROLES)
  @Post(':id/parts')
  async addPart(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const b = parse(PartBody, body);
    const out = await this.db.tenantTx(me, async (tx) => {
      const job = await this.lockJob(tx, me, id);
      if (!canUseParts(me, job)) throw forbidden('You cannot use parts on this job');
      const part = await tx.part.findUnique({ where: { id: b.partId }, select: { id: true, isActive: true, name: true } });
      if (!part) throw notFound('Part');
      if (!part.isActive) throw conflict('PART_INACTIVE', 'This part is no longer in the catalog');
      const m = await moveStock(tx, {
        companyId: me.companyId!, siteId: job.siteId, partId: part.id, type: 'out', delta: -b.qty, jobId: job.id, reason: `Used in ${job.number}`, actorId: me.id,
      });
      const jp = await tx.jobPart.create({ data: { companyId: me.companyId!, jobId: job.id, partId: part.id, qty: b.qty, movementId: m.movementId }, select: { id: true } });
      return { job, part, jp, m };
    });
    await this.audit.log({
      companyId: me.companyId, actorUserId: me.id, action: 'stock.out', entityType: 'part', entityId: out.part.id,
      before: { qty: out.m.before }, after: { qty: out.m.after, jobId: out.job.id }, ip: req.ip,
    });
    return { id: out.jp.id, left: out.m.after };
  }

  /** Put parts back: a reverse movement, the original ledger entry stays. */
  @Roles(...COMPANY_ROLES)
  @Delete(':id/parts/:jpId')
  @HttpCode(204)
  async removePart(@CurrentUser() me: AuthUser, @Param('id') id: string, @Param('jpId') jpId: string, @Req() req: Request) {
    const out = await this.db.tenantTx(me, async (tx) => {
      const job = await this.lockJob(tx, me, id);
      if (!canUseParts(me, job)) throw forbidden('You cannot change parts on this job');
      const jp = await tx.jobPart.findFirst({ where: { id: parse(uuid, jpId), jobId: job.id }, select: { id: true, partId: true, qty: true } });
      if (!jp) throw notFound('Part on this job');
      const m = await moveStock(tx, {
        companyId: me.companyId!, siteId: job.siteId, partId: jp.partId, type: 'in', delta: jp.qty, jobId: job.id, reason: `Returned from ${job.number}`, actorId: me.id,
      });
      await tx.jobPart.delete({ where: { id: jp.id } });
      return { jp, m, job };
    });
    await this.audit.log({
      companyId: me.companyId, actorUserId: me.id, action: 'stock.in', entityType: 'part', entityId: out.jp.partId,
      before: { qty: out.m.before }, after: { qty: out.m.after, jobId: out.job.id }, ip: req.ip,
    });
  }

  /** Replace the list of boards and parts worked on (serials go into device history search). */
  @Roles('company_admin', 'site_manager', 'head_technician', 'technician')
  @Put(':id/components')
  async components(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const rows = parse(ComponentsBody, body);
    await this.db.tenantTx(me, async (tx) => {
      const job = await this.lockJob(tx, me, id);
      if (!canWork(me, job) || (me.role === 'technician' && job.assigneeId !== me.id)) throw forbidden('You cannot change this job');
      await tx.jobComponent.deleteMany({ where: { jobId: job.id } });
      if (rows.length) {
        await tx.jobComponent.createMany({
          data: rows.map((r) => ({
            companyId: me.companyId!, jobId: job.id, component: r.component, serialNo: r.serialNo || null,
            replacementSerialNo: r.result === 'replaced' ? r.replacementSerialNo || null : null, workDone: r.workDone || null, result: r.result,
          })),
        });
      }
    });
    return { ok: true };
  }

  /**
   * Record a bench test (prototype "Test record"). Every item passing moves an in-repair job to Completed / QC
   * (and issues the QR code); any failure keeps or puts it back in repair.
   */
  @Roles('company_admin', 'site_manager', 'head_technician', 'technician')
  @Post(':id/tests')
  async test(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const b = parse(TestBody, body);
    const values = Object.values(b.results);
    const passed = values.every((v) => v === 'pass');
    const weights = passed ? (await limitsFor(this.db.raw, me.companyId!)).creditWeights : null;
    const out = await this.db.tenantTx(me, async (tx) => {
      const job = await this.lockJob(tx, me, id);
      if (!canWork(me, job) || (me.role === 'technician' && job.assigneeId !== me.id)) throw forbidden('You cannot change this job');
      if (job.status !== 'in_repair' && job.status !== 'waiting_parts') {
        throw conflict('BAD_TRANSITION', 'Only a job in repair or waiting for parts can be tested');
      }
      const testedById = b.testedById ?? me.id;
      if (testedById !== me.id) await this.assertAssignee(tx, me, testedById, job.siteId);
      await tx.jobTest.create({
        data: { companyId: me.companyId!, jobId: job.id, testedOn: new Date(b.testedOn), testedById, workDone: b.workDone || null, results: b.results, passed },
      });
      let to: JobStatus | null = null;
      if (passed && job.status === 'in_repair') to = 'qc_passed';
      if (!passed && job.status === 'waiting_parts') to = 'in_repair';
      let qrCode: string | null = null;
      const fails = Object.entries(b.results).filter(([, v]) => v === 'fail').map(([k]) => k);
      const note = passed ? 'Test passed' : fails.length ? `Test failed: ${fails.join(', ')}` : 'Test recorded (not complete)';
      if (to) {
        if (to === 'qc_passed') qrCode = await this.ensureQr(tx, job.deviceId);
        await tx.job.update({ where: { id: job.id }, data: { status: to, ...(to === 'qc_passed' ? { qcPassedAt: new Date(), ...(await this.charge(tx, job, weights!)) } : {}) } });
      }
      await tx.jobEvent.create({ data: { companyId: me.companyId!, jobId: job.id, fromStatus: job.status, toStatus: to ?? job.status, actorId: me.id, note } });
      return { job, to, qrCode };
    });
    if (out.to) {
      await this.audit.log({
        companyId: me.companyId, actorUserId: me.id, action: 'job.status_changed', entityType: 'job', entityId: out.job.id,
        before: { status: out.job.status }, after: { status: out.to, note: 'bench test' }, ip: req.ip,
      });
    }
    return { passed, status: out.to ?? out.job.status, qrCode: out.qrCode };
  }

  /** "Mark as printed": the label print history on the Print QR label page. */
  @Roles(...COMPANY_ROLES)
  @Post(':id/label/printed')
  async printed(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const { copies } = parse(PrintedBody, body ?? {});
    await this.db.tenantTx(me, async (tx) => {
      const job = await this.lockJob(tx, me, id);
      if (job.status !== 'qc_passed' && job.status !== 'dispatched') throw conflict('NOT_QC_PASSED', 'Only jobs that passed QC can print a label');
      await tx.qrPrintLog.create({ data: { companyId: me.companyId!, jobId: job.id, printedBy: me.id, copies } });
    });
    return { ok: true };
  }

  /** Lock the job row for this transaction and load it within the user's scope (404 if out of scope). */
  private async lockJob(tx: TenantTx, me: AuthUser, id: string) {
    const jobId = parse(uuid, id);
    await tx.$queryRaw`SELECT id FROM jobs WHERE id = ${jobId}::uuid FOR UPDATE`;
    const job = await tx.job.findFirst({
      where: { AND: [{ id: jobId }, jobScope(me)] },
      select: { id: true, number: true, status: true, assigneeId: true, siteId: true, deviceId: true, workType: true },
    });
    if (!job) throw notFound('Job');
    return job;
  }

  /**
   * Credits for a job that passes QC (decided 2026-11-24): the weight of its work type, from the weights the
   * company bought. The same device passing QC again within REPEAT_DAYS counts as one job at the highest weight.
   */
  private async charge(tx: TenantTx, job: { id: string; deviceId: string; workType: WorkType }, weights: Record<WorkType, number>) {
    const now = new Date();
    const since = new Date(now.getTime() - REPEAT_DAYS * 86_400_000);
    const before = await tx.job.aggregate({ where: { deviceId: job.deviceId, id: { not: job.id }, chargedAt: { gte: since } }, _sum: { creditsCharged: true } });
    return { creditsCharged: creditsFor(weights[job.workType], before._sum.creditsCharged ?? 0), chargedAt: now };
  }

  /** Assignee must be an active technician in a team at the job's site; a head technician picks only from their team. */
  private async assertAssignee(tx: TenantTx, me: AuthUser, userId: string, siteId: string) {
    const u = await this.db.raw.user.findFirst({
      where: { id: userId, companyId: me.companyId!, isActive: true, role: { in: TEAM_ROLES } },
      select: { fullName: true, teamId: true },
    });
    const team = u?.teamId ? await tx.team.findUnique({ where: { id: u.teamId }, select: { id: true, siteId: true } }) : null;
    if (!u || !team || team.siteId !== siteId) throw conflict('BAD_ASSIGNEE', 'Pick a technician from a team at this site');
    if (me.role === 'head_technician' && team.id !== me.teamId) throw forbidden('You can only assign technicians in your own team');
    return u.fullName;
  }

  /** The device gets its QR code at its first QC pass and keeps it for later jobs. */
  private async ensureQr(tx: TenantTx, deviceId: string) {
    const d = await tx.device.findUniqueOrThrow({ where: { id: deviceId }, select: { qrCode: true } });
    if (d.qrCode) return d.qrCode;
    for (let i = 0; i < 5; i++) {
      const code = newQrCode();
      const taken = await tx.device.findFirst({ where: { qrCode: code }, select: { id: true } });
      if (taken) continue;
      await tx.device.update({ where: { id: deviceId }, data: { qrCode: code } });
      return code;
    }
    throw conflict('QR_FAILED', 'Could not create a QR code. Try again');
  }
}

const LABEL: Record<JobStatus, string> = {
  todo: 'To Do', in_repair: 'In Repair', waiting_parts: 'Waiting for Parts', unrepairable: 'Cannot Repair', qc_passed: 'Completed / QC', dispatched: 'Returned',
};
const label = (s: JobStatus) => LABEL[s];
