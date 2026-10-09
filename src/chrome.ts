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

const defaults: ChromeDependencies = {
  context: { platform: process.platform, home: homedir(), env: process.env },
  exists: path => access(path, constants.X_OK).then(() => true, () => false),
  reachable: endpointReachable,
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

// Opens official Chrome with the dedicated DashBye profile when the configured
// loopback endpoint is not answering. Sign-in always remains manual.
export async function ensureChrome(endpoint: string, options: { launch: boolean }, overrides: Partial<ChromeDependencies> = {}): Promise<{ launched: boolean }> {
  const deps = { ...defaults, ...overrides };
  if (await deps.reachable(endpoint)) return { launched: false };
  if (!options.launch) throw new Error(`dedicated Chrome is not running at ${endpoint}; run "dashbye chrome" or omit --no-launch`);
  const executable = await findChrome(deps);
  const profile = chromeProfileDir(deps.context);
  await deps.ensureProfile(profile);
  deps.spawn(executable, chromeLaunchArgs(profile, endpoint));
  for (let attempt = 0; attempt < LAUNCH_ATTEMPTS; attempt += 1) {
    await deps.sleep(LAUNCH_POLL_MS);
    if (await deps.reachable(endpoint)) return { launched: true };
  }
  throw new Error('Chrome did not open the debugging endpoint; if a window using the DashBye profile is already open without it, quit that Chrome and retry');
}
