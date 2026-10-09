import test from 'node:test';
import assert from 'node:assert/strict';
import { combinePlans, confirmQuestion, formatMultiPlan, parsePlanFile, selectStores } from '../src/multi-plan.js';
import type { ReconciliationPlan } from '../src/reconcile.js';

function chrome(hash: string, operations: ReconciliationPlan['operations'] = []): ReconciliationPlan {
  return { schema: 'dashbye/plan/v2', itemIdHash: 'i', artifactSha256: 'a', releaseHash: 'r', remoteHash: 'h', operations, approvalHash: hash };
}

test('binds the combined approval to every store plan and the pending stores', () => {
  const base = combinePlans({ chrome: chrome('1') }, ['edge']);
  assert.equal(base.schema, 'dashbye/plan/v3');
  assert.notEqual(base.approvalHash, combinePlans({ chrome: chrome('2') }, ['edge']).approvalHash);
  assert.notEqual(base.approvalHash, combinePlans({ chrome: chrome('1') }, []).approvalHash);
  assert.equal(base.approvalHash, combinePlans({ chrome: chrome('1') }, ['edge']).approvalHash);
});

test('rejects plans from older DashBye versions', () => {
  assert.throws(() => parsePlanFile(chrome('1')), /older DashBye.*run dashbye plan again/);
  assert.throws(() => parsePlanFile({ schema: 'dashbye/plan/v3' }), /invalid plan/);
  const plan = combinePlans({ chrome: chrome('1') }, []);
  assert.deepEqual(parsePlanFile(JSON.parse(JSON.stringify(plan))), plan);
});

test('limits work to configured stores', () => {
  assert.deepEqual(selectStores(['chrome', 'firefox']), ['chrome', 'firefox']);
  assert.deepEqual(selectStores(['chrome', 'firefox'], 'firefox'), ['firefox']);
  assert.throws(() => selectStores(['chrome'], 'edge'), /edge is not configured; configured stores: chrome/);
});

test('summarizes each store under its own heading', () => {
  const plan = combinePlans({ chrome: chrome('1', [{ area: 'listing', action: 'update', field: 'description', before: 'a', after: 'b', destructive: false, ownerApprovalRequired: false }]) }, ['firefox']);
  const text = formatMultiPlan(plan, { chrome: { itemId: 'a'.repeat(32), language: 'English' } });
  assert.match(text, /Chrome Web Store\n  Target: item a{32}, English\n  1 change:\n    Listing\s+update description/);
  assert.match(text, /Firefox Add-ons\n  Not supported in this DashBye version yet; nothing will be written\./);
});

test('explains that Firefox is validated only and lists changes to make in AMO', () => {
  const firefox = {
    schema: 'dashbye/firefox-plan/v1' as const, addonHash: 'a', slug: 'x-toc', artifactSha256: 'b', releaseHash: 'c', remoteHash: 'd',
    version: { local: '1.2.0', remote: '1.1.0' }, differences: [{ field: 'summary', action: 'update' as const }, { field: 'screenshots', action: 'replace' as const, before: 1, after: 2 }],
    blocking: [], approvalHash: 'e',
  };
  const text = formatMultiPlan(combinePlans({ firefox }, []), {});
  assert.match(text, /Firefox Add-ons\n  Package 1\.2\.0 \(AMO: 1\.1\.0\)/);
  assert.match(text, /Update by hand in AMO Developer Hub:\n    summary\n    screenshots \(1 → 2\)/);
  assert.match(text, /uploads the package to AMO for validation only/);
  const blocked = formatMultiPlan(combinePlans({ firefox: { ...firefox, blocking: ['package version 1.1.0 is not newer than the AMO version 1.1.0'] } }, []), {});
  assert.match(blocked, /Blocked: package version 1\.1\.0 is not newer/);
});

test('asks one question that names what will happen in each store', () => {
  const firefox = { schema: 'dashbye/firefox-plan/v1' as const, addonHash: 'a', slug: 'x', artifactSha256: 'b', releaseHash: 'c', remoteHash: 'd', version: { local: '1', remote: null }, differences: [], blocking: [], approvalHash: 'e' };
  const change = [{ area: 'listing' as const, action: 'update' as const, field: 'description', before: 'a', after: 'b', destructive: false, ownerApprovalRequired: false }];
  assert.equal(confirmQuestion(combinePlans({ chrome: chrome('1', change) }, [])), 'Save these changes to the Dashboard draft?');
  assert.equal(confirmQuestion(combinePlans({ chrome: chrome('1') }, [])), 'Verify the draft and record the release lock?');
  assert.equal(confirmQuestion(combinePlans({ chrome: chrome('1', change), firefox }, [])), 'Save these changes to the Dashboard draft and validate the Firefox package on AMO?');
  assert.equal(confirmQuestion(combinePlans({ firefox }, [])), 'Upload the Firefox package to AMO for validation?');
});
