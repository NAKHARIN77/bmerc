import { Controller, Get, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../db/db.service.js';
import { notFound, parse } from '../common/http.js';
import { uuid } from '../common/paging.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { COMPANY_ROLES, type AuthUser } from '../auth/auth-user.js';
import { LogView } from '../audit/log-view.js';

const SearchQuery = z.object({ serial: z.string().trim().min(2).max(120) });
const QrCode = z.string().trim().toUpperCase().regex(/^BMERC-[A-Z0-9]{4,16}$/, 'Not a BMERC QR code');

/**
 * Device repair history (design doc section 7, "QR and device history").
 * Any logged-in staff member of the same company can look a device up; other companies get 404 through RLS.
 */
@Controller('devices')
export class DevicesController {
  constructor(private readonly db: DbService) {}

  /** QR label scanned or typed: returns the device id to open its history. */
  @Roles(...COMPANY_ROLES)
  @Get('by-qr/:code')
  async byQr(@CurrentUser() me: AuthUser, @Param('code') code: string) {
    const d = await this.db.tenant(me).device.findFirst({ where: { qrCode: parse(QrCode, code) }, select: { id: true } });
    if (!d) throw notFound('Device with this QR code');
    return d;
  }

  /** Serial of a whole miner or a single board, including boards worked on inside a miner. */
  @Roles(...COMPANY_ROLES)
  @Get('search')
  async search(@CurrentUser() me: AuthUser, @Query() query: unknown) {
    const { serial } = parse(SearchQuery, query);
    const db = this.db.tenant(me);
    const like = { contains: serial, mode: 'insensitive' as const };
    const [devices, comps] = await Promise.all([
      db.device.findMany({ where: { serialNo: like }, select: deviceSelect, take: 20 }),
      db.jobComponent.findMany({
        where: { OR: [{ serialNo: like }, { replacementSerialNo: like }] },
        select: { component: true, serialNo: true, replacementSerialNo: true, job: { select: { device: { select: deviceSelect } } } },
        take: 20,
      }),
    ]);
    const out = new Map<string, (typeof devices)[number] & { matchedBoard: string | null }>();
    for (const d of devices) out.set(d.id, { ...d, matchedBoard: null });
    for (const c of comps) {
      const d = c.job.device;
      if (!out.has(d.id)) out.set(d.id, { ...d, matchedBoard: `${c.component} (${c.serialNo ?? c.replacementSerialNo})` });
    }
    return [...out.values()];
  }

  @Roles(...COMPANY_ROLES)
  @LogView('device')
  @Get(':id/history')
  async history(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const d = await this.db.tenant(me).device.findUnique({
      where: { id: parse(uuid, id) },
      select: {
        ...deviceSelect,
        hashrateTh: true,
        createdAt: true,
        jobs: {
          orderBy: { receivedAt: 'desc' },
          select: {
            id: true, number: true, status: true, reportedFault: true, workNote: true, unrepairableReason: true,
            receivedAt: true, qcPassedAt: true, dispatchedAt: true,
            site: { select: { name: true } },
            assignee: { select: { fullName: true } },
            components: { select: { id: true, component: true, serialNo: true, replacementSerialNo: true, workDone: true, result: true } },
            parts: { select: { id: true, qty: true, part: { select: { name: true, sku: true } } } },
          },
        },
      },
    });
    if (!d) throw notFound('Device');
    return d;
  }
}

const deviceSelect = {
  id: true, kind: true, model: true, serialNo: true, qrCode: true,
  customer: { select: { id: true, name: true } },
  // Work orders for the search results table (prototype "Device repair history").
  jobs: {
    orderBy: { receivedAt: 'desc' as const },
    select: {
      id: true, number: true, status: true, receivedAt: true, reportedFault: true,
      parts: { select: { qty: true, part: { select: { name: true } } } },
      invoice: { select: { totalCents: true, paidCents: true, currency: true, status: true } },
    },
  },
} as const;
