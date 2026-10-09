import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { appStateDir } from './paths.js';

export type AmoCredentials = { issuer: string; secret: string };

export const credentialsFile = () => join(appStateDir(), 'credentials.json');

// AMO API keys come from the environment or a private file in the state directory,
// never from the repository or the project configuration.
export async function loadAmoCredentials(env: Record<string, string | undefined> = process.env, file = credentialsFile()): Promise<AmoCredentials | null> {
  if (env.DASHBYE_AMO_ISSUER && env.DASHBYE_AMO_SECRET) return { issuer: env.DASHBYE_AMO_ISSUER, secret: env.DASHBYE_AMO_SECRET };
  const info = await stat(file).catch(() => null);
  if (!info) return null;
  if (process.platform !== 'win32' && (info.mode & 0o077)) throw new Error(`${file} must be readable only by you; run chmod 600 on it`);
  const raw = JSON.parse(await readFile(file, 'utf8')) as { amo?: { issuer?: unknown; secret?: unknown } };
  const { issuer, secret } = raw.amo ?? {};
  return typeof issuer === 'string' && typeof secret === 'string' && issuer && secret ? { issuer, secret } : null;
}
