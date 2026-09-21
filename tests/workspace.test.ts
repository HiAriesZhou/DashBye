import test from 'node:test';
import assert from 'node:assert/strict';
import type { LoadedWorkspace } from '../src/workspace.js';
import { validateWorkspace } from '../src/workspace.js';

function workspace(): LoadedWorkspace {
  return {
    configPath: '/fixture/dashbye.config.yml',
    config: {
      schema: 'dashbye/config/v1', project: '/fixture', artifact: '/fixture/release.zip', resources: '/fixture/store',
      target: { itemId: 'a'.repeat(32), language: 'English', endpoint: 'http://127.0.0.1:9333' },
    },
    artifact: {
      path: '/fixture/release.zip', kind: 'zip', sha256: 'artifact',
      manifest: {
        version: '1.0.0', name: 'Fixture', summary: 'Fixture', permissions: ['storage'], optionalPermissions: [],
        hostPermissions: ['https://example.com/*'], optionalHostPermissions: [], contentScriptMatches: [],
      },
    },
    release: {
      schema: 'dashbye/release/v1', path: '/fixture/store/release.yml', resourceHashes: {}, hash: 'release',
      listing: {
        defaultLanguage: 'English', category: 'Tools', globalScreenshots: [], globalPromoVideoUrl: null,
        officialUrl: null, homepageUrl: null, supportUrl: null, matureContent: false,
        assets: { icon: '/fixture/icon.png', smallPromo: null, marqueePromo: null },
        locales: { English: { descriptionPath: '/fixture/listing.txt', descriptionText: 'Fixture', screenshots: [], promoVideoUrl: null } },
      },
      privacy: {
        singlePurpose: 'Fixture purpose', permissionJustifications: { storage: 'Stores preferences.' },
        hostPermissionJustification: 'Runs on the configured site.', remoteCode: { uses: false, justification: null },
        collectedData: [],
        certifications: { noSaleOrTransfer: true, relatedToSinglePurpose: true, noCreditworthinessUse: true },
        policyUrl: 'https://example.com/privacy',
      },
    },
  };
}

test('accepts privacy metadata aligned with artifact permissions', () => {
  assert.deepEqual(validateWorkspace(workspace()), []);
});

test('reports missing and stale permission declarations', () => {
  const value = workspace();
  value.release.privacy.permissionJustifications = { contextMenus: 'Stale.' };
  assert.deepEqual(validateWorkspace(value).map(issue => issue.code), [
    'missing_permission_justification',
    'stale_permission_justification',
  ]);
});

test('reports host and remote-code inconsistencies', () => {
  const value = workspace();
  value.release.privacy.hostPermissionJustification = null;
  value.release.privacy.remoteCode = { uses: true, justification: null };
  assert.deepEqual(validateWorkspace(value).map(issue => issue.code), [
    'missing_host_justification',
    'missing_remote_code_justification',
  ]);
});
