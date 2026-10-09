import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { sha256 } from './hash.js';

export type PlatformContext = { platform: NodeJS.Platform; home: string; env: Record<string, string | undefined> };

const current = (): PlatformContext => ({ platform: process.platform, home: homedir(), env: process.env });

// Plans, inspect results, and the dedicated Chrome profile live outside every
// repository, in the platform's per-user application state directory.
export function appStateDir(context: PlatformContext = current()): string {
  if (context.platform === 'darwin') return join(context.home, 'Library', 'Application Support', 'DashBye');
  if (context.platform === 'win32') return join(context.env.LOCALAPPDATA || join(context.home, 'AppData', 'Local'), 'DashBye');
  const xdg = context.env.XDG_STATE_HOME;
  return join(xdg && isAbsolute(xdg) ? xdg : join(context.home, '.local', 'state'), 'dashbye');
}

export function chromeProfileDir(context: PlatformContext = current()): string {
  return join(appStateDir(context), 'chrome-profile');
}

// The directory name is a hash prefix so paths and logs never contain the item ID.
export function itemStateDir(itemId: string, context: PlatformContext = current()): string {
  return join(appStateDir(context), 'items', sha256(itemId).slice(0, 16));
}

export async function ensurePrivateDir(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
}

export async function writePrivateFile(path: string, contents: string): Promise<void> {
  await ensurePrivateDir(dirname(path));
  await writeFile(path, contents, { mode: 0o600 });
  await chmod(path, 0o600);
}
