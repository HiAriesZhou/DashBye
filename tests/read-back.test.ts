import test from 'node:test';
import assert from 'node:assert/strict';
import { settleReadBack } from '../src/read-back.js';

const noSleep = async () => {};

test('returns the first read-back without rereading when nothing remains', async () => {
  let reads = 0;
  const delays: number[] = [];
  const result = await settleReadBack(
    async () => { reads += 1; return { remaining: 0 }; },
    state => state.remaining,
    { attempts: 3, delayMs: 10, sleep: async ms => { delays.push(ms); } },
  );
  assert.deepEqual(result, { state: { remaining: 0 }, remaining: 0, rereads: 0 });
  assert.equal(reads, 1);
  assert.deepEqual(delays, []);
});

test('rereads until the Dashboard settles to zero remaining operations', async () => {
  const states = [{ remaining: 2 }, { remaining: 1 }, { remaining: 0 }];
  const delays: number[] = [];
  const result = await settleReadBack(
    async () => states.shift()!,
    state => state.remaining,
    { attempts: 5, delayMs: 250, sleep: async ms => { delays.push(ms); } },
  );
  assert.deepEqual(result, { state: { remaining: 0 }, remaining: 0, rereads: 2 });
  assert.deepEqual(delays, [250, 250]);
});

test('stops after the attempt limit and reports the last difference', async () => {
  let reads = 0;
  const result = await settleReadBack(
    async () => { reads += 1; return { remaining: 1 }; },
    state => state.remaining,
    { attempts: 3, delayMs: 10, sleep: noSleep },
  );
  assert.equal(reads, 4);
  assert.deepEqual(result, { state: { remaining: 1 }, remaining: 1, rereads: 3 });
});

test('retries a read that fails, such as a reload blocked by unsaved changes', async () => {
  const outcomes: Array<() => { remaining: number }> = [
    () => { throw new Error('page.reload: Timeout'); },
    () => ({ remaining: 0 }),
  ];
  const result = await settleReadBack(
    async () => outcomes.shift()!(),
    state => state.remaining,
    { attempts: 3, delayMs: 10, sleep: noSleep },
  );
  assert.deepEqual(result, { state: { remaining: 0 }, remaining: 0, rereads: 1 });
});

test('rethrows when the final read fails, even after an earlier difference', async () => {
  const outcomes: Array<() => { remaining: number }> = [
    () => ({ remaining: 1 }),
    () => { throw new Error('page.reload: Timeout'); },
  ];
  await assert.rejects(
    settleReadBack(async () => outcomes.shift()!(), state => state.remaining, { attempts: 1, delayMs: 10, sleep: noSleep }),
    /page\.reload: Timeout/,
  );
});

test('rejects invalid retry options', async () => {
  await assert.rejects(
    settleReadBack(async () => ({ remaining: 0 }), state => state.remaining, { attempts: -1, delayMs: 10 }),
    /attempts/,
  );
  await assert.rejects(
    settleReadBack(async () => ({ remaining: 0 }), state => state.remaining, { attempts: 1, delayMs: -5 }),
    /delayMs/,
  );
});
