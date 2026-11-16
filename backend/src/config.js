import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(backendRoot, '.env') });
function integer(value, fallback, min, max, name) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max)
    throw new Error(`${name} harus berupa bilangan bulat ${min}–${max}.`);
  return parsed;
}
export function configuration(env = process.env) {
  if (env.DEMO_MODE != null && !['true', 'false'].includes(env.DEMO_MODE))
    throw new Error('DEMO_MODE harus true atau false.');
  const serverless = env.VERCEL === '1';
  const production = env.NODE_ENV === 'production' || serverless;
  const anonKey = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY,
    serviceKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const hasSupabase = Boolean(env.SUPABASE_URL || anonKey || serviceKey);
  const demo =
    env.DEMO_MODE === 'true' || (!production && !hasSupabase && env.DEMO_MODE !== 'false');
  if (!demo && (!env.SUPABASE_URL || !serviceKey || !anonKey))
    throw new Error(
      'Isi SUPABASE_URL, publishable/anon key, dan secret/service-role key di backend/.env.'
    );
  if (serverless && demo) throw new Error('Vercel memerlukan konfigurasi Supabase.');
  if (env.CRON_SECRET && env.CRON_SECRET.length < 32)
    throw new Error('CRON_SECRET minimal 32 karakter.');
  if (demo && production && (env.DEMO_TOKEN_SECRET?.length ?? 0) < 32)
    throw new Error('Production demo requires DEMO_TOKEN_SECRET with at least 32 characters.');
  const reward = Number(env.COLLECTION_REWARD || 10);
  if (!Number.isInteger(reward) || reward < 0 || reward > 10000)
    throw new Error('COLLECTION_REWARD must be an integer between 0 and 10000.');
  if (env.SUPABASE_URL) {
    const url = new URL(env.SUPABASE_URL);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      throw new Error('SUPABASE_URL harus berupa origin HTTP/HTTPS yang valid.');
  }
  const platformOrigins = serverless
    ? [env.VERCEL_URL, env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_BRANCH_URL]
        .filter(Boolean)
        .map((host) => 'https://' + host)
    : [];
  if (production && !env.APP_ORIGINS && !platformOrigins.length)
    throw new Error('APP_ORIGINS wajib diisi pada production.');
  const defaults = production
    ? ''
    : 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3001,http://127.0.0.1:3001';
  const origins = [
    ...new Set([
      ...(env.APP_ORIGINS ?? defaults)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      ...platformOrigins,
    ]),
  ];
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin)
      throw new Error('APP_ORIGINS harus berupa origin HTTP/HTTPS tanpa path atau trailing slash.');
  }
  const feedingBonusReward = integer(env.FEEDING_BONUS_REWARD, 5, 0, 10000, 'FEEDING_BONUS_REWARD');
  return {
    demo,
    production,
    serverless,
    reward,
    feedingBonusReward,
    origins,
    cronSecret: env.CRON_SECRET,
    maxPhotoBytes: 4 * 1024 * 1024,
    port: integer(env.PORT, 3001, 1, 65535, 'PORT'),
    trustProxyHops: integer(env.TRUST_PROXY_HOPS, serverless ? 1 : 0, 0, 10, 'TRUST_PROXY_HOPS'),
    apiRateLimit: integer(env.API_RATE_LIMIT, 180, 1, 10000, 'API_RATE_LIMIT'),
    uploadRateLimit: integer(env.UPLOAD_RATE_LIMIT, 12, 1, 1000, 'UPLOAD_RATE_LIMIT'),
    maxUploads: integer(env.MAX_CONCURRENT_UPLOADS, 2, 1, 8, 'MAX_CONCURRENT_UPLOADS'),
    url: env.SUPABASE_URL,
    anonKey,
    serviceKey,
    bucket: env.SUPABASE_STORAGE_BUCKET || 'cat-photos',
    secret: env.DEMO_TOKEN_SECRET,
    dataDir: env.DEMO_DATA_DIR || path.join(backendRoot, '.data'),
  };
}
