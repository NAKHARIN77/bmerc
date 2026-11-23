import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller.js';
import { JobActionsController } from './job-actions.controller.js';
import { JobBillingController } from './job-billing.controller.js';

@Module({ controllers: [JobsController, JobActionsController, JobBillingController] })
export class JobsModule {}
