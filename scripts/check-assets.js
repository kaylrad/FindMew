import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  folder = path.join(root, 'frontend/public/mymew');
const assets = JSON.parse(await readFile(path.join(folder, 'asset-integrity.json'), 'utf8'));
for (const asset of assets) {
  const bytes = await readFile(path.join(folder, asset.file));
  assert.equal(bytes.length, asset.bytes, asset.file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, asset.file);
}
async function references(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) await references(file);
    else if (/\.(js|jsx|css)$/.test(file)) {
      const text = await readFile(file, 'utf8');
      for (const match of text.matchAll(/\/mymew\/([\w.-]+\.(?:svg|png))/g))
        assert.ok(
          assets.some((asset) => asset.file === match[1]),
          'Missing original asset: ' + match[1]
        );
    }
  }
}
await references(path.join(root, 'frontend/src'));
console.log(assets.length + ' original design assets verified.');
