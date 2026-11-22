import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditService } from '../audit/audit.service.js';
import { AuditController } from '../audit/audit.controller.js';
import { DbService } from '../db/db.service.js';
import { MailService } from '../mail/mail.service.js';
import { AuthController, MeController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';

@Global()
@Module({
  controllers: [AuthController, MeController, AuditController],
  providers: [AuthService, AuditService, DbService, MailService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthService, AuditService, DbService, MailService],
})
export class AuthModule {}
