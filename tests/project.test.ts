import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import YAML from 'yaml';
import { loadProject, serializeConfig } from '../src/project.js';
import { assertEdgeProductId, assertFirefoxAddon } from '../src/security.js';

const itemId = 'a'.repeat(32);
const productId = 'd34f98f5-f9b7-42b1-bebb-98707202b21d';

async function config(contents: unknown): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dashbye-project-'));
  const path = join(root, 'dashbye.config.yml');
  await writeFile(path, YAML.stringify(contents));
  return path;
}

test('loads a v1 config as a Chrome-only project', async () => {
  const path = await config({ schema: 'dashbye/config/v1', project: '.', artifact: 'release.zip', resources: 'store', target: { itemId, language: 'English', endpoint: 'http://127.0.0.1:9333' } });
  const project = await loadProject(path);
  assert.deepEqual(project.stores, ['chrome']);
  assert.equal(project.endpoint, 'http://127.0.0.1:9333');
  assert.deepEqual(project.targets.chrome, { artifact: join(project.project, 'release.zip'), itemId, language: 'English' });
});

test('loads only the stores listed in a v2 config, in canonical order', async () => {
  const path = await config({
    schema: 'dashbye/config/v2', project: '.', resources: 'store', browser: { endpoint: 'http://127.0.0.1:9444' },
    targets: { firefox: { artifact: 'web-ext-artifacts/x.xpi', addon: 'x-toc' }, chrome: { artifact: 'dist/chrome.zip', itemId, language: 'English' } },
  });
  const project = await loadProject(path);
  assert.deepEqual(project.stores, ['chrome', 'firefox']);
  assert.equal(project.targets.edge, undefined);
  assert.equal(project.targets.firefox?.addon, 'x-toc');
  assert.equal(project.endpoint, 'http://127.0.0.1:9444');
});

test('rejects a v2 config without targets or with invalid IDs', async () => {
  await assert.rejects(loadProject(await config({ schema: 'dashbye/config/v2', targets: {} })), /at least one store/);
  await assert.rejects(loadProject(await config({ schema: 'dashbye/config/v2', targets: { opera: { artifact: 'x.zip' } } })), /unknown store: opera/);
  await assert.rejects(loadProject(await config({ schema: 'dashbye/config/v2', targets: { edge: { artifact: 'x.zip', productId: 'nope', language: 'English' } } })), /Edge product ID/);
});

test('serializes a v2 config with paths relative to the config', async () => {
  const path = await config({ schema: 'dashbye/config/v2', targets: { edge: { artifact: 'dist/edge.zip', productId, language: 'English' } } });
  const project = await loadProject(path);
  assert.deepEqual(serializeConfig(project, path), {
    schema: 'dashbye/config/v2', project: '.', resources: 'store', browser: { endpoint: 'http://127.0.0.1:9333' },
    targets: { edge: { artifact: 'dist/edge.zip', productId, language: 'English' } },
  });
});

test('validates store IDs', () => {
  assert.equal(assertEdgeProductId(productId.toUpperCase()), productId);
  assert.throws(() => assertEdgeProductId('abc'), /Edge product ID/);
  for (const value of ['x-toc', '{8a5b2f4e-1c3d-4e5f-9a8b-7c6d5e4f3a2b}', 'fixture@example.com', '1234567']) assert.equal(assertFirefoxAddon(value), value);
  assert.throws(() => assertFirefoxAddon('has space'), /Firefox add-on/);
});
