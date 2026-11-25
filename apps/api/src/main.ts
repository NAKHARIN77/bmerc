import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';

export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api/v1');
  // The web app forwards /api/v1 to this server, so req.ip would always be the web server's address.
  // Trust X-Forwarded-For from these proxies (Express "trust proxy" syntax) so rate limits and audit IPs see the real client.
  // "true"/"false" and hop counts ("2") must reach Express as a boolean or number; anything else is a list of addresses.
  const trust = process.env.TRUST_PROXY ?? 'loopback';
  app.getHttpAdapter().getInstance().set('trust proxy', trust === 'true' ? true : trust === 'false' ? false : /^\d+$/.test(trust) ? Number(trust) : trust);
  app.use(cookieParser());
  app.enableCors({ origin: process.env.WEB_ORIGIN?.split(',') ?? false, credentials: true });
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.listen(process.env.PORT ?? process.env.API_PORT ?? 4000);
}

if (!process.env.VITEST) await bootstrap();
