import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ApiError, forbidden } from '../common/http.js';
import { ALLOW_SUSPENDED, IS_PUBLIC, PLATFORM_ONLY, ROLES } from './decorators.js';
import { verifyAccessToken } from './tokens.js';
import type { AuthUser } from './auth-user.js';
import { resolveSiteIds } from './scope.js';
import { withTenantTx } from '../prisma/tenant.js';

export const ACCESS_COOKIE = 'bmerc_at';

const unauthorized = () => new ApiError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Please log in');

/** Global guard: every route needs a valid login unless marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : req.cookies?.[ACCESS_COOKIE];
    if (!token) throw unauthorized();

    const userId = await verifyAccessToken(token);
    if (!userId) throw unauthorized();

    const u = await this.prisma.user.findUnique({ where: { id: userId }, include: { company: true } });
    if (!u || !u.isActive) throw unauthorized();

    const user: AuthUser = {
      id: u.id,
      companyId: u.companyId,
      role: u.role,
      isPlatformAdmin: u.isPlatformAdmin,
      teamId: u.teamId,
      siteIds: await this.siteIdsFor(u),
      fullName: u.fullName,
      email: u.email,
    };
    req.user = user;

    if (this.reflector.getAllAndOverride<boolean>(PLATFORM_ONLY, targets)) {
      if (!user.isPlatformAdmin) throw forbidden();
      return true;
    }

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (roles?.length && (!user.role || !roles.includes(user.role))) throw forbidden();

    if (u.company && u.company.status !== 'active') {
      if (!this.reflector.getAllAndOverride<boolean>(ALLOW_SUSPENDED, targets)) {
        throw new ApiError(HttpStatus.FORBIDDEN, 'COMPANY_SUSPENDED', 'This company account is suspended');
      }
    }
    return true;
  }

  // teams and user_sites are RLS tables, so read them inside the user's company context.
  private async siteIdsFor(u: { id: string; companyId: string | null; role: Role | null; teamId: string | null }) {
    if (!u.companyId) return [];
    const needsTeam = (u.role === 'head_technician' || u.role === 'technician') && !!u.teamId;
    const needsSites = u.role === 'site_manager' || u.role === 'stock_keeper';
    if (!needsTeam && !needsSites) return resolveSiteIds(u.role, null, []);
    const [team, managed] = await withTenantTx(this.prisma, u.companyId, async (tx) => [
      needsTeam ? await tx.team.findUnique({ where: { id: u.teamId! }, select: { siteId: true } }) : null,
      needsSites ? await tx.userSite.findMany({ where: { userId: u.id }, select: { siteId: true } }) : [],
    ] as const);
    return resolveSiteIds(u.role, team?.siteId, managed.map((m) => m.siteId));
  }
}
