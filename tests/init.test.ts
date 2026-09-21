import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initialize } from '../src/init.js';

function options(project: string) {
  return {
    project, artifact: 'release.zip', resources: 'store', itemId: 'a'.repeat(32), language: 'English',
    endpoint: 'http://127.0.0.1:9333', nonInteractive: true, overwrite: false,
  } as const;
}

test('creates project config and release templates once', async () => {
  const project = await mkdtemp(join(tmpdir(), 'dashbye-init-'));
  const first = await initialize(options(project));
  assert.equal(first.createdTemplates, true);
  assert.match(await readFile(join(project, 'dashbye.config.yml'), 'utf8'), /dashbye\/config\/v1/);
  assert.match(await readFile(join(project, 'store/release.yml'), 'utf8'), /dashbye\/release\/v1/);
  await writeFile(join(project, 'store/listing/description.txt'), 'Owner copy\n');
  const second = await initialize(options(project));
  assert.equal(second.createdTemplates, false);
  assert.equal(await readFile(join(project, 'store/listing/description.txt'), 'utf8'), 'Owner copy\n');
});
