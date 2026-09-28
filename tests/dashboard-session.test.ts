import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { isDashboardLoginUrl, selectDashboardPage } from '../src/dashboard-v2.js';

const itemId = 'a'.repeat(32);
const editor = `https://chromewebstore.google.com/devconsole/publisher-id/${itemId}/edit`;
const login = `https://accounts.google.com/signin?continue=${encodeURIComponent(editor)}`;

class FakePage {
  window = { name: '' };
  navigations: string[] = [];
  reloads = 0;
  constructor(public location: string, private owner: FakeContext) {}
  url() { return this.location; }
  context() { return this.owner as unknown as BrowserContext; }
  isClosed() { return false; }
  async evaluate(fn: Function, arg: unknown) {
    return runInNewContext(`(${fn.toString()})(arg)`, { window: this.window, arg });
  }
  async goto(url: string) {
    this.navigations.push(url);
    const destination = this.owner.redirect(url);
    if (new URL(destination).origin !== new URL(this.location).origin) this.window.name = '';
    this.location = destination;
  }
  async reload() { this.reloads += 1; }
  getByRole() { return { count: async () => 1 }; }
  locator() { return { first: () => ({ count: async () => 0 }) }; }
  // No close method: the selector must never close an existing page.
}

class FakeContext {
  tabs: FakePage[] = [];
  redirect = (url: string) => url;
  pages() { return this.tabs as unknown as Page[]; }
  async newPage() { return this.add('about:blank') as unknown as Page; }
  add(url: string) {
    const page = new FakePage(url, this);
    this.tabs.push(page);
    return page;
  }
  browser() { return { contexts: () => [this] } as unknown as Browser; }
}

test('duplicate editors are preserved; sequential commands reuse one separate work page', async () => {
  const context = new FakeContext();
  const first = context.add(editor);
  const second = context.add(editor + '?tab=privacy');
  first.window.name = 'user editor with unsaved work';
  second.window.name = 'another user editor';
  const selected = await selectDashboardPage(context.browser(), itemId);
  assert.equal(context.tabs.length, 3);
  assert.notEqual(selected, first);
  assert.notEqual(selected, second);
  assert.equal(selected.url(), editor);
  assert.equal(await selectDashboardPage(context.browser(), itemId), selected);
  assert.equal(await selectDashboardPage(context.browser(), itemId), selected);
  assert.equal(context.tabs.length, 3);
  assert.equal(context.tabs[2]!.reloads, 2);
  assert.deepEqual(first.navigations, []);
  assert.deepEqual(second.navigations, []);
  assert.equal(first.reloads + second.reloads, 0);
  assert.equal(first.window.name, 'user editor with unsaved work');
  assert.equal(second.window.name, 'another user editor');
});

test('legacy and current host aliases for one publisher are duplicates, not ambiguous targets', async () => {
  const context = new FakeContext();
  context.add(editor);
  context.add(`https://chrome.google.com/webstore/devconsole/publisher-id/${itemId}/edit?pli=1`);
  assert.equal((await selectDashboardPage(context.browser(), itemId)).url(), editor);
});

test('unrelated item tabs are not navigated when the exact target is present', async () => {
  const context = new FakeContext();
  context.add(editor);
  const unrelated = context.add(editor.replace('publisher-id', 'another-publisher').replace(itemId, 'b'.repeat(32)));
  await selectDashboardPage(context.browser(), itemId);
  assert.deepEqual(unrelated.navigations, []);
  assert.equal(unrelated.window.name, '');
});

test('different publisher or browser contexts still fail before creating a work page', async () => {
  const first = new FakeContext();
  first.add(editor);
  first.add(editor.replace('publisher-id', 'another-publisher'));
  await assert.rejects(selectDashboardPage(first.browser(), itemId), /multiple publisher/);
  assert.equal(first.tabs.length, 2);
  const second = new FakeContext();
  second.add(editor);
  first.tabs.pop();
  await assert.rejects(selectDashboardPage({
    contexts: () => [first, second],
  } as unknown as Browser, itemId), /multiple publisher/);
  assert.equal(first.tabs.length + second.tabs.length, 2);
});

test('a publisher landing page stays untouched while the work page opens the configured item', async () => {
  const context = new FakeContext();
  const landing = context.add('https://chromewebstore.google.com/devconsole/publisher-id');
  assert.equal((await selectDashboardPage(context.browser(), itemId)).url(), editor);
  assert.deepEqual(landing.navigations, []);
  assert.equal(context.tabs.length, 2);
});

test('repeated login failures do not open more tabs, including redirects that clear window.name', async () => {
  const context = new FakeContext();
  context.redirect = () => login;
  await assert.rejects(selectDashboardPage(context.browser(), itemId), /manual Google login/);
  assert.equal(context.tabs.length, 1);
  await assert.rejects(selectDashboardPage(context.browser(), itemId), /manual Google login/);
  context.tabs[0]!.window.name = '';
  await assert.rejects(selectDashboardPage(context.browser(), itemId), /manual Google login/);
  assert.equal(context.tabs.length, 1);
  // User finishes sign-in; cross-origin navigation can clear the ownership marker.
  context.tabs[0]!.location = editor;
  context.redirect = url => url;
  const selected = await selectDashboardPage(context.browser(), itemId);
  assert.equal(selected.url(), editor);
  assert.equal(await selectDashboardPage(context.browser(), itemId), selected);
  assert.equal(context.tabs.length, 2);
});

test('an existing Dashboard login prevents consuming other publisher landing pages', async () => {
  const context = new FakeContext();
  context.add(login);
  const landing = context.add('https://chromewebstore.google.com/devconsole/publisher-id');
  await assert.rejects(selectDashboardPage(context.browser(), itemId), /manual Google login/);
  assert.equal(context.tabs.length, 2);
  assert.deepEqual(landing.navigations, []);
});

test('stale exact user editors do not cause more work tabs while login is pending', async () => {
  const context = new FakeContext();
  const first = context.add(editor);
  const second = context.add(editor + '?tab=privacy');
  context.redirect = () => login;
  await assert.rejects(selectDashboardPage(context.browser(), itemId), /manual Google login/);
  assert.equal(context.tabs.length, 3);
  await assert.rejects(selectDashboardPage(context.browser(), itemId), /manual Google login/);
  context.tabs[2]!.window.name = '';
  await assert.rejects(selectDashboardPage(context.browser(), itemId), /manual Google login/);
  assert.equal(context.tabs.length, 3);
  assert.deepEqual(first.navigations, []);
  assert.deepEqual(second.navigations, []);
  assert.equal(first.reloads + second.reloads, 0);
});

test('login detection follows bounded return URLs and ignores unrelated Google sign-ins', () => {
  assert.equal(isDashboardLoginUrl(login), true);
  assert.equal(isDashboardLoginUrl(`https://accounts.google.com/signin?continue=${encodeURIComponent(login)}`), true);
  assert.equal(isDashboardLoginUrl('https://accounts.google.com/signin?continue=https://mail.google.com'), false);
  assert.equal(isDashboardLoginUrl('https://example.com/signin?continue=' + encodeURIComponent(editor)), false);
  assert.equal(isDashboardLoginUrl('not a URL'), false);
});
