import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export function sha256(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, normalize(child)]));
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function objectHash(value: unknown): string {
  return sha256(stableJson(value));
}

export async function fileHash(path: string): Promise<string> {
  return sha256(await readFile(path));
}
