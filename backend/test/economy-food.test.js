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
import { DEMO_USER, OTHER_USER } from '../src/services/demo.js';
import { supabaseTransport } from './helpers/supabase-transport.js';
const fixtures = [];
let dir, remote, image;
before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'findmew-economy-food-'));
  const demo = await createApp(
    configuration({
      DEMO_MODE: 'true',
      DEMO_DATA_DIR: dir,
      UPLOAD_RATE_LIMIT: '100',
      MAX_CONCURRENT_UPLOADS: '4',
    })
  );
  fixtures.push({
    mode: 'demo',
    app: demo.app,
    token: demo.issueDemoToken(),
    reset: async (quantity = 0, energy = 10) =>
      demo.store.atomic(() => {
        const user = demo.store.db.users[DEMO_USER];
        user.profile.coins = 200;
        for (const product of ['makanan', 'tuna', 'kibble'])
          user.inventory[product] = product === 'makanan' ? quantity : 0;
        Object.assign(user.pet, {
          energy,
          fed_at: null,
          energy_remainder: 0,
          updated_at: new Date().toISOString(),
        });
      }),
    cooldownOver: async () =>
      demo.store.atomic(() => {
        demo.store.db.users[DEMO_USER].pet.fed_at = new Date(Date.now() - 31000).toISOString();
      }),
  });
  remote = await supabaseTransport();
  const config = configuration({
    DEMO_MODE: 'false',
    SUPABASE_URL: 'https://local-contract.supabase.co',
    SUPABASE_ANON_KEY: 'public-test',
    SUPABASE_SERVICE_ROLE_KEY: 'local-service-key',
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
    reset: async (quantity = 0, energy = 10) => {
      await remote.db.query('update profiles set coins=200 where id=$1', [DEMO_USER]);
      await remote.db.query(
        "update inventory set quantity=0 where user_id=$1 and product_id in ('makanan','tuna','kibble')",
        [DEMO_USER]
      );
      await remote.db.query(
        "insert into inventory values($1,'makanan',$2) on conflict(user_id,product_id) do update set quantity=excluded.quantity",
        [DEMO_USER, quantity]
      );
      await remote.db.query(
        'update pets set energy=$2,fed_at=null,energy_remainder=0,updated_at=now() where user_id=$1',
        [DEMO_USER, energy]
      );
    },
    cooldownOver: async () =>
      remote.db.query("update pets set fed_at=now()-interval '31 seconds' where user_id=$1", [
        DEMO_USER,
      ]),
  });
  image = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#d6ba91' } })
    .png()
    .toBuffer();
});
after(async () => {
  await remote?.db.close();
  if (dir) {
    assert.ok(path.basename(dir).startsWith('findmew-economy-food-'));
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(tmpdir()));
    await rm(dir, { recursive: true, force: true });
  }
});
const call = (f, url, body = {}, key = randomUUID()) =>
  request(f.app)
    .post('/api' + url)
    .set('Authorization', 'Bearer ' + f.token)
    .set('Idempotency-Key', key)
    .send(body);
const state = async (f) =>
  (
    await request(f.app)
      .get('/api/me')
      .set('Authorization', 'Bearer ' + f.token)
  ).body;
const stock = (snapshot, id = 'makanan') =>
  snapshot.inventory.find((item) => item.product_id === id)?.quantity || 0;
