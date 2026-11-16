import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../errors.js';
import { DEMO_USER } from '../services/demo.js';
import { asyncRoute } from '../validation.js';
const claimsSchema = z
  .object({ sub: z.string().uuid(), exp: z.number().int().positive() })
  .strict();
const expired = () => new AppError('SESSION_EXPIRED', 'Sesimu berakhir. Silakan masuk lagi.', 401);
const unavailable = () =>
  new AppError(
    'AUTH_UNAVAILABLE',
    'Layanan masuk sedang terganggu. Sesi tetap tersimpan; coba lagi sebentar.',
    503,
    { retryAfter: 10 }
  );
export function createAuthentication(config, store) {
  const secret = config.secret || randomBytes(48).toString('hex');
  const sign = (payload) => createHmac('sha256', secret).update(payload).digest('base64url');
  const issueDemoToken = (id = DEMO_USER) => {
    const payload = Buffer.from(JSON.stringify({ sub: id, exp: Date.now() + 86400000 })).toString(
      'base64url'
    );
    return `${payload}.${sign(payload)}`;
  };
  const authenticate = asyncRoute(async (req, res, next) => {
    const token = req.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token || token.length > 16384)
      throw new AppError('UNAUTHORIZED', 'Silakan masuk untuk melanjutkan.', 401);
    let user;
    if (config.demo) {
      try {
        const [payload, signature, ...extra] = token.split('.'),
          expected = sign(payload);
        if (
          extra.length ||
          !signature ||
          Buffer.byteLength(signature) !== Buffer.byteLength(expected) ||
          !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
        )
          throw expired();
        const claims = claimsSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString()));
        if (claims.exp <= Date.now()) throw expired();
        user = { id: claims.sub };
      } catch {
        throw expired();
      }
    } else {
      let result;
      try {
        result = await store.client.auth.getUser(token);
      } catch {
        throw unavailable();
      }
      const { data, error } = result;
      if (error) {
        if (
          error.name === 'AuthRetryableFetchError' ||
          !error.status ||
          error.status >= 500 ||
          error.status === 429
        )
          throw unavailable();
        if ([400, 401, 403, 404].includes(error.status)) throw expired();
        throw unavailable();
      }
      if (!data?.user || !z.string().uuid().safeParse(data.user.id).success) throw expired();
      user = data.user;
    }
    req.user = user;
    await store.ensureUser(user.id, user.user_metadata?.name);
    next();
  });
  return { authenticate, issueDemoToken };
}
