import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDoctor, formatPlan, formatSyncResult, formatValidation } from '../src/format.js';
import type { ReconciliationPlan } from '../src/reconcile.js';

const target = { itemId: 'a'.repeat(32), language: 'English – en (default)' };

function plan(operations: ReconciliationPlan['operations']): ReconciliationPlan {
  return { schema: 'dashbye/plan/v2', itemIdHash: 'i', artifactSha256: 'a', releaseHash: 'r', remoteHash: 'h', operations, approvalHash: 'f'.repeat(64) };
}

test('summarizes each planned change in plain words and flags destructive ones', () => {
  const text = formatPlan(plan([
    { area: 'package', action: 'upload', field: 'packageVersion', before: '1.4.1', after: '1.4.2', destructive: false, ownerApprovalRequired: true },
    { area: 'listing', action: 'replace', field: 'smallPromo', before: 'present', after: 'configured', destructive: true, ownerApprovalRequired: true },
    { area: 'listing', action: 'replace', field: 'screenshots', before: 3, after: 4, destructive: true, ownerApprovalRequired: true },
    { area: 'listing', action: 'update', field: 'matureContent', before: false, after: true, destructive: false, ownerApprovalRequired: false },
    { area: 'privacy', action: 'remove', field: 'policyUrl', before: 'hash', after: null, destructive: true, ownerApprovalRequired: true },
  ]), target);
  assert.match(text, /Target: item a{32}, English – en \(default\)/);
  assert.match(text, /5 changes/);
  assert.match(text, /Package\s+upload package version 1\.4\.1 → 1\.4\.2/);
  assert.match(text, /Listing\s+replace small promo tile \(440×280\)\s+! replaces existing content/);
  assert.match(text, /replace screenshots \(3 → 4\)/);
  assert.match(text, /update mature content \(false → true\)/);
  assert.match(text, /Privacy\s+remove privacy policy URL\s+! removes existing content/);
  assert.doesNotMatch(text, /hash/);
});

test('says when the draft already matches', () => {
  assert.match(formatPlan(plan([]), target), /No changes: the Dashboard draft already matches/);
});

test('summarizes packages, issues, and hints per store', () => {
  const text = formatValidation({
    packages: { chrome: { version: '1.4.2', kind: 'zip' }, firefox: { version: '1.4.1', kind: 'zip' } },
    chrome: { release: { locales: ['English – en (default)'] }, baseline: { version: '1.4.1', manifestChanges: [{ field: 'permissions', added: ['tabs'], removed: [] }] } },
    issues: [
      { store: 'chrome', severity: 'error', code: 'x', message: 'missing justification for permission tabs' },
      { store: 'firefox', severity: 'warning', code: 'y', message: 'package versions differ across stores: chrome 1.4.2, firefox 1.4.1' },
    ],
    hints: ['Found a Microsoft Edge Add-ons package (dist/edge.zip), but that store is not configured; run dashbye init to change stores.'],
  });
  assert.match(text, /Chrome Web Store\s+1\.4\.2 \(zip\) · English – en \(default\)/);
  assert.match(text, /Firefox Add-ons\s+1\.4\.1 \(zip\)/);
  assert.match(text, /Chrome Web Store since 1\.4\.1: permissions: \+tabs/);
  assert.match(text, /error\s+Chrome Web Store: missing justification for permission tabs/);
  assert.match(text, /warning\s+Firefox Add-ons: package versions differ/);
  assert.match(text, /hint\s+Found a Microsoft Edge Add-ons package/);
});

test('says when validation found nothing', () => {
  assert.match(formatValidation({ packages: { edge: { version: '1.0.0', kind: 'zip' } }, issues: [], hints: [] }), /No issues found\./);
});

test('reports a successful sync', () => {
  assert.match(formatSyncResult({ releaseLock: '1.4.2.lock.json' }), /Draft saved and read back with no remaining differences\. Release lock: 1\.4\.2\.lock\.json/);
});

test('summarizes doctor results with a next step when Chrome is not running', () => {
  const issues = [{ severity: 'warning' as const, code: 'w', message: 'screenshot is small' }];
  const down = formatDoctor({ config: 'dashbye.config.yml', artifactVersion: '1.4.2', issues, browser: { connected: false, matchingEditTabs: 0, dashboardTabs: 0, error: 'connect ECONNREFUSED' } });
  assert.match(down, /Config: dashbye\.config\.yml · extension 1\.4\.2/);
  assert.match(down, /Chrome: not reachable \(connect ECONNREFUSED\); run "dashbye chrome"/);
  assert.match(down, /warning\s+screenshot is small/);
  const up = formatDoctor({ config: 'dashbye.config.yml', artifactVersion: '1.4.2', issues: [], browser: { connected: true, matchingEditTabs: 1, dashboardTabs: 2 } });
  assert.match(up, /Chrome: connected · 2 Dashboard tabs, 1 for this item/);
});
