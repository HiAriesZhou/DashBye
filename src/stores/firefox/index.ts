import { readFile } from 'node:fs/promises';
import { loadArtifact } from '../../artifact.js';
import { detailHash, visuallyEqual } from '../../image-fingerprint.js';
import type { FirefoxTarget } from '../../project.js';
import type { AmoClient } from './amo.js';
import { createFirefoxPlan, type FirefoxPlan } from './plan.js';
import { loadFirefoxRelease } from './release.js';

type Reader = Pick<AmoClient, 'getAddon' | 'fetchImage'>;

export const developerHubUrl = (slug: string) => `https://addons.mozilla.org/developers/addon/${encodeURIComponent(slug)}/versions/submit/`;

export async function planFirefox(target: FirefoxTarget, resources: string, client: Reader): Promise<FirefoxPlan> {
  const [artifact, release, addon] = await Promise.all([loadArtifact(target.artifact), loadFirefoxRelease(resources), client.getAddon(target.addon)]);
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
  const validation = await client.uploadForValidation(target.artifact);
  return {
    result: validation.valid ? 'validated' as const : 'validation_failed' as const,
    errors: validation.errors,
    warnings: validation.warnings,
    messages: validation.messages,
    listingChanges: plan.differences.length,
    developerHub: developerHubUrl(plan.slug),
  };
}
