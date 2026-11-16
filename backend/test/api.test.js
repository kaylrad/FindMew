import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { configuration } from '../src/config.js';
import { DEMO_USER, OTHER_USER } from '../src/services/demo.js';
let app, store, token, otherToken, config, dir, image;
const auth = () => ({ Authorization: `Bearer ${token}` });
const newPhoto = (key = randomUUID(), name = 'Test Mew', visibility = 'private') =>
  request(app)
    .post('/api/collections')
    .set(auth())
    .set('Idempotency-Key', key)
    .field('name', name)
    .field('notes', 'Sebuah cerita.')
    .field('visibility', visibility)
    .field('latitude', '-6.2')
    .field('longitude', '106.8')
    .attach('photo', image, { filename: 'cat.png', contentType: 'image/png' });
before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'findmew-test-'));
  config = configuration({
    DEMO_MODE: 'true',
    DEMO_DATA_DIR: dir,
    DEMO_TOKEN_SECRET: 'test-secret',
    COLLECTION_REWARD: '25',
    MAX_CONCURRENT_UPLOADS: '4',
    UPLOAD_RATE_LIMIT: '100',
  });
  const result = await createApp(config);
  ({ app, store } = result);
  token = result.issueDemoToken();
  otherToken = result.issueDemoToken(OTHER_USER);
  image = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#ffc77d' } })
    .png()
    .toBuffer();
});
after(async () => {
  await rm(dir, { recursive: true, force: true });
});
test('auth, token verification, CORS and consistent validation', async () => {
  assert.equal((await request(app).get('/api/me')).status, 401);
  assert.equal(
    (await request(app).get('/api/me').set('Authorization', 'Bearer fabricated')).status,
    401
  );
  assert.equal(
    (await request(app).get('/api/config').set('Origin', 'https://evil.example')).status,
    403
  );
  const invalid = await request(app).patch('/api/profile').set(auth()).send({ coins: 999999 });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.code, 'VALIDATION_ERROR');
  assert.equal((await request(app).get('/api/collections?limit=-1').set(auth())).status, 400);
});
test('CRUD, storage, ownership, no extra rewards on retry/edit/delete', async () => {
  const before = (await request(app).get('/api/me').set(auth())).body.profile.coins;
  const key = randomUUID();
  const created = await newPhoto(key);
  assert.equal(created.status, 201);
  assert.equal(created.body.reward, 25);
  const id = created.body.id;
  const retry = await newPhoto(key);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.id, id);
  assert.equal(retry.body.reward, 0);
  assert.equal((await request(app).get(`/api/collections/${id}/photo`).set(auth())).status, 200);
  for (const method of ['get', 'patch', 'delete']) {
    const r = request(app)
      [method](`/api/collections/${id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    if (method === 'patch') r.send({ name: 'Hacked', notes: '', visibility: 'public' });
    assert.equal((await r).status, 404);
  }
  assert.equal((await request(app).get(`/api/map/${id}/photo`)).status, 404);
  const edited = await request(app)
    .patch(`/api/collections/${id}`)
    .set(auth())
    .send({ name: 'Mew baru', notes: 'Catatan edit', visibility: 'public' });
  assert.equal(edited.status, 200);
  assert.equal((await request(app).get(`/api/map/${id}/photo`)).status, 200);
  assert.ok((await request(app).get('/api/map')).body.items.some((c) => c.id === id));
  assert.ok(
    (await request(app).get('/api/explore/map').set(auth())).body.items.some(
      (c) => c.id === id && c.owned
    )
  );
  assert.equal((await request(app).get('/api/me').set(auth())).body.profile.coins, before + 25);
  const deleted = await request(app).delete(`/api/collections/${id}`).set(auth());
  assert.equal(deleted.status, 200);
  assert.equal((await request(app).get(`/api/collections/${id}`).set(auth())).status, 404);
  assert.equal((await newPhoto(key)).status, 409);
  assert.equal((await request(app).get('/api/me').set(auth())).body.profile.coins, before + 25);
  assert.equal((await readdir(path.join(dir, 'photos'))).length, 0);
});
test('parallel photo retries commit a single reward and collection', async () => {
  const key = randomUUID();
  const before = (await store.state(DEMO_USER)).profile.coins;
  const responses = await Promise.all([
    newPhoto(key, 'Serentak'),
    newPhoto(key, 'Serentak'),
    newPhoto(key, 'Serentak'),
  ]);
  assert.ok(responses.every((r) => [200, 201].includes(r.status)));
  assert.equal(new Set(responses.map((r) => r.body.id)).size, 1);
  assert.equal((await store.state(DEMO_USER)).profile.coins, before + 25);
});
test('purchase, consume, accessories and insufficient coins are atomic', async () => {
  const before = (await store.state(DEMO_USER)).profile.coins,
    key = randomUUID();
  const buy = () =>
    request(app)
      .post('/api/purchases')
      .set(auth())
      .set('Idempotency-Key', key)
      .send({ product_id: 'topi-zaitun' });
  await Promise.all([buy(), buy()]);
  let state = await store.state(DEMO_USER);
  assert.equal(state.profile.coins, before - 50);
  assert.equal(state.inventory.find((i) => i.product_id === 'topi-zaitun').quantity, 1);
  const useKey = randomUUID();
  const use = () =>
    request(app)
      .post('/api/inventory/use')
      .set(auth())
      .set('Idempotency-Key', useKey)
      .send({ product_id: 'tuna' });
  await Promise.all([use(), use()]);
  state = await store.state(DEMO_USER);
  assert.equal(state.pet.energy, 95);
  assert.equal(state.inventory.find((i) => i.product_id === 'tuna').quantity, 1);
  assert.equal(
    (
      await request(app)
        .post('/api/purchases')
        .set(auth())
        .set('Idempotency-Key', randomUUID())
        .send({ product_id: 'topi-zaitun', price: 1 })
    ).status,
    400
  );
  assert.equal(
    (
      await request(app)
        .post('/api/purchases')
        .set(auth())
        .set('Idempotency-Key', randomUUID())
        .send({ product_id: 'kacamata-hitam' })
    ).status,
    200
  );
  assert.equal(
    (
      await request(app)
        .put('/api/accessories')
        .set(auth())
        .send({ product_id: 'topi-zaitun', equipped: true })
    ).status,
    200
  );
  assert.ok((await store.state(DEMO_USER)).equipped.some((e) => e.product_id === 'topi-zaitun'));
  await request(app)
    .put('/api/accessories')
    .set(auth())
    .send({ product_id: 'topi-zaitun', equipped: false });
  assert.equal((await store.state(DEMO_USER)).equipped.length, 0);
  for (const product_id of ['topi-merah', 'topi-krem', 'kacamata-oval', 'bingkai-putih'])
    await request(app)
      .post('/api/purchases')
      .set(auth())
      .set('Idempotency-Key', randomUUID())
      .send({ product_id });
  assert.ok((await store.state(DEMO_USER)).profile.coins >= 0);
  assert.equal(
    (
      await request(app)
        .post('/api/purchases')
        .set(auth())
        .set('Idempotency-Key', randomUUID())
        .send({ product_id: 'topi-krem' })
    ).status,
    409
  );
});
test('public map excludes private collections and safe fields only', async () => {
  const r = await request(app).get('/api/map?limit=100');
  assert.equal(r.status, 200);
  const privates = store.db.collections.filter((c) => c.visibility === 'private').map((c) => c.id);
  for (const c of r.body.items) {
    assert.ok(!privates.includes(c.id));
    assert.equal(c.photo_path, undefined);
    assert.equal(c.user_id, undefined);
    assert.ok(c.latitude != null);
  }
});
test('profile/pet updates survive a new backend instance and new login token', async () => {
  await request(app).patch('/api/pet').set(auth()).send({ name: 'Matcha' });
  await request(app)
    .patch('/api/profile')
    .set(auth())
    .send({ name: 'Nadia Baru', username: 'nadia_baru', bio: 'Halo Mew', avatar: '🌿' });
  const restarted = await createApp(config);
  const r = await request(restarted.app)
    .get('/api/me')
    .set('Authorization', `Bearer ${restarted.issueDemoToken()}`);
  assert.equal(r.body.pet.name, 'Matcha');
  assert.equal(r.body.profile.name, 'Nadia Baru');
});
test('rejects spoofed images, missing IDs and oversized/invalid payloads', async () => {
  const r = await request(app)
    .post('/api/collections')
    .set(auth())
    .set('Idempotency-Key', randomUUID())
    .field('name', 'Fake')
    .attach('photo', Buffer.from('not a real image'), {
      filename: 'fake.jpg',
      contentType: 'image/jpeg',
    });
  assert.equal(r.status, 415);
  assert.equal(
    (await request(app).post('/api/purchases').set(auth()).send({ product_id: 'tuna' })).status,
    400
  );
});
