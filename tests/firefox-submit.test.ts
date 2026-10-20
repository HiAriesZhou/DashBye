import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import YAML from 'yaml';
import type { AmoAddon } from '../src/stores/firefox/amo.js';
import type { AmoVersion } from '../src/stores/firefox/amo-write.js';
import { describeSubmission, executeSubmission, formatSubmitPlan, planSubmission, type SubmitDeps } from '../src/stores/firefox/submit.js';

const manifest = (version: string) => zipSync({ 'manifest.json': strToU8(JSON.stringify({ manifest_version: 3, name: 'X', version, description: 'X', browser_specific_settings: { gecko: { id: 'x@example.com' } } })) });

async function workspace(options: { version?: string; notes?: boolean; reviewerNotes?: boolean; source?: boolean } = {}) {
  const { version = '1.2.0', notes = true, reviewerNotes = true, source = true } = options;
  const root = await mkdtemp(join(tmpdir(), 'dashbye-submit-'));
  const files: Record<string, string | Uint8Array> = {
    'dist/x.zip': manifest(version),
    'store/listing/description.txt': 'Description\n',
    'store/release.yml': YAML.stringify({
      schema: 'dashbye/release/v1',
      listing: { defaultLanguage: 'English', locales: { English: { description: 'listing/description.txt' } } },
      stores: { firefox: { summary: 'Summary', ...(reviewerNotes ? { reviewerNotes: 'listing/firefox/reviewer-notes.txt' } : {}) } },
    }),
    ...(reviewerNotes ? { 'store/listing/firefox/reviewer-notes.txt': 'Build: npm ci && npm run build\n' } : {}),
    ...(notes ? { [`store/releases/${version}.notes.md`]: '- New import menu\n' } : {}),
    ...(source ? { 'dist/x-source.zip': new Uint8Array([9, 9, 9]) } : {}),
  };
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  const target = { artifact: join(root, 'dist/x.zip'), addon: 'x', source: source ? join(root, 'dist/x-source.zip') : null };
  return { root, target, resources: join(root, 'store') };
}

const addon = (currentVersion: string | null = '1.1.0'): AmoAddon => ({
  id: 9, guid: 'x@example.com', slug: 'x', defaultLocale: 'en-US', currentVersion, summary: 'Summary', description: 'Description',
  homepageUrl: null, supportUrl: null, supportEmail: null, categories: [], previewUrls: [],
});

function deps(options: { existing?: { id: number; status: string | null } | null; valid?: boolean; readBack?: Partial<AmoVersion>; failNotes?: boolean; current?: string | null } = {}) {
  const calls: string[] = [];
  const result: SubmitDeps = {
    reader: {
      getAddon: async () => { calls.push('getAddon'); return addon(options.current === undefined ? '1.1.0' : options.current); },
      uploadForValidation: async () => {
        calls.push('upload');
        return { uuid: 'u1', valid: options.valid ?? true, errors: options.valid === false ? 1 : 0, warnings: 2, notices: 0, messages: [] };
      },
    },
    writer: {
      findVersion: async () => { calls.push('findVersion'); return options.existing ?? null; },
      createVersion: async (_addon, upload, source) => { calls.push(`create ${upload} ${source ? source.name : 'no-source'}`); return { id: 77, version: '1.2.0' }; },
      setVersionNotes: async (_addon, id, notes) => {
        calls.push(`notes ${id} ${notes.locale}`);
        if (options.failNotes) throw new Error('AMO setVersionNotes failed (500)');
      },
      getVersion: async () => {
        calls.push('getVersion');
        return { id: 77, version: '1.2.0', status: 'unreviewed', hasSource: true, releaseNotes: '- New import menu', reviewerNotes: 'Build: npm ci && npm run build', ...options.readBack };
      },
    },
  };
  return { calls, deps: result };
}

