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

test('reports unknown collected-data categories with the closest valid identifier', () => {
  const value = workspace();
  value.release.privacy.collectedData = ['authenticationInfo', 'websiteContent'];
  const issues = validateWorkspace(value);
  assert.deepEqual(issues.map(issue => [issue.severity, issue.code]), [['error', 'unknown_collected_data_category']]);
  assert.match(issues[0]!.message, /authenticationInfo/);
  assert.match(issues[0]!.message, /did you mean authenticationInformation\?/);
});

test('accepts every known collected-data category', () => {
  const value = workspace();
  value.release.privacy.collectedData = ['authenticationInformation', 'location', 'websiteContent'];
  assert.deepEqual(validateWorkspace(value), []);
});

// The Dashboard reader finds the draft version in free text beside dates and sizes,
// so it reads only three- or four-part versions. Fewer parts would be uploaded on
// every run and never read back; validation stops that before the browser opens.
test('refuses a Chrome version the Dashboard draft cannot be read back for', () => {
  for (const version of ['1', '1.0']) {
    const value = workspace();
    value.artifact.manifest.version = version;
    assert.deepEqual(validateWorkspace(value).map(issue => issue.code), ['unreadable_chrome_version']);
  }
  for (const version of ['1.0.0', '1.2.3.4']) {
    const value = workspace();
    value.artifact.manifest.version = version;
    assert.deepEqual(validateWorkspace(value), []);
  }
});

// A padded suggestion helps only a version that is short; for other shapes it would
// propose a pre-release or a downgrade.
test('the Chrome version message suggests padding only for short versions', () => {
  const message = (version: string) => {
    const value = workspace();
    value.artifact.manifest.version = version;
    return validateWorkspace(value)[0]?.message ?? '';
  };
  assert.match(message('1.0'), /must be x\.y\.z or x\.y\.z\.w.*for example 1\.0\.0/);
  for (const version of ['1.0.0-beta', '1.2.3.4.5']) {
    assert.match(message(version), /must be x\.y\.z or x\.y\.z\.w/);
    assert.doesNotMatch(message(version), /for example/);
  }
});
