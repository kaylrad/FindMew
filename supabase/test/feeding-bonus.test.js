import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testDatabase, USER, OTHER } from './helpers/database.js';
const scalar = async (db, sql, params = []) =>
  Object.values((await db.query(sql, params)).rows[0])[0];
test('feeding bonus migration retains old photos, issues a durable breakdown once and restricts transaction RPCs', async () => {
  const legacy = '33333333-3333-4333-8333-333333333333';
  const db = await testDatabase({
    beforeMigration: async (db, file) => {
      if (!file.endsWith('_feeding_bonus_and_catalog.sql')) return;
      await db.query('insert into auth.users values($1,$2)', [
        legacy,
        JSON.stringify({ name: 'Legacy' }),
      ]);
      await db.query(
        "insert into collections(user_id,name,photo_path) values($1,'Old Mew','legacy.webp')",
        [legacy]
      );
    },
  });
  try {
    assert.equal(await scalar(db, 'select fed from collections where user_id=$1', [legacy]), false);
    const key = randomUUID();
    await db.query('select reserve_upload($1,$2,$3)', [USER, key, 'bonus-hash']);
    const params = [USER, key, 'Fed Mew', '', 'private', null, null, 25, true, 10];
    const created = await scalar(
      db,
      'select complete_collection_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      params
    );
    assert.equal(created.fed, true);
    assert.equal(created.base_reward, 25);
    assert.equal(created.feeding_bonus, 10);
    assert.equal(created.reward, 35);
    const replay = await scalar(
      db,
      'select complete_collection_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      params
    );
    assert.equal(replay.reward, 0);
    assert.equal(replay.feeding_bonus, 0);
    assert.equal(await scalar(db, 'select coins from profiles where id=$1', [USER]), 185);
    assert.equal(
      await scalar(
        db,
        'select count(*)::int from coin_transactions where user_id=$1 and request_id=$2',
        [USER, key]
      ),
      1
    );
    await assert.rejects(
      db.query('select reserve_upload($1,$2,$3)', [USER, key, 'changed-fed-hash']),
      /REQUEST_CONFLICT/
    );
    await db.exec('set role authenticated');
    try {
      await assert.rejects(
        db.query('select complete_collection_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', params),
        /permission denied/
      );
      await assert.rejects(
        db.query('select feed_pet($1,$2)', [USER, randomUUID()]),
        /permission denied/
      );
    } finally {
      await db.exec('reset role');
    }
  } finally {
    await db.close();
  }
});
test('SQL bowl feeding preserves appearance and coins, consumes one portion, caps energy and enforces cooldown atomically', async () => {
  const db = await testDatabase();
  try {
    await db.query(
      "update pets set energy=95,updated_at=now(),cat_type_id='putih',room_id='senja' where user_id=$1",
      [USER]
    );
    const before = await scalar(db, 'select get_user_state($1)', [USER]),
      key = randomUUID();
    const first = await scalar(db, 'select feed_pet($1,$2)', [USER, key]);
    assert.equal(first.pet.energy, 100);
    assert.equal(first.energy_added, 5);
    assert.equal(first.replayed, false);
    const snapshot = await scalar(db, 'select to_jsonb(p) from pets p where user_id=$1', [USER]);
    const repeated = await scalar(db, 'select feed_pet($1,$2)', [USER, key]);
    assert.equal(repeated.energy_added, 0);
    assert.equal(repeated.replayed, true);
    await assert.rejects(db.query('select feed_pet($1,$2)', [USER, randomUUID()]), /FEED_COOLDOWN/);
    assert.deepEqual(
      await scalar(db, 'select to_jsonb(p) from pets p where user_id=$1', [USER]),
      snapshot
    );
    const after = await scalar(db, 'select get_user_state($1)', [USER]);
    assert.equal(
      after.inventory.find((item) => item.product_id === 'tuna').quantity,
      before.inventory.find((item) => item.product_id === 'tuna').quantity - 1
    );
    assert.equal(after.profile.coins, before.profile.coins);
    assert.equal(after.pet.cat_type_id, 'putih');
    assert.equal(after.pet.room_id, 'senja');
    assert.equal(await scalar(db, 'select fed_at from pets where user_id=$1', [OTHER]), null);
    await db.query(
      "update pets set fed_at=now()-interval '31 seconds',energy=10 where user_id=$1",
      [USER]
    );
    const next = await scalar(db, 'select feed_pet($1,$2)', [USER, randomUUID()]);
    assert.equal(next.pet.energy, 40);
  } finally {
    await db.close();
  }
});
