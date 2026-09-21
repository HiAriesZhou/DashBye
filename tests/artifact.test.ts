import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { strToU8, zipSync } from 'fflate';
import { loadArtifact, normalizeManifest } from '../src/artifact.js';
import { sha256 } from '../src/hash.js';

const manifest = {
  manifest_version: 3,
  name: 'Fixture',
  version: '1.2.3',
  description: 'Test fixture',
  permissions: ['storage', 'activeTab', 'storage'],
  optional_permissions: ['contextMenus'],
  host_permissions: ['https://example.com/*'],
  content_scripts: [
    { matches: ['https://example.com/*', 'https://www.example.com/*'] },
    { matches: ['https://example.com/*'] },
  ],
};

test('normalizes permission and host facts from a manifest', () => {
  const facts = normalizeManifest(manifest);
  assert.deepEqual(facts.permissions, ['activeTab', 'storage']);
  assert.deepEqual(facts.optionalPermissions, ['contextMenus']);
  assert.deepEqual(facts.hostPermissions, ['https://example.com/*']);
  assert.deepEqual(facts.contentScriptMatches, ['https://example.com/*', 'https://www.example.com/*']);
});

test('loads and fingerprints a root-manifest ZIP artifact', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dashbye-artifact-'));
  const bytes = zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), 'index.js': strToU8('') });
  const path = join(directory, 'release.zip');
  await writeFile(path, bytes);
  const artifact = await loadArtifact(path);
  assert.equal(artifact.kind, 'zip');
  assert.equal(artifact.manifest.version, '1.2.3');
  assert.equal(artifact.sha256, sha256(bytes));
});

test('rejects ZIP artifacts without a root manifest', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dashbye-artifact-'));
  const path = join(directory, 'release.zip');
  await writeFile(path, zipSync({ 'dist/manifest.json': strToU8(JSON.stringify(manifest)) }));
  await assert.rejects(loadArtifact(path), /root manifest\.json/);
});
