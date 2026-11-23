import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller.js';
import { JobActionsController } from './job-actions.controller.js';

@Module({ controllers: [JobsController, JobActionsController] })
export class JobsModule {}
