import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { strToU8, zipSync } from 'fflate';
import YAML from 'yaml';
import { guideInitialization, initialize } from '../src/init.js';

const itemId = 'a'.repeat(32);
const productId = 'd34f98f5-f9b7-42b1-bebb-98707202b21d';
const manifest = (extra: Record<string, unknown> = {}) => JSON.stringify({ manifest_version: 3, name: 'Example', version: '1.0.0', description: 'Example', ...extra });

function options(project: string) {
  return {
    project, artifact: 'release.zip', resources: 'store', itemId, language: 'English',
    endpoint: 'http://127.0.0.1:9333', nonInteractive: true, overwrite: false,
  } as const;
}

async function project(files: Record<string, string | Uint8Array> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dashbye-init-'));
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

const readConfig = async (root: string) => YAML.parse(await readFile(join(root, 'dashbye.config.yml'), 'utf8'));

test('creates a v2 config and release templates once; Chrome flags imply Chrome only', async () => {
  const root = await project({ 'release.zip': zipSync({ 'manifest.json': strToU8(manifest()) }) });
  const first = await initialize(options(root));
  assert.equal(first.createdTemplates, true);
  const config = await readConfig(root);
  assert.equal(config.schema, 'dashbye/config/v2');
  assert.deepEqual(Object.keys(config.targets), ['chrome']);
  assert.match(await readFile(join(root, 'store/release.yml'), 'utf8'), /dashbye\/release\/v1/);
  await writeFile(join(root, 'store/listing/description.txt'), 'Owner copy\n');
  const second = await initialize(options(root));
  assert.equal(second.createdTemplates, false);
  assert.equal(await readFile(join(root, 'store/listing/description.txt'), 'utf8'), 'Owner copy\n');
});

test('agent init returns one structured question without writing files', async () => {
  const result = await guideInitialization({ overwrite: false });
  assert.equal(result.status, 'needs_input');
  if (result.status !== 'needs_input') return;
  assert.equal(result.question.field, 'project');
  assert.equal(result.question.flag, '--project');
});

test('agent init asks which stores to manage, defaulting to detected ones', async () => {
  const root = await project({
    'release.zip': zipSync({ 'manifest.json': strToU8(manifest()) }),
    'web-ext-artifacts/example.xpi': zipSync({ 'manifest.json': strToU8(manifest({ browser_specific_settings: { gecko: { id: 'x@example.com' } } })) }),
  });
  const result = await guideInitialization({ project: root, overwrite: false });
  assert.equal(result.status, 'needs_input');
  if (result.status !== 'needs_input') return;
  assert.equal(result.question.field, 'stores');
  assert.equal(result.question.kind, 'multi-choice');
  assert.equal(result.question.flag, '--stores');
  assert.equal(result.question.default, 'chrome,firefox');
  assert.deepEqual(result.question.choices?.map(choice => choice.value), ['chrome', 'edge', 'firefox']);
});

test('agent init asks only for the selected store, then previews a one-target config', async () => {
  const root = await project({ 'web-ext-artifacts/example.xpi': zipSync({ 'manifest.json': strToU8(manifest()) }) });
  const first = await guideInitialization({ project: root, stores: 'firefox', overwrite: false });
  assert.equal(first.status === 'needs_input' && first.question.field, 'firefoxArtifact');
  assert.deepEqual(first.status === 'needs_input' && first.question.choices?.map(choice => choice.value), ['web-ext-artifacts/example.xpi']);
  const second = await guideInitialization({ project: root, stores: 'firefox', firefoxArtifact: 'web-ext-artifacts/example.xpi', overwrite: false });
  assert.equal(second.status === 'needs_input' && second.question.field, 'firefoxAddon');
  const ready = await guideInitialization({ project: root, stores: 'firefox', firefoxArtifact: 'web-ext-artifacts/example.xpi', firefoxAddon: 'example', resources: 'store', overwrite: false });
  assert.equal(ready.status, 'ready');
  if (ready.status !== 'ready') return;
  assert.deepEqual(Object.keys(ready.preview.config.targets as object), ['firefox']);
  assert.ok(ready.writeCommand.includes('--stores'));
  assert.ok(!ready.writeCommand.includes('--endpoint'));
});

test('agent init reports invalid store IDs with the question', async () => {
  const root = await project({ 'release.zip': zipSync({ 'manifest.json': strToU8(manifest()) }) });
  const result = await guideInitialization({ project: root, stores: 'edge', edgeArtifact: 'release.zip', edgeProductId: 'nope', overwrite: false });
  assert.equal(result.status, 'needs_input');
  if (result.status !== 'needs_input') return;
  assert.equal(result.question.field, 'edgeProductId');
  assert.match(result.question.error ?? '', /Edge product ID/);
});

test('agent init offers use, change stores, or reconfigure for an existing config', async () => {
  const root = await project({ 'release.zip': zipSync({ 'manifest.json': strToU8(manifest()) }) });
  await initialize(options(root));
  const result = await guideInitialization({ project: root, overwrite: false });
  assert.equal(result.status, 'existing_config');
  if (result.status !== 'existing_config') return;
  assert.deepEqual(result.configuredStores, ['chrome']);
  assert.deepEqual(result.actions.useExisting.slice(0, 2), ['dashbye', 'validate']);
  assert.deepEqual(result.actions.changeStoresWith, ['--stores', '<comma-separated stores>']);
  assert.deepEqual(result.actions.reconfigureWith, ['--overwrite']);
});

test('changing stores keeps existing targets and asks only for the new store', async () => {
  const root = await project({
    'release.zip': zipSync({ 'manifest.json': strToU8(manifest()) }),
  });
  await initialize(options(root));
  const question = await guideInitialization({ project: root, stores: 'chrome,edge', overwrite: false });
  assert.equal(question.status === 'needs_input' && question.question.field, 'edgeArtifact');
  const ready = await guideInitialization({ project: root, stores: 'chrome,edge', edgeArtifact: 'release.zip', edgeProductId: productId, edgeLanguage: 'English', overwrite: false });
  assert.equal(ready.status, 'ready');
  if (ready.status !== 'ready') return;
  await initialize({ ...ready.options, nonInteractive: true });
  const config = await readConfig(root);
  assert.deepEqual(Object.keys(config.targets), ['chrome', 'edge']);
  assert.equal(config.targets.chrome.itemId, itemId);
  assert.equal(config.targets.edge.productId, productId);
});

test('changing stores can remove a store without asking anything', async () => {
  const root = await project({ 'release.zip': zipSync({ 'manifest.json': strToU8(manifest()) }) });
  await initialize({ ...options(root), stores: 'chrome,edge', edgeArtifact: 'release.zip', edgeProductId: productId, edgeLanguage: 'English' });
  await initialize({ project: root, stores: 'edge', nonInteractive: true, overwrite: false });
  assert.deepEqual(Object.keys((await readConfig(root)).targets), ['edge']);
});

test('a Firefox target adds a stores.firefox block to a new release template', async () => {
  const root = await project({ 'web-ext-artifacts/x.xpi': zipSync({ 'manifest.json': strToU8(manifest()) }) });
  await initialize({ project: root, stores: 'firefox', firefoxArtifact: 'web-ext-artifacts/x.xpi', firefoxAddon: 'x', resources: 'store', nonInteractive: true, overwrite: false });
  const release = YAML.parse(await readFile(join(root, 'store/release.yml'), 'utf8'));
  assert.match(release.stores.firefox.summary, /AMO SUMMARY/);
});
