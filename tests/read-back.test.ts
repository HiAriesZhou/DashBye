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
