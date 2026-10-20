import { objectHash, sha256 } from '../../hash.js';

// AMO has no draft and a metadata edit is public at once. While AMO has not yet
// approved the package version, the plan only validates the package ("validate").
// Once AMO's current version equals the package version, sync-draft updates the
// listing fields AMO's API accepts ("listing"); the rest stay manual.
export type FirefoxDesired = {
  addon: string;
  version: string;
  packageKind: 'zip' | 'directory' | 'manifest';
  artifactSha256: string;
  releaseHash: string;
  summary: string;
  description: string | null;
  homepageUrl: string | null;
  supportUrl: string | null;
  supportEmail: string | null;
  categories: string[];
  screenshotHashes: string[];
};

export type FirefoxRemote = {
  slug: string;
  currentVersion: string | null;
  summary: string | null;
  description: string | null;
  homepageUrl: string | null;
  supportUrl: string | null;
  supportEmail: string | null;
  categories: string[];
  screenshotHashes: string[];
};

export type FirefoxDifference = { field: string; action: 'update' | 'remove' | 'replace'; before?: number; after?: number };

export type FirefoxPlan = {
  schema: 'dashbye/firefox-plan/v2';
  mode: 'validate' | 'listing';
  addonHash: string;
  slug: string;
  artifactSha256: string;
  releaseHash: string;
  remoteHash: string;
  version: { local: string; remote: string | null };
  differences: FirefoxDifference[];
  blocking: string[];
  approvalHash: string;
};

export function firefoxApprovalHash(plan: Omit<FirefoxPlan, 'approvalHash'>): string {
  const { schema, mode, addonHash, slug, artifactSha256, releaseHash, remoteHash, version, differences, blocking } = plan;
  return objectHash({ schema, mode, addonHash, slug, artifactSha256, releaseHash, remoteHash, version, differences, blocking });
}

// Fields the AMO add-on edit API accepts. Support URL and previews stay manual.
export const WRITABLE_FIELDS = ['summary', 'description', 'homepageUrl', 'supportEmail', 'categories'] as const;

export const writableDifferences = (differences: FirefoxDifference[]) =>
  differences.filter(difference => (WRITABLE_FIELDS as readonly string[]).includes(difference.field));

export function compareVersions(left: string, right: string): number {
  const a = left.split('.').map(part => Number.parseInt(part, 10) || 0);
  const b = right.split('.').map(part => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

const normalize = (value: string | null) => value === null ? null : value.replace(/\r\n/g, '\n').trim();

export function createFirefoxPlan(desired: FirefoxDesired, remote: FirefoxRemote, visuallyEqual: (left: string, right: string) => boolean): FirefoxPlan {
  const differences: FirefoxDifference[] = [];
  const text = (field: string, local: string | null, live: string | null) => {
    if (normalize(local) === normalize(live)) return;
    differences.push({ field, action: local === null ? 'remove' : 'update' });
  };
  text('summary', desired.summary, remote.summary);
  if (desired.description !== null) text('description', desired.description, remote.description);
  text('homepageUrl', desired.homepageUrl, remote.homepageUrl);
  text('supportUrl', desired.supportUrl, remote.supportUrl);
  text('supportEmail', desired.supportEmail, remote.supportEmail);
  if (objectHash([...desired.categories].sort()) !== objectHash([...remote.categories].sort())) {
    differences.push({ field: 'categories', action: 'update' });
  }
  const screenshotsEqual = desired.screenshotHashes.length === remote.screenshotHashes.length
    && desired.screenshotHashes.every((hash, index) => visuallyEqual(hash, remote.screenshotHashes[index]!));
  if (!screenshotsEqual) differences.push({ field: 'screenshots', action: 'replace', before: remote.screenshotHashes.length, after: desired.screenshotHashes.length });

  const order = remote.currentVersion ? compareVersions(desired.version, remote.currentVersion) : 1;
  const mode = order === 0 ? 'listing' as const : 'validate' as const;
  const blocking: string[] = [];
  if (mode === 'validate' && desired.packageKind !== 'zip') blocking.push('the Firefox package must be a ZIP or XPI file to upload for validation');
  if (order < 0) blocking.push(`package version ${desired.version} is older than the AMO version ${remote.currentVersion}`);
  const base = {
    schema: 'dashbye/firefox-plan/v2' as const,
    mode,
    addonHash: sha256(desired.addon),
    slug: remote.slug,
    artifactSha256: desired.artifactSha256,
    releaseHash: desired.releaseHash,
    remoteHash: objectHash(remote),
    version: { local: desired.version, remote: remote.currentVersion },
    differences,
    blocking,
  };
  return { ...base, approvalHash: firefoxApprovalHash(base) };
}
