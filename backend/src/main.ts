import { setDefaultResultOrder } from 'dns';
setDefaultResultOrder('ipv4first');

import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import * as path from 'path';
import * as fs from 'fs';
import { validateEnv } from './common/env-validator';
import { Logger, ValidationPipe } from '@nestjs/common';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  // ── ENV validation — crash early if required vars missing ─────────────────
  validateEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false, // manually configured below
    logger: ['log', 'warn', 'error'],
  });

  // ── Trust proxy — REQUIRED when behind Nginx on VPS ─────────────────────
  // Without this, rate limiting uses Nginx IP instead of real client IP,
  // and X-Forwarded-For / X-Forwarded-Proto headers are ignored.
  app.set('trust proxy', 1);
  app.use(helmet());

  // ── Global validation pipe ────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,         // strip unknown properties
      forbidNonWhitelisted: false, // don't throw on extra props (lenient for legacy payloads)
      transform: true,
    }),
  );

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  app.enableShutdownHooks();

  // ── Body size limit ───────────────────────────────────────────────────────
  const express = require('express');
  // Webhook: raw buffer needed for HMAC signature verification
  app.use('/webhook', express.raw({ type: 'application/json', limit: '1mb' }));
  // All other routes: standard JSON with 1MB limit
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // ── Static file serving ───────────────────────────────────────────────────
  const storageDir = path.join(process.cwd(), 'storage');
  fs.mkdirSync(storageDir, { recursive: true });
  app.use('/storage/dev.db', (_req: any, res: any) => {
    res.status(403).json({ message: 'Forbidden' });
  });
  app.useStaticAssets(storageDir, { prefix: '/storage' });

  // ── Landing page at root "/" ──────────────────────────────────────────────
  const landingDir = path.join(process.cwd(), '../landing');
  if (fs.existsSync(landingDir)) {
    app.useStaticAssets(landingDir, { prefix: '/' });
  }

  // ── CORS ──────────────────────────────────────────────────────────────────
  const rawOrigins = (process.env.CORS_ORIGINS || '').trim();
  const allowedOrigins = rawOrigins
    ? rawOrigins
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : null;

  const isProduction = process.env.NODE_ENV === 'production';
  app.enableCors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (!allowedOrigins) {
        if (isProduction) return cb(new Error(`CORS blocked: ${origin} — set CORS_ORIGINS`));
        return cb(null, true);
      }
      if (allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS blocked: ${origin}`));
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  logger.log(`🚀  API      →  http://localhost:${port}`);
  logger.log(`📁  Storage  →  http://localhost:${port}/storage`);
  logger.log(`❤️   Health   →  http://localhost:${port}/health`);
  logger.log(
    `🌍  CORS     →  ${allowedOrigins ? allowedOrigins.join(', ') : 'ALL (dev)'}`,
  );

  // ── Graceful SIGTERM handler ──────────────────────────────────────────────
  // Waits for in-flight requests to finish before shutting down
  process.on('SIGTERM', async () => {
    logger.log('SIGTERM received — graceful shutdown starting...');
    await app.close();
    logger.log('Server closed gracefully');
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.log('SIGINT received — shutting down...');
    await app.close();
    process.exit(0);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
