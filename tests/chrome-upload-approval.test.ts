import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Page } from 'playwright-core';
import { strToU8, zipSync } from 'fflate';
import sharp from 'sharp';
import YAML from 'yaml';
import { applyReconciliationPlan } from '../src/dashboard-v2.js';
import { prepareApprovedUploads } from '../src/approved-uploads.js';
import { sha256 } from '../src/hash.js';
import { UNLOCKED } from '../src/edit-lock.js';
import { createDesiredState, createReconciliationPlan } from '../src/reconcile.js';
import { loadWorkspace } from '../src/workspace.js';

const zip = (code: string) => zipSync({
  'manifest.json': strToU8(JSON.stringify({ manifest_version: 3, name: 'Fixture', version: '1.2.0', description: 'Fixture' })),
  'index.js': strToU8(code),
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dashbye-approved-upload-'));
  const files: Record<string, string | Uint8Array> = {
    'release.zip': zip('approved'),
    'store/description.txt': 'Approved description',
    'store/icon.png': await sharp({ create: { width: 128, height: 128, channels: 3, background: '#336699' } }).png().toBuffer(),
    'store/release.yml': YAML.stringify({
      schema: 'dashbye/release/v1',
      listing: { defaultLanguage: 'English', category: 'Tools', locales: { English: { description: 'description.txt', screenshots: [] } }, assets: { icon: 'icon.png' }, matureContent: false },
      privacy: { singlePurpose: 'Fixture', permissionJustifications: {}, hostPermissionJustification: null, remoteCode: { uses: false, justification: null }, collectedData: [], certifications: { noSaleOrTransfer: true, relatedToSinglePurpose: true, noCreditworthinessUse: true }, policyUrl: 'https://example.com/privacy' },
    }),
    'dashbye.config.yml': YAML.stringify({ schema: 'dashbye/config/v2', targets: { chrome: { artifact: 'release.zip', itemId: 'a'.repeat(32), language: 'English' } } }),
  };
  for (const [file, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), content);
  }
  const workspace = await loadWorkspace(join(root, 'dashbye.config.yml'));
  const desired = await createDesiredState(workspace);
  const remote = { itemId: desired.itemId, packageVersion: '1.1.0', listing: { ...desired.listing, iconVisualHash: null }, privacy: desired.privacy, editLock: UNLOCKED };
  const plan = createReconciliationPlan(workspace, desired, remote);
  return { root, workspace, desired, plan };
}

for (const changed of ['package', 'artwork', 'description'] as const) {
  test(`Chrome rejects ${changed} drift after preparation before touching the Dashboard`, async () => {
    const { root, workspace, desired, plan } = await fixture();
    if (changed === 'package') await writeFile(join(root, 'release.zip'), zip('unapproved rebuild with the same version'));
    if (changed === 'artwork') await writeFile(join(root, 'store/icon.png'), await sharp({ create: { width: 128, height: 128, channels: 3, background: '#993333' } }).png().toBuffer());
    if (changed === 'description') await writeFile(join(root, 'store/description.txt'), 'Changed after approval');
    let touched = false;
    const page = new Proxy({}, { get() { touched = true; throw new Error('Dashboard reached before input validation'); } }) as Page;
    await assert.rejects(applyReconciliationPlan(page, workspace, desired, plan), /changed after approval/);
    assert.equal(touched, false);
  });
}

test('Chrome upload payloads retain the checked package and image bytes after a rebuild', async () => {
  const { root, workspace, desired, plan } = await fixture();
  const uploads = await prepareApprovedUploads(workspace, desired, plan);
  assert.equal(uploads.package?.name, 'release.zip');
  assert.equal(uploads.package?.mimeType, 'application/zip');
  assert.equal(sha256(uploads.package!.buffer), plan.artifactSha256);
  const iconHash = workspace.release.resourceHashes[join(root, 'store/icon.png')];
  assert.equal(sha256(uploads.listing.icon.buffer), iconHash);
  await writeFile(join(root, 'release.zip'), zip('later rebuild'));
  await writeFile(join(root, 'store/icon.png'), new Uint8Array([1, 2, 3]));
  assert.equal(sha256(uploads.package!.buffer), plan.artifactSha256);
  assert.equal(sha256(uploads.listing.icon.buffer), iconHash);
});
