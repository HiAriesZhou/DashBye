import { spawn as spawnProcess } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { chromeProfileDir, ensurePrivateDir, type PlatformContext } from './paths.js';
import { normalizeLoopbackEndpoint } from './security.js';

export const DASHBOARD_URL = 'https://chromewebstore.google.com/devconsole';
const LAUNCH_ATTEMPTS = 40;
const LAUNCH_POLL_MS = 500;

export type ChromeDependencies = {
  context: PlatformContext;
  exists: (path: string) => Promise<boolean>;
  reachable: (endpoint: string) => Promise<boolean>;
  // Open page targets, or null when the list could not be read.
  pageTargets: (endpoint: string) => Promise<number | null>;
  spawn: (command: string, args: string[]) => void;
  ensureProfile: (directory: string) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
};

export function chromeExecutableCandidates(context: PlatformContext): string[] {
  const override = context.env.DASHBYE_CHROME;
  const preferred = override && isAbsolute(override) ? [override] : [];
  if (context.platform === 'darwin') {
    const app = join('Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome');
    return [...preferred, join('/Applications', app), join(context.home, 'Applications', app)];
  }
  if (context.platform === 'win32') {
    const exe = join('Google', 'Chrome', 'Application', 'chrome.exe');
    const roots = [context.env.PROGRAMFILES, context.env['PROGRAMFILES(X86)'], context.env.LOCALAPPDATA];
    return [...preferred, ...roots.filter((root): root is string => Boolean(root)).map(root => join(root, exe))];
  }
  return [...preferred, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome'];
}

export function chromeLaunchArgs(profileDir: string, endpoint: string): string[] {
  const port = new URL(normalizeLoopbackEndpoint(endpoint)).port;
  return [
    `--user-data-dir=${profileDir}`,
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${port}`,
    '--no-first-run',
    '--no-default-browser-check',
    DASHBOARD_URL,
  ];
}

export async function endpointReachable(endpoint: string): Promise<boolean> {
  try {
    const response = await fetch(`${normalizeLoopbackEndpoint(endpoint)}/json/version`, { signal: AbortSignal.timeout(1_500) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function countPageTargets(endpoint: string): Promise<number | null> {
  try {
    const response = await fetch(`${normalizeLoopbackEndpoint(endpoint)}/json/list`, { signal: AbortSignal.timeout(1_500) });
    if (!response.ok) return null;
    const targets: unknown = await response.json();
    if (!Array.isArray(targets)) return null;
    return targets.filter(target => typeof target === 'object' && target !== null && (target as { type?: unknown }).type === 'page').length;
  } catch {
    return null;
  }
}

// On macOS, closing every window leaves Chrome running with the debugging endpoint
// still answering but no page target and no default browser context. Playwright
// then fails while connecting with this protocol error.
const NO_CONTEXT_ERROR = /Browser context management is not supported/;

export function isNoWindowError(error: unknown): boolean {
  return error instanceof Error && NO_CONTEXT_ERROR.test(error.message);
}

export function noWindowMessage(endpoint: string): string {
  return `the dedicated DashBye Chrome at ${endpoint} is running without an open window; run "dashbye chrome" or open a new window in it (Cmd+N / Ctrl+N), then retry`;
}

// The window may close between the check and the connection; explain that case
// instead of surfacing Playwright's protocol error.
export async function connectChrome<T>(endpoint: string, connect: (endpoint: string) => Promise<T>): Promise<T> {
  try {
    return await connect(endpoint);
  } catch (error) {
    if (isNoWindowError(error)) throw new Error(noWindowMessage(endpoint));
    throw error;
  }
}

export type ChromeStatus = 'unreachable' | 'no-window' | 'ready';

export async function chromeStatus(endpoint: string, deps: Pick<ChromeDependencies, 'reachable' | 'pageTargets'>): Promise<ChromeStatus> {
  if (!await deps.reachable(endpoint)) return 'unreachable';
  // An unreadable target list is left to the connection attempt to explain.
  return await deps.pageTargets(endpoint) === 0 ? 'no-window' : 'ready';
}

const defaults: ChromeDependencies = {
  context: { platform: process.platform, home: homedir(), env: process.env },
  exists: path => access(path, constants.X_OK).then(() => true, () => false),
  reachable: endpointReachable,
  pageTargets: countPageTargets,
  // Detached so Chrome keeps running, and keeps its session, after DashBye exits.
  spawn: (command, args) => spawnProcess(command, args, { detached: true, stdio: 'ignore' }).unref(),
  ensureProfile: ensurePrivateDir,
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
};

async function findChrome(deps: ChromeDependencies): Promise<string> {
  for (const candidate of chromeExecutableCandidates(deps.context)) {
    if (await deps.exists(candidate)) return candidate;
  }
  throw new Error('official Chrome was not found; install Google Chrome or set DASHBYE_CHROME to its absolute executable path');
}

async function waitFor(deps: ChromeDependencies, ready: () => Promise<boolean>): Promise<boolean> {
  for (let attempt = 0; attempt < LAUNCH_ATTEMPTS; attempt += 1) {
    await deps.sleep(LAUNCH_POLL_MS);
    if (await ready()) return true;
  }
  return false;
}

export type EnsureChromeResult = { launched: boolean; windowOpened: boolean };

// Opens official Chrome with the dedicated DashBye profile when the configured
// loopback endpoint is not answering, or a Dashboard window when that Chrome is
// running with every window closed. Re-running Chrome with the same profile hands
// the URL to the running instance. Sign-in always remains manual.
export async function ensureChrome(endpoint: string, options: { launch: boolean }, overrides: Partial<ChromeDependencies> = {}): Promise<EnsureChromeResult> {
  const deps = { ...defaults, ...overrides };
  const status = await chromeStatus(endpoint, deps);
  if (status === 'ready') return { launched: false, windowOpened: false };
  if (!options.launch) {
    throw new Error(status === 'no-window'
      ? noWindowMessage(endpoint)
      : `dedicated Chrome is not running at ${endpoint}; run "dashbye chrome" or omit --no-launch`);
  }
  const executable = await findChrome(deps);
  const profile = chromeProfileDir(deps.context);
  await deps.ensureProfile(profile);
  deps.spawn(executable, chromeLaunchArgs(profile, endpoint));
  if (status === 'no-window') {
    if (await waitFor(deps, async () => (await deps.pageTargets(endpoint) ?? 0) > 0)) return { launched: false, windowOpened: true };
    throw new Error(`the dedicated DashBye Chrome at ${endpoint} still has no open window; open a new window in it (Cmd+N / Ctrl+N), then retry`);
  }
  if (await waitFor(deps, () => deps.reachable(endpoint))) return { launched: true, windowOpened: false };
  throw new Error('Chrome did not open the debugging endpoint; if a window using the DashBye profile is already open without it, quit that Chrome and retry');
}
