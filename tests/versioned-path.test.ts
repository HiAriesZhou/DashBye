import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveVersionedPath } from '../src/versioned-path.js';

async function release(files: string[]) {
  const root = await mkdtemp(join(tmpdir(), 'dashbye-ver-'));
  await mkdir(join(root, 'release'));
  for (const file of files) await writeFile(join(root, 'release', file), '');
  return root;
}

test('a path without {version} is returned unchanged', async () => {
  assert.equal(await resolveVersionedPath('/x/release/a.zip'), '/x/release/a.zip');
});

test('picks the highest version that matches the pattern', async () => {
  const root = await release(['x-chrome-v0.7.0.zip', 'x-chrome-v0.10.0.zip', 'x-chrome-v0.9.2.zip', 'x-edge-v1.0.0.zip', 'x-chrome-vbad.zip']);
  assert.equal(await resolveVersionedPath(join(root, 'release/x-chrome-v{version}.zip')), join(root, 'release/x-chrome-v0.10.0.zip'));
});

test('names the pattern when nothing matches', async () => {
  const root = await release(['x-edge-v1.0.0.zip']);
  await assert.rejects(resolveVersionedPath(join(root, 'release/x-chrome-v{version}.zip')), /no file matches release\/x-chrome-v\{version\}\.zip|no file matches x-chrome-v\{version\}\.zip/);
});

test('{version} is allowed only in the file name', async () => {
  await assert.rejects(resolveVersionedPath('/x/v{version}/a.zip'), /only in the file name/);
});
