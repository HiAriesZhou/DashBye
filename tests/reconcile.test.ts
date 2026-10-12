import test from 'node:test';
import assert from 'node:assert/strict';
import type { DashboardState, DesiredState } from '../src/reconcile.js';
import { createReconciliationPlan } from '../src/reconcile.js';
import { UNLOCKED } from '../src/edit-lock.js';
import type { LoadedWorkspace } from '../src/workspace.js';

const privacy = {
  singlePurposeHash: 'purpose', permissionJustificationHashes: { storage: 'storage' },
  hostPermissionJustificationHash: null, remoteCode: { uses: false, justificationHash: null },
  collectedData: [],
  certifications: { noSaleOrTransfer: true, relatedToSinglePurpose: true, noCreditworthinessUse: true },
  policyUrlHash: 'policy',
};

const listing = {
  language: 'English', descriptionHash: 'description', category: 'Tools', promoVideoUrlHash: null,
  iconVisualHash: '0000000000000000', screenshotVisualHashes: ['0000000000000000'],
  smallPromoVisualHash: null, marqueePromoVisualHash: null, officialUrlHash: null,
  homepageUrlHash: null, supportUrlHash: null, matureContent: false,
};

function current(): DashboardState {
  return { itemId: 'a'.repeat(32), packageVersion: '1.0.0', listing: structuredClone(listing), privacy: structuredClone(privacy), editLock: { ...UNLOCKED } };
}

function desired(): DesiredState {
  return {
    ...current(), packageVersion: '1.1.0', artifactPath: '/fixture/release.zip',
    listingFiles: { icon: '/fixture/icon.png', screenshots: ['/fixture/screenshot.png'], smallPromo: null, marqueePromo: null },
    listingValues: { description: 'Description', promoVideoUrl: null, officialUrl: null, homepageUrl: null, supportUrl: null },
    privacyValues: {
      singlePurpose: 'Purpose', permissionJustifications: { storage: 'Storage' }, hostPermissionJustification: null,
      remoteCode: { uses: false, justification: null }, collectedData: [],
      certifications: { noSaleOrTransfer: true, relatedToSinglePurpose: true, noCreditworthinessUse: true },
      policyUrl: 'https://example.com/privacy',
    },
  };
}

const workspace = {
  config: { target: { itemId: 'a'.repeat(32) } },
  artifact: { sha256: 'artifact' },
  release: { hash: 'release' },
} as LoadedWorkspace;

test('creates a stable package-only plan', () => {
  const first = createReconciliationPlan(workspace, desired(), current());
  const second = createReconciliationPlan(workspace, desired(), current());
  assert.deepEqual(first.operations, [{
    area: 'package', action: 'upload', field: 'packageVersion', before: '1.0.0', after: '1.1.0',
    destructive: false, ownerApprovalRequired: true,
  }]);
  assert.equal(first.approvalHash, second.approvalHash);
});

test('marks screenshot replacement and privacy edits for owner approval', () => {
  const target = desired();
  target.listing.screenshotVisualHashes = ['ffffffffffffffff'];
  target.privacy.collectedData = ['websiteContent'];
  const plan = createReconciliationPlan(workspace, target, current());
  const screenshots = plan.operations.find(operation => operation.field === 'screenshots');
  const collectedData = plan.operations.find(operation => operation.field === 'collectedData');
  assert.deepEqual({ action: screenshots?.action, destructive: screenshots?.destructive, approval: screenshots?.ownerApprovalRequired }, {
    action: 'replace', destructive: true, approval: true,
  });
  assert.equal(collectedData?.ownerApprovalRequired, true);
});

test('rejects a Dashboard state for another item', () => {
  const state = current();
  state.itemId = 'b'.repeat(32);
  assert.throws(() => createReconciliationPlan(workspace, desired(), state), /does not match/);
});

test('summarizes object-valued privacy fields as hashes instead of raw objects', () => {
  const target = desired();
  target.privacy.permissionJustificationHashes = { storage: 'changed' };
  const plan = createReconciliationPlan(workspace, target, current());
  const operation = plan.operations.find(item => item.field === 'permissionJustifications');
  assert.equal(operation?.action, 'update');
  assert.match(String(operation?.before), /^[0-9a-f]{64}$/);
  assert.match(String(operation?.after), /^[0-9a-f]{64}$/);
  assert.notEqual(operation?.before, operation?.after);
});

test('still plans a locked draft read-only and records why it cannot be written', () => {
  const editable = createReconciliationPlan(workspace, desired(), current());
  const locked = createReconciliationPlan(workspace, desired(), { ...current(), editLock: { pendingReview: true, listingFieldsDisabled: true, privacyFieldsDisabled: true } });
  assert.equal(editable.blocking, undefined);
  assert.deepEqual(locked.operations, editable.operations);
  assert.deepEqual(locked.blocking, ['item is in review; drafts cannot be edited until review completes']);
  assert.notEqual(locked.approvalHash, editable.approvalHash);
});

test('reports disabled fields as a lock even without a review status', () => {
  const plan = createReconciliationPlan(workspace, desired(), { ...current(), editLock: { ...UNLOCKED, privacyFieldsDisabled: true } });
  assert.deepEqual(plan.blocking, ['Privacy fields are read-only on the Dashboard']);
});
