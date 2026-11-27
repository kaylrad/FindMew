import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError, fail } from '../errors.js';
import { products, effectivePet, settlePet, defaultPetAppearance, petOptions } from './catalog.js';
export const DEMO_USER = '11111111-1111-4111-8111-111111111111';
export const OTHER_USER = '22222222-2222-4222-8222-222222222222';
const stamp = () => new Date().toISOString();
const visible = (c) => !c.deleted_at;
const profilePhotoFile = (id) => 'profile-' + id + '.webp';

export class DemoStore {
  constructor(config) {
    this.config = config;
    this.queue = Promise.resolve();
  }
  async init() {
    await mkdir(path.join(this.config.dataDir, 'photos'), { recursive: true });
    try {
      this.db = JSON.parse(await readFile(path.join(this.config.dataDir, 'demo.json'), 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.db = {
        users: {},
        collections: [],
        operations: {},
        transactions: [],
        purchases: [],
        uploads: {},
        deletions: {},
      };
      this.addUser(DEMO_USER, 'Nadia');
      this.addUser(OTHER_USER, 'Raka');
      ['Si Oyen', 'Milo', 'Cimol', 'Abu'].forEach((name, i) =>
        this.db.collections.push({
          id: randomUUID(),
          user_id: DEMO_USER,
          name,
          notes: [
            'Si paling ramah di ujung gang.',
            'Ketemu saat jalan sore.',
            'Suka duduk di tempat yang hangat.',
            'Teman baru dengan mata indah.',
          ][i],
          visibility: i === 2 ? 'private' : 'public',
          photo_path: 'sample:' + (i + 1),
          latitude: i === 2 ? null : -6.2 + i * 0.006,
          longitude: i === 2 ? null : 106.816 + i * 0.004,
          created_at: new Date(Date.now() - i * 86400000).toISOString(),
        })
      );
      this.db.collections.push({
        id: randomUUID(),
        user_id: OTHER_USER,
        name: 'Boba',
        notes: '',
        visibility: 'public',
        photo_path: 'sample:2',
        latitude: -6.19,
        longitude: 106.822,
        created_at: stamp(),
      });
      await this.save();
    }
    this.db.uploads ??= {};
    this.db.deletions ??= {};
    let migrated = false;
    if (!this.db.likes) {
      // Seed one like from Raka so the demo shows a liked collection straight away.
      const liked = this.db.collections.find(
        (c) => c.user_id === DEMO_USER && c.visibility === 'public' && visible(c)
      );
      this.db.likes = liked
        ? [{ collection_id: liked.id, user_id: OTHER_USER, created_at: stamp() }]
        : [];
      migrated = true;
    }
    for (const collection of this.db.collections) {
      if (collection.fed == null) {
        collection.fed = false;
        migrated = true;
      }
      const likes = this.db.likes.filter((like) => like.collection_id === collection.id).length;
      if (collection.like_count !== likes) {
        collection.like_count = likes;
        migrated = true;
      }
    }
    for (const user of Object.values(this.db.users))
      if (!Object.hasOwn(user.profile, 'photo_updated_at')) {
        user.profile.photo_updated_at = null;
        migrated = true;
      }
    for (const user of Object.values(this.db.users))
      for (const [field, value] of Object.entries(defaultPetAppearance))
        if (user.pet[field] == null) {
          user.pet[field] = value;
          migrated = true;
        }
    for (const user of Object.values(this.db.users))
      if (!Object.hasOwn(user.pet, 'fed_at')) {
        user.pet.fed_at = null;
        migrated = true;
      }
    if (migrated) await this.save();
    return this;
  }
  addUser(id, name) {
    if (!this.db.users[id])
      this.db.users[id] = {
        profile: {
          id,
          name,
          username: name.toLowerCase() + '_mew',
          bio: 'Menemukan bahagia, satu meow setiap hari. 🌿',
          avatar: '🐱',
          coins: 150,
          photo_updated_at: null,
        },
        pet: {
          user_id: id,
          name: 'Mochi',
          ...defaultPetAppearance,
          energy: 65,
          clean: 80,
          happiness: 90,
          updated_at: stamp(),
          played_at: null,
          fed_at: null,
        },
        inventory: { tuna: 2, shampoo: 2 },
        equipped: {},
      };
  }
  async save() {
    const file = path.join(this.config.dataDir, 'demo.json');
    await writeFile(file + '.tmp', JSON.stringify(this.db));
    await rename(file + '.tmp', file);
  }
  async atomic(fn) {
    const run = this.queue.then(async () => {
      const before = structuredClone(this.db);
      try {
        const result = await fn();
        await this.save();
        return structuredClone(result);
      } catch (error) {
        this.db = before;
        throw error;
      }
    });
    this.queue = run.catch(() => {});
    return run;
  }
  async health() {
    await this.queue;
    await readFile(path.join(this.config.dataDir, 'demo.json'));
    return { database: 'demo-json', storage: 'local-files' };
  }
  async ensureUser(id, name) {
    if (!this.db.users[id]) await this.atomic(() => this.addUser(id, name || 'Teman Mew'));
  }
  async state(id) {
    await this.queue;
    const u = this.db.users[id];
    if (!u) fail('NOT_FOUND');
    return {
      profile: structuredClone(u.profile),
      pet: effectivePet(u.pet),
      inventory: Object.entries(u.inventory).map(([product_id, quantity]) => ({
        product_id,
        quantity,
      })),
      equipped: Object.entries(u.equipped).map(([slot, product_id]) => ({ slot, product_id })),
      products,
      petOptions,
      collectionCount: this.db.collections.filter((c) => c.user_id === id && visible(c)).length,
    };
  }
  async list(id, { offset = 0, limit = 20 } = {}) {
    await this.queue;
    const rows = this.db.collections
      .filter((c) => c.user_id === id && visible(c))
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
    return { items: structuredClone(rows.slice(offset, offset + limit)), total: rows.length };
  }
  async detail(id, cid) {
    await this.queue;
    const c = this.db.collections.find((c) => c.id === cid && c.user_id === id && visible(c));
    if (!c) fail('NOT_FOUND');
    return structuredClone(c);
  }
  async publicMap(id, { offset = 0, limit = 100 } = {}) {
    await this.queue;
    const rows = this.db.collections
      .filter(
        (c) => visible(c) && c.visibility === 'public' && c.latitude != null && c.user_id !== id
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
    return {
      items: rows.slice(offset, offset + limit).map((c) => ({
        id: c.id,
        name: c.name,
        latitude: c.latitude,
        longitude: c.longitude,
        created_at: c.created_at,
        uploader: this.db.users[c.user_id].profile.name,
        avatar: this.db.users[c.user_id].profile.avatar,
      })),
      total: rows.length,
    };
  }
  likedBy(id) {
    return new Set(
      this.db.likes.filter((like) => like.user_id === id).map((like) => like.collection_id)
    );
  }
  mapItem(c, id, detail = false, liked = this.likedBy(id)) {
    const profile = this.db.users[c.user_id].profile;
    return {
      id: c.id,
      name: c.name,
      visibility: c.visibility,
      latitude: c.latitude,
      longitude: c.longitude,
      created_at: c.created_at,
      owned: c.user_id === id,
      uploader: profile.name,
      avatar: profile.avatar,
      like_count: c.like_count || 0,
      liked: liked.has(c.id),
      ...(detail ? { notes: c.notes, fed: c.fed === true } : {}),
    };
  }
  async exploreMap(id, { offset = 0, limit = 100 } = {}) {
    await this.queue;
    const rows = this.db.collections
      .filter(
        (c) =>
          visible(c) &&
          c.latitude != null &&
          c.longitude != null &&
          (c.user_id === id || c.visibility === 'public')
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
    const liked = this.likedBy(id);
    return {
      items: rows.slice(offset, offset + limit).map((c) => this.mapItem(c, id, false, liked)),
      total: rows.length,
    };
  }
  async mapDetail(id, cid) {
    await this.queue;
    const item = this.db.collections.find(
      (c) =>
        c.id === cid &&
        visible(c) &&
        c.latitude != null &&
        c.longitude != null &&
        (c.user_id === id || c.visibility === 'public')
    );
    if (!item) fail('NOT_FOUND');
    return this.mapItem(item, id, true);
  }
  receipt(id, key, kind, product) {
    const op = this.db.operations[id + key];
    if (op && (op.kind !== kind || (product && op.result.product_id !== product)))
      fail('REQUEST_CONFLICT');
    return op?.result;
  }
  collectionReplay(id, key, hash) {
    const prior = this.receipt(id, key, 'collection');
    if (!prior) return null;
    if (prior.hash !== hash) fail('REQUEST_CONFLICT');
    const item = this.db.collections.find(
      (c) => c.id === prior.id && c.user_id === id && visible(c)
    );
    if (!item) fail('REQUEST_ALREADY_USED');
    return { ...item, reward: 0, base_reward: 0, feeding_bonus: 0, replayed: true };
  }
  async createCollection(id, data, file, key, hash) {
    const operation = id + key;
    const reservation = await this.atomic(() => {
      const replay = this.collectionReplay(id, key, hash);
      if (replay) return { replay };
      const old = this.db.uploads[operation];
      if (old && old.hash !== hash) fail('REQUEST_CONFLICT');
      const job = old || {
        user_id: id,
        request_id: key,
        hash,
        photo_path: id + '_' + randomUUID() + '.webp',
      };
      job.touched_at = stamp();
      this.db.uploads[operation] = job;
      return { job };
    });
    if (reservation.replay) return reservation.replay;
    return this.atomic(async () => {
      const replay = this.collectionReplay(id, key, hash);
      if (replay) return replay;
      const job = this.db.uploads[operation];
      if (!job) fail('UPLOAD_NOT_READY');
      // The reservation is already durable. A failed commit leaves a discoverable file job.
      await writeFile(path.join(this.config.dataDir, 'photos', job.photo_path), file);
      const item = {
        id: randomUUID(),
        user_id: id,
        ...data,
        fed: data.fed === true,
        like_count: 0,
        photo_path: job.photo_path,
        created_at: stamp(),
        updated_at: stamp(),
      };
      const baseReward = this.config.reward,
        feedingBonus = data.fed ? (this.config.feedingBonusReward ?? 5) : 0,
        reward = baseReward + feedingBonus;
      this.db.collections.push(item);
      this.db.users[id].profile.coins += reward;
      this.db.transactions.push({
        id: randomUUID(),
        created_at: stamp(),
        user_id: id,
        amount: reward,
        request_id: key,
        reason: 'collection',
      });
      this.db.operations[operation] = { kind: 'collection', result: { id: item.id, hash } };
      delete this.db.uploads[operation];
      return { ...item, reward, base_reward: baseReward, feeding_bonus: feedingBonus };
    });
  }
  async updateCollection(id, cid, data) {
    return this.atomic(() => {
      const c = this.db.collections.find((c) => c.id === cid && c.user_id === id && visible(c));
      if (!c) fail('NOT_FOUND');
      Object.assign(c, data, { updated_at: stamp() });
      return c;
    });
  }
  async runDeletion(cid) {
    return this.atomic(async () => {
      const job = this.db.deletions[cid];
      if (!job) return true;
      if (!job.photo_path.startsWith('sample:'))
        await unlink(path.join(this.config.dataDir, 'photos', job.photo_path)).catch((e) => {
          if (e.code !== 'ENOENT') throw e;
        });
      this.db.collections = this.db.collections.filter((c) => c.id !== cid);
      this.db.likes = this.db.likes.filter((like) => like.collection_id !== cid);
      delete this.db.deletions[cid];
      return true;
    });
  }
  async setLike(id, cid, liked) {
    return this.atomic(() => {
      const c = this.db.collections.find(
        (c) => c.id === cid && visible(c) && c.visibility === 'public'
      );
      if (!c) fail('NOT_FOUND');
      if (c.user_id === id) fail('OWN_COLLECTION_LIKE');
      const index = this.db.likes.findIndex(
        (like) => like.collection_id === cid && like.user_id === id
      );
      if (liked && index < 0) {
        this.db.likes.push({ collection_id: cid, user_id: id, created_at: stamp() });
        c.like_count = (c.like_count || 0) + 1;
      } else if (!liked && index >= 0) {
        this.db.likes.splice(index, 1);
        c.like_count = Math.max(0, (c.like_count || 0) - 1);
      }
      return { id: c.id, liked, like_count: c.like_count || 0 };
    });
  }
  async setProfilePhoto(id, buffer) {
    return this.atomic(async () => {
      const user = this.db.users[id];
      if (!user) fail('NOT_FOUND');
      await writeFile(path.join(this.config.dataDir, 'photos', profilePhotoFile(id)), buffer);
      user.profile.photo_updated_at = stamp();
      return user.profile;
    });
  }
  async removeProfilePhoto(id) {
    const profile = await this.atomic(() => {
      const user = this.db.users[id];
      if (!user) fail('NOT_FOUND');
      user.profile.photo_updated_at = null;
      return user.profile;
    });
    await unlink(path.join(this.config.dataDir, 'photos', profilePhotoFile(id))).catch(() => {});
    return profile;
  }
  async profilePhoto(id) {
    await this.queue;
    if (!this.db.users[id]?.profile.photo_updated_at) fail('NOT_FOUND');
    try {
      return {
        buffer: await readFile(path.join(this.config.dataDir, 'photos', profilePhotoFile(id))),
      };
    } catch {
      throw new AppError('PHOTO_UNAVAILABLE', 'Foto belum dapat dimuat.', 503);
    }
  }
  async deleteCollection(id, cid) {
    await this.atomic(() => {
      const c = this.db.collections.find((c) => c.id === cid && c.user_id === id);
      if (!c) fail('NOT_FOUND');
      c.deleted_at ??= stamp();
      this.db.deletions[cid] = { photo_path: c.photo_path };
    });
    try {
      await this.runDeletion(cid);
      return { pending: false };
    } catch {
      return { pending: true };
    }
  }
  async photo(id, cid, isPublic = false) {
    await this.queue;
    const c = this.db.collections.find(
      (c) =>
        c.id === cid &&
        visible(c) &&
        (isPublic ? c.visibility === 'public' && c.latitude != null : c.user_id === id)
    );
    if (!c) fail('NOT_FOUND');
    if (c.photo_path.startsWith('sample:')) return { sample: Number(c.photo_path.split(':')[1]) };
    return { buffer: await readFile(path.join(this.config.dataDir, 'photos', c.photo_path)) };
  }
  async history(id, table, { offset = 0, limit = 20 } = {}) {
    await this.queue;
    if (!['purchases', 'coin_transactions'].includes(table))
      throw new Error('Invalid history table');
    const rows = (table === 'purchases' ? this.db.purchases : this.db.transactions)
      .filter((row) => row.user_id === id)
      .slice()
      .reverse();
    return { items: structuredClone(rows.slice(offset, offset + limit)), total: rows.length };
  }
  async updateProfile(id, data) {
    return this.atomic(() => {
      if (
        data.username &&
        Object.values(this.db.users).some(
          (u) => u.profile.id !== id && u.profile.username === data.username
        )
      )
        throw new AppError('CONFLICT', 'Username sudah digunakan.', 409);
      Object.assign(this.db.users[id].profile, data);
      return this.db.users[id].profile;
    });
  }
  async updatePet(id, patch) {
    return this.atomic(() => {
      Object.assign(this.db.users[id].pet, patch);
      return effectivePet(this.db.users[id].pet);
    });
  }
  async buy(id, productId, key) {
    return this.atomic(() => {
      const prior = this.receipt(id, key, 'purchase', productId);
      if (prior) return { ...prior, replayed: true };
      const p = products.find((p) => p.id === productId);
      if (!p) fail('NOT_FOUND');
      if (p.archived) fail('ARCHIVED_PRODUCT');
      const u = this.db.users[id];
      if (u.profile.coins < p.price) fail('INSUFFICIENT_COINS');
      if (p.category === 'accessory' && u.inventory[p.id] > 0) fail('ALREADY_OWNED');
      u.profile.coins -= p.price;
      u.inventory[p.id] = (u.inventory[p.id] || 0) + 1;
      const result = { product_id: p.id, coins: u.profile.coins };
      this.db.operations[id + key] = { kind: 'purchase', result };
      this.db.transactions.push({
        id: randomUUID(),
        created_at: stamp(),
        user_id: id,
        amount: -p.price,
        request_id: key,
        reason: 'purchase',
      });
      this.db.purchases.push({
        id: randomUUID(),
        created_at: stamp(),
        user_id: id,
        product_id: p.id,
        price: p.price,
        request_id: key,
      });
      return result;
    });
  }
  async use(id, productId, key) {
    if (products.some((product) => product.id === productId && product.category === 'food'))
      return this.atomic(() => this.consumeFood(id, key, productId, 'use'));
    return this.atomic(() => {
      const prior = this.receipt(id, key, 'use', productId);
      if (prior) return { ...prior, replayed: true };
      const u = this.db.users[id],
        p = products.find((p) => p.id === productId && p.category !== 'accessory');
      if (!p) fail('NOT_FOUND');
      if (!(u.inventory[p.id] > 0)) fail('OUT_OF_STOCK');
      u.inventory[p.id]--;
      u.pet = settlePet(u.pet);
      const field = p.category === 'food' ? 'energy' : 'clean';
      u.pet[field] = Math.min(100, u.pet[field] + p.effect);
      const result = { product_id: p.id, quantity: u.inventory[p.id] };
      this.db.operations[id + key] = { kind: 'use', result };
      return result;
    });
  }
  async play(id, key) {
    return this.atomic(() => {
      const prior = this.receipt(id, key, 'play');
      if (prior) return prior;
      const u = this.db.users[id];
      if (Date.now() - Date.parse(u.pet.played_at) < 30000) fail('PLAY_COOLDOWN');
      u.pet = settlePet(u.pet);
      u.pet.happiness = Math.min(100, u.pet.happiness + 15);
      u.pet.played_at = stamp();
      const result = { happiness_added: 15 };
      this.db.operations[id + key] = { kind: 'play', result };
      return result;
    });
  }
  consumeFood(id, key, productId, kind = 'feed') {
    const prior = this.receipt(id, key, kind, productId),
      u = this.db.users[id];
    if (prior)
      return {
        pet: effectivePet(u.pet),
        product_id: prior.product_id,
        quantity: u.inventory[prior.product_id] || 0,
        replayed: true,
        energy_added: 0,
      };
    let product;
    if (productId) {
      product = products.find((item) => item.id === productId && item.category === 'food');
      if (!product) fail('NOT_FOUND');
    } else
      product = products
        .filter((item) => item.category === 'food' && u.inventory[item.id] > 0)
        .sort((a, b) =>
          a.id === 'makanan' ? -1 : b.id === 'makanan' ? 1 : a.id.localeCompare(b.id)
        )[0];
    if (!product || !(u.inventory[product.id] > 0)) fail('FOOD_EMPTY');
    if (u.pet.fed_at && Date.now() - Date.parse(u.pet.fed_at) < 30000) fail('FEED_COOLDOWN');
    u.pet = settlePet(u.pet);
    const previous = u.pet.energy;
    u.inventory[product.id]--;
    u.pet.energy = Math.min(100, previous + product.effect);
    u.pet.fed_at = stamp();
    const result = {
      pet: effectivePet(u.pet),
      product_id: product.id,
      quantity: u.inventory[product.id],
      replayed: false,
      energy_added: u.pet.energy - previous,
    };
    this.db.operations[id + key] = { kind, result };
    return result;
  }
  async feed(id, key, productId) {
    return this.atomic(() => this.consumeFood(id, key, productId));
  }
  async equip(id, productId, equipped) {
    return this.atomic(() => {
      const u = this.db.users[id],
        p = products.find((p) => p.id === productId && p.category === 'accessory');
      if (!p) fail('NOT_FOUND');
      if (!(u.inventory[p.id] > 0)) fail('OUT_OF_STOCK');
      if (equipped) u.equipped[p.slot] = p.id;
      else if (u.equipped[p.slot] === p.id) delete u.equipped[p.slot];
      return { equipped };
    });
  }
  async equipLoadout(id, productIds) {
    return this.atomic(() => {
      const user = this.db.users[id],
        chosen = productIds.map((productId) =>
          products.find(
            (product) =>
              product.id === productId &&
              product.category === 'accessory' &&
              ['head', 'face'].includes(product.slot)
          )
        );
      if (
        chosen.some((product) => !product) ||
        new Set(chosen.map((product) => product.slot)).size !== chosen.length
      )
        fail('INVALID_LOADOUT');
      if (chosen.some((product) => !(user.inventory[product.id] > 0))) fail('OUT_OF_STOCK');
      delete user.equipped.head;
      delete user.equipped.face;
      for (const product of chosen) user.equipped[product.slot] = product.id;
      return {
        equipped: Object.entries(user.equipped).map(([slot, product_id]) => ({ slot, product_id })),
      };
    });
  }
  async cleanup() {
    await this.queue;
    const stats = { deleted: 0, abandoned: 0, failed: 0 };
    for (const cid of Object.keys(this.db.deletions)) {
      try {
        await this.runDeletion(cid);
        stats.deleted++;
      } catch {
        stats.failed++;
      }
    }
    for (const [operation, job] of Object.entries(this.db.uploads)) {
      if (Date.now() - Date.parse(job.touched_at) < 86400000) continue;
      try {
        await this.atomic(async () => {
          const current = this.db.uploads[operation];
          if (
            !current ||
            current.photo_path !== job.photo_path ||
            Date.now() - Date.parse(current.touched_at) < 86400000
          )
            return;
          await unlink(path.join(this.config.dataDir, 'photos', current.photo_path)).catch((e) => {
            if (e.code !== 'ENOENT') throw e;
          });
          delete this.db.uploads[operation];
        });
        stats.abandoned++;
      } catch {
        stats.failed++;
      }
    }
    return stats;
  }
}
