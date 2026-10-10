import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import YAML from 'yaml';
import { loadProject } from '../src/project.js';
import { validateStores } from '../src/stores/validate.js';

const productId = 'd34f98f5-f9b7-42b1-bebb-98707202b21d';
const pkg = (version: string, extra: Record<string, unknown> = {}) => zipSync({ 'manifest.json': strToU8(JSON.stringify({ manifest_version: 3, name: 'X', version, description: 'X', ...extra })) });

async function fixture(files: Record<string, Uint8Array | string>, targets: Record<string, unknown>) {
  const root = await mkdtemp(join(tmpdir(), 'dashbye-stores-'));
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  const configPath = join(root, 'dashbye.config.yml');
  await writeFile(configPath, YAML.stringify({ schema: 'dashbye/config/v2', targets }));
  return { configPath, setup: await loadProject(configPath) };
}

test('reports each configured package and warns when versions differ', async () => {
  const { configPath, setup } = await fixture(
    { 'dist/edge.zip': pkg('1.2.0'), 'dist/firefox.xpi': pkg('1.1.0', { browser_specific_settings: { gecko: { id: 'x@example.com' } } }) },
    { edge: { artifact: 'dist/edge.zip', productId, language: 'English' }, firefox: { artifact: 'dist/firefox.xpi', addon: 'x' } },
  );
  const result = await validateStores(configPath, setup, setup.stores, {});
  assert.deepEqual(result.packages, { edge: { version: '1.2.0', kind: 'zip' }, firefox: { version: '1.1.0', kind: 'zip' } });
  assert.ok(result.issues.some(issue => issue.code === 'version_mismatch' && issue.severity === 'warning'));
  assert.equal(result.chrome, undefined);
});

test('a missing package is an error for that store only', async () => {
  const { configPath, setup } = await fixture({ 'dist/edge.zip': pkg('1.0.0') }, {
    edge: { artifact: 'dist/edge.zip', productId, language: 'English' },
    firefox: { artifact: 'dist/firefox.xpi', addon: 'x' },
  });
  const result = await validateStores(configPath, setup, setup.stores, {});
  const errors = result.issues.filter(issue => issue.severity === 'error');
  assert.deepEqual([...new Set(errors.map(issue => issue.store))], ['firefox']);
  assert.ok(errors.some(issue => issue.code === 'package_unreadable' && /Firefox package/.test(issue.message)));
});

test('Firefox packages must declare a gecko add-on ID', async () => {
  const { configPath, setup } = await fixture({ 'dist/firefox.xpi': pkg('1.0.0') }, { firefox: { artifact: 'dist/firefox.xpi', addon: 'x' } });
  const result = await validateStores(configPath, setup, setup.stores, {});
  assert.ok(result.issues.some(issue => issue.code === 'missing_gecko_id' && issue.severity === 'error'));
  for (const id of ['', '   ']) {
    await writeFile(setup.targets.firefox!.artifact, pkg('1.0.0', { browser_specific_settings: { gecko: { id } } }));
    const empty = await validateStores(configPath, setup, setup.stores, {});
    assert.ok(empty.issues.some(issue => issue.code === 'missing_gecko_id' && issue.severity === 'error'));
  }
});

test('hints at packages for stores that are not configured', async () => {
  const { configPath, setup } = await fixture(
    { 'dist/edge.zip': pkg('1.0.0'), 'web-ext-artifacts/x.xpi': pkg('1.0.0', { browser_specific_settings: { gecko: { id: 'x@example.com' } } }) },
    { edge: { artifact: 'dist/edge.zip', productId, language: 'English' } },
  );
  const result = await validateStores(configPath, setup, setup.stores, {});
  assert.deepEqual(result.hints, ['Found a Firefox Add-ons package (web-ext-artifacts/x.xpi), but that store is not configured; run dashbye init to change stores.']);
});
