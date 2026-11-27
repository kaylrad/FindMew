import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testDatabase, USER, OTHER } from './helpers/database.js';
const scalar = async (db, sql, params = []) =>
  Object.values((await db.query(sql, params)).rows[0])[0];

test('economy migration retains old balances, purchases, food, appearance and reward receipts', async () => {
  const legacy = '33333333-3333-4333-8333-333333333333',
    feedKey = randomUUID(),
    collectionKey = randomUUID();
  let before;
  const params = [legacy, collectionKey, 'Old fed Mew', '', 'private', null, null, 25, true, 10];
  const db = await testDatabase({
    beforeMigration: async (db, file) => {
      if (!file.endsWith('_economy_food_stock.sql')) return;
      await db.query(
        "insert into products(id,name,category,description,price,emoji,effect) values('tuna','Tuna favorit','food','Old stock',20,'x',30) on conflict(id) do nothing"
      );
      await db.query('insert into auth.users values($1,$2)', [
        legacy,
        JSON.stringify({ name: 'Legacy' }),
      ]);
      await db.query("select buy_product($1,'topi-zaitun',$2)", [legacy, randomUUID()]);
      await db.query('select reserve_upload($1,$2,$3)', [legacy, collectionKey, 'legacy-fed-hash']);
      await db.query('select complete_collection_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', params);
      await db.query('select feed_pet($1,$2)', [legacy, feedKey]);
      before = await scalar(db, 'select get_user_state($1)', [legacy]);
    },
  });
  try {
    assert.ok(before);
    const after = await scalar(db, 'select get_user_state($1)', [legacy]);
    // Later migrations may add columns; existing values must survive unchanged.
    const { photo_updated_at, ...profile } = after.profile;
    assert.equal(photo_updated_at, null);
    assert.deepEqual(profile, before.profile);
    for (const field of ['pet', 'inventory', 'equipped', 'collectionCount'])
      assert.deepEqual(after[field], before[field]);
    assert.equal(after.profile.coins, 125);
    assert.equal(await scalar(db, 'select price from purchases where user_id=$1', [legacy]), 60);
    assert.equal(
      await scalar(db, "select quantity from inventory where user_id=$1 and product_id='tuna'", [
        legacy,
      ]),
      2
    );
    assert.equal(await scalar(db, "select price from products where id='topi-zaitun'"), 50);
    const receipt = await scalar(
      db,
      'select complete_collection_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      params
    );
    assert.equal(receipt.reward, 0);
    assert.equal(receipt.feeding_bonus, 0);
    const replay = await scalar(db, 'select feed_pet($1,$2)', [legacy, feedKey]);
    assert.equal(replay.replayed, true);
    assert.equal(replay.energy_added, 0);
    assert.equal(
      await scalar(db, "select quantity from inventory where user_id=$1 and product_id='tuna'", [
        legacy,
      ]),
      2
    );
    await db.query("update inventory set quantity=0 where user_id=$1 and product_id='tuna'", [
      legacy,
    ]);
    await assert.rejects(db.query('select feed_pet($1,$2)', [legacy, randomUUID()]), /FOOD_EMPTY/);
    await assert.rejects(
      db.query("select use_product($1,'tuna',$2)", [legacy, randomUUID()]),
      /FOOD_EMPTY/
    );
    assert.equal((await scalar(db, 'select get_user_state($1)', [legacy])).profile.coins, 125);
  } finally {
    await db.close();
  }
});

test('stock RPCs are service-only and the new food transaction consumes once with shared cooldown', async () => {
  const db = await testDatabase();
  try {
    const status = await scalar(db, 'select backend_status()');
    assert.equal(status.schemaVersion, 6);
    assert.equal(status.catalogReady, true);
    await db.query(
      "update inventory set quantity=0 where user_id=$1 and product_id in ('tuna','kibble','makanan')",
      [USER]
    );
    await db.query('update pets set energy=10,fed_at=null,updated_at=now() where user_id=$1', [
      USER,
    ]);
    const before = await scalar(db, 'select to_jsonb(p) from pets p where user_id=$1', [USER]);
    await assert.rejects(
      db.query('select feed_pet_food($1,$2,$3)', [USER, randomUUID(), null]),
      /FOOD_EMPTY/
    );
    assert.deepEqual(
      await scalar(db, 'select to_jsonb(p) from pets p where user_id=$1', [USER]),
      before
    );
    const buyKey = randomUUID();
    await db.query("select buy_product($1,'makanan',$2)", [USER, buyKey]);
    await db.query("select buy_product($1,'makanan',$2)", [USER, buyKey]);
    await db.query("select buy_product($1,'makanan',$2)", [USER, randomUUID()]);
    assert.equal(await scalar(db, 'select coins from profiles where id=$1', [USER]), 144);
    assert.equal(
      await scalar(db, "select quantity from inventory where user_id=$1 and product_id='makanan'", [
        USER,
      ]),
      2
    );
    const key = randomUUID(),
      fed = await scalar(db, 'select feed_pet_food($1,$2,$3)', [USER, key, null]);
    assert.equal(fed.product_id, 'makanan');
    assert.equal(fed.quantity, 1);
    assert.equal(fed.energy_added, 20);
    const retry = await scalar(db, 'select feed_pet_food($1,$2,$3)', [USER, key, null]);
    assert.equal(retry.replayed, true);
    assert.equal(retry.energy_added, 0);
    await assert.rejects(
      db.query("select use_product($1,'makanan',$2)", [USER, randomUUID()]),
      /FEED_COOLDOWN/
    );
    assert.equal(
      await scalar(db, "select quantity from inventory where user_id=$1 and product_id='makanan'", [
        USER,
      ]),
      1
    );
    assert.equal(await scalar(db, 'select coins from profiles where id=$1', [USER]), 144);
    assert.equal(await scalar(db, 'select fed_at from pets where user_id=$1', [OTHER]), null);
    await db.exec('set role authenticated');
    try {
      await assert.rejects(
        db.query('select feed_pet_food($1,$2,$3)', [USER, randomUUID(), 'makanan']),
        /permission denied/
      );
      await assert.rejects(
        db.query('select feed_pet($1,$2)', [USER, randomUUID()]),
        /permission denied/
      );
      await assert.rejects(
        db.query("select consume_food($1,$2,'makanan','feed')", [USER, randomUUID()]),
        /permission denied/
      );
    } finally {
      await db.exec('reset role');
    }
  } finally {
    await db.close();
  }
});
