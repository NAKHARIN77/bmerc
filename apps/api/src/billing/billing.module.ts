import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller.js';
import { StripeWebhookController } from './stripe-webhook.controller.js';

@Module({ controllers: [BillingController, StripeWebhookController] })
export class BillingModule {}
