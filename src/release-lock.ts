import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import type { ManifestFacts } from './artifact.js';
import type { LoadedWorkspace } from './workspace.js';

export type ReleaseLock = {
  schema: 'dashbye/lock/v1';
  version: string;
  artifactSha256: string;
  releaseHash: string;
  manifest: ManifestFacts;
  resourceHashes: Record<string, string>;
  recordedAt: string;
};

export type ManifestChange = {
  field: keyof Pick<ManifestFacts, 'permissions' | 'optionalPermissions' | 'hostPermissions' | 'optionalHostPermissions' | 'contentScriptMatches'>;
  added: string[];
  removed: string[];
};

const fields: ManifestChange['field'][] = [
  'permissions',
  'optionalPermissions',
  'hostPermissions',
  'optionalHostPermissions',
  'contentScriptMatches',
];

export function compareManifest(previous: ManifestFacts | null, current: ManifestFacts): ManifestChange[] {
  if (!previous) return [];
  return fields.flatMap(field => {
    const before = previous[field];
    const after = current[field];
    const added = after.filter(value => !before.includes(value));
    const removed = before.filter(value => !after.includes(value));
    return added.length || removed.length ? [{ field, added, removed }] : [];
  });
}

export async function loadLatestLock(resources: string, currentVersion: string): Promise<ReleaseLock | null> {
  const directory = join(resources, 'releases');
  const files = await readdir(directory).catch(() => []);
  const candidates = files.filter(file => file.endsWith('.lock.json') && file !== `${currentVersion}.lock.json`).sort().reverse();
  for (const file of candidates) {
    try {
      const lock = JSON.parse(await readFile(join(directory, file), 'utf8')) as ReleaseLock;
      if (lock.schema === 'dashbye/lock/v1') return lock;
    } catch {
      throw new Error(`invalid release lock: ${basename(file)}`);
    }
  }
  return null;
}

export function createReleaseLock(workspace: LoadedWorkspace): ReleaseLock {
  const relativeHashes = Object.fromEntries(Object.entries(workspace.release.resourceHashes)
    .map(([path, hash]) => [relative(workspace.config.resources, path), hash] as const)
    .sort(([left], [right]) => left.localeCompare(right)));
  return {
    schema: 'dashbye/lock/v1',
    version: workspace.artifact.manifest.version,
    artifactSha256: workspace.artifact.sha256,
    releaseHash: workspace.release.hash,
    manifest: workspace.artifact.manifest,
    resourceHashes: relativeHashes,
    recordedAt: new Date().toISOString(),
  };
}

export async function writeReleaseLock(workspace: LoadedWorkspace): Promise<string> {
  const directory = join(workspace.config.resources, 'releases');
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${workspace.artifact.manifest.version}.lock.json`);
  await writeFile(path, `${JSON.stringify(createReleaseLock(workspace), null, 2)}\n`, { mode: 0o600 });
  return path;
}
