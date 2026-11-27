import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { configuration } from '../src/config.js';
import { SupabaseStore } from '../src/services/supabase.js';
import { OTHER_USER } from '../src/services/demo.js';
import { supabaseTransport } from './helpers/supabase-transport.js';
let dir, remote, image;
const fixtures = [];
before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'findmew-social-'));
  const demo = await createApp(
    configuration({
      DEMO_MODE: 'true',
      DEMO_DATA_DIR: dir,
      DEMO_TOKEN_SECRET: 'social-test',
      UPLOAD_RATE_LIMIT: '100',
    })
  );
  fixtures.push({
    mode: 'demo',
    app: demo.app,
    token: demo.issueDemoToken(),
    otherToken: demo.issueDemoToken(OTHER_USER),
  });
  remote = await supabaseTransport();
  const config = configuration({
    DEMO_MODE: 'false',
    SUPABASE_URL: 'https://local-contract.supabase.co',
    SUPABASE_ANON_KEY: 'test-public',
    SUPABASE_SERVICE_ROLE_KEY: 'local-service-key',
    UPLOAD_RATE_LIMIT: '100',
  });
  const cloud = await createApp(config, {
    store: new SupabaseStore(config, { fetch: remote.fetch }),
  });
  fixtures.push({
    mode: 'Supabase SDK + SQL',
    app: cloud.app,
    token: 'token-user',
    otherToken: 'token-other',
  });
  image = await sharp({ create: { width: 40, height: 24, channels: 3, background: '#cfb487' } })
    .png()
    .toBuffer();
});
after(async () => {
  await remote?.db.close();
  if (dir) {
    assert.ok(path.basename(dir).startsWith('findmew-social-'));
    await rm(dir, { recursive: true, force: true });
  }
});

for (const mode of ['demo', 'Supabase SDK + SQL']) {
  test(mode + ' likes are for other explorers, idempotent, and counted once', async () => {
    const f = fixtures.find((item) => item.mode === mode),
      auth = { Authorization: 'Bearer ' + f.token },
      otherAuth = { Authorization: 'Bearer ' + f.otherToken };
    async function photo(name, visibility) {
      const response = await request(f.app)
        .post('/api/collections')
        .set(auth)
        .set('Idempotency-Key', randomUUID())
        .field('name', name)
        .field('visibility', visibility)
        .field('fed', 'false')
        .field('latitude', '-7.257')
        .field('longitude', '112.752')
        .attach('photo', image, { filename: 'cat.png', contentType: 'image/png' });
      assert.equal(response.status, 201, JSON.stringify(response.body));
      assert.equal(response.body.like_count, 0);
      return response.body;
    }
    const shared = await photo('Disukai banyak orang', 'public'),
      hidden = await photo('Rahasia', 'private');
    const like = (id, method = 'put', who = otherAuth) =>
      request(f.app)
        [method]('/api/explore/map/' + id + '/like')
        .set(who);

    assert.equal((await request(f.app).put('/api/explore/map/' + shared.id + '/like')).status, 401);
    assert.equal((await like('not-a-uuid')).status, 400);
    assert.equal((await like(hidden.id)).status, 404);
    const own = await like(shared.id, 'put', auth);
    assert.equal(own.status, 409);
    assert.equal(own.body.error.code, 'OWN_COLLECTION_LIKE');

    for (let i = 0; i < 2; i++) {
      const liked = await like(shared.id);
      assert.equal(liked.status, 200, JSON.stringify(liked.body));
      assert.deepEqual(liked.body, { id: shared.id, liked: true, like_count: 1 });
    }
    const map = await request(f.app).get('/api/explore/map?limit=100').set(otherAuth);
    const pin = map.body.items.find((item) => item.id === shared.id);
    assert.equal(pin.liked, true);
    assert.equal(pin.like_count, 1);
    const detail = await request(f.app)
      .get('/api/explore/map/' + shared.id)
      .set(otherAuth);
    assert.equal(detail.body.liked, true);
    assert.equal(detail.body.like_count, 1);
    // The owner sees the count on their own collection, but not as their own like.
    const mine = await request(f.app).get('/api/collections?limit=100').set(auth);
    assert.equal(mine.body.items.find((item) => item.id === shared.id).like_count, 1);
    const ownerDetail = await request(f.app)
      .get('/api/explore/map/' + shared.id)
      .set(auth);
    assert.equal(ownerDetail.body.liked, false);
    assert.equal(ownerDetail.body.owned, true);

    for (let i = 0; i < 2; i++) {
      const unliked = await like(shared.id, 'delete');
      assert.equal(unliked.status, 200);
      assert.deepEqual(unliked.body, { id: shared.id, liked: false, like_count: 0 });
    }
    assert.equal((await like(shared.id)).body.like_count, 1);
    assert.equal(
      (
        await request(f.app)
          .delete('/api/collections/' + shared.id)
          .set(auth)
      ).status,
      200
    );
    assert.equal((await like(shared.id)).status, 404);
  });

  test(mode + ' profile photo uploads as a private square and can be removed', async () => {
    const f = fixtures.find((item) => item.mode === mode),
      auth = { Authorization: 'Bearer ' + f.token },
      otherAuth = { Authorization: 'Bearer ' + f.otherToken };
    const upload = (bytes = image) =>
      request(f.app)
        .put('/api/profile/photo')
        .set(auth)
        .attach('photo', bytes, { filename: 'me.png', contentType: 'image/png' });

    assert.equal((await request(f.app).get('/api/profile/photo')).status, 401);
    assert.equal((await request(f.app).get('/api/profile/photo').set(auth)).status, 404);
    assert.equal(
      (await request(f.app).put('/api/profile/photo').set(auth).send({ photo: 'x' })).status,
      415
    );
    const extraField = await request(f.app)
      .put('/api/profile/photo')
      .set(auth)
      .field('avatar', '🐱')
      .attach('photo', image, { filename: 'me.png', contentType: 'image/png' });
    assert.equal(extraField.status, 400);

    const first = await upload();
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.ok(Date.parse(first.body.photo_updated_at));
    const photo = await request(f.app).get('/api/profile/photo').set(auth).buffer(true);
    assert.equal(photo.status, 200);
    assert.match(photo.headers['content-type'], /image\/webp/);
    const size = await sharp(photo.body).metadata();
    assert.equal(size.width, 512);
    assert.equal(size.height, 512);
    assert.equal((await request(f.app).get('/api/profile/photo').set(otherAuth)).status, 404);

    // A second upload replaces the first one in place.
    const replacement = await sharp({
      create: { width: 30, height: 30, channels: 3, background: '#3f5a40' },
    })
      .png()
      .toBuffer();
    const second = await upload(replacement);
    assert.equal(second.status, 200, JSON.stringify(second.body));
    const me = await request(f.app).get('/api/me').set(auth);
    assert.equal(
      Date.parse(me.body.profile.photo_updated_at),
      Date.parse(second.body.photo_updated_at)
    );
    assert.equal(me.body.profile.avatar, '🐱');

    const removed = await request(f.app).delete('/api/profile/photo').set(auth);
    assert.equal(removed.status, 200);
    assert.equal(removed.body.photo_updated_at, null);
    assert.equal((await request(f.app).get('/api/profile/photo').set(auth)).status, 404);
  });
}
