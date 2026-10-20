import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import sharp from 'sharp';
import YAML from 'yaml';
import { loadFirefoxRelease } from '../src/stores/firefox/release.js';
import { applyFirefoxListing, planFirefox, uploadFirefoxForValidation } from '../src/stores/firefox/index.js';
import type { AmoAddon } from '../src/stores/firefox/amo.js';
import { sha256 } from '../src/hash.js';
import { firefoxApprovalHash, type FirefoxPlan } from '../src/stores/firefox/plan.js';

async function png(color: string): Promise<Buffer> {
  return sharp({ create: { width: 1280, height: 800, channels: 3, background: color } }).png().toBuffer();
}

async function fixture(firefox: unknown, extra: Record<string, unknown> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dashbye-ff-'));
  const files: Record<string, string | Buffer | Uint8Array> = {
    'store/listing/description.txt': 'Shared description\n',
    'store/assets/screenshots/01.png': await png('#336699'),
    'dist/x.xpi': zipSync({ 'manifest.json': strToU8(JSON.stringify({ manifest_version: 3, name: 'X', version: '1.2.0', description: 'X', browser_specific_settings: { gecko: { id: 'x@example.com' } } })) }),
    'store/release.yml': YAML.stringify({
      schema: 'dashbye/release/v1',
      listing: {
        defaultLanguage: 'English', homepageUrl: 'https://example.com', supportUrl: null,
        locales: { English: { description: 'listing/description.txt', screenshots: ['assets/screenshots/01.png'] } },
        ...extra,
      },
      ...(firefox === undefined ? {} : { stores: { firefox } }),
    }),
  };
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

test('Firefox listing defaults to the shared description, screenshots, and URLs', async () => {
  const root = await fixture({ summary: 'Short summary', categories: ['other'] });
  const release = await loadFirefoxRelease(join(root, 'store'));
  assert.equal(release.summary, 'Short summary');
  assert.equal(release.description, 'Shared description');
  assert.equal(release.homepageUrl, 'https://example.com');
  assert.deepEqual(release.categories, ['other']);
  assert.deepEqual(release.screenshots, [join(root, 'store/assets/screenshots/01.png')]);
  assert.match(release.hash, /^[0-9a-f]{64}$/);
});

test('Firefox listing requires a summary of at most 250 characters', async () => {
  await assert.rejects(loadFirefoxRelease(join(await fixture(undefined), 'store')), /stores\.firefox\.summary/);
  await assert.rejects(loadFirefoxRelease(join(await fixture({ summary: 'x'.repeat(251) }), 'store')), /at most 250/);
});

test('plans a Firefox release against AMO without writing anything', async () => {
  const root = await fixture({ summary: 'Short summary', categories: ['other'] });
  const image = await png('#336699');
  const addon: AmoAddon = {
    id: 9, guid: 'x@example.com', slug: 'x', defaultLocale: 'en-US', currentVersion: '1.1.0', summary: 'Old summary', description: 'Shared description',
    homepageUrl: 'https://example.com', supportUrl: null, supportEmail: null, categories: ['other'],
    previewUrls: ['https://addons.mozilla.org/user-media/previews/full/1.png'],
  };
  const calls: string[] = [];
  const client = {
    getAddon: async (id: string) => { calls.push(`get ${id}`); return addon; },
    fetchImage: async () => { calls.push('image'); return new Uint8Array(image); },
  };
  const plan = await planFirefox({ artifact: join(root, 'dist/x.xpi'), addon: 'x' }, join(root, 'store'), client);
  assert.deepEqual(plan.differences, [{ field: 'summary', action: 'update' }]);
  assert.deepEqual(plan.blocking, []);
  assert.deepEqual(plan.version, { local: '1.2.0', remote: '1.1.0' });
  assert.deepEqual(calls, ['get x', 'image']);
});

test('refuses to plan a Firefox package without gecko.id', async () => {
  const root = await fixture({ summary: 'Short summary' });
  await writeFile(join(root, 'dist/x.xpi'), zipSync({ 'manifest.json': strToU8(JSON.stringify({ manifest_version: 3, name: 'X', version: '1.2.0', description: 'X' })) }));
  const client = {
    getAddon: async () => ({ id: 9, guid: 'x@example.com', slug: 'x', defaultLocale: 'en-US', currentVersion: null, summary: null, description: null, homepageUrl: null, supportUrl: null, supportEmail: null, categories: [], previewUrls: [] }) as AmoAddon,
    fetchImage: async () => new Uint8Array(),
  };
  await assert.rejects(planFirefox({ artifact: join(root, 'dist/x.xpi'), addon: 'x' }, join(root, 'store'), client), /Firefox package manifest must set browser_specific_settings\.gecko\.id/);
  await writeFile(join(root, 'dist/x.xpi'), zipSync({ 'manifest.json': strToU8(JSON.stringify({ manifest_version: 3, name: 'X', version: '1.2.0', description: 'X', browser_specific_settings: { gecko: { id: '' } } })) }));
  await assert.rejects(planFirefox({ artifact: join(root, 'dist/x.xpi'), addon: 'x' }, join(root, 'store'), client), /Firefox package manifest must set browser_specific_settings\.gecko\.id/);
});

test('refuses a Firefox package whose gecko.id differs from the configured AMO add-on', async () => {
  const root = await fixture({ summary: 'Short summary' });
  const client = {
    getAddon: async () => ({ id: 9, guid: 'other@example.com', slug: 'x', defaultLocale: 'en-US', currentVersion: null, summary: null, description: null, homepageUrl: null, supportUrl: null, supportEmail: null, categories: [], previewUrls: [] }) as AmoAddon,
    fetchImage: async () => new Uint8Array(),
  };
  await assert.rejects(planFirefox({ artifact: join(root, 'dist/x.xpi'), addon: 'x' }, join(root, 'store'), client), error => {
    assert.equal((error as Error).message, 'Firefox package gecko.id does not match the configured AMO add-on');
    return true;
  });
});

test('refuses a changed Firefox package immediately before validation upload', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dashbye-ff-upload-'));
  const path = join(root, 'x.xpi');
  const approved = new Uint8Array([1, 2, 3]);
  await writeFile(path, approved);
  const base = {
    schema: 'dashbye/firefox-plan/v2' as const, mode: 'validate' as const, addonHash: 'a', slug: 'x', artifactSha256: sha256(approved), releaseHash: 'r', remoteHash: 'h',
    version: { local: '1.2.0', remote: null }, differences: [], blocking: [],
  };
  const plan: FirefoxPlan = { ...base, approvalHash: firefoxApprovalHash(base) };
  await writeFile(path, new Uint8Array([4, 5, 6]));
  let uploaded = false;
  const client = { uploadForValidation: async () => { uploaded = true; throw new Error('upload must not run'); } };
  await assert.rejects(uploadFirefoxForValidation({ artifact: path, addon: 'x' }, client, plan), /Firefox package changed after approval/);
  assert.equal(uploaded, false);
});

