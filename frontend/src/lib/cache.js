import { createStore, get, set, del, clear } from 'idb-keyval';
const db = createStore('findmew-private', 'data');
let generation = 0;
export const cacheGeneration = () => generation;
export async function readSnapshot(uid) {
  try {
    return await get(`snapshot:${uid}`, db);
  } catch {
    return null;
  }
}
export async function writeSnapshot(uid, data, expected) {
  if (expected !== generation) return;
  try {
    await set(`snapshot:${uid}`, { ...data, savedAt: new Date().toISOString() }, db);
    if (expected !== generation) await clear(db);
  } catch {
    /* Private browsing/storage quota: online app remains usable. */
  }
}
export async function readPhoto(uid, id) {
  try {
    return await get(`photo:${uid}:${id}`, db);
  } catch {
    return null;
  }
}
export async function writePhoto(uid, id, blob, expected) {
  if (expected !== generation) return;
  try {
    await set(`photo:${uid}:${id}`, blob, db);
    if (expected !== generation) await clear(db);
  } catch {}
}
export async function clearPrivateData() {
  generation++;
  try {
    await clear(db);
  } catch {}
  sessionStorage.removeItem('findmew-demo');
  localStorage.removeItem('findmew-demo');
  localStorage.removeItem('findmew-auth');
  localStorage.removeItem('findmew-auth-code-verifier');
  localStorage.removeItem('findmew-last-user');
}
export async function deletePhoto(uid, id) {
  try {
    await del(`photo:${uid}:${id}`, db);
  } catch {}
}
