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
  dir = await mkdtemp(path.join(tmpdir(), 'findmew-map-pins-'));
  const demo = await createApp(
    configuration({
      DEMO_MODE: 'true',
      DEMO_DATA_DIR: dir,
      DEMO_TOKEN_SECRET: 'map-pins-test',
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
  image = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#cfb487' } })
    .png()
    .toBuffer();
});
after(async () => {
  await remote?.db.close();
  if (dir) {
    assert.ok(path.basename(dir).startsWith('findmew-map-pins-'));
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(tmpdir()));
    await rm(dir, { recursive: true, force: true });
  }
});

for (const mode of ['demo', 'Supabase SDK + SQL'])
  test(
    mode +
      ' map shows own private and public pins, opens safe details, and never exposes another private photo',
    async () => {
      const f = fixtures.find((item) => item.mode === mode),
        auth = { Authorization: 'Bearer ' + f.token },
        otherAuth = { Authorization: 'Bearer ' + f.otherToken };
      async function photo(name, visibility, other = false, located = true) {
        const upload = request(f.app)
          .post('/api/collections')
          .set(other ? otherAuth : auth)
          .set('Idempotency-Key', randomUUID())
          .field('name', name)
          .field('notes', 'Kucing belang ramah dekat taman.')
          .field('visibility', visibility)
          .field('fed', 'true');
        if (located) upload.field('latitude', '-7.257').field('longitude', '112.752');
        const response = await upload.attach('photo', image, {
          filename: 'cat.png',
          contentType: 'image/png',
        });
        assert.equal(response.status, 201, JSON.stringify(response.body));
        return response.body;
      }
      const ownPrivate = await photo('Pin privat milikku', 'private'),
        ownPublic = await photo('Pin publik milikku', 'public'),
        otherPrivate = await photo('Pin privat orang lain', 'private', true),
        otherPublic = await photo('Pin publik orang lain', 'public', true),
        unlocated = await photo('Tanpa koordinat', 'private', false, false);
      assert.equal((await request(f.app).get('/api/explore/map')).status, 401);
      const map = await request(f.app).get('/api/explore/map?limit=100').set(auth);
      assert.equal(map.status, 200, JSON.stringify(map.body));
      for (const item of [ownPrivate, ownPublic, otherPublic])
        assert.ok(map.body.items.some((pin) => pin.id === item.id));
      for (const item of [otherPrivate, unlocated])
        assert.ok(!map.body.items.some((pin) => pin.id === item.id));
      assert.equal(map.body.items.filter((pin) => pin.id === ownPublic.id).length, 1);
      assert.equal(map.body.items.find((pin) => pin.id === ownPrivate.id).owned, true);
      assert.equal(map.body.items.find((pin) => pin.id === otherPublic.id).owned, false);
      for (const item of map.body.items) {
        assert.equal(item.user_id, undefined);
        assert.equal(item.photo_path, undefined);
      }
      const first = await request(f.app).get('/api/explore/map?limit=1').set(auth),
        second = await request(f.app).get('/api/explore/map?limit=1&offset=1').set(auth);
      assert.equal(first.body.total, map.body.total);
      assert.notEqual(first.body.items[0].id, second.body.items[0].id);
      const detail = await request(f.app)
        .get('/api/explore/map/' + ownPrivate.id)
        .set(auth);
      assert.equal(detail.status, 200);
      assert.equal(detail.body.notes, 'Kucing belang ramah dekat taman.');
      assert.equal(detail.body.fed, true);
      assert.equal(detail.body.owned, true);
      assert.equal(detail.body.visibility, 'private');
      assert.equal(detail.body.photo_path, undefined);
      assert.equal(detail.body.user_id, undefined);
      assert.equal(
        (
          await request(f.app)
            .get('/api/explore/map/' + otherPublic.id)
            .set(auth)
        ).status,
        200
      );
      assert.equal(
        (
          await request(f.app)
            .get('/api/explore/map/' + otherPrivate.id)
            .set(auth)
        ).status,
        404
      );
      assert.equal(
        (
          await request(f.app)
            .get('/api/explore/map/' + ownPrivate.id)
            .set(otherAuth)
        ).status,
        404
      );
      assert.equal(
        (
          await request(f.app)
            .get('/api/explore/map/' + unlocated.id)
            .set(auth)
        ).status,
        404
      );
      assert.equal((await request(f.app).get('/api/explore/map/not-a-uuid').set(auth)).status, 400);
      const publicMap = await request(f.app).get('/api/map?limit=100');
      assert.ok(!publicMap.body.items.some((pin) => pin.id === ownPrivate.id));
      assert.equal((await request(f.app).get('/api/map/' + ownPrivate.id + '/photo')).status, 404);
      assert.equal(
        (
          await request(f.app)
            .get('/api/collections/' + ownPrivate.id + '/photo')
            .set(auth)
        ).status,
        200
      );
      assert.equal(
        (
          await request(f.app)
            .patch('/api/collections/' + otherPublic.id)
            .set(otherAuth)
            .send({ visibility: 'private' })
        ).status,
        200
      );
      assert.equal(
        (
          await request(f.app)
            .get('/api/explore/map/' + otherPublic.id)
            .set(auth)
        ).status,
        404
      );
      assert.equal(
        (
          await request(f.app)
            .delete('/api/collections/' + ownPrivate.id)
            .set(auth)
        ).status,
        200
      );
      assert.equal(
        (
          await request(f.app)
            .get('/api/explore/map/' + ownPrivate.id)
            .set(auth)
        ).status,
        404
      );
      assert.ok(
        !(await request(f.app).get('/api/explore/map?limit=100').set(auth)).body.items.some(
          (pin) => pin.id === ownPrivate.id
        )
      );
    }
  );
