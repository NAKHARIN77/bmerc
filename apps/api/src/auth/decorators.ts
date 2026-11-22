import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '../generated/prisma/enums.js';
import type { AuthUser } from './auth-user.js';

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';
export const PLATFORM_ONLY = 'platformOnly';
export const ALLOW_SUSPENDED = 'allowSuspended';

/** No login needed. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Only company users with one of these roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);
/** Only platform owner accounts. */
export const PlatformOnly = () => SetMetadata(PLATFORM_ONLY, true);
/** Reachable even when the company is suspended (account-suspended page, billing). */
export const AllowSuspended = () => SetMetadata(ALLOW_SUSPENDED, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
