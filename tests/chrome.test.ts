import test from 'node:test';
import assert from 'node:assert/strict';
import { chromeExecutableCandidates, chromeLaunchArgs, chromeStatus, connectChrome, ensureChrome, isNoWindowError } from '../src/chrome.js';

const mac = { platform: 'darwin' as const, home: '/Users/u', env: {} };

test('lists official Chrome locations per platform, honouring an absolute override', () => {
  assert.deepEqual(chromeExecutableCandidates(mac), [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Users/u/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]);
  assert.equal(chromeExecutableCandidates({ ...mac, env: { DASHBYE_CHROME: '/opt/chrome' } })[0], '/opt/chrome');
  assert.equal(chromeExecutableCandidates({ ...mac, env: { DASHBYE_CHROME: 'chrome' } })[0], '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  const windows = chromeExecutableCandidates({ platform: 'win32', home: 'C:\\Users\\u', env: { PROGRAMFILES: 'C:\\Program Files', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' } });
  assert.ok(windows.some(path => path.endsWith('chrome.exe')));
  assert.ok(chromeExecutableCandidates({ platform: 'linux', home: '/home/u', env: {} }).includes('/usr/bin/google-chrome'));
});

test('launches the dedicated profile on the configured loopback port', () => {
  assert.deepEqual(chromeLaunchArgs('/state/chrome-profile', 'http://127.0.0.1:9444'), [
    '--user-data-dir=/state/chrome-profile',
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=9444',
    '--no-first-run',
    '--no-default-browser-check',
    'https://chromewebstore.google.com/devconsole',
  ]);
});

function fakes(reachableAfter: number, pages: Array<number | null> = [1]) {
  let checks = 0;
  let listings = 0;
  const spawned: Array<{ command: string; args: string[] }> = [];
  return {
    spawned,
    deps: {
      context: mac,
      exists: async (path: string) => path.startsWith('/Applications/'),
      reachable: async () => { checks += 1; return checks > reachableAfter; },
      // Each listing returns the next count; the last one repeats.
      pageTargets: async () => pages[Math.min(listings++, pages.length - 1)]!,
      spawn: (command: string, args: string[]) => { spawned.push({ command, args }); },
      ensureProfile: async () => {},
      sleep: async () => {},
    },
  };
}

test('does nothing when the endpoint already answers', async () => {
  const { spawned, deps } = fakes(0);
  assert.deepEqual(await ensureChrome('http://127.0.0.1:9333', { launch: true }, deps), { launched: false, windowOpened: false });
  assert.equal(spawned.length, 0);
});

test('launches Chrome and waits for the endpoint', async () => {
  const { spawned, deps } = fakes(3);
  assert.deepEqual(await ensureChrome('http://127.0.0.1:9333', { launch: true }, deps), { launched: true, windowOpened: false });
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0]!.command, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  assert.ok(spawned[0]!.args.includes('--remote-debugging-port=9333'));
});

test('refuses to launch when launching is disabled', async () => {
  const { spawned, deps } = fakes(Infinity);
  await assert.rejects(ensureChrome('http://127.0.0.1:9333', { launch: false }, deps), /dedicated Chrome is not running.*dashbye doctor --login/);
  assert.equal(spawned.length, 0);
});

test('reports a missing Chrome installation', async () => {
  const { deps } = fakes(Infinity);
  await assert.rejects(ensureChrome('http://127.0.0.1:9333', { launch: true }, { ...deps, exists: async () => false }), /official Chrome was not found.*DASHBYE_CHROME/);
});

test('explains when the endpoint never opens', async () => {
  const { deps } = fakes(Infinity);
  await assert.rejects(ensureChrome('http://127.0.0.1:9333', { launch: true }, deps), /did not open the debugging endpoint/);
});

const PROTOCOL_ERROR = 'Protocol error (Browser.setDownloadBehavior): Browser context management is not supported.';

test('classifies a running Chrome without page targets as windowless', async () => {
  const status = (reachable: boolean, pages: number | null) => chromeStatus('http://127.0.0.1:9333', { reachable: async () => reachable, pageTargets: async () => pages });
  assert.equal(await status(false, null), 'unreachable');
  assert.equal(await status(true, 0), 'no-window');
  assert.equal(await status(true, 2), 'ready');
  // An unreadable list is left to the connection attempt.
  assert.equal(await status(true, null), 'ready');
});

test('opens a Dashboard window in a running Chrome that has none', async () => {
  const { spawned, deps } = fakes(0, [0, 0, 0, 1]);
  assert.deepEqual(await ensureChrome('http://127.0.0.1:9333', { launch: true }, deps), { launched: false, windowOpened: true });
  assert.equal(spawned.length, 1);
  // The same profile routes the URL to the running instance.
  assert.ok(spawned[0]!.args.some(arg => arg.startsWith('--user-data-dir=') && arg.endsWith('chrome-profile')));
  assert.equal(spawned[0]!.args.at(-1), 'https://chromewebstore.google.com/devconsole');
});

test('explains a windowless Chrome when launching is disabled', async () => {
  const { spawned, deps } = fakes(0, [0]);
  await assert.rejects(ensureChrome('http://127.0.0.1:9333', { launch: false }, deps), /running without an open window.*dashbye doctor --login.*Cmd\+N/);
  assert.equal(spawned.length, 0);
});

test('explains when no window appears after asking Chrome for one', async () => {
  const { spawned, deps } = fakes(0, [0]);
  await assert.rejects(ensureChrome('http://127.0.0.1:9333', { launch: true }, deps), /still has no open window.*Cmd\+N/);
  assert.equal(spawned.length, 1);
});

test('replaces the Playwright protocol error for a windowless Chrome', async () => {
  assert.equal(isNoWindowError(new Error(PROTOCOL_ERROR)), true);
  assert.equal(isNoWindowError(new Error('connect ECONNREFUSED')), false);
  await assert.rejects(connectChrome('http://127.0.0.1:9333', async () => { throw new Error(PROTOCOL_ERROR); }), (error: Error) => {
    assert.match(error.message, /running without an open window/);
    assert.doesNotMatch(error.message, /Protocol error/);
    return true;
  });
  await assert.rejects(connectChrome('http://127.0.0.1:9333', async () => { throw new Error('connect ECONNREFUSED'); }), /ECONNREFUSED/);
  assert.equal(await connectChrome('http://127.0.0.1:9333', async () => 'browser'), 'browser');
});
