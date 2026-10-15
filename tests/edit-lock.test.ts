import test from 'node:test';
import assert from 'node:assert/strict';
import { assertDraftEditable, assertPlanWritable, DraftLockedError, editLockReasons, isLocked, UNLOCKED, fieldsLocked } from '../src/edit-lock.js';

test('an editable draft has no lock reasons', () => {
  assert.equal(isLocked(UNLOCKED), false);
  assert.deepEqual(editLockReasons(UNLOCKED), []);
  assert.doesNotThrow(() => assertDraftEditable(UNLOCKED));
});

test('a pending review is reported once, in plain words', () => {
  const lock = { pendingReview: true, listingFieldsDisabled: true, privacyFieldsDisabled: true };
  assert.deepEqual(editLockReasons(lock), ['item is in review; drafts cannot be edited until review completes']);
  assert.throws(() => assertDraftEditable(lock), (error: unknown) => error instanceof DraftLockedError
    && /draft is not editable: item is in review.*Nothing was written; run dashbye plan again/.test(error.message));
});

test('disabled fields lock the draft even without a review status', () => {
  const lock = { ...UNLOCKED, listingFieldsDisabled: true };
  assert.equal(isLocked(lock), true);
  assert.throws(() => assertDraftEditable(lock), /Store listing fields are read-only/);
});

test('sync-draft refuses a plan made while the draft was locked', () => {
  assert.doesNotThrow(() => assertPlanWritable({}));
  assert.doesNotThrow(() => assertPlanWritable({ blocking: [] }));
  assert.throws(() => assertPlanWritable({ blocking: ['item is in review; drafts cannot be edited until review completes'] }), DraftLockedError);
});

test('a section is locked only when every visible text field is disabled', () => {
  assert.equal(fieldsLocked([]), false);
  assert.equal(fieldsLocked([false, false]), false);
  // "No remote code" disables only that card's justification field.
  assert.equal(fieldsLocked([false, false, false, false, false, false, false, true, false]), false);
  assert.equal(fieldsLocked([true, true, true]), true);
});
