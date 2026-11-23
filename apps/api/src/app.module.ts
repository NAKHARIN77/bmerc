import 'dotenv/config';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CompanyModule } from './company/company.module.js';
import { UsersModule } from './users/users.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { SitesModule } from './sites/sites.module.js';
import { TeamsModule } from './teams/teams.module.js';
import { PartsModule } from './parts/parts.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { StockModule } from './stock/stock.module.js';
import { DevicesModule } from './devices/devices.module.js';
import { PlatformModule } from './platform/platform.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { BillingModule } from './billing/billing.module.js';
import { MinerModelsModule } from './miner-models/miner-models.module.js';

@Module({
  imports: [PrismaModule, AuthModule, CompanyModule, UsersModule, CustomersModule, SitesModule, TeamsModule, PartsModule, JobsModule, StockModule, DevicesModule, PlatformModule, ReportsModule, BillingModule, MinerModelsModule],
  controllers: [AppController],
})
export class AppModule {}
