import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { configuration } from '../src/config.js';
import { SupabaseStore } from '../src/services/supabase.js';
import { supabaseTransport, USER, OTHER } from './helpers/supabase-transport.js';
let api, store, remote, image;
const auth = { Authorization: 'Bearer token-user' };
const photo = (key, name = 'Cloud contract Mew', visibility = 'private') =>
  request(api)
    .post('/api/collections')
    .set(auth)
    .set('Idempotency-Key', key)
    .field('name', name)
    .field('notes', 'contract test')
    .field('visibility', visibility)
    .field('latitude', '-6.2')
    .field('longitude', '106.8')
    .attach('photo', image, { filename: 'cat.png', contentType: 'image/png' });
const scalar = async (sql, params = []) =>
  Object.values((await remote.db.query(sql, params)).rows[0])[0];
before(async () => {
  remote = await supabaseTransport();
  const config = configuration({
    DEMO_MODE: 'false',
    SUPABASE_URL: 'https://local-contract.supabase.co',
    SUPABASE_ANON_KEY: 'public-test-key',
    SUPABASE_SERVICE_ROLE_KEY: 'local-service-key',
    MAX_CONCURRENT_UPLOADS: '4',
    UPLOAD_RATE_LIMIT: '100',
  });
  store = await new SupabaseStore(config, { fetch: remote.fetch }).init();
  api = (await createApp(config, { store })).app;
  image = await sharp({ create: { width: 30, height: 30, channels: 3, background: '#eea56d' } })
    .png()
    .toBuffer();
});
after(async () => await remote.db.close());

test('real Supabase SDK verifies user tokens and keeps Auth outages separate from invalid sessions', async () => {
  assert.equal((await request(api).get('/api/me').set(auth)).status, 200);
  assert.equal(
    (await request(api).get('/api/me').set('Authorization', 'Bearer invalid-token')).status,
    401
  );
  remote.faults.authStatus = 503;
  const outage = await request(api).get('/api/me').set(auth);
  assert.equal(outage.status, 503);
  assert.equal(outage.body.error.code, 'AUTH_UNAVAILABLE');
  assert.equal(outage.headers['retry-after'], '10');
  delete remote.faults.authStatus;
  assert.ok(
    remote.calls.some(
      (c) => c.pathname === '/auth/v1/user' && c.authorization === 'Bearer token-user'
    )
  );
});
test('readiness checks schema, seed and private Storage without exposing credentials', async () => {
  const ready = await request(api).get('/api/ready');
  assert.equal(ready.status, 200);
  assert.equal(ready.body.schemaVersion, 5);
  assert.equal(ready.body.storage, true);
  remote.faults.publicBucket = true;
  assert.equal((await request(api).get('/api/ready')).status, 503);
  delete remote.faults.publicBucket;
  const config = await request(api).get('/api/config');
  assert.equal(config.body.demo, false);
  assert.ok(!JSON.stringify(config.body).includes('local-service-key'));
  assert.equal((await request(api).post('/api/demo/session')).status, 404);
});
test('Express + SDK + PostgreSQL + object store perform CRUD with ownership and public privacy', async () => {
  const key = randomUUID(),
    created = await photo(key);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.id;
  assert.equal(remote.objects.size, 1);
  const loaded = await request(api)
    .get('/api/collections/' + id + '/photo')
    .set(auth);
  assert.equal(loaded.status, 200);
  assert.match(loaded.headers['content-type'], /image\/webp/);
  assert.equal(
    (
      await request(api)
        .patch('/api/collections/' + id)
        .set('Authorization', 'Bearer token-other')
        .send({ name: 'steal' })
    ).status,
    404
  );
  assert.equal((await request(api).get('/api/map/' + id + '/photo')).status, 404);
  const edited = await request(api)
    .patch('/api/collections/' + id)
    .set(auth)
    .send({ visibility: 'public', name: 'Updated contract Mew' });
  assert.equal(edited.status, 200);
  assert.ok((await request(api).get('/api/map')).body.items.some((c) => c.id === id));
  assert.ok(
    (await request(api).get('/api/explore/map').set(auth)).body.items.some(
      (c) => c.id === id && c.owned
    )
  );
  const replay = await photo(key);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.reward, 0);
  assert.equal(replay.body.name, 'Updated contract Mew');
  assert.equal((await photo(key, 'different payload')).status, 409);
  assert.equal(
    (
      await request(api)
        .delete('/api/collections/' + id)
        .set(auth)
    ).status,
    200
  );
  assert.equal(remote.objects.size, 0);
  assert.equal((await photo(key)).status, 409);
});
test('an uploaded file survives a failed metadata transaction and retry commits one reward', async () => {
  const before = await scalar('select coins from profiles where id=$1', [USER]),
    key = randomUUID();
  remote.faults.complete_collection_v2 = 1;
  assert.equal((await photo(key, 'Retry Mew')).status, 503);
  assert.equal(remote.objects.size, 1);
  assert.equal(await scalar('select count(*) from upload_jobs'), 1);
  assert.equal(await scalar('select coins from profiles where id=$1', [USER]), before);
  const retry = await photo(key, 'Retry Mew');
  assert.equal(retry.status, 201, JSON.stringify(retry.body));
  assert.equal(await scalar('select coins from profiles where id=$1', [USER]), before + 10);
  assert.equal(await scalar('select count(*) from upload_jobs'), 0);
  await request(api)
    .delete('/api/collections/' + retry.body.id)
    .set(auth);
});
test('Storage failure leaves a hidden tombstone, persists retry work and cleanup completes deletion', async () => {
  const created = await photo(randomUUID(), 'Delete retry Mew'),
    id = created.body.id;
  remote.faults.remove = 1;
  const result = await request(api)
    .delete('/api/collections/' + id)
    .set(auth);
  assert.equal(result.status, 202);
  assert.equal(result.body.pending, true);
  assert.equal(remote.objects.size, 1);
  assert.equal(
    (
      await request(api)
        .get('/api/collections/' + id)
        .set(auth)
    ).status,
    404
  );
  assert.equal((await request(api).get('/api/map/' + id + '/photo')).status, 404);
  await remote.db.exec("update storage_gc set next_attempt_at=now()-interval '1 second'");
  const cleaned = await store.cleanup();
  assert.equal(cleaned.deleted, 1);
  assert.equal(remote.objects.size, 0);
  assert.equal(await scalar('select count(*) from storage_gc'), 0);
});
test('abandoned upload files are cleaned after restart-safe reservations without rewards', async () => {
  const key = randomUUID();
  remote.faults.complete_collection_v2 = 1;
  assert.equal((await photo(key, 'Abandoned Mew')).status, 503);
  await remote.db.exec("update upload_jobs set touched_at=now()-interval '25 hours'");
  const cleaned = await store.cleanup();
  assert.equal(cleaned.abandoned, 1);
  assert.equal(remote.objects.size, 0);
  assert.equal(await scalar('select count(*) from upload_jobs'), 0);
});
test('purchase and coin histories are paginated and scoped to the verified owner', async () => {
  const key = randomUUID();
  await request(api)
    .post('/api/purchases')
    .set(auth)
    .set('Idempotency-Key', key)
    .send({ product_id: 'topi-zaitun' });
  const history = await request(api).get('/api/purchases?limit=1').set(auth);
  assert.equal(history.status, 200);
  assert.equal(history.body.items.length, 1);
  assert.equal(history.body.items[0].user_id, USER);
  const other = await request(api)
    .get('/api/transactions')
    .set('Authorization', 'Bearer token-other');
  assert.equal(other.status, 200);
  assert.equal(other.body.total, 0);
});
