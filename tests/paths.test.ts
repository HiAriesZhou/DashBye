import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appStateDir, chromeProfileDir, itemStateDir, writePrivateFile } from '../src/paths.js';

const itemId = 'a'.repeat(32);

test('uses the platform state directory', () => {
  assert.equal(appStateDir({ platform: 'darwin', home: '/Users/u', env: {} }), '/Users/u/Library/Application Support/DashBye');
  assert.equal(appStateDir({ platform: 'win32', home: 'C:\\Users\\u', env: { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' } }), join('C:\\Users\\u\\AppData\\Local', 'DashBye'));
  assert.equal(appStateDir({ platform: 'linux', home: '/home/u', env: {} }), '/home/u/.local/state/dashbye');
  assert.equal(appStateDir({ platform: 'linux', home: '/home/u', env: { XDG_STATE_HOME: '/state' } }), '/state/dashbye');
});

test('ignores a relative XDG_STATE_HOME', () => {
  assert.equal(appStateDir({ platform: 'linux', home: '/home/u', env: { XDG_STATE_HOME: 'state' } }), '/home/u/.local/state/dashbye');
});

test('keeps the Chrome profile and item state under the state directory without the raw item ID', () => {
  const base = { platform: 'darwin' as const, home: '/Users/u', env: {} };
  assert.equal(chromeProfileDir(base), '/Users/u/Library/Application Support/DashBye/chrome-profile');
  const itemDir = itemStateDir(itemId, base);
  assert.match(itemDir, /^\/Users\/u\/Library\/Application Support\/DashBye\/items\/[0-9a-f]{16}$/);
  assert.equal(itemDir.includes(itemId), false);
});

test('writes private files and creates private directories', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dashbye-paths-'));
  const file = join(root, 'items', 'x', 'plan.json');
  await writePrivateFile(file, '{}\n');
  assert.equal(await readFile(file, 'utf8'), '{}\n');
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.equal((await stat(join(root, 'items', 'x'))).mode & 0o777, 0o700);
});

test('keeps project state under a hash of the config path', async () => {
  const { projectStateDir } = await import('../src/paths.js');
  const dir = projectStateDir('/repo/dashbye.config.yml', { platform: 'darwin', home: '/Users/u', env: {} });
  assert.match(dir, /^\/Users\/u\/Library\/Application Support\/DashBye\/projects\/[0-9a-f]{16}$/);
  assert.equal(dir.includes('repo'), false);
});
