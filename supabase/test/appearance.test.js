import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testDatabase, USER, OTHER } from './helpers/database.js';

test('appearance migration upgrades existing pets and archives sale listings without deleting classic ownership', async () => {
  const legacy = '33333333-3333-4333-8333-333333333333';
  let before;
  const db = await testDatabase({
    beforeMigration: async (db, file) => {
      if (!file.endsWith('_mymew_appearance.sql')) return;
      await db.exec(
        "insert into products(id,name,category,description,price,emoji,slot) values('bandana','Classic bandana','accessory','classic',60,'x','neck'),('flower','Classic flower','accessory','classic',100,'x','head');"
      );
      await db.query('insert into auth.users values($1,$2)', [legacy, '{}']);
      await db.query("insert into inventory values($1,'bandana',1),($1,'flower',1);", [legacy]);
      await db.query(
        "insert into equipped_accessories values($1,'neck','bandana'),($1,'head','flower')",
        [legacy]
      );
      await db.query(
        "insert into purchases(user_id,product_id,price,request_id) values($1,'flower',100,$2)",
        [legacy, randomUUID()]
      );
      before = (await db.query('select * from pets where user_id=$1', [legacy])).rows[0];
    },
  });
  try {
    assert.ok(before, 'fixture must execute before the new migration');
    const after = (await db.query('select * from pets where user_id=$1', [legacy])).rows[0];
    assert.equal(after.cat_type_id, 'oyen');
    assert.equal(after.room_id, 'hangat');
    for (const field of [
      'name',
      'energy',
      'clean',
      'happiness',
      'updated_at',
      'energy_remainder',
      'clean_remainder',
      'happiness_remainder',
    ])
      assert.deepEqual(after[field], before[field]);
    assert.equal(
      (await db.query('select * from inventory where user_id=$1', [legacy])).rows.length,
      2
    );
    assert.equal(
      (await db.query('select * from equipped_accessories where user_id=$1', [legacy])).rows.length,
      2
    );
    assert.equal(
      (await db.query('select * from purchases where user_id=$1', [legacy])).rows.length,
      1
    );
    assert.ok(
      (
        await db.query("select archived from products where id in ('bandana','bow','flower')")
      ).rows.every((row) => row.archived)
    );
    for (const [field, bad] of [
      ['cat_type_id', 'tiger'],
      ['room_id', 'spaceship'],
    ])
      await assert.rejects(
        db.query('update pets set ' + field + '=$2 where user_id=$1', [USER, bad]),
        /check constraint/
      );
    const fresh = (await db.query('select * from pets where user_id=$1', [USER])).rows[0];
    assert.equal(fresh.cat_type_id, 'oyen');
    assert.equal(fresh.room_id, 'hangat');
  } finally {
    await db.close();
  }
});

test('SQL loadout changes both slots atomically, requires ownership, preserves neck, and is service-only', async () => {
  const db = await testDatabase();
  try {
    await db.query(
      "insert into inventory values($1,'bandana',1),($1,'flower',1),($1,'topi-zaitun',1),($1,'kacamata-hitam',1)",
      [USER]
    );
    await db.query("select equip_product($1,'bandana',true)", [USER]);
    const load = (ids) => db.query('select equip_loadout($1,$2) result', [USER, ids]);
    const applied = (await load(['topi-zaitun', 'kacamata-hitam'])).rows[0].result;
    assert.deepEqual(
      new Set(applied.equipped.map((item) => item.product_id)),
      new Set(['bandana', 'topi-zaitun', 'kacamata-hitam'])
    );
    const snapshot = (await db.query('select get_user_state($1) state', [USER])).rows[0].state;
    for (const ids of [['topi-zaitun', 'topi-merah'], ['bandana'], ['no-such-product'], null])
      await assert.rejects(load(ids), /INVALID_LOADOUT/);
    await assert.rejects(load(['topi-merah', 'kacamata-hitam']), /OUT_OF_STOCK/);
    const unchanged = (await db.query('select get_user_state($1) state', [USER])).rows[0].state;
    for (const field of ['profile', 'pet', 'inventory', 'equipped'])
      assert.deepEqual(unchanged[field], snapshot[field]);
    await load(['flower', 'kacamata-hitam']);
    assert.ok(
      (
        await db.query('select product_id from equipped_accessories where user_id=$1', [USER])
      ).rows.some((row) => row.product_id === 'flower')
    );
    const cleared = (await load([])).rows[0].result;
    assert.deepEqual(cleared.equipped, [{ slot: 'neck', product_id: 'bandana' }]);
    assert.equal(
      (await db.query('select * from equipped_accessories where user_id=$1', [OTHER])).rows.length,
      0
    );
    await db.exec("set role authenticated;set request.jwt.claim.sub='" + OTHER + "';");
    await assert.rejects(load([]), /permission denied/);
    await assert.rejects(
      db.query("update pets set cat_type_id='hitam' where user_id=$1", [USER]),
      /permission denied/
    );
    await db.exec('reset role');
  } finally {
    await db.close();
  }
});
