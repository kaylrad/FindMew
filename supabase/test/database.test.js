import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testDatabase, USER as uid, OTHER as other } from './helpers/database.js';
import { products } from '../../backend/src/services/catalog.js';
let db;
const q = (sql, params = []) => db.query(sql, params);
const scalar = async (sql, params = []) => Object.values((await q(sql, params)).rows[0])[0];
before(async () => {
  db = await testDatabase();
});
after(async () => await db.close());

test('all migrations and seed initialize a usable backend schema', async () => {
  assert.equal(await scalar('select coins from profiles where id=$1', [uid]), 150);
  assert.equal((await q('select * from products')).rows.length, products.length);
  assert.equal(
    await scalar("select quantity from inventory where user_id=$1 and product_id='tuna'", [uid]),
    2
  );
  const health = await scalar('select backend_status()');
  assert.equal(health.schemaVersion, 6);
  assert.equal(health.catalogReady, true);
});
test('collection receipts reward once and survive deletion', async () => {
  const key = randomUUID();
  await q('select reserve_upload($1,$2,$3)', [uid, key, 'photo-hash']);
  const args = [uid, key, 'SQL Mew', 'catatan', 'private', -6.2, 106.8, 25];
  const a = await scalar('select complete_collection($1,$2,$3,$4,$5,$6,$7,$8)', args);
  const b = await scalar('select complete_collection($1,$2,$3,$4,$5,$6,$7,$8)', args);
  assert.equal(a.id, b.id);
  assert.equal(b.reward, 0);
  assert.equal(await scalar('select coins from profiles where id=$1', [uid]), 175);
  await assert.rejects(
    q('select reserve_upload($1,$2,$3)', [uid, key, 'changed']),
    /REQUEST_CONFLICT/
  );
  await assert.rejects(q('select begin_collection_delete($1,$2)', [other, a.id]), /NOT_FOUND/);
  const job = await scalar('select begin_collection_delete($1,$2)', [uid, a.id]);
  const claim = await scalar('select claim_photo_delete($1)', [job.id]);
  assert.equal((await scalar('select get_user_state($1)', [uid])).collectionCount, 0);
  assert.equal(await scalar('select finish_photo_delete($1,$2)', [job.id, claim.token]), true);
  assert.equal((await q('select * from collections where id=$1', [a.id])).rows.length, 0);
  await assert.rejects(
    q('select complete_collection($1,$2,$3,$4,$5,$6,$7,$8)', args),
    /REQUEST_ALREADY_USED/
  );
});
test('purchase and consumption preserve coins, stock, and idempotency', async () => {
  const key = randomUUID();
  await q('select buy_product($1,$2,$3)', [uid, 'kacamata-hitam', key]);
  await q('select buy_product($1,$2,$3)', [uid, 'kacamata-hitam', key]);
  assert.equal(await scalar('select coins from profiles where id=$1', [uid]), 115);
  const used = randomUUID();
  await q('select use_product($1,$2,$3)', [uid, 'tuna', used]);
  await q('select use_product($1,$2,$3)', [uid, 'tuna', used]);
  assert.equal(
    await scalar("select quantity from inventory where user_id=$1 and product_id='tuna'", [uid]),
    1
  );
  assert.equal(await scalar('select energy from pets where user_id=$1', [uid]), 100);
  await q('update profiles set coins=0 where id=$1', [uid]);
  await assert.rejects(
    q('select buy_product($1,$2,$3)', [uid, 'topi-merah', randomUUID()]),
    /INSUFFICIENT_COINS/
  );
  await assert.rejects(
    q('update inventory set quantity=-1 where user_id=$1', [uid]),
    /check constraint/
  );
});
test('accessories require ownership and can be equipped and removed', async () => {
  await assert.rejects(
    q('select equip_product($1,$2,$3)', [uid, 'topi-zaitun', true]),
    /OUT_OF_STOCK/
  );
  await q('update profiles set coins=100 where id=$1', [uid]);
  await q('select buy_product($1,$2,$3)', [uid, 'topi-zaitun', randomUUID()]);
  await q('select equip_product($1,$2,$3)', [uid, 'topi-zaitun', true]);
  assert.equal(
    await scalar('select product_id from equipped_accessories where user_id=$1', [uid]),
    'topi-zaitun'
  );
  await q('select equip_product($1,$2,$3)', [uid, 'topi-zaitun', false]);
  assert.equal(
    (await q('select * from equipped_accessories where user_id=$1', [uid])).rows.length,
    0
  );
});
test('RLS and service-only grants deny cross-user reads and all client transactions', async () => {
  await db.exec("set role authenticated;set request.jwt.claim.sub='" + other + "';");
  try {
    assert.equal((await q('select * from profiles where id=$1', [uid])).rows.length, 0);
    await assert.rejects(
      q('update profiles set coins=1000 where id=$1', [other]),
      /permission denied/
    );
    await assert.rejects(
      q('select buy_product($1,$2,$3)', [uid, 'tuna', randomUUID()]),
      /permission denied/
    );
    await assert.rejects(q('select get_user_state($1)', [uid]), /permission denied/);
    await assert.rejects(
      q('select claim_upload_cleanup($1,$2,$3)', [uid, randomUUID(), 'path']),
      /permission denied/
    );
    await assert.rejects(
      q('insert into collections(user_id,name,photo_path) values($1,$2,$3)', [
        other,
        'cheat',
        'cheat.jpg',
      ]),
      /permission denied/
    );
  } finally {
    await db.exec('reset role');
  }
});
test('abandoned upload cleanup is exclusive and stale tokens cannot finalize new generations', async () => {
  const key = randomUUID(),
    old = await scalar('select reserve_upload($1,$2,$3)', [uid, key, 'hash']);
  const args = [uid, key, old.photo_path];
  assert.equal(await scalar('select claim_upload_cleanup($1,$2,$3)', args), null);
  await q(
    "update upload_jobs set touched_at=now()-interval '25 hours' where user_id=$1 and request_id=$2",
    [uid, key]
  );
  const claim = await scalar('select claim_upload_cleanup($1,$2,$3)', args);
  assert.ok(claim.token);
  assert.equal(await scalar('select claim_upload_cleanup($1,$2,$3)', args), null);
  await assert.rejects(
    q('select reserve_upload($1,$2,$3)', [uid, key, 'hash']),
    /UPLOAD_NOT_READY/
  );
  assert.equal(
    await scalar('select finish_upload_cleanup($1,$2,$3,$4)', [...args, randomUUID()]),
    false
  );
  assert.equal(
    await scalar('select finish_upload_cleanup($1,$2,$3,$4)', [...args, claim.token]),
    true
  );
  const fresh = await scalar('select reserve_upload($1,$2,$3)', [uid, key, 'hash']);
  assert.notEqual(fresh.photo_path, old.photo_path);
  assert.equal(
    await scalar('select finish_upload_cleanup($1,$2,$3,$4)', [...args, claim.token]),
    false
  );
  assert.equal(
    await scalar('select photo_path from upload_jobs where user_id=$1 and request_id=$2', [
      uid,
      key,
    ]),
    fresh.photo_path
  );
});
test('failed cleanup uses backoff and expired leases can be reclaimed', async () => {
  const key = randomUUID(),
    job = await scalar('select reserve_upload($1,$2,$3)', [uid, key, 'retry-hash']);
  const args = [uid, key, job.photo_path];
  await q(
    "update upload_jobs set touched_at=now()-interval '25 hours' where user_id=$1 and request_id=$2",
    [uid, key]
  );
  const first = await scalar('select claim_upload_cleanup($1,$2,$3)', args);
  await q('select release_upload_cleanup($1,$2,$3,$4)', [...args, first.token]);
  assert.equal(await scalar('select claim_upload_cleanup($1,$2,$3)', args), null);
  await q(
    "update upload_jobs set next_attempt_at=now()-interval '1 second' where user_id=$1 and request_id=$2",
    [uid, key]
  );
  const second = await scalar('select claim_upload_cleanup($1,$2,$3)', args);
  assert.notEqual(second.token, first.token);
  await q(
    "update upload_jobs set cleanup_until=now()-interval '1 second' where user_id=$1 and request_id=$2",
    [uid, key]
  );
  const third = await scalar('select claim_upload_cleanup($1,$2,$3)', args);
  assert.notEqual(third.token, second.token);
  assert.equal(
    await scalar('select finish_upload_cleanup($1,$2,$3,$4)', [...args, second.token]),
    false
  );
});
test('consumables cannot become negative and status stays in range', async () => {
  for (const product of ['tuna', 'shampoo']) {
    const quantity = await scalar(
      'select quantity from inventory where user_id=$1 and product_id=$2',
      [uid, product]
    );
    for (let i = 0; i < quantity; i++) {
      await q('update pets set fed_at=null where user_id=$1', [uid]);
      await q('select use_product($1,$2,$3)', [uid, product, randomUUID()]);
    }
    await assert.rejects(
      q('select use_product($1,$2,$3)', [uid, product, randomUUID()]),
      product === 'tuna' ? /FOOD_EMPTY/ : /OUT_OF_STOCK/
    );
    assert.equal(
      await scalar('select quantity from inventory where user_id=$1 and product_id=$2', [
        uid,
        product,
      ]),
      0
    );
  }
  const pet = (await q('select * from pets where user_id=$1', [uid])).rows[0];
  assert.equal(pet.energy, 100);
  assert.equal(pet.clean, 100);
});
test('decay uses timestamps and play enforces a database cooldown', async () => {
  await q(
    "update pets set energy=80,clean=85,happiness=70,energy_remainder=0,clean_remainder=0,happiness_remainder=0,updated_at=now()-interval '2 hours',played_at=null where user_id=$1",
    [uid]
  );
  const key = randomUUID();
  await q('select play_pet($1,$2)', [uid, key]);
  const p = (await q('select * from pets where user_id=$1', [uid])).rows[0];
  assert.equal(p.energy, 76);
  assert.equal(p.clean, 83);
  assert.equal(p.happiness, 82);
  await q('select play_pet($1,$2)', [uid, key]);
  await assert.rejects(q('select play_pet($1,$2)', [uid, randomUUID()]), /PLAY_COOLDOWN/);
});
test('frequent interactions preserve fractional decay instead of resetting the clock', async () => {
  await q(
    'update pets set energy=80,clean=85,happiness=70,energy_remainder=0,clean_remainder=0,happiness_remainder=0,updated_at=now() where user_id=$1',
    [uid]
  );
  for (let i = 0; i < 4; i++) {
    await q("update pets set updated_at=now()-interval '15 minutes' where user_id=$1", [uid]);
    await q('select settle_pet($1)', [uid]);
  }
  const p = (await q('select * from pets where user_id=$1', [uid])).rows[0];
  assert.equal(p.energy, 78);
  assert.equal(p.clean, 84);
  assert.equal(p.happiness, 69);
});
