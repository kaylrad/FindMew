import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { AppError } from './errors.js';
import { backendRoot } from './config.js';
import { DemoStore, DEMO_USER } from './services/demo.js';
import { SupabaseStore } from './services/supabase.js';
import { createAuthentication } from './middleware/auth.js';
import { requestContext, errorHandler } from './middleware/errors.js';
import { asyncRoute, pagination, idSchema } from './validation.js';
import { collectionRoutes, sendPhoto } from './routes/collections.js';
import { accountRoutes } from './routes/account.js';
import { maintenanceRoute } from './routes/maintenance.js';

export async function createApp(
  config,
  { store: providedStore, logger = console, serveFrontend = true } = {}
) {
  const store =
    providedStore ||
    (await (config.demo ? new DemoStore(config) : new SupabaseStore(config)).init());
  const { authenticate, issueDemoToken } = createAuthentication(config, store);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxyHops || false);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https://tiles.openfreemap.org'],
          connectSrc: [
            "'self'",
            ...(config.url ? [config.url] : []),
            'https://tiles.openfreemap.org',
          ],
          fontSrc: ["'self'"],
          workerSrc: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: config.production ? [] : null,
        },
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use('/api', requestContext);
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin || config.origins.includes(origin)) cb(null, true);
        else cb(new AppError('ORIGIN_DENIED', 'Origin tidak diizinkan.', 403));
      },
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
      exposedHeaders: ['X-Request-Id', 'Retry-After'],
    })
  );
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: config.apiRateLimit || 180,
      skip: (req) => ['/health', '/ready'].includes(req.path),
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler(req, res, next) {
        next(
          new AppError('RATE_LIMITED', 'Terlalu banyak permintaan. Coba lagi sebentar.', 429, {
            retryAfter: 60,
          })
        );
      },
    })
  );
  app.use(express.json({ limit: '32kb' }));
  app.get('/api/health', (_, res) =>
    res.json({ ok: true, mode: config.demo ? 'demo' : 'supabase' })
  );
  app.get(
    '/api/ready',
    asyncRoute(async (req, res) => {
      try {
        const result = await store.health();
        res.json({ ok: true, mode: config.demo ? 'demo' : 'supabase', ...result });
      } catch {
        throw new AppError(
          'NOT_READY',
          'Backend belum siap. Periksa koneksi database, migration, dan bucket privat.',
          503
        );
      }
    })
  );
  app.get('/api/config', (_, res) =>
    res.json({
      demo: config.demo,
      reward: config.reward,
      feedingBonusReward: config.feedingBonusReward,
      maxPhotoBytes: config.maxPhotoBytes,
      supabase: config.demo ? null : { url: config.url, anonKey: config.anonKey },
    })
  );
  app.post(
    '/api/demo/session',
    asyncRoute(async (req, res) => {
      if (!config.demo) throw new AppError('NOT_FOUND', 'Endpoint tidak ditemukan.', 404);
      await store.ensureUser(DEMO_USER, 'Nadia');
      res.json({
        access_token: issueDemoToken(),
        user: { id: DEMO_USER },
        expires_at: Date.now() + 86400000,
      });
    })
  );
  app.get(
    '/api/map',
    asyncRoute(async (req, res) => res.json(await store.publicMap(null, pagination(req))))
  );
  app.get(
    '/api/map/:id/photo',
    asyncRoute(async (req, res) =>
      sendPhoto(res, await store.photo(null, idSchema.parse(req.params.id), true))
    )
  );
  app.get('/api/internal/cleanup', maintenanceRoute(store, config.cronSecret));
  app.use('/api', authenticate);
  app.use('/api/collections', collectionRoutes(store, config));
  app.use('/api', accountRoutes(store));
  app.use('/api', (_, res, next) =>
    next(new AppError('NOT_FOUND', 'Endpoint tidak ditemukan.', 404))
  );
  const dist = path.resolve(backendRoot, '../frontend/dist');
  if (serveFrontend && existsSync(dist)) {
    app.use(
      express.static(dist, {
        setHeaders(res, file) {
          if (/(?:sw\.js|workbox-|manifest\.webmanifest|index\.html)/.test(file))
            res.set('Cache-Control', 'no-cache');
        },
      })
    );
    app.get('*', (_, res) =>
      res.set('Cache-Control', 'no-cache').sendFile(path.join(dist, 'index.html'))
    );
  }
  app.use(errorHandler(logger));
  return { app, store, issueDemoToken };
}
