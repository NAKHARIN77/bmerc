import { Module } from '@nestjs/common';
import { PartsController } from './parts.controller.js';

@Module({ controllers: [PartsController] })
export class PartsModule {}
