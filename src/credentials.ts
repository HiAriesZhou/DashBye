import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { appStateDir } from './paths.js';

export type AmoCredentials = { issuer: string; secret: string };
export type EdgeCredentials = { clientId: string; apiKey: string };

export const credentialsFile = () => join(appStateDir(), 'credentials.json');

type Env = Record<string, string | undefined>;

// Store API keys come from the environment or a private file in the state directory,
// never from the repository or the project configuration.
async function readEntry(file: string, store: 'amo' | 'edge'): Promise<Record<string, unknown>> {
  const info = await stat(file).catch(() => null);
  if (!info) return {};
  if (process.platform !== 'win32' && (info.mode & 0o077)) throw new Error(`${file} must be readable only by you; run chmod 600 on it`);
  const entry = (JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>)[store];
  return entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
}

const filled = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

export async function loadAmoCredentials(env: Env = process.env, file = credentialsFile()): Promise<AmoCredentials | null> {
  if (env.DASHBYE_AMO_ISSUER && env.DASHBYE_AMO_SECRET) return { issuer: env.DASHBYE_AMO_ISSUER, secret: env.DASHBYE_AMO_SECRET };
  const { issuer, secret } = await readEntry(file, 'amo');
  return filled(issuer) && filled(secret) ? { issuer, secret } : null;
}

export async function loadEdgeCredentials(env: Env = process.env, file = credentialsFile()): Promise<EdgeCredentials | null> {
  if (env.DASHBYE_EDGE_CLIENT_ID && env.DASHBYE_EDGE_API_KEY) return { clientId: env.DASHBYE_EDGE_CLIENT_ID, apiKey: env.DASHBYE_EDGE_API_KEY };
  const { clientId, apiKey } = await readEntry(file, 'edge');
  return filled(clientId) && filled(apiKey) ? { clientId, apiKey } : null;
}
