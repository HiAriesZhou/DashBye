import { access, readFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import sharp from 'sharp';
import YAML from 'yaml';
import { loadArtifact, type ArtifactFacts } from './artifact.js';
import { fileHash, objectHash } from './hash.js';
import { normalizeLoopbackEndpoint, assertItemId } from './security.js';

export const CONFIG_NAME = 'dashbye.config.yml';

export type ProjectConfig = {
  schema: 'dashbye/config/v1';
  project: string;
  artifact: string;
  resources: string;
  target: { itemId: string; language: string; endpoint: string };
};

export type PrivacyConfig = {
  singlePurpose: string;
  permissionJustifications: Record<string, string>;
  hostPermissionJustification: string | null;
  remoteCode: { uses: boolean; justification: string | null };
  collectedData: string[];
  certifications: {
    noSaleOrTransfer: boolean;
    relatedToSinglePurpose: boolean;
    noCreditworthinessUse: boolean;
  };
  policyUrl: string;
};

export type ListingLocaleConfig = {
  description: string;
  screenshots: string[];
  promoVideoUrl: string | null;
};

export type ReleaseConfig = {
  schema: 'dashbye/release/v1';
  listing: {
    defaultLanguage: string;
    category: string;
    locales: Record<string, ListingLocaleConfig>;
    assets: { icon: string; smallPromo: string | null; marqueePromo: string | null };
    globalScreenshots: string[];
    globalPromoVideoUrl: string | null;
    officialUrl: string | null;
    homepageUrl: string | null;
    supportUrl: string | null;
    matureContent: boolean;
  };
  privacy: PrivacyConfig;
};

export type ResolvedLocale = Omit<ListingLocaleConfig, 'description' | 'screenshots'> & {
  descriptionPath: string;
  descriptionText: string;
  screenshots: string[];
};

export type ResolvedRelease = Omit<ReleaseConfig, 'listing'> & {
  path: string;
  listing: Omit<ReleaseConfig['listing'], 'locales' | 'assets' | 'globalScreenshots'> & {
    locales: Record<string, ResolvedLocale>;
    assets: { icon: string; smallPromo: string | null; marqueePromo: string | null };
    globalScreenshots: string[];
  };
  resourceHashes: Record<string, string>;
  hash: string;
};

export type LoadedWorkspace = {
  configPath: string;
  config: ProjectConfig & { project: string; artifact: string; resources: string };
  artifact: ArtifactFacts;
  release: ResolvedRelease;
};

export type WorkspaceOverrides = {
  project?: string;
  artifact?: string;
  resources?: string;
  itemId?: string;
  language?: string;
  endpoint?: string;
};

export type ValidationIssue = {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function nullableText(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  return text(value, label);
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be true or false`);
  return value;
}

function stringList(value: unknown, label: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${label} must be a list of strings`);
  }
  return value.map(item => item.trim());
}

function pathFrom(base: string, value: string): string {
  return isAbsolute(value) ? value : resolve(base, value);
}

async function validateImage(path: string, kind: 'icon' | 'screenshot' | 'smallPromo' | 'marqueePromo'): Promise<void> {
  let metadata;
  try {
    metadata = await sharp(await readFile(path)).metadata();
  } catch {
    throw new Error(`cannot read ${kind} image: ${basename(path)}`);
  }
  if (!['png', 'jpeg'].includes(metadata.format ?? '')) throw new Error(`${kind} must be PNG or JPEG: ${basename(path)}`);
  const dimensions = kind === 'icon' ? [[128, 128]]
    : kind === 'smallPromo' ? [[440, 280]]
    : kind === 'marqueePromo' ? [[1400, 560]]
    : [[1280, 800], [640, 400]];
  if (!dimensions.some(([width, height]) => metadata.width === width && metadata.height === height)) {
    throw new Error(`${kind} has invalid dimensions: ${basename(path)}`);
  }
  if (kind === 'screenshot' && metadata.format === 'png' && metadata.hasAlpha) {
    throw new Error(`screenshots must not contain alpha: ${basename(path)}`);
  }
}

