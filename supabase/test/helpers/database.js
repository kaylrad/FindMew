import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
export const USER = '11111111-1111-4111-8111-111111111111';
export const OTHER = '22222222-2222-4222-8222-222222222222';
export async function testDatabase({ beforeMigration } = {}) {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,public to authenticated; grant execute on function auth.uid() to authenticated;
   create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    const folder = new URL('../../migrations/', import.meta.url);
    for (const file of (await readdir(folder)).filter((f) => f.endsWith('.sql')).sort()) {
      await beforeMigration?.(db, file);
      await db.exec(await readFile(new URL(file, folder), 'utf8'));
    }
    await db.exec(await readFile(new URL('../../seed.sql', import.meta.url), 'utf8'));
    await db.query('insert into auth.users values($1,$3),($2,$3)', [
      USER,
      OTHER,
      JSON.stringify({ name: 'Nadia' }),
    ]);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
