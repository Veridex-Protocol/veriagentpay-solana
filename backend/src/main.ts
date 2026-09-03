import * as dotenv from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

dotenv.config();

const sharedDevelopmentEnv = resolve(__dirname, '../../../backend/.env');
if (!process.env.JWT_SECRET && existsSync(sharedDevelopmentEnv)) {
  dotenv.config({ path: sharedDevelopmentEnv });
}

const tunnelDeploymentPath = resolve(__dirname, '../../deployments/devnet-tunnel.json');
if (!process.env.SOLANA_PROGRAM_ID && existsSync(tunnelDeploymentPath)) {
  const deployment = JSON.parse(readFileSync(tunnelDeploymentPath, 'utf8'));
  if (!process.env.RP_ID || process.env.RP_ID === deployment.webauthn.rpId) {
    process.env.SOLANA_CHAIN_REF ??= deployment.network;
    process.env.SOLANA_CLUSTER_DOMAIN ??= deployment.genesisHash;
    process.env.SOLANA_PROGRAM_ID ??= deployment.programId;
    process.env.SOLANA_RPC_URL ??= deployment.clusterRpc;
    process.env.SOLANA_USDC_MINT ??= deployment.stablecoinMint;
    process.env.WEBAUTHN_ORIGIN ??= deployment.webauthn.origin;
  }
}

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { assertSecretsLoaded } from './config/secrets';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { getEnabledPlatforms } from './config/platforms.config';
import { assertRelayerIsRemote } from './relayer/relayer-signer.factory';

async function bootstrap() {
  // Fail at boot, loudly, rather than deep inside DI — or worse, at runtime
  // under a fallback signing key. Every secret is validated here (SEC-008).
  assertSecretsLoaded();

  // `rawBody` preserves the exact bytes each platform signed, which webhook
  // signature verification requires — a re-serialized body does not reproduce
  // them (SEC-007).
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // The app sits behind nginx, so without this every request throttles against
  // the proxy's single IP and the rate limits apply to all users collectively
  // rather than per client (SEC-016).
  (app.getHttpAdapter().getInstance() as any).set('trust proxy', 1);

  // Bound request size. Without a limit, any endpoint will buffer and parse an
  // arbitrarily large payload (SEC-017).
  app.use(json({ limit: '256kb' }));
  app.use(urlencoded({ extended: true, limit: '256kb' }));

  /**
   * Global input validation.
   *
   * `forbidNonWhitelisted` is the important one: it rejects properties no DTO
   * declares, which is the class of bug behind SEC-002 — an unauthenticated
   * caller supplying `userId` in a body that never intended to expose it.
   *
   * Webhook routes opt out at the handler, since platform payloads carry many
   * undeclared fields; their integrity comes from signature verification.
   */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      disableErrorMessages: process.env.NODE_ENV === 'production',
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  // 1. Enable Helmet Security Headers (nosniff, XSS protection, frameguard)
  try {
    const helmet = require('helmet');
    app.use(
      helmet({
        contentSecurityPolicy: false, // Allow iframe embedding for Discord/Telegram Mini Apps
        crossOriginEmbedderPolicy: false,
      })
    );
  } catch (e) {
    // Helmet will activate automatically once packages are installed
  }

  // 2. Enable CORS with configurable origin restriction
  const isProduction = process.env.NODE_ENV === 'production';

  const defaultOrigins = [
    'https://veriagentpay.xyz',
    'https://www.veriagentpay.xyz',
    'https://app.veriagentpay.xyz',
    'https://admin.veriagentpay.xyz',
    'https://web.telegram.org',
    'https://*.discord.com',
    'https://app.slack.com',
  ];

  if (!isProduction) {
    defaultOrigins.push('http://localhost:3000', 'http://localhost:3001');
  }

  const configuredOrigins = process.env.ALLOWED_ORIGINS?.split(',') ?? [];
  const allowedOrigins = (
    configuredOrigins.length > 0 ? configuredOrigins : defaultOrigins
  )
    .map((o) => o.trim())
    .filter(Boolean);

  // A configured tunnel allowlist must not turn ordinary local development
  // into an "unlisted but allowed" warning on every request.
  if (!isProduction) {
    for (const localOrigin of ['http://localhost:3000', 'http://localhost:3001']) {
      if (!allowedOrigins.includes(localOrigin)) allowedOrigins.push(localOrigin);
    }
  }

  /** Matches an origin against an allowlist entry, supporting a leading `*.` wildcard. */
  const originMatches = (origin: string, pattern: string): boolean => {
    if (pattern === '*') return true;
    if (pattern === origin) return true;

    const wildcardIndex = pattern.indexOf('://*.');
    if (wildcardIndex !== -1) {
      const scheme = pattern.slice(0, wildcardIndex + 3); // includes "://"
      const suffix = pattern.slice(wildcardIndex + 4); // ".discord.com"
      return origin.startsWith(scheme) && origin.slice(scheme.length).endsWith(suffix);
    }
    return false;
  };

  try {
    const cookieParser = require('cookie-parser');
    app.use(cookieParser());
  } catch (e) {
    // Cookie parser middleware fallback
  }

  app.enableCors({
    origin: (origin, callback) => {
      // Same-origin / server-to-server requests carry no Origin header.
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.some((pattern) => originMatches(origin, pattern))) {
        callback(null, true);
        return;
      }
      if (!isProduction) {
        console.warn(`[CORS] Allowing unlisted origin in non-production: ${origin}`);
        callback(null, true);
        return;
      }
      callback(new Error(`Origin ${origin} is not permitted by CORS policy`), false);
    },
    credentials: true,
    methods: 'GET,POST,PUT,DELETE,OPTIONS',
    // `x-wallet-address` and `x-admin-email` were removed: both were used as
    // identity, neither carried proof, and allowing them here invited their
    // reintroduction. Identity now comes from Authorization only.
    allowedHeaders: 'Content-Type,Authorization,x-telegram-init-data,x-passkey-verified',
  });

  // Refuse to serve production traffic while the relayer can sign from a local
  // key. The migration's failure mode is silent — the key is imported to KMS,
  // the alias is missed, and everything keeps working from the env var while
  // looking migrated — so this turns it into a boot failure. The guard has
  // existed since the KMS migration but was never invoked.
  //
  // @see docs/security-remediation-plan.md — BE-H-01
  assertRelayerIsRemote();

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`🚀 VeriAgent Pay API Gateway successfully running on port ${port}`);
  console.log(`🔌 Enabled platforms: ${getEnabledPlatforms().join(', ')}`);
}
bootstrap();
