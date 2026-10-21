import test from 'node:test';
import assert from 'node:assert/strict';
import { settleReadBack } from '../src/read-back.js';

const noSleep = async () => {};

test('returns the first read-back without rereading when nothing remains', async () => {
  let rereads = 0;
  const result = await settleReadBack(
    { remaining: 0 },
    async () => { rereads += 1; return { remaining: 0 }; },
    state => state.remaining,
    { attempts: 3, delayMs: 10, sleep: noSleep },
  );
  assert.deepEqual(result, { state: { remaining: 0 }, remaining: 0, rereads: 0 });
  assert.equal(rereads, 0);
});

test('rereads until the Dashboard settles to zero remaining operations', async () => {
  const states = [{ remaining: 1 }, { remaining: 0 }];
  const delays: number[] = [];
  const result = await settleReadBack(
    { remaining: 2 },
    async () => states.shift()!,
    state => state.remaining,
    { attempts: 5, delayMs: 250, sleep: async ms => { delays.push(ms); } },
  );
  assert.deepEqual(result, { state: { remaining: 0 }, remaining: 0, rereads: 2 });
  assert.deepEqual(delays, [250, 250]);
});

test('stops after the attempt limit and reports the last difference', async () => {
  let rereads = 0;
  const result = await settleReadBack(
    { remaining: 1 },
    async () => { rereads += 1; return { remaining: 1 }; },
    state => state.remaining,
    { attempts: 3, delayMs: 10, sleep: noSleep },
  );
  assert.equal(rereads, 3);
  assert.deepEqual(result, { state: { remaining: 1 }, remaining: 1, rereads: 3 });
});

test('rejects invalid retry options', async () => {
  await assert.rejects(
    settleReadBack({ remaining: 1 }, async () => ({ remaining: 0 }), state => state.remaining, { attempts: -1, delayMs: 10 }),
    /attempts/,
  );
  await assert.rejects(
    settleReadBack({ remaining: 1 }, async () => ({ remaining: 0 }), state => state.remaining, { attempts: 1, delayMs: -5 }),
    /delayMs/,
  );
});

test('an unconfirmed save retries only the remaining approved work, once', async () => {
  const { applyWithRetry } = await import('../src/read-back.js');
  const applied: string[][] = [];
  const result = await applyWithRetry({
    approved: ['package', 'description', 'privacy'],
    apply: async plan => { applied.push(plan); if (applied.length === 1) throw new Error('Save draft did not settle'); return 'saved'; },
    read: async () => 'partly saved',
    remaining: () => ['description'],
    withinApproved: remaining => remaining.every(op => ['package', 'description', 'privacy'].includes(op)),
    retryPlan: () => ['description'],
  });
  assert.equal(result, 'saved');
  assert.deepEqual(applied, [['package', 'description', 'privacy'], ['description']]);
});

test('no retry when nothing remains, when work falls outside the approval, or for other errors', async () => {
  const { applyWithRetry } = await import('../src/read-back.js');
  const settle = async () => { throw new Error('Save draft did not settle'); };
  assert.equal(await applyWithRetry({ approved: ['a'], apply: settle, read: async () => 'done', remaining: () => [], withinApproved: () => true, retryPlan: () => [] }), 'done');
  await assert.rejects(applyWithRetry({ approved: ['a'], apply: settle, read: async () => 'x', remaining: () => ['b'], withinApproved: () => false, retryPlan: () => ['b'] }), /differs from the approved plan/);
  await assert.rejects(applyWithRetry({ approved: ['a'], apply: async () => { throw new Error('selector missing'); }, read: async () => 'x', remaining: () => ['a'], withinApproved: () => true, retryPlan: () => ['a'] }), /selector missing/);
  let calls = 0;
  await assert.rejects(applyWithRetry({ approved: ['a'], apply: async () => { calls += 1; throw new Error('Save draft did not settle'); }, read: async () => 'x', remaining: () => ['a'], withinApproved: () => true, retryPlan: () => ['a'] }), /did not settle/);
  assert.equal(calls, 2);
});
