import test from 'node:test';
import assert from 'node:assert/strict';
import { combinePlans, confirmQuestion, formatMultiPlan, parsePlanFile, planForRun, selectStores, storesToRun } from '../src/multi-plan.js';
import { chromeApprovalHash, type ReconciliationPlan } from '../src/reconcile.js';
import { firefoxApprovalHash, type FirefoxPlan } from '../src/stores/firefox/plan.js';
import { edgeApprovalHash, type EdgePlan } from '../src/stores/edge/index.js';

function chrome(artifactSha256 = 'a', operations: ReconciliationPlan['operations'] = []): ReconciliationPlan {
  const base = { schema: 'dashbye/plan/v2' as const, itemIdHash: 'i', artifactSha256, releaseHash: 'r', remoteHash: 'h', operations };
  return { ...base, approvalHash: chromeApprovalHash(base) };
}

function edge(): EdgePlan {
  const base = {
    schema: 'dashbye/edge-plan/v1' as const, productIdHash: 'p', artifactSha256: 'e', version: '1.2.0',
    operations: [{ area: 'package' as const, action: 'upload' as const, field: 'draftPackage' as const, after: '1.2.0' }], blocking: [],
  };
  return { ...base, approvalHash: edgeApprovalHash(base) };
}

function firefox(differences: FirefoxPlan['differences'] = [], blocking: string[] = [], mode: FirefoxPlan['mode'] = 'validate'): FirefoxPlan {
  const base = {
    schema: 'dashbye/firefox-plan/v2' as const, mode, addonHash: 'a', slug: 'x', artifactSha256: 'b', releaseHash: 'c', remoteHash: 'd',
    version: { local: '1.2.0', remote: '1.1.0' }, differences, blocking,
  };
  return { ...base, approvalHash: firefoxApprovalHash(base) };
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

test('rejects changed Chrome operations with the stored hashes intact', () => {
  const plan = structuredClone(combinePlans({ chrome: chrome() }, []));
  plan.stores.chrome!.operations.push({ area: 'listing', action: 'replace', field: 'screenshots', before: 1, after: 2, destructive: true, ownerApprovalRequired: true });
  assert.throws(() => parsePlanFile(plan), /plan file was modified; run dashbye plan again/);
});

test('rejects changed Firefox differences with the stored hashes intact', () => {
  const plan = structuredClone(combinePlans({ firefox: firefox() }, []));
  plan.stores.firefox!.differences.push({ field: 'categories', action: 'update' });
  assert.throws(() => parsePlanFile(plan), /plan file was modified; run dashbye plan again/);
});

test('rejects a changed combined hash or pending stores', () => {
  const plan = combinePlans({ chrome: chrome() }, ['edge']);
  assert.throws(() => parsePlanFile({ ...plan, approvalHash: 'tampered' }), /plan file was modified/);
  assert.throws(() => parsePlanFile({ ...plan, pending: [] }), /plan file was modified/);
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

test('before approval, Firefox is validated only and listing changes wait for AMO', () => {
  const firefoxPlan = firefox([{ field: 'summary', action: 'update' }, { field: 'screenshots', action: 'replace', before: 1, after: 2 }]);
  const text = formatMultiPlan(combinePlans({ firefox: firefoxPlan }, []), {});
  assert.match(text, /Firefox Add-ons\n  Package 1\.2\.0 \(AMO: 1\.1\.0\)/);
  assert.match(text, /Listing changes wait until AMO approves 1\.2\.0:\n    summary\n    screenshots \(1 → 2\)/);
  assert.match(text, /uploads the package to AMO for validation only; submit it with dashbye submit/);
  const blocked = formatMultiPlan(combinePlans({ firefox: firefox(firefoxPlan.differences, ['package version 1.1.0 is not newer than the AMO version 1.1.0']) }, []), {});
  assert.match(blocked, /Blocked: package version 1\.1\.0 is not newer/);
});

test('after approval, Firefox lists the fields sync-draft updates and those left to AMO Developer Hub', () => {
  const text = formatMultiPlan(combinePlans({ firefox: firefox([{ field: 'description', action: 'update' }, { field: 'supportUrl', action: 'update' }], [], 'listing') }, []), {});
  assert.match(text, /AMO approved 1\.2\.0\. sync-draft updates:\n    description/);
  assert.match(text, /Update by hand in AMO Developer Hub:\n    supportUrl/);
  assert.equal(confirmQuestion(combinePlans({ firefox: firefox([{ field: 'description', action: 'update' }], [], 'listing') }, [])), 'Update the AMO listing?');
});

test('Edge uploads the package to the draft and leaves the listing and publishing to Partner Center', () => {
  const plan = combinePlans({ edge: edge() }, []);
  assert.deepEqual(parsePlanFile(JSON.parse(JSON.stringify(plan))), plan);
  const text = formatMultiPlan(plan, {});
  assert.match(text, /Microsoft Edge Add-ons\n  Package 1\.2\.0 → draft submission/);
  assert.match(text, /Store listing and publishing stay in Partner Center/);
  assert.equal(confirmQuestion(plan), 'Upload the Edge package to its draft?');
  const tampered = structuredClone(plan);
  tampered.stores.edge!.version = '9.9.9';
  assert.throws(() => parsePlanFile(tampered), /plan file was modified/);
});

test('asks one question that names what will happen in each store', () => {
  const firefoxPlan = firefox();
  const change = [{ area: 'listing' as const, action: 'update' as const, field: 'description', before: 'a', after: 'b', destructive: false, ownerApprovalRequired: false }];
  assert.equal(confirmQuestion(combinePlans({ chrome: chrome('1', change) }, [])), 'Save these changes to the Dashboard draft?');
  assert.equal(confirmQuestion(combinePlans({ chrome: chrome('1') }, [])), 'Verify the draft and record the release lock?');
  assert.equal(confirmQuestion(combinePlans({ chrome: chrome('1', change), firefox: firefoxPlan }, [])), 'Save these changes to the Dashboard draft and validate the Firefox package on AMO?');
  assert.equal(confirmQuestion(combinePlans({ firefox: firefoxPlan }, [])), 'Upload the Firefox package to AMO for validation?');
});

test('an explicit pending Edge selection runs no store', () => {
  const plan = combinePlans({ chrome: chrome(), firefox: firefox() }, ['edge']);
  assert.deepEqual(storesToRun(plan, 'edge'), { run: [], pending: ['edge'] });
  assert.deepEqual(storesToRun(plan, 'firefox'), { run: ['firefox'], pending: [] });
  assert.deepEqual(storesToRun(plan), { run: ['chrome', 'firefox'], pending: ['edge'] });
});

test('confirmation text shows only selected stores', () => {
  const change = [{ area: 'listing' as const, action: 'update' as const, field: 'description', before: 'a', after: 'b', destructive: false, ownerApprovalRequired: false }];
  const approved = combinePlans({ chrome: chrome('1', change), firefox: firefox() }, ['edge']);
  const { run, pending } = storesToRun(approved, 'firefox');
  const shown = planForRun(approved, run, pending);
  assert.match(formatMultiPlan(shown, { chrome: { itemId: 'a'.repeat(32), language: 'English' } }), /Firefox Add-ons/);
  assert.doesNotMatch(formatMultiPlan(shown, { chrome: { itemId: 'a'.repeat(32), language: 'English' } }), /Chrome Web Store|Edge Add-ons/);
  assert.equal(confirmQuestion(shown), 'Upload the Firefox package to AMO for validation?');
});

test('binds the lock reasons of a Chrome plan and keeps editable plans compatible', () => {
  const editable = chrome('1');
  const blockedBase = { ...editable, approvalHash: undefined, blocking: ['item is in review; drafts cannot be edited until review completes'] };
  const blocked = { ...blockedBase, approvalHash: chromeApprovalHash(blockedBase) };
  assert.notEqual(blocked.approvalHash, editable.approvalHash);
  assert.equal(chromeApprovalHash({ ...editable, blocking: [] }), editable.approvalHash);
  const plan = combinePlans({ chrome: blocked }, []);
  assert.deepEqual(parsePlanFile(JSON.parse(JSON.stringify(plan))), plan);
  const unblocked = structuredClone(plan);
  delete unblocked.stores.chrome!.blocking;
  assert.throws(() => parsePlanFile(unblocked), /plan file was modified/);
  assert.throws(() => parsePlanFile({ ...plan, stores: { chrome: { ...blocked, blocking: [1] } } }), /invalid plan/);
});
