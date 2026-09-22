import test from 'node:test';
import assert from 'node:assert/strict';
import { isDashboardUrl, isExactItemEditUrl, itemEditUrlFromDashboardUrl, languageOptionCandidates } from '../src/dashboard-v2.js';

const itemId = 'a'.repeat(32);

test('recognizes supported Dashboard pages without accepting other Google pages', () => {
  assert.equal(isDashboardUrl('https://chromewebstore.google.com/devconsole/publisher-id'), true);
  assert.equal(isDashboardUrl('https://chrome.google.com/webstore/devconsole/publisher-id'), true);
  assert.equal(isDashboardUrl('https://accounts.google.com/signin'), false);
  assert.equal(isDashboardUrl('https://example.com/devconsole/publisher-id'), false);
});

test('matches only the configured item edit URL', () => {
  const target = `https://chromewebstore.google.com/devconsole/publisher-id/${itemId}/edit`;
  assert.equal(isExactItemEditUrl(target, itemId), true);
  assert.equal(isExactItemEditUrl(target, 'b'.repeat(32)), false);
  assert.equal(isExactItemEditUrl(target.replace('/edit', '/package'), itemId), false);
});

test('builds an exact item URL from the authenticated publisher scope', () => {
  assert.equal(
    itemEditUrlFromDashboardUrl('https://chromewebstore.google.com/devconsole/publisher-id', itemId),
    `https://chromewebstore.google.com/devconsole/publisher-id/${itemId}/edit`,
  );
  assert.equal(
    itemEditUrlFromDashboardUrl('https://chrome.google.com/webstore/devconsole/publisher-id/other-item/edit?tab=package', itemId),
    `https://chrome.google.com/webstore/devconsole/publisher-id/${itemId}/edit`,
  );
});

test('does not invent a publisher scope', () => {
  assert.equal(itemEditUrlFromDashboardUrl('https://chromewebstore.google.com/devconsole', itemId), null);
  assert.equal(itemEditUrlFromDashboardUrl('https://accounts.google.com/signin', itemId), null);
  assert.equal(itemEditUrlFromDashboardUrl('not a URL', itemId), null);
});

test('prefers the configured Dashboard language label with a legacy English fallback', () => {
  assert.deepEqual(languageOptionCandidates('English – en (default)'), ['English – en (default)', 'English']);
  assert.deepEqual(languageOptionCandidates('Chinese (China) – zh-CN'), ['Chinese (China) – zh-CN']);
});
