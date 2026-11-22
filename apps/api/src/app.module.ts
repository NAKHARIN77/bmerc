import 'dotenv/config';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { SitesModule } from './sites/sites.module.js';
import { JobsModule } from './jobs/jobs.module.js';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, SitesModule, JobsModule],
  controllers: [AppController],
})
export class AppModule {}
