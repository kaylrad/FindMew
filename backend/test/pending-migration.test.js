import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { configuration } from '../src/config.js';
import { SupabaseStore } from '../src/services/supabase.js';
import { supabaseTransport } from './helpers/supabase-transport.js';
const migration = new URL(
  '../../supabase/migrations/20261127090000_collection_likes_profile_photo.sql',
  import.meta.url
);
let remote, app, store, image;
const user = { Authorization: 'Bearer token-user' },
  other = { Authorization: 'Bearer token-other' };
before(async () => {
  remote = await supabaseTransport();
  // Put the database back to schemaVersion 5: the new code is deployed before the migration.
  await remote.db.exec(`
    drop function public.set_collection_like(uuid,uuid,boolean);
    drop table public.collection_likes;
    alter table public.collections drop column like_count;
    alter table public.profiles drop column photo_updated_at;
    create or replace function public.backend_status() returns jsonb language sql stable as
      $$ select jsonb_build_object('schemaVersion',5,'database',true,'catalogReady',true) $$;`);
  const config = configuration({
    DEMO_MODE: 'false',
    SUPABASE_URL: 'https://local-contract.supabase.co',
    SUPABASE_ANON_KEY: 'test-public',
    SUPABASE_SERVICE_ROLE_KEY: 'local-service-key',
    UPLOAD_RATE_LIMIT: '100',
  });
  ({ app, store } = await createApp(config, {
    store: new SupabaseStore(config, { fetch: remote.fetch }),
  }));
  image = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#cfb487' } })
    .png()
    .toBuffer();
});
after(async () => await remote?.db.close());

const photo = async (who, name) => {
  const response = await request(app)
    .post('/api/collections')
    .set(who)
    .set('Idempotency-Key', randomUUID())
    .field('name', name)
    .field('visibility', 'public')
    .field('latitude', '-7.05')
    .field('longitude', '110.44')
    .attach('photo', image, { filename: 'cat.png', contentType: 'image/png' });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body;
};

test('before the migration, existing map pins and collections keep working', async () => {
  const mine = await photo(user, 'Pin lama milikku'),
    theirs = await photo(other, 'Pin lama orang lain');
  const map = await request(app).get('/api/explore/map?limit=100').set(user);
  assert.equal(map.status, 200, JSON.stringify(map.body));
  for (const id of [mine.id, theirs.id]) {
    const pin = map.body.items.find((item) => item.id === id);
    assert.ok(pin, 'pin ' + id + ' is on the map');
    assert.equal(pin.like_count, 0);
    assert.equal(pin.liked, false);
  }
  const detail = await request(app)
    .get('/api/explore/map/' + theirs.id)
    .set(user);
  assert.equal(detail.status, 200, JSON.stringify(detail.body));
  assert.equal(detail.body.like_count, 0);
  assert.equal((await request(app).get('/api/collections').set(user)).status, 200);
  assert.equal((await request(app).get('/api/me').set(user)).status, 200);

  const like = await request(app)
    .put('/api/explore/map/' + theirs.id + '/like')
    .set(user);
  assert.equal(like.status, 503);
  assert.equal(like.body.error.code, 'MIGRATION_REQUIRED');
  const upload = await request(app)
    .put('/api/profile/photo')
    .set(user)
    .attach('photo', image, { filename: 'me.png', contentType: 'image/png' });
  assert.equal(upload.status, 503);
  assert.equal(upload.body.error.code, 'MIGRATION_REQUIRED');
  assert.ok(![...remote.objects.keys()].some((key) => key.startsWith('profiles/')));
  assert.equal((await request(app).get('/api/profile/photo').set(user)).status, 404);
  const ready = await request(app).get('/api/ready');
  assert.equal(ready.status, 503);
  assert.equal(ready.body.error.code, 'MIGRATION_PENDING');
});

test('running the migration later enables likes and profile photos without a redeploy', async () => {
  await remote.db.exec(await readFile(migration, 'utf8'));
  store.socialCheck = null; // what the one-minute re-check does on its own
  const theirs = await photo(other, 'Pin baru orang lain');
  const like = await request(app)
    .put('/api/explore/map/' + theirs.id + '/like')
    .set(user);
  assert.equal(like.status, 200, JSON.stringify(like.body));
  assert.equal(like.body.like_count, 1);
  const upload = await request(app)
    .put('/api/profile/photo')
    .set(user)
    .attach('photo', image, { filename: 'me.png', contentType: 'image/png' });
  assert.equal(upload.status, 200, JSON.stringify(upload.body));
  assert.equal((await request(app).get('/api/ready')).status, 200);
});
