import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { parse } from '../common/http.js';
import { limitsFor, usageFor } from '../common/limits.js';
import { changed } from '../common/diff.js';
import { AllowSuspended, CurrentUser, Roles } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth-user.js';

// Intl.supportedValuesOf('timeZone') leaves out valid IANA names such as Asia/Ho_Chi_Minh, so ask the formatter instead.
const isTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

const CompanyPatch = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    legalName: optionalText(200),
    taxId: optionalText(50),
    billingEmail: z.email().nullable().optional(),
    billingAddress: optionalText(500),
    timezone: z.string().max(64).refine(isTimeZone, 'Unknown time zone').optional(),
  })
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update');

const select = {
  id: true, name: true, legalName: true, taxId: true, billingEmail: true, billingAddress: true, timezone: true,
  status: true, createdAt: true,
} as const;

/** Company settings: setup wizard step 1 and the billing details page. */
@Controller('company')
export class CompanyController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Roles('company_admin')
  @AllowSuspended()
  @Get()
  get(@CurrentUser() me: AuthUser) {
    return this.prisma.company.findUniqueOrThrow({ where: { id: me.companyId! }, select });
  }

  @Roles('company_admin')
  @AllowSuspended() // a suspended company still has to be able to fix its billing details
  @Patch()
  async update(@CurrentUser() me: AuthUser, @Body() body: unknown, @Req() req: Request) {
    const data = parse(CompanyPatch, body);
    const before = await this.prisma.company.findUniqueOrThrow({ where: { id: me.companyId! }, select });
    const after = await this.prisma.company.update({ where: { id: me.companyId! }, data, select });
    await this.audit.log({
      companyId: me.companyId, actorUserId: me.id, action: 'company.updated', entityType: 'company', entityId: me.companyId!,
      before: changed(before, data), after: changed(after, data), ip: req.ip,
    });
    return after;
  }

  /** Plan limits next to current usage (Subscription page, dashboard "Your plan" card). */
  @Roles('company_admin')
  @AllowSuspended()
  @Get('usage')
  async usage(@CurrentUser() me: AuthUser) {
    const [limits, used] = await Promise.all([limitsFor(this.prisma, me.companyId!), usageFor(this.prisma, me.companyId!)]);
    return {
      plan: limits.plan,
      users: { used: used.users, limit: limits.maxUsers },
      sites: { used: used.sites, limit: limits.maxSites },
      jobsThisMonth: { used: used.jobsThisMonth, limit: limits.maxJobsPerMonth },
    };
  }
}
