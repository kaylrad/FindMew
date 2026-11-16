import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { configuration } from '../src/config.js';
import { DemoStore, DEMO_USER, OTHER_USER } from '../src/services/demo.js';
import { SupabaseStore } from '../src/services/supabase.js';
import { supabaseTransport, USER, OTHER } from './helpers/supabase-transport.js';
const fixtures = [];
let dir, remote;
before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'findmew-appearance-'));
  const demoConfig = configuration({
    DEMO_MODE: 'true',
    DEMO_DATA_DIR: dir,
    DEMO_TOKEN_SECRET: 'appearance-test-secret',
  });
  const demo = await createApp(demoConfig);
  fixtures.push({
    mode: 'demo',
    api: demo.app,
    token: demo.issueDemoToken(),
    otherToken: demo.issueDemoToken(OTHER_USER),
    inspect: async () => structuredClone(demo.store.db.users[DEMO_USER]),
    grant: async () =>
      demo.store.atomic(() => {
        const user = demo.store.db.users[DEMO_USER];
        user.inventory.bandana = 1;
        user.inventory.flower = 1;
      }),
    restart: async () => {
      const restarted = await createApp(demoConfig);
      return request(restarted.app)
        .get('/api/me')
        .set('Authorization', 'Bearer ' + restarted.issueDemoToken());
    },
  });
  remote = await supabaseTransport();
  const config = configuration({
    DEMO_MODE: 'false',
    SUPABASE_URL: 'https://local-contract.supabase.co',
    SUPABASE_ANON_KEY: 'test-public',
    SUPABASE_SERVICE_ROLE_KEY: 'local-service-key',
  });
  const store = new SupabaseStore(config, { fetch: remote.fetch });
  const cloud = await createApp(config, { store });
  fixtures.push({
    mode: 'Supabase SDK + SQL',
    api: cloud.app,
    token: 'token-user',
    otherToken: 'token-other',
    inspect: async () => ({
      pet: (await remote.db.query('select * from pets where user_id=$1', [USER])).rows[0],
      profile: (await remote.db.query('select * from profiles where id=$1', [USER])).rows[0],
    }),
    grant: async () =>
      remote.db.query(
        "insert into inventory values($1,'bandana',1),($1,'flower',1) on conflict(user_id,product_id) do update set quantity=1",
        [USER]
      ),
    restart: async () =>
      request(
        (await createApp(config, { store: new SupabaseStore(config, { fetch: remote.fetch }) })).app
      )
        .get('/api/me')
        .set('Authorization', 'Bearer token-user'),
  });
});
after(async () => {
  await remote?.db.close();
  if (dir) await rm(dir, { recursive: true, force: true });
});
const authenticated = (fixture, method, url, body, other = false) => {
  const req = request(fixture.api)
    [method](url)
    .set('Authorization', 'Bearer ' + (other ? fixture.otherToken : fixture.token));
  return body === undefined ? req : req.send(body);
};

