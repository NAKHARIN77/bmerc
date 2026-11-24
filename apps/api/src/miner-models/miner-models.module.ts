import { Module } from '@nestjs/common';
import { MinerModelsController, PlatformMinerModelsController } from './miner-models.controller.js';

@Module({ controllers: [MinerModelsController, PlatformMinerModelsController] })
export class MinerModelsModule {}
