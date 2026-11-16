import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
async function check(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const file = new URL(entry.name + (entry.isDirectory() ? '/' : ''), folder);
    if (entry.isDirectory()) await check(file);
    else if (entry.name.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', fileURLToPath(file)], {
        encoding: 'utf8',
      });
      if (result.status !== 0) {
        process.stderr.write(result.stderr || String(result.error));
        process.exit(1);
      }
    }
  }
}
await check(new URL('../src/', import.meta.url));
console.log('All backend JavaScript files passed syntax checks.');
