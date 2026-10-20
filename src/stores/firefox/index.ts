import { readFile } from 'node:fs/promises';
import { loadArtifactWithRaw } from '../../artifact.js';
import { sha256 } from '../../hash.js';
import { detailHash, visuallyEqual } from '../../image-fingerprint.js';
import type { FirefoxTarget } from '../../project.js';
import type { AmoAddon, AmoClient } from './amo.js';
import type { AmoListing, AmoWriter } from './amo-write.js';
import { createFirefoxPlan, writableDifferences, type FirefoxPlan } from './plan.js';
import { loadFirefoxRelease } from './release.js';

type Reader = Pick<AmoClient, 'getAddon' | 'fetchImage'>;

export const developerHubUrl = (slug: string) => `https://addons.mozilla.org/developers/addon/${encodeURIComponent(slug)}/versions/submit/`;

export function assertPackageForAddon(raw: Record<string, unknown>, addon: Pick<AmoAddon, 'guid'>): void {
  const settings = raw.browser_specific_settings as { gecko?: { id?: unknown } } | undefined;
  const geckoId = settings?.gecko?.id;
  if (typeof geckoId !== 'string' || !geckoId.trim()) throw new Error('Firefox package manifest must set browser_specific_settings.gecko.id');
  if (geckoId !== addon.guid) throw new Error('Firefox package gecko.id does not match the configured AMO add-on');
}

export async function planFirefox(target: FirefoxTarget, resources: string, client: Reader): Promise<FirefoxPlan> {
  const [{ artifact, raw }, release, addon] = await Promise.all([loadArtifactWithRaw(target.artifact), loadFirefoxRelease(resources), client.getAddon(target.addon)]);
  assertPackageForAddon(raw, addon);
  const [localShots, remoteShots] = await Promise.all([
    Promise.all(release.screenshots.map(async file => detailHash(await readFile(file)))),
    Promise.all(addon.previewUrls.map(async url => detailHash(await client.fetchImage(url)))),
  ]);
  return createFirefoxPlan(
    {
      addon: target.addon, version: artifact.manifest.version, packageKind: artifact.kind, artifactSha256: artifact.sha256, releaseHash: release.hash,
      summary: release.summary, description: release.description, homepageUrl: release.homepageUrl, supportUrl: release.supportUrl,
      supportEmail: release.supportEmail, categories: release.categories, screenshotHashes: localShots,
    },
    {
      slug: addon.slug, currentVersion: addon.currentVersion, summary: addon.summary, description: addon.description,
      homepageUrl: addon.homepageUrl, supportUrl: addon.supportUrl, supportEmail: addon.supportEmail,
      categories: addon.categories, screenshotHashes: remoteShots,
    },
    (left, right) => visuallyEqual(left, right),
  );
}

// Before confirmation: the approved plan must still match the package, listing,
// and AMO add-on, and nothing may block validation.
export async function verifyFirefox(target: FirefoxTarget, resources: string, client: Reader, approved: FirefoxPlan): Promise<FirefoxPlan> {
  const fresh = await planFirefox(target, resources, client);
  if (fresh.approvalHash !== approved.approvalHash) throw new Error('plan is stale because the Firefox package, listing, or AMO add-on changed; run dashbye plan again');
  if (fresh.blocking.length) throw new Error(`Firefox: ${fresh.blocking.join('; ')}`);
  return fresh;
}

// After confirmation: upload for validation only. No version is created and no
// listing field is changed.
export async function uploadFirefoxForValidation(target: FirefoxTarget, client: Pick<AmoClient, 'uploadForValidation'>, plan: FirefoxPlan) {
  const bytes = await readFile(target.artifact);
  if (sha256(bytes) !== plan.artifactSha256) throw new Error('Firefox package changed after approval; run dashbye plan again');
  const validation = await client.uploadForValidation(target.artifact, { bytes });
  return {
    result: validation.valid ? 'validated' as const : 'validation_failed' as const,
    errors: validation.errors,
    warnings: validation.warnings,
    messages: validation.messages,
    listingChanges: plan.differences.length,
    developerHub: developerHubUrl(plan.slug),
  };
}

// After AMO approved the package version: write the listing fields its API accepts,
// then re-read AMO. Support URL and previews remain changes to make by hand.
export async function applyFirefoxListing(target: FirefoxTarget, resources: string, client: Reader, writer: Pick<AmoWriter, 'updateListing'>, plan: FirefoxPlan) {
  if (plan.mode !== 'listing') throw new Error(`Firefox listing is waiting for AMO to approve ${plan.version.local}; run dashbye plan after approval`);
  const [release, addon] = await Promise.all([loadFirefoxRelease(resources), client.getAddon(target.addon)]);
  const values: Required<AmoListing> = {
    summary: release.summary, description: release.description ?? '', homepageUrl: release.homepageUrl,
    supportEmail: release.supportEmail, categories: release.categories,
  };
  const fields = writableDifferences(plan.differences).map(difference => difference.field as keyof AmoListing);
  if (fields.length) await writer.updateListing(target.addon, addon.defaultLocale, Object.fromEntries(fields.map(field => [field, values[field]])));
  const after = await planFirefox(target, resources, client);
  const remaining = writableDifferences(after.differences).map(difference => difference.field);
  if (remaining.length) throw new Error(`AMO listing read-back still differs: ${remaining.join(', ')}`);
  return { result: 'saved_and_reread' as const, listingChanges: fields.length, manualChanges: after.differences.map(difference => difference.field) };
}
