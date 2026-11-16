import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { AppError, databaseError, fail } from '../errors.js';
import { effectivePet, petOptions } from './catalog.js';

export class SupabaseStore {
  constructor(config, { fetch: transport = globalThis.fetch } = {}) {
    this.config = config;
    this.client = createClient(config.url, config.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (url, options = {}) =>
          transport(url, {
            ...options,
            signal: options.signal
              ? AbortSignal.any([options.signal, AbortSignal.timeout(30000)])
              : AbortSignal.timeout(30000),
          }),
      },
    });
    this.storage = this.client.storage.from(config.bucket);
  }
  async init() {
    return this;
  }
  async query(query) {
    const { data, error, count } = await query;
    if (error) throw databaseError(error);
    return { data, count };
  }
  async rpc(name, args) {
    return (await this.query(this.client.rpc(name, args))).data;
  }
  async ensureUser(id, name) {
    await this.rpc('initialize_user', { p_user: id, p_name: name || 'Teman Mew' });
  }
  async health() {
    const status = await this.rpc('backend_status', {});
    const { data, error } = await this.client.storage.getBucket(this.config.bucket);
    if (
      !status?.database ||
      status.schemaVersion < 5 ||
      !status.catalogReady ||
      error ||
      data?.public !== false
    )
      throw new AppError('NOT_READY', 'Database, katalog, atau bucket privat belum siap.', 503);
    return { database: true, storage: true, schemaVersion: status.schemaVersion };
  }
  async state(id) {
    const data = await this.rpc('get_user_state', { p_user: id });
    if (!data?.pet) fail('NOT_FOUND');
    return { ...data, pet: effectivePet(data.pet), petOptions };
  }
  async list(id, { offset = 0, limit = 20 } = {}) {
    const { data, count } = await this.query(
      this.client
        .from('collections')
        .select('*', { count: 'exact' })
        .eq('user_id', id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .order('id')
        .range(offset, offset + limit - 1)
    );
    return { items: data, total: count };
  }
  async detail(id, cid) {
    const { data } = await this.query(
      this.client
        .from('collections')
        .select('*')
        .eq('id', cid)
        .eq('user_id', id)
        .is('deleted_at', null)
        .maybeSingle()
    );
    if (!data) fail('NOT_FOUND');
    return data;
  }
  async publicMap(id, { offset = 0, limit = 100 } = {}) {
    let q = this.client
      .from('collections')
      .select('id,name,latitude,longitude,created_at,profiles!inner(name,avatar)', {
        count: 'exact',
      })
      .eq('visibility', 'public')
      .not('latitude', 'is', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .order('id')
      .range(offset, offset + limit - 1);
    if (id) q = q.neq('user_id', id);
    const { data, count } = await this.query(q);
    return {
      items: data.map(({ profiles, ...c }) => ({
        ...c,
        uploader: profiles.name,
        avatar: profiles.avatar,
      })),
      total: count,
    };
  }
  async exploreMap(id, { offset = 0, limit = 100 } = {}) {
    const { data, count } = await this.query(
      this.client
        .from('collections')
        .select(
          'id,user_id,name,visibility,latitude,longitude,created_at,profiles!inner(name,avatar)',
          { count: 'exact' }
        )
        .or(`user_id.eq.${id},visibility.eq.public`)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .order('id')
        .range(offset, offset + limit - 1)
    );
    return {
      items: data.map(({ profiles, user_id, ...item }) => ({
        ...item,
        owned: user_id === id,
        uploader: profiles.name,
        avatar: profiles.avatar,
      })),
      total: count,
    };
  }
  async mapDetail(id, cid) {
    const { data } = await this.query(
      this.client
        .from('collections')
        .select(
          'id,user_id,name,notes,visibility,fed,latitude,longitude,created_at,profiles!inner(name,avatar)'
        )
        .eq('id', cid)
        .or(`user_id.eq.${id},visibility.eq.public`)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .is('deleted_at', null)
        .maybeSingle()
    );
    if (!data) fail('NOT_FOUND');
    const { profiles, user_id, ...item } = data;
    return { ...item, owned: user_id === id, uploader: profiles.name, avatar: profiles.avatar };
  }
  async createCollection(id, data, file, key, hash) {
    const job = await this.rpc('reserve_upload', { p_user: id, p_request: key, p_hash: hash });
    const complete = () =>
      this.rpc('complete_collection_v2', {
        p_user: id,
        p_request: key,
        p_name: data.name,
        p_notes: data.notes,
        p_visibility: data.visibility,
        p_lat: data.latitude,
        p_lng: data.longitude,
        p_reward: this.config.reward,
        p_fed: data.fed === true,
        p_bonus: this.config.feedingBonusReward ?? 5,
      });
    if (job.completed) return complete();
    const { error } = await this.storage.upload(job.photo_path, file, {
      contentType: 'image/webp',
      upsert: false,
    });
    if (error && String(error.statusCode) !== '409' && error.error !== 'Duplicate')
      throw new AppError(
        'UPLOAD_FAILED',
        'Foto gagal diunggah. Coba lagi dengan foto yang sama.',
        503
      );
    // Reserve is durable before uploading. An interrupted finalization leaves a retryable job.
    return complete();
  }
  async updateCollection(id, cid, data) {
    const { data: row } = await this.query(
      this.client
        .from('collections')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', cid)
        .eq('user_id', id)
        .is('deleted_at', null)
        .select()
        .maybeSingle()
    );
    if (!row) fail('NOT_FOUND');
    return row;
  }
  async processDeletion(job) {
    const claim = await this.rpc('claim_photo_delete', { p_job: job.id });
    if (!claim) return false;
    try {
      const { error } = await this.storage.remove([claim.photo_path]);
      if (error) throw error;
      return await this.rpc('finish_photo_delete', { p_job: job.id, p_token: claim.token });
    } catch (error) {
      await this.rpc('release_photo_delete', { p_job: job.id, p_token: claim.token }).catch(
        () => {}
      );
      throw error;
    }
  }
  async deleteCollection(id, cid) {
    const job = await this.rpc('begin_collection_delete', { p_user: id, p_id: cid });
    try {
      return { pending: !(await this.processDeletion(job)) };
    } catch {
      return { pending: true };
    }
  }
  async photo(id, cid, isPublic = false) {
    let q = this.client
      .from('collections')
      .select('photo_path')
      .eq('id', cid)
      .is('deleted_at', null);
    q = isPublic ? q.eq('visibility', 'public').not('latitude', 'is', null) : q.eq('user_id', id);
    const { data } = await this.query(q.maybeSingle());
    if (!data) fail('NOT_FOUND');
    const { data: blob, error } = await this.storage.download(data.photo_path);
    if (error) throw new AppError('PHOTO_UNAVAILABLE', 'Foto belum dapat dimuat.', 503);
    return { buffer: Buffer.from(await blob.arrayBuffer()) };
  }
  async history(id, table, { offset = 0, limit = 20 } = {}) {
    if (!['purchases', 'coin_transactions'].includes(table))
      throw new Error('Invalid history table');
    const { data, count } = await this.query(
      this.client
        .from(table)
        .select('*', { count: 'exact' })
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .order('id')
        .range(offset, offset + limit - 1)
    );
    return { items: data, total: count };
  }
  async updateProfile(id, data) {
    return (
      await this.query(this.client.from('profiles').update(data).eq('id', id).select().single())
    ).data;
  }
  async updatePet(id, patch) {
    return effectivePet(
      (await this.query(this.client.from('pets').update(patch).eq('user_id', id).select().single()))
        .data
    );
  }
  async buy(id, productId, key) {
    return this.rpc('buy_product', { p_user: id, p_product: productId, p_request: key });
  }
  async use(id, productId, key) {
    return this.rpc('use_product', { p_user: id, p_product: productId, p_request: key });
  }
  async play(id, key) {
    return this.rpc('play_pet', { p_user: id, p_request: key });
  }
  async feed(id, key, productId) {
    const result = await this.rpc('feed_pet_food', {
      p_user: id,
      p_request: key,
      p_product: productId ?? null,
    });
    return { ...result, pet: effectivePet(result.pet) };
  }
  async equip(id, productId, equipped) {
    await this.rpc('equip_product', { p_user: id, p_product: productId, p_equipped: equipped });
    return { equipped };
  }
  async equipLoadout(id, productIds) {
    return this.rpc('equip_loadout', { p_user: id, p_products: productIds });
  }
  async cleanup() {
    const now = new Date().toISOString(),
      stats = { deleted: 0, abandoned: 0, failed: 0, skipped: 0 };
    const { data: jobs } = await this.query(
      this.client
        .from('storage_gc')
        .select('*')
        .lte('next_attempt_at', now)
        .order('next_attempt_at')
        .order('created_at')
        .limit(100)
    );
    for (const job of jobs) {
      try {
        if (await this.processDeletion(job)) stats.deleted++;
        else stats.skipped++;
      } catch {
        stats.failed++;
      }
    }
    const { data: uploads } = await this.query(
      this.client
        .from('upload_jobs')
        .select('*')
        .lt('touched_at', new Date(Date.now() - 24 * 3600000).toISOString())
        .lte('next_attempt_at', now)
        .order('next_attempt_at')
        .order('touched_at')
        .limit(100)
    );
    for (const job of uploads) {
      let claim;
      try {
        claim = await this.rpc('claim_upload_cleanup', {
          p_user: job.user_id,
          p_request: job.request_id,
          p_path: job.photo_path,
        });
        if (!claim) {
          stats.skipped++;
          continue;
        }
        const { error } = await this.storage.remove([claim.photo_path]);
        if (error) throw error;
        const finished = await this.rpc('finish_upload_cleanup', {
          p_user: job.user_id,
          p_request: job.request_id,
          p_path: claim.photo_path,
          p_token: claim.token,
        });
        if (finished) stats.abandoned++;
        else stats.skipped++;
      } catch {
        stats.failed++;
        if (claim)
          await this.rpc('release_upload_cleanup', {
            p_user: job.user_id,
            p_request: job.request_id,
            p_path: claim.photo_path,
            p_token: claim.token,
          }).catch(() => {});
      }
    }
    return stats;
  }
}
export function uploadHash(buffer, data) {
  const { fed, ...metadata } = data;
  return createHash('sha256')
    .update(buffer)
    .update(JSON.stringify(fed ? { ...metadata, fed: true } : metadata))
    .digest('hex');
}