export async function discoverConfig(start = process.cwd()): Promise<string | null> {
  let directory = resolve(start);
  while (true) {
    const candidate = join(directory, CONFIG_NAME);
    if (await access(candidate).then(() => true).catch(() => false)) return candidate;
    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

export async function loadProjectConfig(configPath: string): Promise<ProjectConfig & { project: string; artifact: string; resources: string }> {
  const absolute = resolve(configPath);
  let raw: Record<string, unknown>;
  try {
    raw = record(YAML.parse(await readFile(absolute, 'utf8')), 'config');
  } catch (error) {
    if (error instanceof Error && error.message !== 'config must be an object') throw new Error(`cannot read config: ${basename(absolute)}`);
    throw error;
  }
  if (raw.schema !== 'dashbye/config/v1') throw new Error('unsupported project config schema');
  const base = dirname(absolute);
  const project = pathFrom(base, text(raw.project ?? '.', 'project'));
  const target = record(raw.target, 'target');
  return {
    schema: 'dashbye/config/v1',
    project,
    artifact: pathFrom(project, text(raw.artifact, 'artifact')),
    resources: pathFrom(project, text(raw.resources ?? 'store', 'resources')),
    target: {
      itemId: assertItemId(text(target.itemId, 'target.itemId')),
      language: text(target.language, 'target.language'),
      endpoint: normalizeLoopbackEndpoint(text(target.endpoint ?? 'http://127.0.0.1:9333', 'target.endpoint')),
    },
  };
}

function parsePrivacy(value: unknown): PrivacyConfig {
  const raw = record(value, 'privacy');
  const justificationsRaw = record(raw.permissionJustifications ?? {}, 'privacy.permissionJustifications');
  const remote = record(raw.remoteCode, 'privacy.remoteCode');
  const certifications = record(raw.certifications, 'privacy.certifications');
  return {
    singlePurpose: text(raw.singlePurpose, 'privacy.singlePurpose'),
    permissionJustifications: Object.fromEntries(Object.entries(justificationsRaw).map(([key, value]) => [key, text(value, `privacy.permissionJustifications.${key}`)])),
    hostPermissionJustification: nullableText(raw.hostPermissionJustification, 'privacy.hostPermissionJustification'),
    remoteCode: {
      uses: boolean(remote.uses, 'privacy.remoteCode.uses'),
      justification: nullableText(remote.justification, 'privacy.remoteCode.justification'),
    },
    collectedData: stringList(raw.collectedData, 'privacy.collectedData'),
    certifications: {
      noSaleOrTransfer: boolean(certifications.noSaleOrTransfer, 'privacy.certifications.noSaleOrTransfer'),
      relatedToSinglePurpose: boolean(certifications.relatedToSinglePurpose, 'privacy.certifications.relatedToSinglePurpose'),
      noCreditworthinessUse: boolean(certifications.noCreditworthinessUse, 'privacy.certifications.noCreditworthinessUse'),
    },
    policyUrl: text(raw.policyUrl, 'privacy.policyUrl'),
  };
}

export async function loadRelease(resources: string): Promise<ResolvedRelease> {
  const path = join(resources, 'release.yml');
  let raw: Record<string, unknown>;
  try {
    raw = record(YAML.parse(await readFile(path, 'utf8')), 'release');
  } catch {
    throw new Error(`cannot read release definition: ${basename(path)}`);
  }
  if (raw.schema !== 'dashbye/release/v1') throw new Error('unsupported release schema');
  const listingRaw = record(raw.listing, 'listing');
  const localesRaw = record(listingRaw.locales, 'listing.locales');
  const assetsRaw = record(listingRaw.assets, 'listing.assets');
  const resourceHashes: Record<string, string> = {};
  const locales: Record<string, ResolvedLocale> = {};
  for (const [language, localeValue] of Object.entries(localesRaw)) {
    const locale = record(localeValue, `listing.locales.${language}`);
    const descriptionPath = pathFrom(resources, text(locale.description, `listing.locales.${language}.description`));
    const descriptionText = (await readFile(descriptionPath, 'utf8').catch(() => {
      throw new Error(`cannot read description: ${basename(descriptionPath)}`);
    })).replace(/\r\n/g, '\n').replace(/\n+$/, '');
    if (!descriptionText.trim() || descriptionText.length > 16_000) throw new Error(`description for ${language} must contain 1–16,000 characters`);
    const screenshots = stringList(locale.screenshots, `listing.locales.${language}.screenshots`).map(item => pathFrom(resources, item));
    if (screenshots.length > 5) throw new Error(`listing.locales.${language}.screenshots may contain at most five files`);
    locales[language] = {
      descriptionPath,
      descriptionText,
      screenshots,
      promoVideoUrl: nullableText(locale.promoVideoUrl, `listing.locales.${language}.promoVideoUrl`),
    };
    for (const file of screenshots) await validateImage(file, 'screenshot');
    for (const file of [descriptionPath, ...screenshots]) resourceHashes[file] = await fileHash(file);
  }
  const asset = async (key: string, required: boolean): Promise<string | null> => {
    const value = nullableText(assetsRaw[key], `listing.assets.${key}`);
    if (!value) {
      if (required) throw new Error(`listing.assets.${key} is required`);
      return null;
    }
    const file = pathFrom(resources, value);
    await validateImage(file, key as 'icon' | 'smallPromo' | 'marqueePromo');
    resourceHashes[file] = await fileHash(file);
    return file;
  };
  const globalScreenshots = stringList(listingRaw.globalScreenshots, 'listing.globalScreenshots').map(item => pathFrom(resources, item));
  if (globalScreenshots.length > 5) throw new Error('listing.globalScreenshots may contain at most five files');
  for (const file of globalScreenshots) await validateImage(file, 'screenshot');
  for (const file of globalScreenshots) resourceHashes[file] = await fileHash(file);
  const release: ResolvedRelease = {
    schema: 'dashbye/release/v1',
    path,
    listing: {
      defaultLanguage: text(listingRaw.defaultLanguage, 'listing.defaultLanguage'),
      category: text(listingRaw.category, 'listing.category'),
      locales,
      assets: {
        icon: (await asset('icon', true))!,
        smallPromo: await asset('smallPromo', false),
        marqueePromo: await asset('marqueePromo', false),
      },
      globalScreenshots,
      globalPromoVideoUrl: nullableText(listingRaw.globalPromoVideoUrl, 'listing.globalPromoVideoUrl'),
      officialUrl: nullableText(listingRaw.officialUrl, 'listing.officialUrl'),
      homepageUrl: nullableText(listingRaw.homepageUrl, 'listing.homepageUrl'),
      supportUrl: nullableText(listingRaw.supportUrl, 'listing.supportUrl'),
      matureContent: boolean(listingRaw.matureContent, 'listing.matureContent'),
    },
    privacy: parsePrivacy(raw.privacy),
    resourceHashes,
    hash: '',
  };
  release.hash = objectHash({
    listing: listingRaw,
    privacy: release.privacy,
    resourceHashes: Object.fromEntries(Object.entries(resourceHashes)
      .map(([file, hash]) => [relative(resources, file), hash] as const)
      .sort(([left], [right]) => left.localeCompare(right))),
  });
  return release;
}

export async function loadWorkspace(configPath: string, overrides: WorkspaceOverrides = {}): Promise<LoadedWorkspace> {
  const loaded = await loadProjectConfig(configPath);
  const project = overrides.project ? resolve(overrides.project) : loaded.project;
  const config = {
    ...loaded,
    project,
    artifact: overrides.artifact ? pathFrom(process.cwd(), overrides.artifact) : loaded.artifact,
    resources: overrides.resources ? pathFrom(process.cwd(), overrides.resources) : loaded.resources,
    target: {
      itemId: overrides.itemId ? assertItemId(overrides.itemId) : loaded.target.itemId,
      language: overrides.language ?? loaded.target.language,
      endpoint: overrides.endpoint ? normalizeLoopbackEndpoint(overrides.endpoint) : loaded.target.endpoint,
    },
  };
  const [artifact, release] = await Promise.all([loadArtifact(config.artifact), loadRelease(config.resources)]);
  return { configPath: resolve(configPath), config, artifact, release };
}

export function validateWorkspace(workspace: LoadedWorkspace): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const manifest = workspace.artifact.manifest;
  const privacy = workspace.release.privacy;
  const permissions = [...new Set([...manifest.permissions, ...manifest.optionalPermissions])].sort();
  for (const permission of permissions) {
    if (!privacy.permissionJustifications[permission]) {
      issues.push({ severity: 'error', code: 'missing_permission_justification', message: `missing justification for permission ${permission}` });
    }
  }
  for (const permission of Object.keys(privacy.permissionJustifications).sort()) {
    if (!permissions.includes(permission)) {
      issues.push({ severity: 'error', code: 'stale_permission_justification', message: `stale justification for removed permission ${permission}` });
    }
  }
  const hasHostAccess = manifest.hostPermissions.length > 0
    || manifest.optionalHostPermissions.length > 0
    || manifest.contentScriptMatches.length > 0;
  if (hasHostAccess && !privacy.hostPermissionJustification) {
    issues.push({ severity: 'error', code: 'missing_host_justification', message: 'host access requires a justification' });
  }
  if (!hasHostAccess && privacy.hostPermissionJustification) {
    issues.push({ severity: 'error', code: 'stale_host_justification', message: 'host justification exists but the artifact has no host access' });
  }
  if (privacy.remoteCode.uses && !privacy.remoteCode.justification) {
    issues.push({ severity: 'error', code: 'missing_remote_code_justification', message: 'remote code use requires a justification' });
  }
  if (!privacy.remoteCode.uses && privacy.remoteCode.justification) {
    issues.push({ severity: 'error', code: 'stale_remote_code_justification', message: 'remote code justification exists while remote code is disabled' });
  }
  for (const [key, value] of Object.entries(privacy.certifications)) {
    if (!value) issues.push({ severity: 'error', code: 'uncertified_data_use', message: `data-use certification is not affirmed: ${key}` });
  }
  if (!workspace.release.listing.locales[workspace.config.target.language]) {
    issues.push({ severity: 'error', code: 'missing_target_locale', message: 'target language is not defined in release listing locales' });
  }
  if (workspace.release.listing.defaultLanguage !== workspace.config.target.language) {
    issues.push({ severity: 'warning', code: 'target_not_default_language', message: 'configured target language differs from listing default language' });
  }
  return issues;
}

export function publicWorkspaceSummary(workspace: LoadedWorkspace, issues: ValidationIssue[]) {
  return {
    schema: workspace.config.schema,
    artifact: {
      kind: workspace.artifact.kind,
      version: workspace.artifact.manifest.version,
      sha256: workspace.artifact.sha256,
      permissions: workspace.artifact.manifest.permissions,
      optionalPermissions: workspace.artifact.manifest.optionalPermissions,
      hostPermissions: workspace.artifact.manifest.hostPermissions,
      optionalHostPermissions: workspace.artifact.manifest.optionalHostPermissions,
      contentScriptMatches: workspace.artifact.manifest.contentScriptMatches,
    },
    release: {
      hash: workspace.release.hash,
      locales: Object.keys(workspace.release.listing.locales),
      category: workspace.release.listing.category,
      assets: {
        localizedScreenshots: Object.fromEntries(Object.entries(workspace.release.listing.locales).map(([language, locale]) => [language, locale.screenshots.length])),
        globalScreenshots: workspace.release.listing.globalScreenshots.length,
        icon: true,
        smallPromo: Boolean(workspace.release.listing.assets.smallPromo),
        marqueePromo: Boolean(workspace.release.listing.assets.marqueePromo),
      },
      privacy: {
        permissionJustifications: Object.keys(workspace.release.privacy.permissionJustifications).sort(),
        hostPermissionJustification: Boolean(workspace.release.privacy.hostPermissionJustification),
        remoteCode: workspace.release.privacy.remoteCode.uses,
        collectedData: workspace.release.privacy.collectedData,
        policyUrlConfigured: Boolean(workspace.release.privacy.policyUrl),
      },
    },
    issues,
    valid: !issues.some(issue => issue.severity === 'error'),
  };
}
