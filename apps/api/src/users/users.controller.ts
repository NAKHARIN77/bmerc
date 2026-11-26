import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { notFound, parse } from '../common/http.js';
import { uuid } from '../common/paging.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { COMPANY_ROLES, type AuthUser } from '../auth/auth-user.js';
import { LogView } from '../audit/log-view.js';
import type { Role } from '../generated/prisma/enums.js';
import { UsersService } from './users.service.js';

const role = z.enum(COMPANY_ROLES as [Role, ...Role[]]);
const fullName = z.string().trim().min(2).max(200);
const InviteBody = z.object({
  email: z.email(),
  fullName,
  role,
  teamId: z.uuid().nullish(),
  siteIds: z.array(z.uuid()).max(500).optional(),
});
const PatchBody = z
  .object({ fullName: fullName.optional(), role: role.optional(), teamId: z.uuid().nullable().optional(), siteIds: z.array(z.uuid()).max(500).optional() })
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update');

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Roles('company_admin', 'site_manager')
  @LogView('user')
  @Get()
  list(@CurrentUser() me: AuthUser) {
    return this.users.list(me);
  }

  @Roles('company_admin', 'site_manager')
  @LogView('user')
  @Get(':id')
  async get(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    parse(uuid, id);
    if (me.siteIds !== null && !(await this.users.list(me)).some((u) => u.id === id)) throw notFound('User');
    return this.users.get(me, id);
  }

  /** Creates the user without a password and emails them a link to set one. */
  @Roles('company_admin')
  @Post()
  invite(@CurrentUser() me: AuthUser, @Body() body: unknown, @Req() req: Request) {
    return this.users.invite(me, parse(InviteBody, body), req.ip);
  }

  @Roles('company_admin')
  @Patch(':id')
  update(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    return this.users.update(me, parse(uuid, id), parse(PatchBody, body), req.ip);
  }

  @Roles('company_admin')
  @Post(':id/deactivate')
  @HttpCode(200)
  deactivate(@CurrentUser() me: AuthUser, @Param('id') id: string, @Req() req: Request) {
    return this.users.setActive(me, parse(uuid, id), false, req.ip);
  }

  @Roles('company_admin')
  @Post(':id/activate')
  @HttpCode(200)
  activate(@CurrentUser() me: AuthUser, @Param('id') id: string, @Req() req: Request) {
    return this.users.setActive(me, parse(uuid, id), true, req.ip);
  }

  @Roles('company_admin')
  @Post(':id/resend-invite')
  @HttpCode(200)
  resendInvite(@CurrentUser() me: AuthUser, @Param('id') id: string, @Req() req: Request) {
    return this.users.resendInvite(me, parse(uuid, id), req.ip);
  }
}
