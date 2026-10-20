import test from 'node:test';
import assert from 'node:assert/strict';
import { pickDisplay, toTopLeft, windowBoundsOn } from '../src/displays.js';

// NSScreen frames as read on a Mac: a built-in main display and one above it.
const screens = [
  { name: 'Built-in Retina Display', x: 0, y: 0, width: 1470, height: 956 },
  { name: 'MAG274UPF', x: -216, y: 956, width: 1920, height: 1080 },
  { name: '虚拟屏 3 · DashBye', x: 1704, y: 956, width: 1920, height: 1080 },
];

test('converts bottom-left screen frames to top-left window coordinates', () => {
  assert.deepEqual(toTopLeft(screens)[1], { name: 'MAG274UPF', left: -216, top: -1080, width: 1920, height: 1080 });
  assert.deepEqual(toTopLeft(screens)[0], { name: 'Built-in Retina Display', left: 0, top: 0, width: 1470, height: 956 });
});

test('picks a display by exact name, then by a unique partial name', () => {
  const displays = toTopLeft(screens);
  assert.equal(pickDisplay(displays, 'mag274upf')?.name, 'MAG274UPF');
  assert.equal(pickDisplay(displays, 'DashBye')?.name, '虚拟屏 3 · DashBye');
  assert.equal(pickDisplay(displays, 'Missing'), null);
  assert.equal(pickDisplay([...displays, { ...displays[2]!, name: '虚拟屏 4 · DashBye' }], 'DashBye'), null);
});

test('places the window inside the display with a margin', () => {
  const [, external] = toTopLeft(screens);
  assert.deepEqual(windowBoundsOn(external!), { left: -176, top: -1040, width: 1600, height: 1000 });
  assert.deepEqual(windowBoundsOn({ name: 'small', left: 0, top: 0, width: 1280, height: 800 }), { left: 40, top: 40, width: 1200, height: 720 });
});

function fakeSession(current: { left: number; top: number; width: number; height: number }) {
  const sent: Array<[string, unknown]> = [];
  return { sent, send: async (method: string, params?: unknown) => {
    sent.push([method, params]);
    if (method === 'Browser.getWindowForTarget') return { windowId: 7, bounds: { ...current, windowState: 'normal' } };
    return {};
  } };
}

test('moves only the DashBye window to the named display, once', async () => {
  const { placeOnDisplay } = await import('../src/displays.js');
  const displays = toTopLeft(screens);
  const notes: string[] = [];
  const session = fakeSession({ left: 100, top: 100, width: 1200, height: 800 });
  assert.equal(await placeOnDisplay(session, 'DashBye', { displays, notify: note => notes.push(note) }), 'moved');
  assert.deepEqual(session.sent.slice(1), [
    ['Browser.setWindowBounds', { windowId: 7, bounds: { windowState: 'normal' } }],
    ['Browser.setWindowBounds', { windowId: 7, bounds: { left: 1744, top: -1040, width: 1600, height: 1000 } }],
  ]);
  const already = fakeSession({ left: 1800, top: -1000, width: 1200, height: 800 });
  assert.equal(await placeOnDisplay(already, 'DashBye', { displays, notify: note => notes.push(note) }), 'already');
  assert.equal(already.sent.length, 1);
  const missing = fakeSession({ left: 100, top: 100, width: 1200, height: 800 });
  assert.equal(await placeOnDisplay(missing, 'Absent', { displays, notify: note => notes.push(note) }), 'not_found');
  assert.equal(missing.sent.length, 0);
  assert.match(notes.join('\n'), /display "Absent" was not found.*stays where it is/);
});
