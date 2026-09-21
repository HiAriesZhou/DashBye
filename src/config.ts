import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import sharp from 'sharp';
import YAML from 'yaml';
import type { AssetConfig, ResolvedStoreConfig, StoreConfig } from './types.js';

const keys = ['icon', 'localizedScreenshots', 'globalScreenshots', 'smallPromo', 'marqueePromo'] as const;

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function stringList(value: unknown, label: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${label} must be a list of paths`);
  }
  return value;
}

function parseConfig(value: unknown): StoreConfig {
  if (!value || typeof value !== 'object') throw new Error('config must be an object');
  const raw = value as Record<string, unknown>;
  if (raw.schema !== 'cws-release-kit/v1') throw new Error('unsupported schema');
  const assetsRaw = (raw.assets ?? {}) as Record<string, unknown>;
  const assets: AssetConfig = {
    localizedScreenshots: stringList(assetsRaw.localizedScreenshots, 'assets.localizedScreenshots'),
    globalScreenshots: stringList(assetsRaw.globalScreenshots, 'assets.globalScreenshots'),
  };
  for (const key of ['icon', 'smallPromo', 'marqueePromo'] as const) {
    const candidate = assetsRaw[key];
    if (candidate !== undefined && candidate !== null) assets[key] = requiredString(candidate, `assets.${key}`);
  }
  if (assets.localizedScreenshots.length > 5 || assets.globalScreenshots.length > 5) {
    throw new Error('screenshot sections may contain at most five files');
  }
  for (const key of Object.keys(assetsRaw)) {
    if (!keys.includes(key as typeof keys[number])) throw new Error(`unknown asset key: ${key}`);
  }
  return {
    schema: 'cws-release-kit/v1',
    language: requiredString(raw.language, 'language'),
    description: requiredString(raw.description, 'description'),
    assets,
  };
}

function resolveAsset(base: string, value: string | undefined): string | undefined {
  return value ? resolve(base, value) : undefined;
}

async function validateImage(path: string, kind: keyof AssetConfig): Promise<string> {
  let input: Buffer;
  try {
    input = await readFile(path);
  } catch {
    throw new Error(`cannot read ${kind} file: ${basename(path)}`);
  }
  const meta = await sharp(input).metadata();
  if (!['png', 'jpeg'].includes(meta.format ?? '')) throw new Error(`${kind} must be PNG or JPEG: ${basename(path)}`);
  const expected = kind === 'icon' ? [[128, 128]]
    : kind === 'smallPromo' ? [[440, 280]]
    : kind === 'marqueePromo' ? [[1400, 560]]
    : [[1280, 800], [640, 400]];
  if (!expected.some(([width, height]) => meta.width === width && meta.height === height)) {
    throw new Error(`${kind} has invalid dimensions: ${basename(path)}`);
  }
  if ((kind === 'localizedScreenshots' || kind === 'globalScreenshots') && meta.format === 'png' && meta.hasAlpha) {
    throw new Error(`screenshots must not contain alpha: ${basename(path)}`);
  }
  return createHash('sha256').update(input).digest('hex');
}

export async function loadConfig(configPath: string): Promise<ResolvedStoreConfig> {
  const absolute = resolve(configPath);
  const base = dirname(absolute);
  let configText: string;
  try {
    configText = await readFile(absolute, 'utf8');
  } catch {
    throw new Error(`cannot read config file: ${basename(absolute)}`);
  }
  const parsed = parseConfig(YAML.parse(configText));
  const descriptionPath = resolve(base, parsed.description);
  let descriptionText: string;
  try {
    descriptionText = await readFile(descriptionPath, 'utf8');
  } catch {
    throw new Error(`cannot read description file: ${basename(descriptionPath)}`);
  }
  if (!descriptionText.trim() || descriptionText.length > 16_000) {
    throw new Error('description must contain 1–16,000 characters');
  }
  const assets: AssetConfig = {
    localizedScreenshots: parsed.assets.localizedScreenshots.map(path => resolve(base, path)),
    globalScreenshots: parsed.assets.globalScreenshots.map(path => resolve(base, path)),
  };
  for (const key of ['icon', 'smallPromo', 'marqueePromo'] as const) {
    const resolved = resolveAsset(base, parsed.assets[key]);
    if (resolved) assets[key] = resolved;
  }
  const assetHashes: Record<string, string> = {};
  for (const key of keys) {
    const values = Array.isArray(assets[key]) ? assets[key] : assets[key] ? [assets[key]] : [];
    for (const path of values) assetHashes[path] = await validateImage(path, key);
  }
  return { ...parsed, configPath: absolute, descriptionPath, descriptionText, assets, assetHashes };
}

export function publicConfigSummary(config: ResolvedStoreConfig) {
  return {
    schema: config.schema,
    language: config.language,
    descriptionLength: config.descriptionText.length,
    descriptionSha256: createHash('sha256').update(config.descriptionText).digest('hex'),
    assets: Object.fromEntries(Object.entries(config.assets).map(([key, value]) => [key, Array.isArray(value) ? value.length : Boolean(value)])),
    assetHashes: Object.values(config.assetHashes),
  };
}
