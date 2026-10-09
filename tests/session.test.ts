import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { LoginRequiredError } from '../src/dashboard-v2.js';
import { askYesNo, openDashboard } from '../src/session.js';

async function answer(text: string): Promise<{ result: boolean; prompt: string }> {
  const input = new PassThrough();
  const output = new PassThrough();
  let prompt = '';
  output.on('data', chunk => { prompt += chunk.toString(); });
  const pending = askYesNo('Save these changes to the Dashboard draft?', { input, output });
  input.end(text);
  return { result: await pending, prompt };
}

test('Enter and yes confirm; no declines', async () => {
  assert.equal((await answer('\n')).result, true);
  assert.equal((await answer('y\n')).result, true);
  assert.equal((await answer('YES\n')).result, true);
  assert.equal((await answer('n\n')).result, false);
  assert.equal((await answer('no\n')).result, false);
});

test('shows a default-yes prompt and asks again after an unclear answer', async () => {
  const { result, prompt } = await answer('maybe\nn\n');
  assert.equal(result, false);
  assert.match(prompt, /Save these changes to the Dashboard draft\? \[Y\/n\] /);
  assert.equal(prompt.match(/\[Y\/n\]/g)?.length, 2);
});

test('closing the input declines', async () => {
  assert.equal((await answer('')).result, false);
});

function deps(failures: number) {
  let attempts = 0;
  const messages: string[] = [];
  return {
    messages,
    attempts: () => attempts,
    value: {
      ensure: async () => ({ launched: true }),
      connect: async () => ({}) as never,
      select: async () => {
        attempts += 1;
        if (attempts <= failures) throw new LoginRequiredError();
        return 'page' as never;
      },
      sleep: async () => {},
    },
  };
}

test('waits for manual sign-in in a terminal, then continues', async () => {
  const fake = deps(2);
  const result = await openDashboard('http://127.0.0.1:9333', 'a'.repeat(32), { launch: true, waitForLogin: true, notify: message => fake.messages.push(message) }, fake.value);
  assert.equal(result.page, 'page');
  assert.equal(fake.attempts(), 3);
  assert.equal(fake.messages.filter(message => /Sign in to Google/.test(message)).length, 1);
  assert.ok(fake.messages.some(message => /Opened the dedicated DashBye Chrome/.test(message)));
});

test('stops at the sign-in page when it may not wait', async () => {
  const fake = deps(1);
  await assert.rejects(
    openDashboard('http://127.0.0.1:9333', 'a'.repeat(32), { launch: true, waitForLogin: false, notify: () => {} }, fake.value),
    LoginRequiredError,
  );
  assert.equal(fake.attempts(), 1);
});

test('gives up after the sign-in wait limit', async () => {
  const fake = deps(Infinity);
  await assert.rejects(
    openDashboard('http://127.0.0.1:9333', 'a'.repeat(32), { launch: true, waitForLogin: true, notify: () => {}, loginAttempts: 3 }, fake.value),
    LoginRequiredError,
  );
  assert.equal(fake.attempts(), 3);
});

test('does not retry other Dashboard errors', async () => {
  const fake = deps(0);
  await assert.rejects(
    openDashboard('http://127.0.0.1:9333', 'a'.repeat(32), { launch: true, waitForLogin: true, notify: () => {} }, {
      ...fake.value,
      select: async () => { throw new Error('multiple publisher Dashboard contexts are open'); },
    }),
    /multiple publisher/,
  );
});
