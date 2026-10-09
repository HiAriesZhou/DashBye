import { createInterface } from 'node:readline';
import { chromium, type Browser, type Page } from 'playwright-core';
import { ensureChrome } from './chrome.js';
import { LoginRequiredError, selectDashboardPage } from './dashboard-v2.js';

const LOGIN_POLL_MS = 3_000;
const LOGIN_ATTEMPTS = 200; // about ten minutes

// Enter means yes. A closed input declines, so an unattended run never writes.
export function askYesNo(question: string, streams: { input: NodeJS.ReadableStream; output: NodeJS.WritableStream }): Promise<boolean> {
  const lines = createInterface({ input: streams.input, terminal: false });
  const iterator = lines[Symbol.asyncIterator]();
  const ask = async (): Promise<boolean> => {
    streams.output.write(`${question} [Y/n] `);
    const next = await iterator.next();
    if (next.done) return false;
    const reply = String(next.value).trim().toLowerCase();
    if (reply === '' || reply === 'y' || reply === 'yes') return true;
    if (reply === 'n' || reply === 'no') return false;
    return ask();
  };
  return ask().finally(() => lines.close());
}

export type SessionDependencies = {
  ensure: (endpoint: string, options: { launch: boolean }) => Promise<{ launched: boolean }>;
  connect: (endpoint: string) => Promise<Browser>;
  select: (browser: Browser, itemId: string) => Promise<Page>;
  sleep: (ms: number) => Promise<void>;
};

const defaults: SessionDependencies = {
  ensure: ensureChrome,
  connect: endpoint => chromium.connectOverCDP(endpoint, { timeout: 30_000 }),
  select: selectDashboardPage,
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
};

export type SessionOptions = {
  launch: boolean;
  waitForLogin: boolean;
  notify: (message: string) => void;
  loginAttempts?: number;
};

// Opens (when allowed) the dedicated Chrome and selects the work page for the item.
// Sign-in is never automated; in a terminal DashBye waits while the person signs in.
// Retries reuse one connection, and page selection never opens extra login tabs.
export async function openDashboard(endpoint: string, itemId: string, options: SessionOptions, overrides: Partial<SessionDependencies> = {}): Promise<{ browser: Browser; page: Page }> {
  const deps = { ...defaults, ...overrides };
  const { launched } = await deps.ensure(endpoint, { launch: options.launch });
  if (launched) options.notify('Opened the dedicated DashBye Chrome.');
  const browser = await deps.connect(endpoint);
  const attempts = options.loginAttempts ?? LOGIN_ATTEMPTS;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return { browser, page: await deps.select(browser, itemId) };
    } catch (error) {
      if (!(error instanceof LoginRequiredError) || !options.waitForLogin || attempt >= attempts) throw error;
      if (attempt === 1) options.notify('Sign in to Google in the DashBye Chrome window; DashBye continues when the Dashboard opens. Press Ctrl+C to stop.');
      await deps.sleep(LOGIN_POLL_MS);
    }
  }
}
