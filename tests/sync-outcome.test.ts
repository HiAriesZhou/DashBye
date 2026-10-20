import test from 'node:test';
import assert from 'node:assert/strict';
import { syncOutcome } from '../src/sync-outcome.js';

test('sync outcome is pending when only unsupported stores were selected', () => {
  assert.equal(syncOutcome({}), 'pending');
  assert.equal(syncOutcome({ chrome: { result: 'saved_and_reread' } }), 'saved_and_reread');
  assert.equal(syncOutcome({ firefox: { result: 'validated' } }), 'validated');
  assert.equal(syncOutcome({ chrome: { result: 'saved_and_reread' }, firefox: { result: 'validated' } }), 'saved_and_reread');
  assert.equal(syncOutcome({ chrome: { result: 'saved_and_reread' }, firefox: { result: 'validation_failed' } }), 'failed');
});

test('an Edge draft upload counts as written; a failed upload fails the run', () => {
  assert.equal(syncOutcome({ edge: { result: 'draft_uploaded' } }), 'draft_uploaded');
  assert.equal(syncOutcome({ chrome: { result: 'saved_and_reread' }, edge: { result: 'draft_uploaded' } }), 'saved_and_reread');
  assert.equal(syncOutcome({ edge: { result: 'draft_uploaded' }, firefox: { result: 'validated' } }), 'draft_uploaded');
  assert.equal(syncOutcome({ edge: { result: 'upload_failed' } }), 'failed');
});
