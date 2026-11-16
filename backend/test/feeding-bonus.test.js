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
import { SupabaseStore, uploadHash } from '../src/services/supabase.js';
import { DEMO_USER, OTHER_USER } from '../src/services/demo.js';
import { supabaseTransport } from './helpers/supabase-transport.js';
const fixtures = [];
let dir, remote, image;
before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'findmew-feeding-bonus-'));
  const demo = await createApp(
    configuration({
      DEMO_MODE: 'true',
      DEMO_DATA_DIR: dir,
      DEMO_TOKEN_SECRET: 'feeding-bonus-test',
      COLLECTION_REWARD: '10',
      FEEDING_BONUS_REWARD: '5',
      UPLOAD_RATE_LIMIT: '100',
      MAX_CONCURRENT_UPLOADS: '4',
    })
  );
  fixtures.push({
    mode: 'demo',
    app: demo.app,
    token: demo.issueDemoToken(),
    otherToken: demo.issueDemoToken(OTHER_USER),
    setPet: async () =>
      demo.store.atomic(() =>
        Object.assign(demo.store.db.users[DEMO_USER].pet, {
          energy: 91,
          fed_at: null,
          updated_at: new Date().toISOString(),
          energy_remainder: 0,
        })
      ),
    rawPet: async () => structuredClone(demo.store.db.users[DEMO_USER].pet),
  });
  remote = await supabaseTransport();
  const config = configuration({
    DEMO_MODE: 'false',
    SUPABASE_URL: 'https://local-contract.supabase.co',
    SUPABASE_ANON_KEY: 'test-public',
    SUPABASE_SERVICE_ROLE_KEY: 'local-service-key',
    COLLECTION_REWARD: '10',
    FEEDING_BONUS_REWARD: '5',
    UPLOAD_RATE_LIMIT: '100',
    MAX_CONCURRENT_UPLOADS: '4',
  });
  const cloud = await createApp(config, {
    store: new SupabaseStore(config, { fetch: remote.fetch }),
  });
  fixtures.push({
    mode: 'Supabase SDK + SQL',
    app: cloud.app,
    token: 'token-user',
    otherToken: 'token-other',
    setPet: async () =>
      remote.db.query(
        'update pets set energy=91,fed_at=null,updated_at=now(),energy_remainder=0 where user_id=$1',
        [DEMO_USER]
      ),
    rawPet: async () =>
      (await remote.db.query('select * from pets where user_id=$1', [DEMO_USER])).rows[0],
  });
  image = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#e9c194' } })
    .png()
    .toBuffer();
});
after(async () => {
  await remote?.db.close();
  if (dir) await rm(dir, { recursive: true, force: true });
});
const state = async (f) =>
  (
    await request(f.app)
      .get('/api/me')
      .set('Authorization', 'Bearer ' + f.token)
  ).body;
