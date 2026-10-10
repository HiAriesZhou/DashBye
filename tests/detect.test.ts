import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { detectStores } from '../src/stores/detect.js';

const manifest = (extra: Record<string, unknown> = {}) => JSON.stringify({ manifest_version: 3, name: 'Fixture', version: '1.0.0', description: 'Fixture', ...extra });
const gecko = { browser_specific_settings: { gecko: { id: 'fixture@example.com' } } };

async function repo(files: Record<string, string | Uint8Array>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dashbye-detect-'));
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

const zip = (manifestJson: string) => zipSync({ 'manifest.json': strToU8(manifestJson) });

test('a plain zip suggests Chrome and offers it to Edge, without assuming Firefox', async () => {
  const root = await repo({ 'dist/release.zip': zip(manifest()) });
  const result = await detectStores(root);
  assert.deepEqual(result.suggested, ['chrome']);
  assert.deepEqual(result.stores.chrome.artifacts, ['dist/release.zip']);
  assert.deepEqual(result.stores.edge.artifacts, ['dist/release.zip']);
  assert.deepEqual(result.stores.firefox.artifacts, []);
});

test('web-ext and WXT layouts suggest the stores they build for', async () => {
  const root = await repo({
    'web-ext-artifacts/fixture-1.0.0.xpi': zip(manifest(gecko)),
    '.output/chrome-mv3.zip': zip(manifest()),
    '.output/edge-mv3.zip': zip(manifest()),
  });
  const result = await detectStores(root);
  assert.deepEqual(result.suggested, ['chrome', 'edge', 'firefox']);
  assert.deepEqual(result.stores.firefox.artifacts, ['web-ext-artifacts/fixture-1.0.0.xpi']);
  assert.deepEqual(result.stores.edge.artifacts, ['.output/edge-mv3.zip']);
  assert.ok(result.stores.firefox.evidence.some(line => /gecko/.test(line)));
});

test('a build directory with a gecko manifest counts as a Firefox package', async () => {
  const root = await repo({ 'dist/firefox/manifest.json': manifest(gecko), 'dist/chrome/manifest.json': manifest() });
  const result = await detectStores(root);
  assert.deepEqual(result.stores.firefox.artifacts, ['dist/firefox']);
  assert.deepEqual(result.stores.chrome.artifacts, ['dist/chrome']);
});

test('package scripts and store links are evidence and ID hints', async () => {
  const root = await repo({
    'package.json': JSON.stringify({ scripts: { 'build:firefox': 'wxt zip -b firefox', 'zip:edge': 'plasmo package --target=edge-mv3' } }),
    'README.md': 'Install from https://chromewebstore.google.com/detail/x-toc/abcdefghijklmnopabcdefghijklmnop or https://addons.mozilla.org/en-US/firefox/addon/x-toc/',
  });
  const result = await detectStores(root);
  assert.deepEqual(result.suggested, ['chrome', 'edge', 'firefox']);
  assert.equal(result.stores.chrome.idHint, 'abcdefghijklmnopabcdefghijklmnop');
  assert.equal(result.stores.firefox.idHint, 'x-toc');
  assert.ok(result.stores.edge.evidence.some(line => /zip:edge/.test(line)));
});

test('an empty repository falls back to Chrome only', async () => {
  const root = await repo({ 'src/index.ts': '' });
  const result = await detectStores(root);
  assert.deepEqual(result.suggested, ['chrome']);
  assert.deepEqual(result.stores.chrome.evidence, []);
});

test('unreadable packages are ignored rather than failing detection', async () => {
  const root = await repo({ 'dist/broken.zip': 'not a zip', 'dist/firefox.xpi': zip(manifest(gecko)) });
  const result = await detectStores(root);
  assert.deepEqual(result.stores.firefox.artifacts, ['dist/firefox.xpi']);
  assert.deepEqual(result.stores.chrome.artifacts, []);
});

test('test scripts are not evidence; build and packaging scripts are', async () => {
  const root = await repo({
    'package.json': JSON.stringify({ scripts: { 'test:e2e:extension': 'playwright test --project=chrome', 'build:chrome': 'vite build --mode chrome' } }),
  });
  const result = await detectStores(root);
  assert.deepEqual(result.stores.chrome.evidence, ['package.json script "build:chrome"']);
});
