import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { DbService } from '../db/db.service.js';
import { AuditService } from '../audit/audit.service.js';
import { conflict, notFound, parse } from '../common/http.js';
import { uuid } from '../common/paging.js';
import { uniqueOr409 } from '../common/prisma-errors.js';
import { CurrentUser, PlatformOnly, Roles } from '../auth/decorators.js';
import { COMPANY_ROLES, type AuthUser } from '../auth/auth-user.js';

// Miner models with their hashboards and chips (decided 2026-11-24). A shared list kept by the platform owner
// (company_id NULL), read by every company at intake, when picking parts and when recording boards worked on.
// Since 2026-11-26 a company may also add, edit and delete models of its own; only that company sees them.
// RLS enforces both: tenant queries read shared + own rows and can change only own rows.

export const MINER_MODEL_SELECT = {
  id: true, brand: true, name: true, hashboards: true, chipModel: true, chipsPerBoard: true, hashrateTh: true,
  notes: true, sourceUrl: true, verified: true, isActive: true,
} as const;

const optText = (max: number) => z.string().trim().max(max).nullable().optional();
const ModelBody = z.object({
  brand: z.string().trim().min(2).max(60),
  name: z.string().trim().min(2).max(120),
  hashboards: z.number().int().min(1).max(12),
  chipModel: optText(40),
  chipsPerBoard: z.number().int().min(1).max(1000).nullable().optional(),
  hashrateTh: z.number().min(0).max(100_000).nullable().optional(),
  notes: optText(1000),
  sourceUrl: z.url().max(500).nullable().optional().or(z.literal('').transform(() => null)),
  verified: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
const ModelPatch = ModelBody.partial().refine((b) => Object.keys(b).length > 0, 'Nothing to update');
const NAME_TAKEN = ['MODEL_TAKEN', 'A model with this name already exists'] as const;

type Row = { hashrateTh: { toNumber(): number } | null };
const view = <T extends Row>(m: T) => ({ ...m, hashrateTh: m.hashrateTh === null ? null : m.hashrateTh.toNumber() });

const CompanyModelBody = ModelBody.omit({ verified: true, isActive: true });
const CompanyModelPatch = CompanyModelBody.partial().refine((b) => Object.keys(b).length > 0, 'Nothing to update');
const EDITORS = ['company_admin', 'stock_keeper'] as const;

/** Company side: the shared list plus the company's own models (own: true), for pickers and the Miner models page. */
@Controller('miner-models')
export class MinerModelsController {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  @Roles(...COMPANY_ROLES)
  @Get()
  async list(@CurrentUser() me: AuthUser) {
    const rows = await this.db.tenant(me).minerModel.findMany({
      where: { isActive: true },
      select: { ...MINER_MODEL_SELECT, companyId: true },
      orderBy: [{ brand: 'asc' }, { name: 'asc' }],
    });
    return rows.map(({ companyId, ...m }) => ({ ...view(m), own: companyId !== null }));
  }

  @Roles(...EDITORS)
  @Post()
  async create(@CurrentUser() me: AuthUser, @Body() body: unknown, @Req() req: Request) {
    const data = parse(CompanyModelBody, body);
    await this.assertNameFree(me, data.name);
    const m = await uniqueOr409(
      this.db.tenant(me).minerModel.create({ data: { ...data, companyId: me.companyId! }, select: MINER_MODEL_SELECT }),
      ...NAME_TAKEN,
    );
    await this.audit.log({ companyId: me.companyId, actorUserId: me.id, action: 'miner_model.created', entityType: 'miner_model', entityId: m.id, after: data, ip: req.ip });
    return { ...view(m), own: true };
  }

  @Roles(...EDITORS)
  @Patch(':id')
  async update(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const data = parse(CompanyModelPatch, body);
    const mid = await this.ownModel(me, id);
    if (data.name) await this.assertNameFree(me, data.name, mid);
    const m = await uniqueOr409(this.db.tenant(me).minerModel.update({ where: { id: mid }, data, select: MINER_MODEL_SELECT }), ...NAME_TAKEN);
    await this.audit.log({ companyId: me.companyId, actorUserId: me.id, action: 'miner_model.updated', entityType: 'miner_model', entityId: mid, after: data, ip: req.ip });
    return { ...view(m), own: true };
  }

  /** Devices keep their typed model name; parts stop listing the model. */
  @Roles(...EDITORS)
  @Delete(':id')
  async remove(@CurrentUser() me: AuthUser, @Param('id') id: string, @Req() req: Request) {
    const mid = await this.ownModel(me, id);
    await this.db.tenantTx(me, async (tx) => {
      await tx.$executeRaw`UPDATE "parts" SET "model_ids" = array_remove("model_ids", ${mid}::uuid) WHERE ${mid}::uuid = ANY("model_ids")`;
      await tx.device.updateMany({ where: { minerModelId: mid }, data: { minerModelId: null } });
      await tx.minerModel.delete({ where: { id: mid } });
    });
    await this.audit.log({ companyId: me.companyId, actorUserId: me.id, action: 'miner_model.deleted', entityType: 'miner_model', entityId: mid, ip: req.ip });
    return { outcome: 'deleted' as const };
  }

  /** Only the company's own models can be changed; the shared list belongs to BMERC. */
  private async ownModel(me: AuthUser, id: string) {
    const m = await this.db.tenant(me).minerModel.findUnique({ where: { id: parse(uuid, id) }, select: { id: true, companyId: true } });
    if (!m) throw notFound('Miner model');
    if (m.companyId === null) throw conflict('SHARED_MODEL', 'This model is on the BMERC list. Only models your company added can be changed or deleted');
    return m.id;
  }

  /** Same name as a shared model or another of the company's own (case-insensitive) is a 409. */
  private async assertNameFree(me: AuthUser, name: string, exceptId?: string) {
    const clash = await this.db.tenant(me).minerModel.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) throw conflict(...NAME_TAKEN);
  }
}

/** Platform owner: add, correct and mark models as checked. */
@Controller('platform/miner-models')
@PlatformOnly()
export class PlatformMinerModelsController {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list() {
    const rows = await this.db.raw.minerModel.findMany({
      select: { ...MINER_MODEL_SELECT, updatedAt: true, _count: { select: { devices: true } } },
      orderBy: [{ brand: 'asc' }, { name: 'asc' }],
    });
    return rows.map(({ _count, ...m }) => ({ ...view(m), devices: _count.devices }));
  }

  @Post()
  async create(@CurrentUser() me: AuthUser, @Body() body: unknown, @Req() req: Request) {
    const data = parse(ModelBody, body);
    const m = await uniqueOr409(this.db.raw.minerModel.create({ data, select: MINER_MODEL_SELECT }), ...NAME_TAKEN);
    await this.audit.log({ companyId: null, actorUserId: me.id, action: 'platform.miner_model_created', entityType: 'miner_model', entityId: m.id, after: data, ip: req.ip });
    return view(m);
  }

  @Patch(':id')
  async update(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const data = parse(ModelPatch, body);
    const mid = parse(uuid, id);
    if (!(await this.db.raw.minerModel.findUnique({ where: { id: mid }, select: { id: true } }))) throw notFound('Miner model');
    const m = await uniqueOr409(this.db.raw.minerModel.update({ where: { id: mid }, data, select: MINER_MODEL_SELECT }), ...NAME_TAKEN);
    await this.audit.log({ companyId: null, actorUserId: me.id, action: 'platform.miner_model_updated', entityType: 'miner_model', entityId: mid, after: data, ip: req.ip });
    return view(m);
  }
}
