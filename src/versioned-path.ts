import { readdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { compareVersions } from './stores/firefox/plan.js';

const PLACEHOLDER = '{version}';
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// `release/x-chrome-v{version}.zip` resolves to the matching file with the highest
// version, so the config does not change on every release.
export async function resolveVersionedPath(path: string): Promise<string> {
  if (!path.includes(PLACEHOLDER)) return path;
  const directory = dirname(path);
  const name = basename(path);
  if (directory.includes(PLACEHOLDER)) throw new Error(`{version} is allowed only in the file name: ${path}`);
  const [prefix, suffix] = name.split(PLACEHOLDER) as [string, string];
  const pattern = new RegExp(`^${escape(prefix)}(\\d+(?:\\.\\d+)*)${escape(suffix)}$`);
  const versions = (await readdir(directory).catch(() => [] as string[]))
    .flatMap(file => { const match = pattern.exec(file); return match ? [match[1]!] : []; })
    .sort((left, right) => compareVersions(right, left));
  if (!versions.length) throw new Error(`no file matches ${basename(dirname(path))}/${name}`);
  return join(directory, `${prefix}${versions[0]}${suffix}`);
}
