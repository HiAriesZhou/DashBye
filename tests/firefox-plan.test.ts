import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, createFirefoxPlan, type FirefoxDesired, type FirefoxRemote } from '../src/stores/firefox/plan.js';

const desired: FirefoxDesired = {
  addon: 'x-toc', version: '1.2.0', packageKind: 'zip', artifactSha256: 'a', releaseHash: 'r',
  summary: 'Summary', description: 'Body', homepageUrl: 'https://example.com', supportUrl: null, supportEmail: null,
  categories: ['other'], screenshotHashes: ['s1'],
};
const remote: FirefoxRemote = {
  slug: 'x-toc', currentVersion: '1.1.0', summary: 'Summary', description: 'Body', homepageUrl: 'https://example.com',
  supportUrl: null, supportEmail: null, categories: ['other'], screenshotHashes: ['s1'],
};

test('compares dotted Firefox versions numerically', () => {
  assert.equal(compareVersions('1.10.0', '1.9.9') > 0, true);
  assert.equal(compareVersions('1.2', '1.2.0'), 0);
  assert.equal(compareVersions('0.9', '1.0') < 0, true);
});

test('an unchanged listing with a newer package only needs validation', () => {
  const plan = createFirefoxPlan(desired, remote, () => true);
  assert.equal(plan.schema, 'dashbye/firefox-plan/v1');
  assert.deepEqual(plan.differences, []);
  assert.deepEqual(plan.blocking, []);
  assert.deepEqual(plan.version, { local: '1.2.0', remote: '1.1.0' });
});

test('lists listing differences for the owner to update in AMO, without values', () => {
  const plan = createFirefoxPlan({ ...desired, summary: 'New', categories: ['other', 'privacy-security'], screenshotHashes: ['s1', 's2'] }, remote, (left, right) => left === right);
  assert.deepEqual(plan.differences, [
    { field: 'summary', action: 'update' },
    { field: 'categories', action: 'update' },
    { field: 'screenshots', action: 'replace', before: 1, after: 2 },
  ]);
  assert.doesNotMatch(JSON.stringify(plan), /New/);
});

test('empty desired categories report categories still present on AMO', () => {
  const plan = createFirefoxPlan({ ...desired, categories: [] }, remote, () => true);
  assert.deepEqual(plan.differences, [{ field: 'categories', action: 'update' }]);
});

test('blocks validation when the package is not newer or cannot be uploaded', () => {
  assert.match(createFirefoxPlan({ ...desired, version: '1.1.0' }, remote, () => true).blocking[0]!, /1\.1\.0 is not newer than the AMO version 1\.1\.0/);
  assert.match(createFirefoxPlan({ ...desired, packageKind: 'directory' }, remote, () => true).blocking[0]!, /ZIP or XPI file/);
});

test('the approval hash changes with the package, listing, or AMO state', () => {
  const base = createFirefoxPlan(desired, remote, () => true).approvalHash;
  assert.notEqual(createFirefoxPlan({ ...desired, artifactSha256: 'b' }, remote, () => true).approvalHash, base);
  assert.notEqual(createFirefoxPlan(desired, { ...remote, currentVersion: '1.1.5' }, () => true).approvalHash, base);
  assert.equal(createFirefoxPlan(desired, remote, () => true).approvalHash, base);
});
