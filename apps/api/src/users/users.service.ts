import { HttpStatus, Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthService } from '../auth/auth.service.js';
import { ApiError, conflict, forbidden, notFound } from '../common/http.js';
import { assertSeat } from '../common/limits.js';
import type { Role } from '../generated/prisma/enums.js';
import { SITE_ROLES, TEAM_ROLES, type AuthUser } from '../auth/auth-user.js';

export interface UserInput {
  email: string;
  fullName: string;
  role: Role;
  teamId?: string | null;
  siteIds?: string[];
}

export interface UserPatch {
  fullName?: string;
  role?: Role;
  teamId?: string | null;
  siteIds?: string[];
}

const invalid = (message: string, field: string) =>
  new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', message, [{ path: [field], message }]);

const PUBLIC_FIELDS = {
  id: true, email: true, fullName: true, role: true, teamId: true, isActive: true, lastLoginAt: true, createdAt: true,
  passwordHash: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  /** Admin: everyone in the company. Site manager: staff in teams at their sites and people linked to those sites. */
  async list(me: AuthUser) {
    const prisma = this.db.raw;
    const where: Record<string, unknown> = { companyId: me.companyId! };
    if (me.siteIds !== null) {
      const db = this.db.tenant(me);
      const [teams, links] = await Promise.all([
        db.team.findMany({ where: { siteId: { in: me.siteIds } }, select: { id: true } }),
        db.userSite.findMany({ where: { siteId: { in: me.siteIds } }, select: { userId: true } }),
      ]);
      where.OR = [
        { teamId: { in: teams.map((t) => t.id) } },
        { id: { in: links.map((l) => l.userId) } },
        { id: me.id },
        // Technicians without a team: a site manager may add them to a team (see teams setMembers), so they must be listed.
        { teamId: null, role: { in: [...TEAM_ROLES] }, isActive: true },
      ];
    }
    const users = await prisma.user.findMany({ where, select: PUBLIC_FIELDS, orderBy: { createdAt: 'asc' } });
    return this.decorate(me, users);
  }

  async get(me: AuthUser, id: string) {
    const u = await this.db.raw.user.findFirst({ where: { id, companyId: me.companyId! }, select: PUBLIC_FIELDS });
    if (!u) throw notFound('User');
    return (await this.decorate(me, [u]))[0];
  }

  async invite(me: AuthUser, input: UserInput, ip?: string) {
    const email = input.email.toLowerCase();
    if (await this.db.raw.user.findUnique({ where: { email } })) {
      throw conflict('EMAIL_TAKEN', 'This email is already registered');
    }
    await this.assertSeatAvailable(me);
    const siteIds = await this.checkAssignment(me, input.role, input.teamId ?? null, input.siteIds ?? []);

    const user = await this.db.tenantTx(me, async (tx) => {
      const u = await tx.user.create({
        data: { companyId: me.companyId!, email, fullName: input.fullName, role: input.role, teamId: input.teamId ?? null },
      });
      if (siteIds.length) {
        await tx.userSite.createMany({ data: siteIds.map((siteId) => ({ companyId: me.companyId!, userId: u.id, siteId })) });
      }
      return u;
    });
    await this.auth.sendInvite(user.id, me);
    await this.audit.log({
      companyId: me.companyId, actorUserId: me.id, action: 'user.invited', entityType: 'user', entityId: user.id,
      after: { email, role: input.role, teamId: input.teamId ?? null, siteIds }, ip,
    });
    return this.get(me, user.id);
  }

  async update(me: AuthUser, id: string, patch: UserPatch, ip?: string) {
    const before = await this.get(me, id);
    if (id === me.id && patch.role && patch.role !== before.role) {
      throw forbidden('You cannot change your own role');
    }
    const role = patch.role ?? before.role!;
    const teamId = patch.teamId !== undefined ? patch.teamId : before.teamId;
    const wantedSites = patch.siteIds ?? (SITE_ROLES.includes(role) ? before.siteIds : []);
    if (before.role === 'company_admin' && role !== 'company_admin') await this.assertAnotherAdmin(me, id);
    const siteIds = await this.checkAssignment(me, role, teamId, wantedSites);

    await this.db.tenantTx(me, async (tx) => {
      await tx.user.update({ where: { id }, data: { fullName: patch.fullName, role, teamId } });
      await tx.userSite.deleteMany({ where: { userId: id } });
      if (siteIds.length) {
        await tx.userSite.createMany({ data: siteIds.map((siteId) => ({ companyId: me.companyId!, userId: id, siteId })) });
      }
    });
    const after = await this.get(me, id);
    await this.audit.log({
      companyId: me.companyId, actorUserId: me.id, action: 'user.updated', entityType: 'user', entityId: id,
      before: pick(before), after: pick(after), ip,
    });
    return after;
  }

  async setActive(me: AuthUser, id: string, active: boolean, ip?: string) {
    const target = await this.get(me, id);
    if (id === me.id) throw forbidden('You cannot deactivate your own account');
    if (target.isActive === active) return target;
    if (active) await this.assertSeatAvailable(me);
    else if (target.role === 'company_admin') await this.assertAnotherAdmin(me, id);

    await this.db.raw.user.update({ where: { id }, data: { isActive: active } });
    if (!active) {
      await this.db.raw.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await this.audit.log({
      companyId: me.companyId, actorUserId: me.id, action: active ? 'user.activated' : 'user.deactivated',
      entityType: 'user', entityId: id, ip,
    });
    return this.get(me, id);
  }

  async resendInvite(me: AuthUser, id: string, ip?: string) {
    const target = await this.get(me, id);
    if (target.status !== 'invited') {
      throw new ApiError(HttpStatus.CONFLICT, 'ALREADY_ACCEPTED', 'This user has already set a password');
    }
    if (!target.isActive) throw new ApiError(HttpStatus.CONFLICT, 'USER_INACTIVE', 'Activate this user first');
    await this.auth.sendInvite(id, me);
    await this.audit.log({ companyId: me.companyId, actorUserId: me.id, action: 'user.invite_resent', entityType: 'user', entityId: id, ip });
  }

  // ───── Rules ─────

  /**
   * site_manager, stock_keeper: one or more sites, no team.
   * head_technician / technician: must be in a team (their team decides which jobs they see).
   * company_admin: neither.
   */
  private async checkAssignment(me: AuthUser, role: Role, teamId: string | null, siteIds: string[]) {
    const db = this.db.tenant(me);
    if (teamId && !(await db.team.findUnique({ where: { id: teamId }, select: { id: true } }))) {
      throw invalid('Team not found', 'teamId');
    }
    if (TEAM_ROLES.includes(role) && !teamId) {
      throw invalid('Pick a team for this role', 'teamId');
    }
    if (!TEAM_ROLES.includes(role) && teamId) {
      throw invalid('Only head technicians and technicians belong to a team', 'teamId');
    }
    if (!SITE_ROLES.includes(role)) return [];
    const unique = [...new Set(siteIds)];
    if (!unique.length) throw invalid('Pick at least one site for this role', 'siteIds');
    const found = await db.site.count({ where: { id: { in: unique } } });
    if (found !== unique.length) throw invalid('One or more sites were not found', 'siteIds');
    return unique;
  }

  /** Plan seat limit: active users, including people who have not accepted their invite yet. */
  private assertSeatAvailable(me: AuthUser) {
    return assertSeat(this.db.raw, me.companyId!);
  }

  private async assertAnotherAdmin(me: AuthUser, exceptId: string) {
    const others = await this.db.raw.user.count({
      where: { companyId: me.companyId!, role: 'company_admin', isActive: true, id: { not: exceptId } },
    });
    if (!others) throw conflict('LAST_ADMIN', 'The company needs at least one active admin');
  }

  /** Adds managed sites and team name; replaces passwordHash with an invited/active status. */
  private async decorate(
    me: AuthUser,
    users: Array<{ id: string; teamId: string | null; passwordHash: string | null } & Record<string, unknown>>,
  ) {
    const db = this.db.tenant(me);
    const ids = users.map((u) => u.id);
    const [links, teams] = await Promise.all([
      db.userSite.findMany({ where: { userId: { in: ids } }, select: { userId: true, siteId: true } }),
      db.team.findMany({
        where: { id: { in: users.map((u) => u.teamId).filter((x): x is string => !!x) } },
        select: { id: true, name: true, siteId: true },
      }),
    ]);
    const teamById = new Map(teams.map((t) => [t.id, t]));
    return users.map(({ passwordHash, ...u }) => ({
      ...(u as Omit<typeof u, 'passwordHash'> & { id: string; email: string; fullName: string; role: Role | null; teamId: string | null; isActive: boolean }),
      status: passwordHash ? ('active' as const) : ('invited' as const),
      team: u.teamId ? (teamById.get(u.teamId) ?? null) : null,
      siteIds: links.filter((l) => l.userId === u.id).map((l) => l.siteId),
    }));
  }
}

const pick = (u: { fullName: string; role: Role | null; teamId: string | null; siteIds: string[] }) => ({
  fullName: u.fullName, role: u.role, teamId: u.teamId, siteIds: u.siteIds,
});
