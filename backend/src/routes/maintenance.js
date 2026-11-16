import { timingSafeEqual } from 'node:crypto';
import { AppError } from '../errors.js';
import { asyncRoute } from '../validation.js';

export function maintenanceRoute(store, secret) {
  return asyncRoute(async (req, res) => {
    const expected = Buffer.from('Bearer ' + (secret || ''));
    const supplied = Buffer.from(req.get('Authorization') || '');
    if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new AppError('UNAUTHORIZED', 'Akses tidak diizinkan.', 401);
    }
    res.json({ ok: true, ...(await store.cleanup()) });
  });
}
