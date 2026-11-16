import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createServerlessHandler } from '../src/serverless.js';
import { configuration } from '../src/config.js';
import { createApp } from '../src/app.js';

test('serverless handler preserves API paths and bodies and shares one cold-start initialization', async () => {
  let starts = 0;
  const handler = createServerlessHandler(async () => {
    starts++;
    const app = express();
    app.use(express.json());
    app.post('/api/example', (req, res) => res.json({ value: req.body.value }));
    return app;
  });
  const results = await Promise.all([
    request(handler).post('/api/example').send({ value: 10 }),
    request(handler).post('/api/example').send({ value: 15 }),
  ]);
  assert.deepEqual(
    results.map((result) => result.body.value),
    [10, 15]
  );
  assert.equal(starts, 1);
});

test('serverless startup failure returns a safe no-store response and permits recovery', async () => {
  let calls = 0;
  const handler = createServerlessHandler(() => {
    if (++calls === 1) throw new Error('private runtime detail');
    return (req, res) => res.end('ready');
  });
  const failed = await request(handler).get('/api/health');
  assert.equal(failed.status, 503);
  assert.equal(failed.body.error.code, 'NOT_READY');
  assert.equal(failed.headers['cache-control'], 'no-store');
  assert.ok(!failed.text.includes('private runtime detail'));
  assert.equal((await request(handler).get('/api/health')).text, 'ready');
  assert.equal(calls, 2);
});

test('hosted configuration permits only exact configured Vercel origins and rejects hosted demo', () => {
  const env = {
    VERCEL: '1',
    DEMO_MODE: 'false',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'test-public',
    SUPABASE_SECRET_KEY: 'test-private',
    VERCEL_URL: 'findmew-preview.vercel.app',
    VERCEL_PROJECT_PRODUCTION_URL: 'findmew.vercel.app',
  };
  const config = configuration(env);
  assert.equal(config.production, true);
  assert.equal(config.trustProxyHops, 1);
  assert.deepEqual(config.origins, [
    'https://findmew-preview.vercel.app',
    'https://findmew.vercel.app',
  ]);
  assert.ok(!config.origins.includes('https://unrelated.vercel.app'));
  assert.equal(config.maxPhotoBytes, 4 * 1024 * 1024);
  assert.throws(() => configuration({ ...env, DEMO_MODE: 'true' }));
  assert.throws(() => configuration({ ...env, VERCEL_URL: 'invalid.vercel.app/path' }));
});

test('scheduled cleanup requires its own secret and never accepts an ordinary user token', async () => {
  let cleaned = 0;
  const secret = 'test-only-cleanup-secret-32-characters';
  const store = {
    cleanup: async () => {
      cleaned++;
      return { deleted: 2, abandoned: 0, failed: 0 };
    },
  };
  const config = configuration({ DEMO_MODE: 'true', CRON_SECRET: secret });
  const { app } = await createApp(config, { store, serveFrontend: false });
  assert.equal((await request(app).get('/api/internal/cleanup')).status, 401);
  assert.equal(
    (await request(app).get('/api/internal/cleanup').set('Authorization', 'Bearer user-token'))
      .status,
    401
  );
  assert.equal(cleaned, 0);
  const result = await request(app)
    .get('/api/internal/cleanup')
    .set('Authorization', 'Bearer ' + secret);
  assert.equal(result.status, 200);
  assert.equal(result.body.deleted, 2);
  assert.equal(cleaned, 1);
  assert.equal((await request(app).get('/')).status, 404);
});