for (const mode of ['demo', 'Supabase SDK + SQL']) {
  test(
    mode +
      ': catalog prices and default upload rewards are 10/15, 3 food, 50 plain hats, 70 logo hats, 60 glasses',
    async () => {
      const f = fixtures.find((item) => item.mode === mode);
      await f.reset();
      const snapshot = await state(f),
        sale = snapshot.products.filter((item) => !item.archived);
      assert.equal(sale.length, 12);
      for (const product of sale) {
        const expected =
          product.id === 'makanan'
            ? 3
            : ['topi-navy-logo', 'topi-krem-logo'].includes(product.id)
              ? 70
              : product.slot === 'face'
                ? 60
                : 50;
        assert.equal(product.price, expected, product.id);
      }
      const config = (await request(f.app).get('/api/config')).body;
      assert.equal(config.reward, 10);
      assert.equal(config.feedingBonusReward, 5);
      for (const fed of [false, true]) {
        const key = randomUUID(),
          upload = () =>
            request(f.app)
              .post('/api/collections')
              .set('Authorization', 'Bearer ' + f.token)
              .set('Idempotency-Key', key)
              .field('name', 'Mew ekonomi')
              .field('fed', String(fed))
              .attach('photo', image, { filename: 'cat.png', contentType: 'image/png' });
        const first = await upload();
        assert.equal(first.status, 201);
        assert.equal(first.body.reward, fed ? 15 : 10);
        assert.equal(first.body.base_reward, 10);
        assert.equal(first.body.feeding_bonus, fed ? 5 : 0);
        const replay = await upload();
        assert.equal(replay.status, 200);
        assert.equal(replay.body.reward, 0);
      }
      assert.equal((await state(f)).profile.coins, 225);
    }
  );
  test(
    mode + ': empty bowl cannot add energy, spend coins, or borrow another owner food',
    async () => {
      const f = fixtures.find((item) => item.mode === mode);
      await f.reset();
      const before = await state(f);
      for (const [url, body] of [
        ['/pet/feed', {}],
        ['/pet/feed', { product_id: 'makanan' }],
        ['/inventory/use', { product_id: 'tuna' }],
      ]) {
        const result = await call(f, url, body);
        assert.equal(result.status, 409);
        assert.equal(result.body.error.code, 'FOOD_EMPTY');
      }
      for (const body of [{ product_id: 'shampoo' }, { product_id: 'not-food' }])
        assert.equal((await call(f, '/pet/feed', body)).status, 404);
      assert.equal(
        (await call(f, '/pet/feed', { product_id: 'makanan', energy: 100 })).status,
        400
      );
      const after = await state(f);
      assert.equal(after.pet.energy, before.pet.energy);
      assert.equal(after.pet.fed_at, null);
      assert.equal(after.profile.coins, before.profile.coins);
      assert.deepEqual(after.inventory, before.inventory);
    }
  );
  test(
    mode + ': food can be bought repeatedly for three coins and purchase retries charge once',
    async () => {
      const f = fixtures.find((item) => item.mode === mode);
      await f.reset();
      for (let i = 0; i < 2; i++)
        assert.equal((await call(f, '/purchases', { product_id: 'makanan' })).status, 200);
      const key = randomUUID(),
        buy = () => call(f, '/purchases', { product_id: 'makanan' }, key),
        responses = await Promise.all([buy(), buy(), buy()]);
      assert.ok(responses.every((item) => item.status === 200));
      const after = await state(f);
      assert.equal(stock(after), 3);
      assert.equal(after.profile.coins, 191);
    }
  );
  test(
    mode +
      ': concurrent feeding consumes one portion, retries none, and inventory-use shares cooldown',
    async () => {
      const f = fixtures.find((item) => item.mode === mode);
      await f.reset(2);
      const key = randomUUID(),
        feed = () => call(f, '/pet/feed', { product_id: 'makanan' }, key);
      const responses = await Promise.all([feed(), feed(), feed()]);
      assert.ok(responses.every((item) => item.status === 200));
      assert.equal(responses.filter((item) => item.body.replayed === false).length, 1);
      assert.equal(responses.filter((item) => item.body.energy_added === 20).length, 1);
      let after = await state(f);
      assert.equal(after.pet.energy, 30);
      assert.equal(stock(after), 1);
      assert.equal(after.profile.coins, 200);
      assert.equal((await feed()).body.energy_added, 0);
      assert.equal(stock(await state(f)), 1);
      for (const [url, body] of [
        ['/pet/feed', {}],
        ['/inventory/use', { product_id: 'makanan' }],
      ]) {
        const blocked = await call(f, url, body);
        assert.equal(blocked.status, 409);
        assert.equal(blocked.body.error.code, 'FEED_COOLDOWN');
      }
      assert.equal(stock(await state(f)), 1);
      await f.cooldownOver();
      const usedKey = randomUUID(),
        used = await call(f, '/inventory/use', { product_id: 'makanan' }, usedKey);
      assert.equal(used.status, 200);
      assert.equal(used.body.energy_added, 20);
      assert.equal(used.body.quantity, 0);
      assert.equal(
        (await call(f, '/inventory/use', { product_id: 'makanan' }, usedKey)).body.energy_added,
        0
      );
      assert.equal(
        (await call(f, '/pet/feed', { product_id: 'makanan' }, usedKey)).body.error.code,
        'REQUEST_CONFLICT'
      );
      assert.equal((await call(f, '/pet/feed', {})).body.error.code, 'FOOD_EMPTY');
      after = await state(f);
      assert.equal(after.pet.energy, 50);
      assert.equal(stock(after), 0);
      assert.equal(after.profile.coins, 200);
    }
  );
  test(
    mode + ': distinct simultaneous feeds cannot consume two portions and energy stays capped',
    async () => {
      const f = fixtures.find((item) => item.mode === mode);
      await f.reset(2, 95);
      const attempts = await Promise.all([call(f, '/pet/feed', {}), call(f, '/pet/feed', {})]);
      assert.equal(attempts.filter((item) => item.status === 200).length, 1);
      assert.equal(attempts.filter((item) => item.body.error?.code === 'FEED_COOLDOWN').length, 1);
      assert.equal(attempts.find((item) => item.status === 200).body.energy_added, 5);
      const after = await state(f);
      assert.equal(after.pet.energy, 100);
      assert.equal(stock(after), 1);
      assert.equal(after.profile.coins, 200);
    }
  );
}
