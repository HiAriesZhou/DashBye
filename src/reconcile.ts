import { objectHash, sha256 } from './hash.js';
import { visualHashFile, visuallyEqual } from './image-fingerprint.js';
import type { LoadedWorkspace } from './workspace.js';

export type PrivacyState = {
  singlePurposeHash: string;
  permissionJustificationHashes: Record<string, string>;
  hostPermissionJustificationHash: string | null;
  remoteCode: { uses: boolean; justificationHash: string | null };
  collectedData: string[];
  certifications: {
    noSaleOrTransfer: boolean;
    relatedToSinglePurpose: boolean;
    noCreditworthinessUse: boolean;
  };
  policyUrlHash: string;
};

export type ListingState = {
  language: string;
  descriptionHash: string;
  category: string;
  promoVideoUrlHash: string | null;
  iconVisualHash: string | null;
  screenshotVisualHashes: string[];
  smallPromoVisualHash: string | null;
  marqueePromoVisualHash: string | null;
  officialUrlHash: string | null;
  homepageUrlHash: string | null;
  supportUrlHash: string | null;
  matureContent: boolean;
};

export type DashboardState = {
  itemId: string;
  packageVersion: string | null;
  listing: ListingState;
  privacy: PrivacyState;
};

export type DesiredState = DashboardState & {
  artifactPath: string;
  listingFiles: {
    icon: string;
    screenshots: string[];
    smallPromo: string | null;
    marqueePromo: string | null;
  };
  listingValues: {
    description: string;
    promoVideoUrl: string | null;
    officialUrl: string | null;
    homepageUrl: string | null;
    supportUrl: string | null;
  };
  privacyValues: LoadedWorkspace['release']['privacy'];
};

export type ReconcileOperation = {
  area: 'package' | 'listing' | 'privacy';
  action: 'upload' | 'update' | 'replace' | 'remove' | 'reorder';
  field: string;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
  destructive: boolean;
  ownerApprovalRequired: boolean;
};

export type ReconciliationPlan = {
  schema: 'dashbye/plan/v2';
  itemIdHash: string;
  artifactSha256: string;
  releaseHash: string;
  remoteHash: string;
  operations: ReconcileOperation[];
  approvalHash: string;
};

const hashNullable = (value: string | null) => value === null ? null : sha256(value);

export async function createDesiredState(workspace: LoadedWorkspace): Promise<DesiredState> {
  const locale = workspace.release.listing.locales[workspace.config.target.language];
  if (!locale) throw new Error('target language is absent from release locales');
  const privacy = workspace.release.privacy;
  const screenshots = locale.screenshots.length ? locale.screenshots : workspace.release.listing.globalScreenshots;
  return {
    itemId: workspace.config.target.itemId,
    packageVersion: workspace.artifact.manifest.version,
    artifactPath: workspace.artifact.path,
    listing: {
      language: workspace.config.target.language,
      descriptionHash: sha256(locale.descriptionText),
      category: workspace.release.listing.category,
      promoVideoUrlHash: hashNullable(locale.promoVideoUrl ?? workspace.release.listing.globalPromoVideoUrl),
      iconVisualHash: await visualHashFile(workspace.release.listing.assets.icon),
      screenshotVisualHashes: await Promise.all(screenshots.map(visualHashFile)),
      smallPromoVisualHash: workspace.release.listing.assets.smallPromo ? await visualHashFile(workspace.release.listing.assets.smallPromo) : null,
      marqueePromoVisualHash: workspace.release.listing.assets.marqueePromo ? await visualHashFile(workspace.release.listing.assets.marqueePromo) : null,
      officialUrlHash: hashNullable(workspace.release.listing.officialUrl),
      homepageUrlHash: hashNullable(workspace.release.listing.homepageUrl),
      supportUrlHash: hashNullable(workspace.release.listing.supportUrl),
      matureContent: workspace.release.listing.matureContent,
    },
    listingFiles: {
      icon: workspace.release.listing.assets.icon,
      screenshots,
      smallPromo: workspace.release.listing.assets.smallPromo,
      marqueePromo: workspace.release.listing.assets.marqueePromo,
    },
    listingValues: {
      description: locale.descriptionText,
      promoVideoUrl: locale.promoVideoUrl ?? workspace.release.listing.globalPromoVideoUrl,
      officialUrl: workspace.release.listing.officialUrl,
      homepageUrl: workspace.release.listing.homepageUrl,
      supportUrl: workspace.release.listing.supportUrl,
    },
    privacy: {
      singlePurposeHash: sha256(privacy.singlePurpose),
      permissionJustificationHashes: Object.fromEntries(Object.entries(privacy.permissionJustifications).map(([key, value]) => [key, sha256(value)])),
      hostPermissionJustificationHash: hashNullable(privacy.hostPermissionJustification),
      remoteCode: { uses: privacy.remoteCode.uses, justificationHash: hashNullable(privacy.remoteCode.justification) },
      collectedData: [...privacy.collectedData].sort(),
      certifications: privacy.certifications,
      policyUrlHash: sha256(privacy.policyUrl),
    },
    privacyValues: privacy,
  };
}

