import { readFile, stat } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { sha256 } from './hash.js';

export type ManifestFacts = {
  version: string;
  name: string;
  summary: string;
  permissions: string[];
  optionalPermissions: string[];
  hostPermissions: string[];
  optionalHostPermissions: string[];
  contentScriptMatches: string[];
};

export type ArtifactFacts = {
  path: string;
  kind: 'zip' | 'directory' | 'manifest';
  sha256: string;
  manifest: ManifestFacts;
};

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string'))].sort()
    : [];
}

function requiredString(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`manifest ${key} is required`);
  return value.trim();
}

export function normalizeManifest(value: unknown): ManifestFacts {
  if (!value || typeof value !== 'object') throw new Error('manifest must be a JSON object');
  const raw = value as Record<string, unknown>;
  const scripts = Array.isArray(raw.content_scripts) ? raw.content_scripts : [];
  const contentScriptMatches = scripts.flatMap(script => {
    if (!script || typeof script !== 'object') return [];
    return strings((script as Record<string, unknown>).matches);
  });
  return {
    version: requiredString(raw, 'version'),
    name: requiredString(raw, 'name'),
    summary: requiredString(raw, 'description'),
    permissions: strings(raw.permissions),
    optionalPermissions: strings(raw.optional_permissions),
    hostPermissions: strings(raw.host_permissions),
    optionalHostPermissions: strings(raw.optional_host_permissions),
    contentScriptMatches: [...new Set(contentScriptMatches)].sort(),
  };
}

function parseManifest(input: Uint8Array): ManifestFacts {
  try {
    return normalizeManifest(JSON.parse(new TextDecoder().decode(input)));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('manifest ')) throw error;
    throw new Error('artifact manifest.json is not valid JSON');
  }
}

export async function loadArtifact(inputPath: string): Promise<ArtifactFacts> {
  const path = resolve(inputPath);
  let metadata;
  try {
    metadata = await stat(path);
  } catch {
    throw new Error(`artifact does not exist: ${basename(path)}`);
  }
  if (metadata.isDirectory()) {
    const manifestBytes = await readFile(join(path, 'manifest.json')).catch(() => {
      throw new Error('artifact directory does not contain manifest.json');
    });
    return { path, kind: 'directory', sha256: sha256(manifestBytes), manifest: parseManifest(manifestBytes) };
  }
  const bytes = await readFile(path);
  if (extname(path).toLowerCase() === '.zip') {
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(bytes);
    } catch {
      throw new Error(`artifact ZIP is invalid: ${basename(path)}`);
    }
    const manifestBytes = entries['manifest.json'];
    if (!manifestBytes) throw new Error('artifact ZIP does not contain a root manifest.json');
    return { path, kind: 'zip', sha256: sha256(bytes), manifest: parseManifest(manifestBytes) };
  }
  if (basename(path) !== 'manifest.json' && extname(path).toLowerCase() !== '.json') {
    throw new Error('artifact must be a ZIP, build directory, or manifest JSON');
  }
  return { path, kind: 'manifest', sha256: sha256(bytes), manifest: parseManifest(bytes) };
}
