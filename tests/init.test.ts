import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { guideInitialization, initialize } from '../src/init.js';

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

test('agent init returns one structured question without writing files', async () => {
  const project = await mkdtemp(join(tmpdir(), 'dashbye-agent-init-'));
  const result = await guideInitialization({ overwrite: false });
  assert.equal(result.status, 'needs_input');
  if (result.status !== 'needs_input') return;
  assert.equal(result.question.field, 'project');
  assert.equal(result.question.kind, 'path');
  assert.equal(await readFile(join(project, 'dashbye.config.yml'), 'utf8').catch(() => null), null);
});

test('agent init returns a ready preview and non-interactive write command', async () => {
  const project = await mkdtemp(join(tmpdir(), 'dashbye-agent-ready-'));
  await writeFile(join(project, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Example', version: '1.0.0' }));
  const result = await guideInitialization({
    project, artifact: 'manifest.json', resources: 'store', itemId: 'a'.repeat(32), language: 'English',
    endpoint: 'http://127.0.0.1:9333', overwrite: false,
  });
  assert.equal(result.status, 'ready');
  if (result.status !== 'ready') return;
  assert.equal(result.preview.configPath, join(project, 'dashbye.config.yml'));
  assert.deepEqual(result.writeCommand.slice(0, 2), ['dashbye', 'init']);
  assert.ok(result.writeCommand.includes('--non-interactive'));
  assert.equal(await readFile(join(project, 'dashbye.config.yml'), 'utf8').catch(() => null), null);
});

test('agent init recommends an existing configuration before asking again', async () => {
  const project = await mkdtemp(join(tmpdir(), 'dashbye-agent-existing-'));
  const configPath = join(project, 'dashbye.config.yml');
  await writeFile(configPath, 'schema: dashbye/config/v1\n');
  const result = await guideInitialization({ project, overwrite: false });
  assert.equal(result.status, 'existing_config');
  if (result.status !== 'existing_config') return;
  assert.equal(result.configPath, configPath);
  assert.equal(result.question.field, 'existingConfig');
  assert.deepEqual(result.actions.useExisting.slice(0, 2), ['dashbye', 'validate']);
  assert.deepEqual(result.actions.reconfigureWith, ['--overwrite']);
});
