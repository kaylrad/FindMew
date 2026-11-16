// Local contract transport: real supabase-js HTTP requests, PostgreSQL via PGlite,
// and an isolated in-memory object store. No request reaches Supabase cloud.
import { testDatabase, USER, OTHER } from '../../../supabase/test/helpers/database.js';
export { USER, OTHER };
const rpcNames = new Set([
  'initialize_user',
  'get_user_state',
  'backend_status',
  'reserve_upload',
  'complete_collection',
  'complete_collection_v2',
  'buy_product',
  'use_product',
  'play_pet',
  'feed_pet',
  'feed_pet_food',
  'equip_product',
  'equip_loadout',
  'begin_collection_delete',
  'claim_photo_delete',
  'finish_photo_delete',
  'release_photo_delete',
  'claim_upload_cleanup',
  'finish_upload_cleanup',
  'release_upload_cleanup',
]);
const tables = new Set([
  'profiles',
  'pets',
  'collections',
  'products',
  'inventory',
  'equipped_accessories',
  'purchases',
  'coin_transactions',
  'upload_jobs',
  'storage_gc',
]);
const columns = new Set([
  'id',
  'user_id',
  'request_id',
  'name',
  'notes',
  'visibility',
  'fed',
  'latitude',
  'longitude',
  'photo_path',
  'created_at',
  'updated_at',
  'deleted_at',
  'touched_at',
  'next_attempt_at',
  'cleaning',
  'price',
  'bio',
  'username',
  'avatar',
  'active',
  'archived',
  'product_id',
  'quantity',
  'slot',
  'cat_type_id',
  'room_id',
]);
const ident = (s) => {
  if (!columns.has(s)) throw new Error('Unexpected column: ' + s);
  return '"' + s + '"';
};
const json = (value, status = 200, headers = {}) =>
  new Response(status === 204 ? null : JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

export async function supabaseTransport() {
  const db = await testDatabase(),
    objects = new Map(),
    faults = {},
    calls = [];
  const transport = async (input, options = {}) => {
    const url = new URL(String(input)),
      headers = new Headers(options.headers),
      method = options.method || 'GET',
      pathname = url.pathname;
    calls.push({ pathname, method, authorization: headers.get('authorization') });
    if (pathname === '/auth/v1/user') {
      if (faults.authThrow) throw new Error('Network unavailable');
      if (faults.authStatus)
        return json({ code: 'unexpected_failure', msg: 'Auth unavailable' }, faults.authStatus);
      const token = headers.get('authorization');
      const id =
        token === 'Bearer token-user' ? USER : token === 'Bearer token-other' ? OTHER : null;
      return id
        ? json({
            id,
            aud: 'authenticated',
            role: 'authenticated',
            email: 'test@example.invalid',
            user_metadata: { name: 'Nadia' },
            app_metadata: {},
            created_at: new Date().toISOString(),
          })
        : json({ code: 'bad_jwt', msg: 'Invalid JWT' }, 401);
    }
    if (headers.get('apikey') !== 'local-service-key')
      return json({ message: 'Invalid API key' }, 401);
    if (pathname === '/storage/v1/bucket/cat-photos')
      return faults.bucketMissing
        ? json({ message: 'Bucket missing' }, 404)
        : json({
            id: 'cat-photos',
            name: 'cat-photos',
            public: Boolean(faults.publicBucket),
            file_size_limit: 6291456,
          });
    if (pathname.startsWith('/storage/v1/object/')) {
      const prefix = '/storage/v1/object/cat-photos';
      if (method === 'DELETE') {
        if (faults.remove) {
          faults.remove--;
          return json(
            { statusCode: '503', error: 'Unavailable', message: 'Storage temporarily unavailable' },
            503
          );
        }
        const { prefixes } = JSON.parse(options.body);
        for (const key of prefixes) objects.delete(key);
        return json(prefixes.map((name) => ({ name })));
      }
      const key = decodeURIComponent(pathname.slice(prefix.length + 1));
      if (method === 'POST') {
        if (faults.upload) {
          faults.upload--;
          return json(
            { statusCode: '503', error: 'Unavailable', message: 'Upload unavailable' },
            503
          );
        }
        if (objects.has(key))
          return json(
            { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' },
            409
          );
        objects.set(key, Buffer.from(await new Response(options.body).arrayBuffer()));
        return json({ Key: 'cat-photos/' + key, Id: 'test-object' });
      }
      if (method === 'GET')
        return objects.has(key)
          ? new Response(objects.get(key), { headers: { 'Content-Type': 'image/webp' } })
          : json({ message: 'Not found' }, 404);
    }
    if (pathname.startsWith('/rest/v1/rpc/')) {
      const name = pathname.split('/').pop();
      if (!rpcNames.has(name)) throw new Error('Unexpected RPC: ' + name);
      if (faults[name]) {
        faults[name]--;
        return json({ code: 'XX000', message: 'Simulated database outage' }, 503);
      }
      const args = JSON.parse(options.body || '{}'),
        entries = Object.entries(args);
      for (const [key] of entries)
        if (!/^p_[a-z_]+$/.test(key)) throw new Error('Invalid SQL argument');
      try {
        const result = await db.query(
          'select public.' +
            name +
            '(' +
            entries.map(([key], i) => key + '=> $' + (i + 1)).join(',') +
            ') as result',
          entries.map(([, value]) => value)
        );
        return json(result.rows[0].result);
      } catch (error) {
        return json({ code: error.code || 'P0001', message: error.message }, 400);
      }
    }
    if (pathname.startsWith('/rest/v1/')) {
      const table = pathname.split('/').pop();
      if (!tables.has(table)) throw new Error('Unexpected table: ' + table);
      const values = [],
        filters = [];
      for (const [column, filter] of url.searchParams) {
        if (['select', 'order', 'offset', 'limit'].includes(column)) continue;
        if (column === 'or') {
          if (!filter.startsWith('(') || !filter.endsWith(')'))
            throw new Error('Invalid OR filter');
          const terms = filter
            .slice(1, -1)
            .split(',')
            .map((term) => {
              const match = term.match(/^([a-z_]+)\.eq\.(.+)$/);
              if (!match) throw new Error('Unexpected OR filter');
              values.push(match[2]);
              return 't.' + ident(match[1]) + '=$' + values.length;
            });
          filters.push('(' + terms.join(' or ') + ')');
          continue;
        }
        const col = 't.' + ident(column);
        if (filter === 'is.null') {
          filters.push(col + ' is null');
          continue;
        }
        if (filter === 'not.is.null') {
          filters.push(col + ' is not null');
          continue;
        }
        const operators = { eq: '=', neq: '<>', lt: '<', lte: '<=' },
          dot = filter.indexOf('.'),
          op = operators[filter.slice(0, dot)];
        if (!op) throw new Error('Unexpected filter ' + filter);
        values.push(filter.slice(dot + 1));
        filters.push(col + op + '$' + values.length);
      }
      const where = filters.length ? ' where ' + filters.join(' and ') : '';
      const projection = url.searchParams.get('select') || '*';
      const select = projection.includes('profiles!inner')
        ? projection
            .slice(0, projection.indexOf(',profiles!inner'))
            .split(',')
            .map((c) => 't.' + ident(c))
            .join(',') +
          ",(select jsonb_build_object('name',p.name,'avatar',p.avatar) from profiles p where p.id=t.user_id) as profiles"
        : projection === '*'
          ? 't.*'
          : projection
              .split(',')
              .map((c) => 't.' + ident(c))
              .join(',');
      const order = (url.searchParams.get('order') || '')
        .split(',')
        .filter(Boolean)
        .map((term) => {
          const [column, dir] = term.split('.');
          return 't.' + ident(column) + (dir === 'desc' ? ' desc' : ' asc');
        });
      let rows, total;
      if (method === 'PATCH') {
        const entries = Object.entries(JSON.parse(options.body)),
          updates = entries.map(([column, value]) => {
            values.push(value);
            return ident(column) + '=$' + values.length;
          });
        rows = (
          await db.query(
            'update ' + table + ' t set ' + updates.join(',') + where + ' returning *',
            values
          )
        ).rows;
        total = rows.length;
      } else if (method === 'GET' || method === 'HEAD') {
        total = Number(
          (await db.query('select count(*) from ' + table + ' t' + where, values)).rows[0].count
        );
        const limit = Number(url.searchParams.get('limit') || 1000),
          offset = Number(url.searchParams.get('offset') || 0);
        rows = (
          await db.query(
            'select ' +
              select +
              ' from ' +
              table +
              ' t' +
              where +
              (order.length ? ' order by ' + order.join(',') : '') +
              ' limit ' +
              limit +
              ' offset ' +
              offset,
            values
          )
        ).rows;
      } else throw new Error('Unexpected method ' + method);
      const range = {
        'Content-Range': (rows.length ? '0-' + (rows.length - 1) : '*') + '/' + total,
      };
      if (headers.get('accept')?.includes('vnd.pgrst.object'))
        return rows.length === 1
          ? json(rows[0], 200, range)
          : json({ code: 'PGRST116', message: 'No rows' }, 406, range);
      return method === 'HEAD'
        ? new Response(null, { status: 200, headers: range })
        : json(rows, 200, range);
    }
    throw new Error('Unexpected Supabase request: ' + method + ' ' + pathname);
  };
  return { db, objects, faults, calls, fetch: transport };
}
