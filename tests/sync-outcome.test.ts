import test from 'node:test';
import assert from 'node:assert/strict';
import { syncOutcome } from '../src/sync-outcome.js';

test('sync outcome is pending when only unsupported stores were selected', () => {
  assert.equal(syncOutcome({}), 'pending');
  assert.equal(syncOutcome({ chrome: { result: 'saved_and_reread' } }), 'saved_and_reread');
  assert.equal(syncOutcome({ firefox: { result: 'validated' } }), 'saved_and_reread');
  assert.equal(syncOutcome({ chrome: { result: 'saved_and_reread' }, firefox: { result: 'validation_failed' } }), 'failed');
});
