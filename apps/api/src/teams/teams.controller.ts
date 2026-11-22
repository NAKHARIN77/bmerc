import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { DbService } from '../db/db.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ApiError, conflict, forbidden, notFound, parse } from '../common/http.js';
import { uuid } from '../common/paging.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { COMPANY_ROLES, TEAM_ROLES, type AuthUser } from '../auth/auth-user.js';
import { canSeeSite } from '../auth/scope.js';

const name = z.string().trim().min(2).max(100);
const TeamBody = z.object({ siteId: z.uuid(), name, headUserId: z.uuid().nullable().optional() });
const TeamPatch = z
  .object({ name: name.optional(), siteId: z.uuid().optional(), headUserId: z.uuid().nullable().optional() })
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update');
const MembersBody = z.object({ userIds: z.array(z.uuid()).max(500) });


const invalid = (message: string, field: string, details?: unknown) =>
  new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', message, details ?? [{ path: [field], message }]);

// Teams live in the tenant DB (RLS); users do not, so every user id is checked against the company here.
// Company admins manage every team; site managers manage teams at their own sites.
@Controller('teams')
export class TeamsController {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  @Roles(...COMPANY_ROLES)
  @Get()
  async list(@CurrentUser() me: AuthUser) {
    const teams = await this.db.tenant(me).team.findMany({
      where: me.siteIds === null ? {} : { siteId: { in: me.siteIds } },
      select: { id: true, name: true, siteId: true, headUserId: true, site: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    const members = await this.db.raw.user.findMany({
      where: { companyId: me.companyId!, teamId: { in: teams.map((t) => t.id) } },
      select: { id: true, fullName: true, role: true, isActive: true, teamId: true },
      orderBy: { fullName: 'asc' },
    });
    // Open / done job counts per member and per team (done = passed QC or returned).
    const counts = await this.db.tenant(me).job.groupBy({ by: ['assigneeId', 'status'], where: { assigneeId: { in: members.map((m) => m.id) } }, _count: { _all: true } });
    const tally = (userId: string) => {
      let open = 0, done = 0;
      for (const c of counts) {
        if (c.assigneeId !== userId) continue;
        if (c.status === 'qc_passed' || c.status === 'dispatched') done += c._count._all;
        else open += c._count._all;
      }
      return { jobsOpen: open, jobsDone: done };
    };
    return teams.map((t) => {
      const list = members.filter((m) => m.teamId === t.id).map(({ teamId: _t, ...m }) => ({ ...m, ...tally(m.id) }));
      return { ...t, members: list, jobsOpen: list.reduce((a, m) => a + m.jobsOpen, 0), jobsDone: list.reduce((a, m) => a + m.jobsDone, 0) };
    });
  }

  @Roles(...COMPANY_ROLES)
  @Get(':id')
  async get(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const team = (await this.list(me)).find((t) => t.id === parse(uuid, id));
    if (!team) throw notFound('Team');
    return team;
  }

  @Roles('company_admin', 'site_manager')
  @Post()
  async create(@CurrentUser() me: AuthUser, @Body() body: unknown, @Req() req: Request) {
    const data = parse(TeamBody, body);
    await this.checkSite(me, data.siteId);
    if (data.headUserId) await this.checkHead(me, data.headUserId, null);
    const team = await this.db.tenantTx(me, async (tx) => {
      const t = await tx.team.create({ data: { companyId: me.companyId!, siteId: data.siteId, name: data.name, headUserId: data.headUserId ?? null } });
      if (data.headUserId) await tx.user.update({ where: { id: data.headUserId }, data: { teamId: t.id } });
      return t;
    });
    await this.audit.log({ companyId: me.companyId, actorUserId: me.id, action: 'team.created', entityType: 'team', entityId: team.id, after: data, ip: req.ip });
    return this.get(me, team.id);
  }

  @Roles('company_admin', 'site_manager')
  @Patch(':id')
  async update(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const data = parse(TeamPatch, body);
    const before = await this.manageable(me, parse(uuid, id));
    if (data.siteId && data.siteId !== before.siteId) {
      if (me.role !== 'company_admin') throw forbidden('Only a company admin can move a team to another site');
      await this.checkSite(me, data.siteId);
    }
    if (data.headUserId) await this.checkHead(me, data.headUserId, id);
    await this.db.tenantTx(me, async (tx) => {
      await tx.team.update({ where: { id }, data });
      if (data.headUserId) await tx.user.update({ where: { id: data.headUserId }, data: { teamId: id } });
    });
    await this.audit.log({
      companyId: me.companyId, actorUserId: me.id, action: 'team.updated', entityType: 'team', entityId: id,
      before: { name: before.name, siteId: before.siteId, headUserId: before.headUserId }, after: data, ip: req.ip,
    });
    return this.get(me, id);
  }

  /** Replaces the member list. People left out lose their team (and with it, their job visibility). */
  @Roles('company_admin', 'site_manager')
  @Put(':id/members')
  async setMembers(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const team = await this.manageable(me, parse(uuid, id));
    const userIds = [...new Set(parse(MembersBody, body).userIds)];
    const users = await this.db.raw.user.findMany({
      where: { id: { in: userIds }, companyId: me.companyId! },
      select: { id: true, role: true, teamId: true },
    });
    if (users.length !== userIds.length) throw invalid('One or more users were not found', 'userIds');
    const wrongRole = users.filter((u) => !u.role || !TEAM_ROLES.includes(u.role));
    if (wrongRole.length) {
      throw invalid('Only head technicians and technicians belong to a team; admins, site managers and stock keepers are linked to sites', 'userIds', wrongRole.map((u) => ({ path: ['userIds'], message: `${u.id} has role ${u.role}` })));
    }
    if (me.role === 'site_manager') {
      // A site manager may only pull in people who are unassigned or already at one of their sites.
      const otherTeams = [...new Set(users.map((u) => u.teamId).filter((t): t is string => !!t && t !== id))];
      const visible = await this.db.tenant(me).team.count({ where: { id: { in: otherTeams }, siteId: { in: me.siteIds ?? [] } } });
      if (visible !== otherTeams.length) throw forbidden('Some of these people belong to a team at a site you do not manage');
    }

    const current = await this.db.raw.user.findMany({ where: { companyId: me.companyId!, teamId: id }, select: { id: true } });
    const removed = current.map((u) => u.id).filter((uid) => !userIds.includes(uid));
    await this.db.tenantTx(me, async (tx) => {
      if (removed.length) await tx.user.updateMany({ where: { id: { in: removed }, companyId: me.companyId! }, data: { teamId: null } });
      if (userIds.length) await tx.user.updateMany({ where: { id: { in: userIds }, companyId: me.companyId! }, data: { teamId: id } });
      if (team.headUserId && !userIds.includes(team.headUserId)) await tx.team.update({ where: { id }, data: { headUserId: null } });
      // Someone who headed their old team stops heading it when they move here.
      const movedIn = users.filter((u) => u.teamId && u.teamId !== id).map((u) => u.id);
      if (movedIn.length) await tx.team.updateMany({ where: { headUserId: { in: movedIn }, id: { not: id } }, data: { headUserId: null } });
    });
    await this.audit.log({
      companyId: me.companyId, actorUserId: me.id, action: 'team.members_set', entityType: 'team', entityId: id,
      before: { userIds: current.map((u) => u.id) }, after: { userIds }, ip: req.ip,
    });
    return this.get(me, id);
  }

  @Roles('company_admin', 'site_manager')
  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() me: AuthUser, @Param('id') id: string, @Req() req: Request) {
    const team = await this.manageable(me, parse(uuid, id));
    const members = await this.db.raw.user.count({ where: { companyId: me.companyId!, teamId: id } });
    if (members) throw conflict('IN_USE', 'Move or remove the team members first', { members });
    await this.db.tenant(me).team.delete({ where: { id } });
    await this.audit.log({ companyId: me.companyId, actorUserId: me.id, action: 'team.deleted', entityType: 'team', entityId: id, before: team, ip: req.ip });
  }

  // ───── Checks ─────

  /** The team, if this user may change it; 404 when it is outside their sites. */
  private async manageable(me: AuthUser, id: string) {
    const team = await this.db.tenant(me).team.findUnique({ where: { id } });
    if (!team || !canSeeSite(me, team.siteId)) throw notFound('Team');
    return team;
  }

  private async checkSite(me: AuthUser, siteId: string) {
    const site = await this.db.tenant(me).site.findUnique({ where: { id: siteId }, select: { id: true } });
    if (!site) throw invalid('Site not found', 'siteId');
    if (!canSeeSite(me, siteId)) throw forbidden('You can only manage teams at your own sites');
  }

  /** The head must be a head technician in this company, and not already heading another team. */
  private async checkHead(me: AuthUser, userId: string, teamId: string | null) {
    const u = await this.db.raw.user.findFirst({ where: { id: userId, companyId: me.companyId! }, select: { role: true, teamId: true } });
    if (!u) throw invalid('User not found', 'headUserId');
    if (u.role !== 'head_technician') throw invalid('The team head must have the head technician role', 'headUserId');
    if (me.role === 'site_manager' && u.teamId && u.teamId !== teamId) {
      const theirs = await this.db.tenant(me).team.findUnique({ where: { id: u.teamId }, select: { siteId: true } });
      if (!theirs || !canSeeSite(me, theirs.siteId)) throw forbidden('This person belongs to a team at a site you do not manage');
    }
    const other = await this.db.tenant(me).team.findFirst({ where: { headUserId: userId, ...(teamId ? { id: { not: teamId } } : {}) }, select: { name: true } });
    if (other) throw conflict('ALREADY_HEAD', `This person already heads ${other.name}`);
  }
}
