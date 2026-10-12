import { chmod, readFile } from 'node:fs/promises';

// tsc writes files as 0644 and clean.mjs removes dist/, so an `npm link`ed
// command would stop being executable after every build.
const root = new URL('../', import.meta.url);
const { bin } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
for (const path of Object.values(typeof bin === 'string' ? { bin } : bin ?? {})) {
  await chmod(new URL(path, root), 0o755);
}
