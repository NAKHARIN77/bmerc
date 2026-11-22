import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ApiError, forbidden } from '../common/http.js';
import { ALLOW_SUSPENDED, IS_PUBLIC, PLATFORM_ONLY, ROLES } from './decorators.js';
import { verifyAccessToken } from './tokens.js';
import type { AuthUser } from './auth-user.js';

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
}