function fieldOperation(area: ReconcileOperation['area'], field: string, before: unknown, after: unknown, privacy = false): ReconcileOperation | null {
  if (objectHash(before) === objectHash(after)) return null;
  return {
    area,
    action: after === null || (Array.isArray(after) && after.length === 0) ? 'remove' : 'update',
    field,
    before: Array.isArray(before) ? before.length : before as string | number | boolean | null,
    after: Array.isArray(after) ? after.length : after as string | number | boolean | null,
    destructive: after === null || (Array.isArray(after) && after.length === 0),
    ownerApprovalRequired: privacy,
  };
}

function assetOperation(field: string, before: string | null, after: string | null): ReconcileOperation | null {
  if (visuallyEqual(before, after)) return null;
  const action = after === null ? 'remove' : before === null ? 'update' : 'replace';
  return { area: 'listing', action, field, before: before ? 'present' : null, after: after ? 'configured' : null, destructive: before !== null, ownerApprovalRequired: before !== null };
}

export function createReconciliationPlan(workspace: LoadedWorkspace, desired: DesiredState, current: DashboardState): ReconciliationPlan {
  if (current.itemId !== desired.itemId) throw new Error('Dashboard item does not match configured target');
  const operations: ReconcileOperation[] = [];
  if (current.packageVersion !== desired.packageVersion) {
    operations.push({ area: 'package', action: 'upload', field: 'packageVersion', before: current.packageVersion, after: desired.packageVersion, destructive: false, ownerApprovalRequired: true });
  }
  const listingFields: Array<[keyof ListingState, string]> = [
    ['descriptionHash', 'description'], ['category', 'category'], ['promoVideoUrlHash', 'promoVideoUrl'],
    ['officialUrlHash', 'officialUrl'], ['homepageUrlHash', 'homepageUrl'], ['supportUrlHash', 'supportUrl'],
    ['matureContent', 'matureContent'],
  ];
  for (const [key, field] of listingFields) {
    const operation = fieldOperation('listing', field, current.listing[key], desired.listing[key]);
    if (operation) operations.push(operation);
  }
  for (const [field, before, after] of [
    ['icon', current.listing.iconVisualHash, desired.listing.iconVisualHash],
    ['smallPromo', current.listing.smallPromoVisualHash, desired.listing.smallPromoVisualHash],
    ['marqueePromo', current.listing.marqueePromoVisualHash, desired.listing.marqueePromoVisualHash],
  ] as const) {
    const operation = assetOperation(field, before, after);
    if (operation) operations.push(operation);
  }
  const screenshotEqual = current.listing.screenshotVisualHashes.length === desired.listing.screenshotVisualHashes.length
    && current.listing.screenshotVisualHashes.every((hash, index) => visuallyEqual(hash, desired.listing.screenshotVisualHashes[index] ?? null));
  if (!screenshotEqual) {
    operations.push({ area: 'listing', action: 'replace', field: 'screenshots', before: current.listing.screenshotVisualHashes.length, after: desired.listing.screenshotVisualHashes.length, destructive: current.listing.screenshotVisualHashes.length > 0, ownerApprovalRequired: current.listing.screenshotVisualHashes.length > 0 });
  }
  const privacyFields: Array<[unknown, unknown, string]> = [
    [current.privacy.singlePurposeHash, desired.privacy.singlePurposeHash, 'singlePurpose'],
    [current.privacy.permissionJustificationHashes, desired.privacy.permissionJustificationHashes, 'permissionJustifications'],
    [current.privacy.hostPermissionJustificationHash, desired.privacy.hostPermissionJustificationHash, 'hostPermissionJustification'],
    [current.privacy.remoteCode, desired.privacy.remoteCode, 'remoteCode'],
    [current.privacy.collectedData, desired.privacy.collectedData, 'collectedData'],
    [current.privacy.certifications, desired.privacy.certifications, 'certifications'],
    [current.privacy.policyUrlHash, desired.privacy.policyUrlHash, 'policyUrl'],
  ];
  for (const [before, after, field] of privacyFields) {
    const operation = fieldOperation('privacy', field, before, after, true);
    if (operation) operations.push(operation);
  }
  const base = {
    schema: 'dashbye/plan/v2' as const,
    itemIdHash: sha256(workspace.config.target.itemId),
    artifactSha256: workspace.artifact.sha256,
    releaseHash: workspace.release.hash,
    remoteHash: objectHash(current),
    operations,
  };
  return { ...base, approvalHash: objectHash(base) };
}

export function publicDashboardState(state: DashboardState) {
  const publicFingerprint = (value: string | null) => value === null ? null : sha256(value);
  return {
    ...state,
    itemId: undefined,
    listing: {
      ...state.listing,
      iconVisualHash: publicFingerprint(state.listing.iconVisualHash),
      screenshotVisualHashes: state.listing.screenshotVisualHashes.map(value => publicFingerprint(value)!),
      smallPromoVisualHash: publicFingerprint(state.listing.smallPromoVisualHash),
      marqueePromoVisualHash: publicFingerprint(state.listing.marqueePromoVisualHash),
    },
    itemIdMatched: true,
  };
}
