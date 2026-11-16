import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { configuration } from '../src/config.js';
import { createApp } from '../src/app.js';
import { DemoStore, DEMO_USER } from '../src/services/demo.js';
import { settlePet, effectivePet } from '../src/services/catalog.js';
let app, store, config, token, dir, image;
const auth = () => ({ Authorization: 'Bearer ' + token });
const upload = (target, key = randomUUID()) =>
  request(target)
    .post('/api/collections')
    .set(auth())
    .set('Idempotency-Key', key)
    .field('name', 'Hardening Mew')
    .attach('photo', image, { filename: 'cat.png', contentType: 'image/png' });
before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'findmew-hardening-'));
  config = configuration({
    DEMO_MODE: 'true',
    DEMO_DATA_DIR: dir,
    DEMO_TOKEN_SECRET: 'test-secret',
    UPLOAD_RATE_LIMIT: '100',
  });
  const created = await createApp(config);
  ({ app, store } = created);
  token = created.issueDemoToken();
  image = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#fad6ab' } })
    .png()
    .toBuffer();
});
after(async () => await rm(dir, { recursive: true, force: true }));

test('map assets use the permitted provider and local worker while preserving security headers', async () => {
  const response = await request(app).get('/api/health');
  assert.equal(response.status, 200);
  assert.equal(response.headers['referrer-policy'], 'strict-origin-when-cross-origin');
  const policy = response.headers['content-security-policy'];
  assert.match(
    policy,
    /(?:^|;)img-src 'self' data: blob: https:\/\/tiles\.openfreemap\.org(?:;|$)/
  );
  assert.match(policy, /(?:^|;)connect-src [^;]*https:\/\/tiles\.openfreemap\.org(?:;|$)/);
  assert.match(policy, /(?:^|;)worker-src 'self'(?:;|$)/);
  assert.match(policy, /(?:^|;)script-src 'self'(?:;|$)/);
  assert.match(policy, /(?:^|;)object-src 'none'(?:;|$)/);
});

