import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rewriteDocHref } from './doc-links.mjs';

const blob = 'https://github.com/HiAriesZhou/DashBye/blob/main';

test('keeps absolute URLs and in-page anchors', () => {
  assert.equal(rewriteDocHref('https://nodejs.org/'), 'https://nodejs.org/');
  assert.equal(rewriteDocHref('mailto:a@example.com'), 'mailto:a@example.com');
  assert.equal(rewriteDocHref('#saved-files'), '#saved-files');
});

test('maps the usage guides to their pages on the site', () => {
  assert.equal(rewriteDocHref('usage.zh-CN.md'), '/zh/docs/');
  assert.equal(rewriteDocHref('usage.md#agent-setup'), '/docs/#agent-setup');
});

test('sends other repository files to GitHub', () => {
  assert.equal(rewriteDocHref('store-schema.md#firefox-add-ons'), `${blob}/docs/store-schema.md#firefox-add-ons`);
  assert.equal(rewriteDocHref('../README.md'), `${blob}/README.md`);
  assert.equal(rewriteDocHref('../brand/LICENSE'), `${blob}/brand/LICENSE`);
});
