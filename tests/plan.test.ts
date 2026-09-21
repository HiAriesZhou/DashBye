import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPlan, publicPlan } from '../src/plan.js';
import type { DashboardSnapshot, ResolvedStoreConfig } from '../src/types.js';

const config: ResolvedStoreConfig = {
  schema: 'cws-release-kit/v1',
  language: 'English – en (default)',
  configPath: '/synthetic/store.yml',
  descriptionPath: '/synthetic/listing.txt',
  descriptionText: 'Synthetic description',
  assets: {
    localizedScreenshots: ['/synthetic/01.png', '/synthetic/02.png'],
    globalScreenshots: [],
  },
  assetHashes: {},
};

function current(overrides: Partial<DashboardSnapshot> = {}): DashboardSnapshot {
  return {
    itemId: 'a'.repeat(32),
    language: config.language,
    descriptionLength: config.descriptionText.length,
    descriptionSha256: createHash('sha256').update(config.descriptionText).digest('hex'),
    localizedScreenshotCount: 0,
    globalScreenshotCount: 0,
    hasIcon: false,
    hasSmallPromo: false,
    hasMarqueePromo: false,
    saveDraftEnabled: false,
    ...overrides,
  };
}

test('plans append-only screenshots', () => {
  const plan = createPlan(config, current({ localizedScreenshotCount: 1 }));
  assert.deepEqual(plan.appendLocalizedScreenshots, ['/synthetic/02.png']);
  assert.equal(plan.requiresExistingPrefixConfirmation, true);
  assert.equal(plan.description, 'unchanged');
  assert.equal('itemId' in publicPlan(plan), false);
});

test('refuses destructive reconciliation', () => {
  assert.throws(() => createPlan(config, current({ localizedScreenshotCount: 3 })), /append-only/);
});

test('refuses language drift', () => {
  assert.throws(() => createPlan(config, current({ language: 'Chinese (China) – zh-CN' })), /language/);
});
