import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { DbService } from '../db/db.service.js';
import { parse } from '../common/http.js';
import { periods } from '../common/periods.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth-user.js';
import { jobScope } from '../auth/scope.js';

// Company reports (prototype "Reports"; design doc: GET /reports/turnaround · /reports/parts-usage ·
// /reports/jobs-by-technician · ?format=csv). Every number stays inside what the user may see.

const Q = z.object({ period: z.enum(['day', 'week', 'month']).default('week'), format: z.enum(['json', 'csv']).default('json') });
const DAY = 86_400_000;

/** RFC 4180 CSV, so the file opens cleanly in Excel or Google Sheets. */
function csv(res: Response, name: string, header: string[], rows: Array<Array<string | number>>) {
  const cell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
  res.send('﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n'));
}

@Controller('reports')
export class ReportsController {
  constructor(private readonly db: DbService) {}

  /** Jobs that passed QC per day, week or month (the bar chart). */
  @Roles('company_admin', 'site_manager', 'head_technician')
  @Get('completed')
  async completed(@CurrentUser() me: AuthUser, @Query() query: unknown, @Res({ passthrough: true }) res: Response) {
    const q = parse(Q, query);
    const list = periods(q.period);
    const jobs = await this.db.tenant(me).job.findMany({ where: { AND: [jobScope(me), { qcPassedAt: { gte: list[0].from } }] }, select: { qcPassedAt: true } });
    const rows = list.map((p) => ({ label: p.label, count: jobs.filter((j) => j.qcPassedAt! >= p.from && j.qcPassedAt! < p.to).length }));
    if (q.format === 'csv') return csv(res, `jobs-completed-${q.period}`, ['Period', 'Jobs passed QC'], rows.map((r) => [r.label, r.count]));
    return rows;
  }

  /** Average days from intake to release (returned to the customer), by release date. */
  @Roles('company_admin', 'site_manager', 'head_technician')
  @Get('turnaround')
  async turnaround(@CurrentUser() me: AuthUser, @Query() query: unknown, @Res({ passthrough: true }) res: Response) {
    const q = parse(Q, query);
    const list = periods(q.period);
    const jobs = await this.db.tenant(me).job.findMany({
      where: { AND: [jobScope(me), { dispatchedAt: { gte: list[0].from } }] },
      select: { number: true, receivedAt: true, qcPassedAt: true, dispatchedAt: true, status: true, site: { select: { name: true } }, device: { select: { model: true } } },
      orderBy: { dispatchedAt: 'desc' },
    });
    const days = (j: (typeof jobs)[number]) => (j.dispatchedAt!.getTime() - j.receivedAt.getTime()) / DAY;
    const rows = list.map((p) => {
      const inP = jobs.filter((j) => j.dispatchedAt! >= p.from && j.dispatchedAt! < p.to);
      return { label: p.label, released: inP.length, avgDays: inP.length ? Math.round((inP.reduce((a, j) => a + days(j), 0) / inP.length) * 10) / 10 : null };
    });
    const detail = jobs.map((j) => ({ number: j.number, model: j.device.model, site: j.site.name, receivedAt: j.receivedAt, releasedAt: j.dispatchedAt, days: Math.round(days(j) * 10) / 10, repaired: j.status === 'dispatched' && !!j.qcPassedAt }));
    if (q.format === 'csv') {
      return csv(res, `turnaround-${q.period}`, ['Ticket', 'Model', 'Site', 'Received', 'Released', 'Days', 'Repaired'],
        detail.map((d) => [d.number, d.model, d.site, d.receivedAt.toISOString().slice(0, 10), d.releasedAt!.toISOString().slice(0, 10), d.days, d.repaired ? 'Yes' : 'No']));
    }
    return { periods: rows, jobs: detail };
  }

  /** Parts used in jobs per site (net of parts returned to stock), in the period. */
  @Roles('company_admin', 'site_manager', 'head_technician', 'stock_keeper')
  @Get('parts-usage')
  async partsUsage(@CurrentUser() me: AuthUser, @Query() query: unknown, @Res({ passthrough: true }) res: Response) {
    const q = parse(Q, query);
    const list = periods(q.period);
    const moves = await this.db.tenant(me).stockMovement.findMany({
      where: { jobId: { not: null }, createdAt: { gte: list[0].from }, ...(me.siteIds === null ? {} : { siteId: { in: me.siteIds } }) },
      select: { qty: true, site: { select: { id: true, name: true } }, part: { select: { id: true, name: true, sku: true, unit: true } } },
    });
    const byKey = new Map<string, { site: string; part: string; sku: string; unit: string; used: number }>();
    for (const m of moves) {
      const k = `${m.site.id}:${m.part.id}`;
      const row = byKey.get(k) ?? { site: m.site.name, part: m.part.name, sku: m.part.sku, unit: m.part.unit, used: 0 };
      row.used += -m.qty; // out is negative; a return to stock cancels it
      byKey.set(k, row);
    }
    const rows = [...byKey.values()].filter((r) => r.used > 0).sort((a, b) => a.site.localeCompare(b.site) || b.used - a.used);
    if (q.format === 'csv') return csv(res, `parts-usage-${q.period}`, ['Site', 'Part', 'SKU', 'Used', 'Unit'], rows.map((r) => [r.site, r.part, r.sku, r.used, r.unit]));
    return { from: list[0].from, rows };
  }

  /** Completed (passed QC in the period) and open jobs per technician. */
  @Roles('company_admin', 'site_manager', 'head_technician')
  @Get('jobs-by-technician')
  async byTechnician(@CurrentUser() me: AuthUser, @Query() query: unknown, @Res({ passthrough: true }) res: Response) {
    const q = parse(Q, query);
    const from = periods(q.period)[0].from;
    const jobs = await this.db.tenant(me).job.findMany({
      where: { AND: [jobScope(me), { assigneeId: { not: null } }, { OR: [{ status: { in: ['todo', 'in_repair', 'waiting_parts'] } }, { qcPassedAt: { gte: from } }] }] },
      select: { status: true, qcPassedAt: true, assignee: { select: { id: true, fullName: true, role: true } } },
    });
    const by = new Map<string, { name: string; role: string | null; completed: number; open: number }>();
    for (const j of jobs) {
      const a = j.assignee!;
      const row = by.get(a.id) ?? { name: a.fullName, role: a.role, completed: 0, open: 0 };
      if (j.qcPassedAt && j.qcPassedAt >= from) row.completed += 1;
      if (j.status === 'todo' || j.status === 'in_repair' || j.status === 'waiting_parts') row.open += 1;
      by.set(a.id, row);
    }
    const rows = [...by.values()].sort((a, b) => b.completed - a.completed || a.name.localeCompare(b.name));
    if (q.format === 'csv') return csv(res, `jobs-by-technician-${q.period}`, ['Technician', 'Completed', 'Open'], rows.map((r) => [r.name, r.completed, r.open]));
    return { from, rows };
  }
}
