import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`;
    if (['node_modules', '.vercel'].includes(entry.name)) continue;
    if (entry.isDirectory()) await check(file);
    else if (/\.(m?js)$/.test(file)) {
      const result = spawnSync(process.execPath, ['--check', file], {
        stdio: 'inherit',
      });
      if (result.status !== 0) process.exit(result.status || 1);
    }
  }
}
await check('hosted');
await check('scripts');
console.log('JavaScript syntax checks passed.');
