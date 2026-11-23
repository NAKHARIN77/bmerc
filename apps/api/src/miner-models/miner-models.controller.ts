import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { DbService } from '../db/db.service.js';
import { AuditService } from '../audit/audit.service.js';
import { notFound, parse } from '../common/http.js';
import { uuid } from '../common/paging.js';
import { uniqueOr409 } from '../common/prisma-errors.js';
import { CurrentUser, PlatformOnly, Roles } from '../auth/decorators.js';
import { COMPANY_ROLES, type AuthUser } from '../auth/auth-user.js';

// Miner models with their hashboards and chips (decided 2026-11-24). One list for every company, kept by the
// platform owner; companies read it at intake, when picking parts and when recording boards worked on.

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

/** Company side: the active models, for pickers and the Miner models page. */
@Controller('miner-models')
export class MinerModelsController {
  constructor(private readonly db: DbService) {}

  @Roles(...COMPANY_ROLES)
  @Get()
  async list() {
    const rows = await this.db.raw.minerModel.findMany({ where: { isActive: true }, select: MINER_MODEL_SELECT, orderBy: [{ brand: 'asc' }, { name: 'asc' }] });
    return rows.map(view);
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