test('config rejects unsafe origins, invalid limits, partial Supabase config and weak production secrets', () => {
  for (const overrides of [
    { DEMO_MODE: 'yes' },
    { PORT: 'NaN' },
    { PORT: '0' },
    { APP_ORIGINS: '*' },
    { APP_ORIGINS: 'https://example.com/path' },
    { TRUST_PROXY_HOPS: 'true' },
    { MAX_CONCURRENT_UPLOADS: '99' },
    { SUPABASE_URL: 'https://example.supabase.co' },
  ])
    assert.throws(() => configuration(overrides));
  assert.throws(() =>
    configuration({
      DEMO_MODE: 'true',
      NODE_ENV: 'production',
      DEMO_TOKEN_SECRET: 'weak',
      APP_ORIGINS: 'https://example.com',
    })
  );
  const real = configuration({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    SUPABASE_SECRET_KEY: 'sb_secret_test',
  });
  assert.equal(real.demo, false);
  assert.equal(real.anonKey, 'sb_publishable_test');
  assert.equal(real.serviceKey, 'sb_secret_test');
});
test('malformed and oversized JSON have consistent redacted errors and request identifiers', async () => {
  const malformed = await request(app)
    .patch('/api/profile')
    .set(auth())
    .set('Content-Type', 'application/json')
    .send('{"secret":"must-not-be-reflected"');
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.error.code, 'INVALID_JSON');
  assert.ok(!JSON.stringify(malformed.body).includes('must-not-be-reflected'));
  assert.equal(malformed.body.error.requestId, malformed.headers['x-request-id']);
  assert.equal(malformed.headers['cache-control'], 'no-store');
  const large = await request(app)
    .patch('/api/profile')
    .set(auth())
    .send({ bio: 'x'.repeat(33000) });
  assert.equal(large.status, 413);
  assert.equal(large.body.error.code, 'PAYLOAD_TOO_LARGE');
  const cors = await request(app).get('/api/config').set('Origin', 'https://untrusted.example');
  assert.equal(cors.status, 403);
  assert.equal(cors.headers['cache-control'], 'no-store');
});
test('unexpected backend failures never expose secrets or raw exceptions', async () => {
  const events = [],
    badStore = Object.create(store);
  badStore.use = async () => {
    throw new Error('private-service-key-and-database-password');
  };
  const bad = (
    await createApp(config, { store: badStore, logger: { error: (event) => events.push(event) } })
  ).app;
  const result = await request(bad)
    .post('/api/inventory/use')
    .set(auth())
    .set('Idempotency-Key', randomUUID())
    .send({ product_id: 'tuna' });
  assert.equal(result.status, 500);
  assert.equal(result.body.error.code, 'INTERNAL_ERROR');
  assert.ok(!JSON.stringify([result.body, events]).includes('private-service-key'));
  assert.equal(events[0].requestId, result.headers['x-request-id']);
});
test('even correctly signed demo tokens need a valid subject and finite future expiry', async () => {
  for (const claims of [
    { sub: DEMO_USER },
    { sub: DEMO_USER, exp: Date.now() - 1 },
    { sub: 'invalid', exp: Date.now() + 10000 },
    { sub: DEMO_USER, exp: 'tomorrow' },
  ]) {
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url'),
      signature = createHmac('sha256', config.secret).update(payload).digest('base64url');
    assert.equal(
      (
        await request(app)
          .get('/api/me')
          .set('Authorization', 'Bearer ' + payload + '.' + signature)
      ).status,
      401
    );
  }
});
test('PATCH supports individual fields but rejects empty patches and protected fields', async () => {
  const old = (await store.state(DEMO_USER)).profile;
  const partial = await request(app)
    .patch('/api/profile')
    .set(auth())
    .send({ bio: 'Only the bio changes' });
  assert.equal(partial.status, 200);
  assert.equal(partial.body.name, old.name);
  assert.equal((await request(app).patch('/api/profile').set(auth()).send({})).status, 400);
  assert.equal(
    (await request(app).patch('/api/profile').set(auth()).send({ coins: 999 })).status,
    400
  );
  const created = await upload(app);
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.equal(
    (
      await request(app)
        .patch('/api/collections/' + id)
        .set(auth())
        .send({ notes: 'Partial note' })
    ).status,
    200
  );
  assert.equal(
    (
      await request(app)
        .patch('/api/collections/' + id)
        .set(auth())
        .send({ user_id: randomUUID() })
    ).status,
    400
  );
});
test('uploads require identity before buffering and enforce multipart size and fields', async () => {
  assert.equal(
    (await request(app).post('/api/collections').set(auth()).send({ name: 'no key' })).body.error
      .code,
    'VALIDATION_ERROR'
  );
  assert.equal(
    (
      await request(app)
        .post('/api/collections')
        .set(auth())
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'JSON upload' })
    ).status,
    415
  );
  const tooLarge = await request(app)
    .post('/api/collections')
    .set(auth())
    .set('Idempotency-Key', randomUUID())
    .field('name', 'Large')
    .attach('photo', Buffer.alloc(6 * 1024 * 1024 + 1), {
      filename: 'large.jpg',
      contentType: 'image/jpeg',
    });
  assert.equal(tooLarge.status, 400);
  assert.equal(tooLarge.body.error.code, 'UPLOAD_LIMIT');
});
test('upload capacity rejects concurrent work and releases its slot after completion', async () => {
  let enter, release;
  const entered = new Promise((r) => {
      enter = r;
    }),
    hold = new Promise((r) => {
      release = r;
    });
  const heldStore = Object.create(store);
  heldStore.createCollection = async (...args) => {
    enter();
    await hold;
    return store.createCollection(...args);
  };
  const limited = (await createApp({ ...config, maxUploads: 1 }, { store: heldStore })).app;
  const first = upload(limited).then((r) => r);
  try {
    await Promise.race([
      entered,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('upload did not start')), 3000).unref()
      ),
    ]);
    const blocked = await upload(limited);
    assert.equal(blocked.status, 503);
    assert.equal(blocked.body.error.code, 'UPLOAD_BUSY');
  } finally {
    release();
  }
  assert.equal((await first).status, 201);
  assert.equal((await upload(limited)).status, 201);
});
test('fractional decay matches elapsed time even when status is materialized frequently', () => {
  const start = Date.UTC(2026, 10, 15),
    pet = { energy: 80, clean: 85, happiness: 70, updated_at: new Date(start).toISOString() };
  let p = pet;
  for (let i = 1; i <= 4; i++) p = settlePet(p, start + i * 900000);
  assert.deepEqual([p.energy, p.clean, p.happiness], [78, 84, 69]);
  const publicPet = effectivePet(p, start + 3600000);
  assert.equal(publicPet.energy_remainder, undefined);
});
test('failed demo file commits retain durable reservations and retries reward only once', async () => {
  const key = randomUUID(),
    before = (await store.state(DEMO_USER)).profile.coins,
    save = store.save.bind(store);
  let count = 0;
  store.save = async () => {
    if (++count === 2) throw new Error('Simulated disk failure');
    return save();
  };
  let failed;
  try {
    failed = await upload(app, key);
  } finally {
    store.save = save;
  }
  assert.equal(failed.status, 500);
  const persisted = JSON.parse(await readFile(path.join(dir, 'demo.json'), 'utf8'));
  assert.ok(persisted.uploads[DEMO_USER + key]);
  assert.equal(persisted.users[DEMO_USER].profile.coins, before);
  const retry = await upload(app, key);
  assert.equal(retry.status, 201);
  assert.equal((await upload(app, key)).body.reward, 0);
  assert.equal((await store.state(DEMO_USER)).profile.coins, before + 10);
  assert.equal(
    (
      await request(app)
        .post('/api/collections')
        .set(auth())
        .set('Idempotency-Key', key)
        .field('name', 'Changed body')
        .attach('photo', image, { filename: 'cat.png', contentType: 'image/png' })
    ).status,
    409
  );
});
test('demo deletion jobs survive partial failure and are recovered by a fresh store', async () => {
  const created = await upload(app),
    id = created.body.id,
    remove = store.runDeletion;
  store.runDeletion = async () => {
    throw new Error('File locked');
  };
  let result;
  try {
    result = await request(app)
      .delete('/api/collections/' + id)
      .set(auth());
  } finally {
    store.runDeletion = remove;
  }
  assert.equal(result.status, 202);
  assert.equal(
    (
      await request(app)
        .get('/api/collections/' + id)
        .set(auth())
    ).status,
    404
  );
  const restarted = await new DemoStore(config).init();
  assert.ok(restarted.db.deletions[id]);
  assert.equal((await restarted.cleanup()).deleted, 1);
  assert.ok(!restarted.db.deletions[id]);
});
