import test from 'node:test';
import assert from 'node:assert/strict';
import { assertItemId, normalizeLoopbackEndpoint } from '../src/security.js';

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
