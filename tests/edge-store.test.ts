import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { planEdge, uploadEdgeDraft, verifyEdge } from '../src/stores/edge/index.js';

const productId = '11111111-1111-4111-8111-111111111111';

async function edgeZip(version = '1.2.0') {
  const dir = await mkdtemp(join(tmpdir(), 'dashbye-edge-'));
  await mkdir(join(dir, 'dist'));
  const path = join(dir, 'dist/x-edge.zip');
  await writeFile(path, zipSync({ 'manifest.json': strToU8(JSON.stringify({ manifest_version: 3, name: 'X', version, description: 'X' })) }));
  return { dir, target: { artifact: path, productId, language: 'English' } };
}

test('plans an Edge draft package upload without values', async () => {
  const { target } = await edgeZip();
  const plan = await planEdge(target, true);
  assert.equal(plan.schema, 'dashbye/edge-plan/v1');
  assert.deepEqual(plan.operations, [{ area: 'package', action: 'upload', field: 'draftPackage', after: '1.2.0' }]);
  assert.deepEqual(plan.blocking, []);
  assert.doesNotMatch(JSON.stringify(plan), new RegExp(productId));
  assert.match(plan.approvalHash, /^[0-9a-f]{64}$/);
});

test('blocks without Edge API credentials or with a build directory', async () => {
  const { dir, target } = await edgeZip();
  assert.match((await planEdge(target, false)).blocking.join(), /Edge API credentials/);
  await mkdir(join(dir, 'build'));
  await writeFile(join(dir, 'build/manifest.json'), JSON.stringify({ manifest_version: 3, name: 'X', version: '1.2.0', description: 'X' }));
  assert.match((await planEdge({ ...target, artifact: join(dir, 'build') }, true)).blocking.join(), /ZIP/);
});

test('refuses a stale plan before any upload', async () => {
  const { target } = await edgeZip();
  const plan = await planEdge(target, true);
  await writeFile(target.artifact, zipSync({ 'manifest.json': strToU8(JSON.stringify({ manifest_version: 3, name: 'X', version: '1.2.1', description: 'X' })) }));
  await assert.rejects(verifyEdge(target, true, plan), /plan is stale/);
});

test('uploads the approved bytes to the draft and reports the operation outcome', async () => {
  const { target } = await edgeZip();
  const plan = await planEdge(target, true);
  const seen: Array<[string, number]> = [];
  const ok = { uploadDraftPackage: async (id: string, bytes: Uint8Array) => { seen.push([id, bytes.length]); return { status: 'Succeeded' as const, errorCode: null }; } };
  assert.deepEqual(await uploadEdgeDraft(target, ok, plan), { result: 'draft_uploaded', version: '1.2.0' });
  assert.equal(seen[0]![0], productId);
  const failed = { uploadDraftPackage: async () => ({ status: 'Failed' as const, errorCode: 'InvalidPackage' }) };
  assert.deepEqual(await uploadEdgeDraft(target, failed, plan), { result: 'upload_failed', errorCode: 'InvalidPackage' });
});

test('refuses a package replaced after approval', async () => {
  const { target } = await edgeZip();
  const plan = await planEdge(target, true);
  await writeFile(target.artifact, new Uint8Array([1, 2, 3]));
  let uploaded = false;
  await assert.rejects(uploadEdgeDraft(target, { uploadDraftPackage: async () => { uploaded = true; return { status: 'Succeeded', errorCode: null }; } }, plan), /changed after approval/);
  assert.equal(uploaded, false);
});

test('a package already uploaded to the draft is not uploaded again until it changes', async () => {
  const { target } = await edgeZip();
  const first = await planEdge(target, true);
  const uploaded = { productIdHash: first.productIdHash, artifactSha256: first.artifactSha256 };
  const again = await planEdge(target, true, uploaded);
  assert.deepEqual(again.operations, []);
  assert.notEqual(again.approvalHash, first.approvalHash);
  assert.deepEqual((await planEdge(target, true, { ...uploaded, artifactSha256: 'other' })).operations.length, 1);
  assert.deepEqual((await planEdge(target, true, { ...uploaded, productIdHash: 'other' })).operations.length, 1);
});
