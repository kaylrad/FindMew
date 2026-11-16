import { readFile, access } from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const root = 'frontend/dist/';
const manifest = JSON.parse(await readFile(root + 'manifest.webmanifest', 'utf8'));
assert.equal(manifest.name, 'FindMew');
assert.equal(manifest.short_name, 'FindMew');
assert.equal(manifest.start_url, '/');
assert.equal(manifest.display, 'standalone');
assert.ok(manifest.theme_color && manifest.background_color);
for (const size of [192, 512]) {
  const icon = manifest.icons.find((i) => i.sizes === `${size}x${size}` && i.purpose === 'any');
  assert.ok(icon);
  const metadata = await sharp(root + icon.src.replace(/^\//, '')).metadata();
  assert.equal(metadata.width, size);
  assert.equal(metadata.height, size);
}
assert.ok(manifest.icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512'));
const sw = await readFile(root + 'sw.js', 'utf8');
assert.match(sw, /index\.html/);
assert.match(sw, /NavigationRoute/);
assert.match(sw, /SKIP_WAITING/);
assert.ok(!/url:["'][^"']*(?:\/api\/|auth\/v1|access_token)/.test(sw));
const html = await readFile(root + 'index.html', 'utf8');
assert.match(html, /rel="manifest"/);
assert.match(html, /apple-touch-icon/);
await access(root + 'icons/maskable-512.png');
console.log(
  'PWA verified: manifest, icon dimensions, maskable, shell precache, navigation fallback, update message, no API/Auth precache.'
);
