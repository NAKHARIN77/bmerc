import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { forPlatformAdmin, forTenant } from '../prisma/tenant.js';
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

  /** Platform owner: read-only across companies. */
  platform() {
    return forPlatformAdmin(this.raw);
  }

  /** Platform owner acting inside one company (e.g. via the company switcher). */
  tenantById(companyId: string) {
    return forTenant(this.raw, companyId);
  }
}