const upload = (f, key = randomUUID(), fed = 'true', extra = {}) => {
  let req = request(f.app)
    .post('/api/collections')
    .set('Authorization', 'Bearer ' + f.token)
    .set('Idempotency-Key', key)
    .field('name', 'Mew diberi makan');
  if (fed !== undefined && fed !== null) req = req.field('fed', fed);
  for (const [name, value] of Object.entries(extra)) req = req.field(name, value);
  return req.attach('photo', image, { filename: 'cat.png', contentType: 'image/png' });
};
for (const mode of ['demo', 'Supabase SDK + SQL']) {
  test(
    mode +
      ': feeding bonus commits once, survives retries and cannot be edited or replayed after deletion',
    async () => {
      const f = fixtures.find((item) => item.mode === mode),
        before = await state(f),
        key = randomUUID();
      const responses = await Promise.all([upload(f, key), upload(f, key)]);
      assert.ok(responses.every((response) => [200, 201].includes(response.status)));
      const created = responses.find((response) => response.status === 201);
      assert.ok(created);
      assert.equal(created.body.fed, true);
      assert.equal(created.body.reward, 15);
      assert.equal(created.body.base_reward, 10);
      assert.equal(created.body.feeding_bonus, 5);
      assert.equal(responses.filter((response) => response.body.reward === 15).length, 1);
      assert.equal((await state(f)).profile.coins, before.profile.coins + 15);
      const retry = await upload(f, key);
      assert.equal(retry.status, 200);
      assert.equal(retry.body.reward, 0);
      assert.equal(retry.body.base_reward, 0);
      assert.equal(retry.body.feeding_bonus, 0);
      const changedFlag = await upload(f, key, 'false');
      assert.equal(changedFlag.status, 409);
      assert.equal(changedFlag.body.error.code, 'REQUEST_CONFLICT');
      const id = created.body.id;
      const edit = await request(f.app)
        .patch('/api/collections/' + id)
        .set('Authorization', 'Bearer ' + f.token)
        .send({ fed: false });
      assert.equal(edit.status, 400);
      const detail = await request(f.app)
        .get('/api/collections/' + id)
        .set('Authorization', 'Bearer ' + f.token);
      assert.equal(detail.body.fed, true);
      const deleted = await request(f.app)
        .delete('/api/collections/' + id)
        .set('Authorization', 'Bearer ' + f.token);
      assert.ok([200, 202].includes(deleted.status));
      const old = await upload(f, key);
      assert.equal(old.status, 409);
      assert.equal(old.body.error.code, 'REQUEST_ALREADY_USED');
      assert.equal((await state(f)).profile.coins, before.profile.coins + 15);
    }
  );
  test(
    mode +
      ': false and omitted feeding answers earn only base reward; invalid booleans and supplied amounts are rejected',
    async () => {
      const f = fixtures.find((item) => item.mode === mode);
      for (const fed of ['false', null]) {
        const created = await upload(f, randomUUID(), fed);
        assert.equal(created.status, 201);
        assert.equal(created.body.fed, false);
        assert.equal(created.body.reward, 10);
        assert.equal(created.body.feeding_bonus, 0);
      }
      const before = (await state(f)).profile.coins;
      for (const fed of ['yes', '1', '0', 'on', 'TRUE', ''])
        assert.equal((await upload(f, randomUUID(), fed)).status, 400);
      for (const amount of [{ reward: '9999' }, { feeding_bonus: '9999' }, { base_reward: '9999' }])
        assert.equal((await upload(f, randomUUID(), 'true', amount)).status, 400);
      assert.equal((await state(f)).profile.coins, before);
    }
  );
  test(
    mode +
      ': bowl feeding consumes one portion, is capped, persistent, owner-scoped, idempotent and cooldown-protected',
    async () => {
      const f = fixtures.find((item) => item.mode === mode);
      await f.setPet();
      const before = await state(f),
        key = randomUUID();
      const feed = () =>
        request(f.app)
          .post('/api/pet/feed')
          .set('Authorization', 'Bearer ' + f.token)
          .set('Idempotency-Key', key)
          .send({});
      const responses = await Promise.all([feed(), feed()]);
      assert.ok(responses.every((item) => item.status === 200));
      assert.equal(responses.filter((item) => item.body.replayed === false).length, 1);
      assert.equal(responses.filter((item) => item.body.replayed === true).length, 1);
      assert.equal(responses.find((item) => !item.body.replayed).body.energy_added, 9);
      let current = await state(f);
      assert.equal(current.pet.energy, 100);
      assert.ok(current.pet.fed_at);
      assert.equal(current.profile.coins, before.profile.coins);
      assert.equal(
        current.inventory.find((item) => item.product_id === 'tuna').quantity,
        before.inventory.find((item) => item.product_id === 'tuna').quantity - 1
      );
      const raw = await f.rawPet(),
        retry = await feed();
      assert.equal(retry.body.energy_added, 0);
      assert.deepEqual(await f.rawPet(), raw);
      const cooldown = await request(f.app)
        .post('/api/pet/feed')
        .set('Authorization', 'Bearer ' + f.token)
        .set('Idempotency-Key', randomUUID())
        .send({});
      assert.equal(cooldown.status, 409);
      assert.equal(cooldown.body.error.code, 'FEED_COOLDOWN');
      assert.deepEqual(await f.rawPet(), raw);
      const other = await request(f.app)
        .get('/api/pet')
        .set('Authorization', 'Bearer ' + f.otherToken);
      assert.equal(other.body.fed_at, null);
      assert.equal(
        (await request(f.app).post('/api/pet/feed').set('Idempotency-Key', randomUUID()).send({}))
          .status,
        401
      );
      assert.equal(
        (
          await request(f.app)
            .post('/api/pet/feed')
            .set('Authorization', 'Bearer ' + f.token)
            .send({})
        ).status,
        400
      );
      assert.equal(
        (
          await request(f.app)
            .post('/api/pet/feed')
            .set('Authorization', 'Bearer ' + f.token)
            .set('Idempotency-Key', randomUUID())
            .send({ energy: 100 })
        ).status,
        400
      );
    }
  );
  test(
    mode +
      ': eleven Figma cosmetics and food can be sold, new hats and glasses equip, and archived food still consumes stock',
    async () => {
      const f = fixtures.find((item) => item.mode === mode);
      await f.setPet();
      const initial = await state(f);
      const expected = [
        'makanan',
        'topi-zaitun',
        'topi-merah',
        'topi-krem',
        'kacamata-hitam',
        'kacamata-oval',
        'bingkai-putih',
        'topi-navy-logo',
        'topi-putih',
        'topi-krem-logo',
        'topi-hitam',
        'bingkai-hitam',
      ];
      const sale = initial.products.filter((product) => !product.archived);
      assert.deepEqual(new Set(sale.map((product) => product.id)), new Set(expected));
      assert.equal(sale.filter((product) => product.category === 'accessory').length, 11);
      assert.equal(sale.find((product) => product.id === 'makanan').price, 3);
      const config = await request(f.app).get('/api/config');
      assert.equal(config.body.feedingBonusReward, 5);
      const buy = (id) =>
        request(f.app)
          .post('/api/purchases')
          .set('Authorization', 'Bearer ' + f.token)
          .set('Idempotency-Key', randomUUID())
          .send({ product_id: id });
      for (const id of ['tuna', 'kibble', 'shampoo', 'brush', 'bandana', 'bow', 'flower']) {
        const response = await buy(id);
        assert.equal(response.status, 409);
        assert.equal(response.body.error.code, 'ARCHIVED_PRODUCT');
      }
      assert.equal((await state(f)).profile.coins, initial.profile.coins);
      assert.equal((await buy('topi-navy-logo')).status, 200);
      assert.equal((await buy('bingkai-hitam')).status, 200);
      const equip = await request(f.app)
        .put('/api/accessories/loadout')
        .set('Authorization', 'Bearer ' + f.token)
        .send({ product_ids: ['topi-navy-logo', 'bingkai-hitam'] });
      assert.equal(equip.status, 200);
      assert.deepEqual(
        new Set(equip.body.equipped.map((item) => item.product_id)),
        new Set(['topi-navy-logo', 'bingkai-hitam'])
      );
      const stock = initial.inventory.find((item) => item.product_id === 'tuna').quantity;
      const legacy = await request(f.app)
        .post('/api/inventory/use')
        .set('Authorization', 'Bearer ' + f.token)
        .set('Idempotency-Key', randomUUID())
        .send({ product_id: 'tuna' });
      assert.equal(legacy.status, 200);
      const after = await state(f);
      assert.equal(after.inventory.find((item) => item.product_id === 'tuna').quantity, stock - 1);
      assert.equal(after.profile.coins, initial.profile.coins - 130);
    }
  );
}
test('feeding reward configuration is bounded and false keeps the legacy upload identity', () => {
  for (const value of ['-1', '10001', 'NaN', '0.5'])
    assert.throws(() => configuration({ FEEDING_BONUS_REWARD: value }));
  assert.equal(configuration({ FEEDING_BONUS_REWARD: '0' }).feedingBonusReward, 0);
  const data = { name: 'Mew', notes: '', visibility: 'private', latitude: null, longitude: null },
    bytes = Buffer.from('photo');
  assert.equal(uploadHash(bytes, data), uploadHash(bytes, { ...data, fed: false }));
  assert.notEqual(uploadHash(bytes, data), uploadHash(bytes, { ...data, fed: true }));
});
