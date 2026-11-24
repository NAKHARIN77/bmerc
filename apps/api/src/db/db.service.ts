import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { forPlatformAdmin, forTenant, withTenantTx, type TenantTx } from '../prisma/tenant.js';
import type { AuthUser } from '../auth/auth-user.js';
import { forbidden } from '../common/http.js';

/** Entry point for tenant data. Company id always comes from the logged-in user. */
@Injectable()
export class DbService {
  constructor(readonly raw: PrismaService) {}

  tenant(user: AuthUser) {
    if (!user.companyId) throw forbidden('This account is not part of a company');
    return forTenant(this.raw, user.companyId);
  }

  /** Several tenant writes that must succeed or fail together. */
  tenantTx<T>(user: AuthUser, fn: (tx: TenantTx) => Promise<T>) {
    if (!user.companyId) throw forbidden('This account is not part of a company');
    return withTenantTx(this.raw, user.companyId, fn);
  }

  /** Platform owner: read-only across companies. */
  platform() {
    return forPlatformAdmin(this.raw);
  }
}
