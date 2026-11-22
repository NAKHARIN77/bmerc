import { Controller, Get, Param } from '@nestjs/common';
import { DbService } from '../db/db.service.js';
import { notFound, parse } from '../common/http.js';
import { uuid } from '../common/paging.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { COMPANY_ROLES, type AuthUser } from '../auth/auth-user.js';
import { siteScope } from '../auth/scope.js';

const select = {
  id: true, name: true, country: true, province: true, address: true, status: true,
  customer: { select: { id: true, name: true } },
  teams: { select: { id: true, name: true, headUserId: true } },
} as const;

// Read side only; create / edit come with the CRUD work in plan step 3.
@Controller('sites')
export class SitesController {
  constructor(private readonly db: DbService) {}

  @Roles(...COMPANY_ROLES)
  @Get()
  list(@CurrentUser() me: AuthUser) {
    return this.db.tenant(me).site.findMany({ where: siteScope(me), select, orderBy: { name: 'asc' } });
  }

  @Roles(...COMPANY_ROLES)
  @Get(':id')
  async get(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const site = await this.db.tenant(me).site.findFirst({ where: { AND: [{ id: parse(uuid, id) }, siteScope(me)] }, select });
    if (!site) throw notFound('Site');
    return site;
  }
}