for (const mode of ['demo', 'Supabase SDK + SQL']) {
  test(`${mode}: cat and room selections are partial, owner-scoped and persist without resetting decay`, async () => {
    const fixture = fixtures.find((item) => item.mode === mode),
      initial = await authenticated(fixture, 'get', '/api/me');
    assert.equal(initial.body.pet.cat_type_id, 'oyen');
    assert.equal(initial.body.pet.room_id, 'hangat');
    assert.deepEqual(
      initial.body.petOptions.cats.map((item) => item.id),
      ['oyen', 'mujair', 'hitam', 'putih']
    );
    assert.deepEqual(
      initial.body.petOptions.rooms.map((item) => item.id),
      ['hangat', 'senja', 'rimbun']
    );
    const before = await fixture.inspect();
    const changed = await authenticated(fixture, 'patch', '/api/pet', {
      cat_type_id: 'mujair',
      room_id: 'senja',
    });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    assert.equal(changed.body.name, initial.body.pet.name);
    assert.equal(
      (await authenticated(fixture, 'patch', '/api/pet', { room_id: 'rimbun' })).body.cat_type_id,
      'mujair'
    );
    assert.equal(
      (await authenticated(fixture, 'patch', '/api/pet', { name: 'Mew Figma' })).body.room_id,
      'rimbun'
    );
    const after = await fixture.inspect();
    for (const field of [
      'energy',
      'clean',
      'happiness',
      'updated_at',
      'played_at',
      'energy_remainder',
      'clean_remainder',
      'happiness_remainder',
    ])
      assert.deepEqual(after.pet[field], before.pet[field]);
    assert.equal(after.profile.coins, before.profile.coins);
    const other = await authenticated(fixture, 'get', '/api/pet', undefined, true);
    assert.equal(other.body.cat_type_id, 'oyen');
    assert.equal(other.body.room_id, 'hangat');
    const restarted = await fixture.restart();
    assert.equal(restarted.body.pet.cat_type_id, 'mujair');
    assert.equal(restarted.body.pet.room_id, 'rimbun');
    assert.equal(restarted.body.pet.name, 'Mew Figma');
  });

  test(`${mode}: purchases unlock owned head/face loadouts atomically and preserve classic inventory`, async () => {
    const fixture = fixtures.find((item) => item.mode === mode);
    const buy = async (id) =>
      request(fixture.api)
        .post('/api/purchases')
        .set('Authorization', 'Bearer ' + fixture.token)
        .set('Idempotency-Key', randomUUID())
        .send({ product_id: id });
    let state = (await authenticated(fixture, 'get', '/api/me')).body;
    for (const id of ['bandana', 'bow', 'flower']) {
      assert.equal(state.products.find((item) => item.id === id).archived, true);
      const archived = await buy(id);
      assert.equal(archived.status, 409);
      assert.equal(archived.body.error.code, 'ARCHIVED_PRODUCT');
    }
    const beforeBalance = state.profile.coins;
    const key = randomUUID(),
      purchase = () =>
        request(fixture.api)
          .post('/api/purchases')
          .set('Authorization', 'Bearer ' + fixture.token)
          .set('Idempotency-Key', key)
          .send({ product_id: 'topi-zaitun' });
    const bought = await Promise.all([purchase(), purchase()]);
    assert.ok(bought.every((item) => item.status === 200));
    assert.equal((await buy('topi-zaitun')).body.error.code, 'ALREADY_OWNED');
    assert.equal((await buy('kacamata-hitam')).status, 200);
    state = (await authenticated(fixture, 'get', '/api/me')).body;
    assert.equal(state.profile.coins, beforeBalance - 110);
    assert.equal(state.inventory.find((item) => item.product_id === 'topi-zaitun').quantity, 1);
    await fixture.grant();
    assert.equal(
      (
        await authenticated(fixture, 'put', '/api/accessories', {
          product_id: 'bandana',
          equipped: true,
        })
      ).status,
      200
    );
    const snapshot = (await authenticated(fixture, 'get', '/api/me')).body;
    const loaded = await authenticated(fixture, 'put', '/api/accessories/loadout', {
      product_ids: ['topi-zaitun', 'kacamata-hitam'],
    });
    assert.equal(loaded.status, 200, JSON.stringify(loaded.body));
    assert.deepEqual(
      new Set(loaded.body.equipped.map((item) => item.product_id)),
      new Set(['topi-zaitun', 'kacamata-hitam', 'bandana'])
    );
    const failed = await authenticated(fixture, 'put', '/api/accessories/loadout', {
      product_ids: ['topi-merah', 'kacamata-hitam'],
    });
    assert.equal(failed.status, 409);
    assert.equal(failed.body.error.code, 'OUT_OF_STOCK');
    state = (await authenticated(fixture, 'get', '/api/me')).body;
    assert.deepEqual(state.equipped, loaded.body.equipped);
    assert.deepEqual(state.inventory, snapshot.inventory);
    assert.equal(state.profile.coins, snapshot.profile.coins);
    assert.equal(state.pet.updated_at, snapshot.pet.updated_at);
    const other = (await authenticated(fixture, 'get', '/api/me', undefined, true)).body;
    assert.equal(other.equipped.length, 0);
    const classic = await authenticated(fixture, 'put', '/api/accessories/loadout', {
      product_ids: ['flower', 'kacamata-hitam'],
    });
    assert.equal(classic.status, 200);
    assert.ok(classic.body.equipped.some((item) => item.product_id === 'flower'));
    const cleared = await authenticated(fixture, 'put', '/api/accessories/loadout', {
      product_ids: [],
    });
    assert.equal(cleared.status, 200);
    assert.deepEqual(cleared.body.equipped, [{ slot: 'neck', product_id: 'bandana' }]);
  });

  test(`${mode}: appearance and loadout requests reject invalid IDs, duplicates and protected fields`, async () => {
    const fixture = fixtures.find((item) => item.mode === mode);
    for (const body of [
      {},
      { cat_type_id: 'tiger' },
      { room_id: 'secret' },
      { cat_type_id: null },
      { user_id: OTHER },
      { energy: 100 },
      { updated_at: new Date().toISOString() },
    ])
      assert.equal((await authenticated(fixture, 'patch', '/api/pet', body)).status, 400);
    for (const body of [
      {},
      { product_ids: null },
      { product_ids: ['unknown'] },
      { product_ids: ['bandana'] },
      { product_ids: ['topi-zaitun', 'topi-merah'] },
      { product_ids: ['topi-zaitun', 'topi-zaitun'] },
      { product_ids: ['topi-zaitun', 'kacamata-hitam', 'bingkai-putih'] },
      { product_ids: [], user_id: OTHER },
    ])
      assert.equal(
        (await authenticated(fixture, 'put', '/api/accessories/loadout', body)).status,
        400,
        JSON.stringify(body)
      );
    assert.equal(
      (await request(fixture.api).put('/api/accessories/loadout').send({ product_ids: [] })).status,
      401
    );
  });
}

test('existing demo records receive durable appearance defaults while keeping classic items and decay timestamps', async () => {
  const oldDir = await mkdtemp(path.join(tmpdir(), 'findmew-classic-'));
  try {
    const config = configuration({ DEMO_MODE: 'true', DEMO_DATA_DIR: oldDir });
    const old = await new DemoStore(config).init();
    const file = path.join(oldDir, 'demo.json'),
      db = JSON.parse(await readFile(file, 'utf8'));
    delete db.users[DEMO_USER].pet.cat_type_id;
    delete db.users[DEMO_USER].pet.room_id;
    db.users[DEMO_USER].inventory.flower = 1;
    db.users[DEMO_USER].equipped.head = 'flower';
    await writeFile(file, JSON.stringify(db));
    const migrated = await new DemoStore(config).init(),
      state = await migrated.state(DEMO_USER);
    assert.equal(state.pet.cat_type_id, 'oyen');
    assert.equal(state.pet.room_id, 'hangat');
    assert.equal(state.pet.updated_at, db.users[DEMO_USER].pet.updated_at);
    assert.ok(state.equipped.some((item) => item.product_id === 'flower'));
    assert.equal(state.inventory.find((item) => item.product_id === 'flower').quantity, 1);
    assert.equal(JSON.parse(await readFile(file, 'utf8')).users[DEMO_USER].pet.cat_type_id, 'oyen');
  } finally {
    await rm(oldDir, { recursive: true, force: true });
  }
});