test('after AMO approves the version, sync updates writable listing fields and re-reads them', async () => {
  const root = await fixture({ summary: 'New summary', categories: ['other'], supportUrl: 'https://example.com/help' });
  const image = await png('#336699');
  let live: AmoAddon = {
    id: 9, guid: 'x@example.com', slug: 'x', defaultLocale: 'en-US', currentVersion: '1.2.0', summary: 'Old summary', description: 'Shared description',
    homepageUrl: 'https://example.com', supportUrl: null, supportEmail: null, categories: ['other'],
    previewUrls: ['https://addons.mozilla.org/user-media/previews/full/1.png'],
  };
  const reader = { getAddon: async () => live, fetchImage: async () => new Uint8Array(image) };
  const updates: unknown[] = [];
  const writer = { updateListing: async (_addon: string, locale: string, listing: Record<string, unknown>) => {
    updates.push({ locale, listing });
    live = { ...live, summary: listing.summary as string };
  } };
  const target = { artifact: join(root, 'dist/x.xpi'), addon: 'x' };
  const plan = await planFirefox(target, join(root, 'store'), reader);
  assert.equal(plan.mode, 'listing');
  const result = await applyFirefoxListing(target, join(root, 'store'), reader, writer, plan);
  assert.deepEqual(updates, [{ locale: 'en-US', listing: { summary: 'New summary' } }]);
  assert.deepEqual(result, { result: 'saved_and_reread', listingChanges: 1, manualChanges: ['supportUrl'] });
});

test('listing sync refuses a plan that is still waiting for AMO approval', async () => {
  const root = await fixture({ summary: 'New summary' });
  const reader = { getAddon: async () => ({ id: 9, guid: 'x@example.com', slug: 'x', defaultLocale: 'en-US', currentVersion: '1.1.0', summary: 'Old', description: 'Shared description', homepageUrl: 'https://example.com', supportUrl: null, supportEmail: null, categories: [], previewUrls: [] }) as AmoAddon, fetchImage: async () => new Uint8Array() };
  const target = { artifact: join(root, 'dist/x.xpi'), addon: 'x' };
  const plan = await planFirefox(target, join(root, 'store'), reader);
  let wrote = false;
  await assert.rejects(applyFirefoxListing(target, join(root, 'store'), reader, { updateListing: async () => { wrote = true; } }, plan), /waiting for AMO to approve 1\.2\.0/);
  assert.equal(wrote, false);
});

test('listing sync reports a read-back that still differs', async () => {
  const root = await fixture({ summary: 'New summary' });
  const addon = { id: 9, guid: 'x@example.com', slug: 'x', defaultLocale: 'en-US', currentVersion: '1.2.0', summary: 'Old', description: 'Shared description', homepageUrl: 'https://example.com', supportUrl: null, supportEmail: null, categories: [], previewUrls: [] } as AmoAddon;
  const reader = { getAddon: async () => addon, fetchImage: async () => new Uint8Array() };
  const target = { artifact: join(root, 'dist/x.xpi'), addon: 'x' };
  const plan = await planFirefox(target, join(root, 'store'), reader);
  await assert.rejects(applyFirefoxListing(target, join(root, 'store'), reader, { updateListing: async () => {} }, plan), /AMO listing read-back still differs: summary/);
});
