import { Module } from '@nestjs/common';
import { StockController } from './stock.controller.js';
import { TransfersController } from './transfers.controller.js';

@Module({ controllers: [TransfersController, StockController] })
export class StockModule {}