test('plans a submission without values and without writing', async () => {
  const { target, resources } = await workspace();
  const { calls, deps: d } = deps();
  const plan = await planSubmission(target, resources, d);
  assert.equal(plan.schema, 'dashbye/firefox-submit/v1');
  assert.deepEqual(plan.version, { local: '1.2.0', remote: '1.1.0' });
  assert.deepEqual(plan.blocking, []);
  assert.match(plan.sourceSha256 ?? '', /^[0-9a-f]{64}$/);
  assert.match(plan.releaseNotesHash ?? '', /^[0-9a-f]{64}$/);
  assert.match(plan.approvalHash, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(JSON.stringify(plan), /New import menu|npm ci/);
  assert.deepEqual(calls, ['getAddon', 'findVersion']);
});

test('blocks a submission that AMO already has, an old version, missing notes, or missing keys', async () => {
  const { target, resources } = await workspace();
  assert.match((await planSubmission(target, resources, deps({ existing: { id: 5, status: 'unreviewed' } }).deps)).blocking.join(), /already has version 1\.2\.0 \(unreviewed\)/);
  assert.match((await planSubmission(target, resources, deps({ current: '1.2.0' }).deps)).blocking.join(), /not newer than the AMO version 1\.2\.0/);
  const noNotes = await workspace({ notes: false });
  assert.match((await planSubmission(noNotes.target, noNotes.resources, deps().deps)).blocking.join(), /release notes are missing: releases\/1\.2\.0\.notes\.md/);
  const { deps: d } = deps();
  assert.match((await planSubmission(target, resources, { ...d, writer: null })).blocking.join(), /AMO API key/);
});

test('submits after approval: validate, create with source, set notes, read back', async () => {
  const { target, resources } = await workspace();
  const { calls, deps: d } = deps();
  const plan = await planSubmission(target, resources, d);
  const result = await executeSubmission(target, resources, d, plan);
  assert.deepEqual(result, { result: 'submitted', version: '1.2.0', status: 'unreviewed', warnings: 2 });
  assert.deepEqual(calls.slice(2), ['getAddon', 'findVersion', 'upload', 'create u1 x-source.zip', 'notes 77 en-US', 'getVersion']);
});

test('submits without a source archive when none is configured', async () => {
  const { target, resources } = await workspace({ source: false });
  const { calls, deps: d } = deps({ readBack: { hasSource: false } });
  const result = await executeSubmission(target, resources, d, await planSubmission(target, resources, d));
  assert.equal(result.result, 'submitted');
  assert.ok(calls.includes('create u1 no-source'));
});

test('a failed validation stops before any version is created', async () => {
  const { target, resources } = await workspace();
  const { calls, deps: d } = deps({ valid: false });
  const result = await executeSubmission(target, resources, d, await planSubmission(target, resources, d));
  assert.equal(result.result, 'validation_failed');
  assert.ok(!calls.some(call => call.startsWith('create')));
});

test('refuses a stale approval or a changed package before uploading', async () => {
  const { target, resources } = await workspace();
  const { calls, deps: d } = deps();
  const plan = await planSubmission(target, resources, d);
  await writeFile(target.source!, new Uint8Array([1]));
  await assert.rejects(executeSubmission(target, resources, d, plan), /plan is stale/);
  assert.ok(!calls.includes('upload'));
});

test('reports a created version whose notes failed instead of retrying', async () => {
  const { target, resources } = await workspace();
  const { calls, deps: d } = deps({ failNotes: true });
  const result = await executeSubmission(target, resources, d, await planSubmission(target, resources, d));
  assert.deepEqual(result, { result: 'submitted_incomplete', version: '1.2.0', error: 'AMO setVersionNotes failed (500)' });
  assert.equal(calls.filter(call => call.startsWith('create')).length, 1);
});

test('a read-back that differs from the approved notes is reported as incomplete', async () => {
  const { target, resources } = await workspace();
  const { deps: d } = deps({ readBack: { releaseNotes: 'Other notes' } });
  const result = await executeSubmission(target, resources, d, await planSubmission(target, resources, d));
  assert.equal(result.result, 'submitted_incomplete');
  assert.match(String((result as { error?: string }).error), /release notes/);
});

test('the submission summary names what is sent and warns that AMO has no draft', async () => {
  const { target, resources } = await workspace();
  const plan = await planSubmission(target, resources, deps().deps);
  const text = formatSubmitPlan(plan);
  assert.match(text, /Submit Firefox 1\.2\.0 to AMO for review \(current: 1\.1\.0\)/);
  assert.match(text, /Package, source archive, release notes, reviewer notes/);
  assert.match(text, /AMO has no draft: once created, the version is in the review queue\./);
  assert.match(text, new RegExp(`Approval: ${plan.approvalHash}`));
  const blocked = formatSubmitPlan({ ...plan, blocking: ['AMO already has version 1.2.0 (unreviewed)'] });
  assert.match(blocked, /Blocked: AMO already has version 1\.2\.0/);
  assert.doesNotMatch(blocked, /Approval:/);
});

test('describes each submission outcome in one line', () => {
  assert.match(describeSubmission({ result: 'submitted', version: '1.2.0', status: 'unreviewed', warnings: 2 }), /Submitted 1\.2\.0 to AMO \(unreviewed, 2 validation warnings\)/);
  assert.match(describeSubmission({ result: 'submitted_incomplete', version: '1.2.0', error: 'AMO setVersionNotes failed (500)' }), /1\.2\.0 was created and is in review, but .*setVersionNotes failed \(500\).*Do not run submit again/);
  assert.match(describeSubmission({ result: 'validation_failed', errors: 1, warnings: 0, messages: [] }), /AMO validation failed \(1 errors, 0 warnings\)\. Nothing was submitted/);
});

test('release notes AMO returns as an HTML list match the Markdown list that was sent', async () => {
  const { target, resources } = await workspace();
  const { deps: d } = deps({ readBack: { releaseNotes: '<ul><li>New import menu</li></ul>' } });
  const result = await executeSubmission(target, resources, d, await planSubmission(target, resources, d));
  assert.equal(result.result, 'submitted');
});
