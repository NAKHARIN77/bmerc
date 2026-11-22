import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditService } from '../audit/audit.service.js';
import { DbService } from '../db/db.service.js';
import { AuthController, MeController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';

@Global()
@Module({
  controllers: [AuthController, MeController],
  providers: [AuthService, AuditService, DbService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthService, AuditService, DbService],
})
export class AuthModule {}
