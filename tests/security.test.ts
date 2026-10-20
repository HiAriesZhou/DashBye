import test from 'node:test';
import assert from 'node:assert/strict';
import { assertItemId, normalizeLoopbackEndpoint, publicErrorMessage } from '../src/security.js';

test('accepts loopback endpoints with explicit ports', () => {
  assert.equal(normalizeLoopbackEndpoint('http://127.0.0.1:9333/json'), 'http://127.0.0.1:9333');
  assert.equal(normalizeLoopbackEndpoint('http://localhost:9222'), 'http://localhost:9222');
});

test('rejects remote or ambiguous endpoints', () => {
  assert.throws(() => normalizeLoopbackEndpoint('https://example.com:9333'));
  assert.throws(() => normalizeLoopbackEndpoint('http://127.0.0.1'));
  assert.throws(() => normalizeLoopbackEndpoint('file:///tmp/socket'));
});

test('requires Chrome extension-shaped item IDs', () => {
  assert.equal(assertItemId('a'.repeat(32)), 'a'.repeat(32));
  assert.throws(() => assertItemId('real-product-name'));
  assert.throws(() => assertItemId('A'.repeat(32)));
  assert.throws(() => assertItemId('z'.repeat(32)));
});

test('public error messages drop Playwright call logs and field contents', () => {
  const error = new Error([
    'locator.fill: Timeout 30000ms exceeded.',
    'Call log:',
    '\u001b[2m  - waiting for locator(\'textarea\').visible().first()\u001b[22m',
    '\u001b[2m    - fill("Fictional private justification text")\u001b[22m',
  ].join('\n'));
  assert.equal(publicErrorMessage(error), 'locator.fill: Timeout 30000ms exceeded.');
});

test('public error messages hide Dashboard publisher and item paths', () => {
  const url = `https://chrome.google.com/webstore/devconsole/11111111-2222-3333-4444-555555555555/${'a'.repeat(32)}/edit/listing?hl=en`;
  const message = publicErrorMessage(new Error(`page.goto: net::ERR_ABORTED at ${url}`));
  assert.equal(message, 'page.goto: net::ERR_ABORTED at chrome.google.com/…');
  assert.doesNotMatch(message, /a{32}|11111111/);
});

test('public error messages handle non-errors and overly long lines', () => {
  assert.equal(publicErrorMessage('boom'), 'unknown error');
  assert.equal(publicErrorMessage(new Error('x'.repeat(500))).length, 300);
});

test('public errors redact AMO and Microsoft store URLs too', () => {
  const message = publicErrorMessage(new Error('failed at https://addons.mozilla.org/api/v5/addons/addon/x@example.com/ and https://api.addons.microsoftedge.microsoft.com/v1/products/1111/submissions/draft/package and https://partner.microsoft.com/dashboard/microsoftedge/1111'));
  assert.doesNotMatch(message, /x@example\.com|1111/);
  assert.match(message, /addons\.mozilla\.org\/…/);
  assert.match(message, /partner\.microsoft\.com\/…/);
});
