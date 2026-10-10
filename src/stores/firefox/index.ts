import { readFile } from 'node:fs/promises';
import { loadArtifactWithRaw } from '../../artifact.js';
import { sha256 } from '../../hash.js';
import { detailHash, visuallyEqual } from '../../image-fingerprint.js';
import type { FirefoxTarget } from '../../project.js';
import type { AmoClient } from './amo.js';
import { createFirefoxPlan, type FirefoxPlan } from './plan.js';
import { loadFirefoxRelease } from './release.js';

type Reader = Pick<AmoClient, 'getAddon' | 'fetchImage'>;

export const developerHubUrl = (slug: string) => `https://addons.mozilla.org/developers/addon/${encodeURIComponent(slug)}/versions/submit/`;

export async function planFirefox(target: FirefoxTarget, resources: string, client: Reader): Promise<FirefoxPlan> {
  const [{ artifact, raw }, release, addon] = await Promise.all([loadArtifactWithRaw(target.artifact), loadFirefoxRelease(resources), client.getAddon(target.addon)]);
  const settings = raw.browser_specific_settings as { gecko?: { id?: unknown } } | undefined;
  const geckoId = settings?.gecko?.id;
  if (typeof geckoId !== 'string' || !geckoId.trim()) throw new Error('Firefox package manifest must set browser_specific_settings.gecko.id');
  if (geckoId !== addon.guid) throw new Error('Firefox package gecko.id does not match the configured AMO add-on');
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
