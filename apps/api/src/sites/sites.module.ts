import { Module } from '@nestjs/common';
import { SitesController } from './sites.controller.js';

@Module({ controllers: [SitesController] })
export class SitesModule {}
