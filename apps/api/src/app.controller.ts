import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service.js';
import { Public } from './auth/decorators.js';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', db: 'ok' };
  }

  /** Plans on sale, for the public landing page. Prices are one USD price for every country, before VAT. */
  @Public()
  @Get('plans')
  plans() {
    return this.prisma.plan.findMany({
      where: { isActive: true, code: { not: 'trial' } },
      select: { code: true, name: true, priceCents: true, currency: true, maxJobsPerMonth: true, maxSites: true, maxUsers: true, features: true },
      orderBy: { priceCents: 'asc' },
    });
  }
}
