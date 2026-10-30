import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { loadArtifact } from './artifact.js';
import { sha256 } from './hash.js';
import type { DesiredState, ReconciliationPlan } from './reconcile.js';
import { loadRelease, type LoadedWorkspace } from './workspace.js';

type Upload = { name: string; mimeType: string; buffer: Buffer };
export type ApprovedUploads = {
  package: Upload | null;
  listing: { icon: Upload; screenshots: Upload[]; smallPromo: Upload | null; marqueePromo: Upload | null };
};

const changed = () => new Error('Chrome inputs changed after approval; run dashbye plan again');

// Capture and check every file before the first mutation. The browser receives
// these exact bytes, so a subsequent rebuild cannot change an approved upload.
export async function prepareApprovedUploads(workspace: LoadedWorkspace, desired: DesiredState, plan: ReconciliationPlan): Promise<ApprovedUploads> {
  if (sha256(workspace.config.target.itemId) !== plan.itemIdHash
    || workspace.artifact.sha256 !== plan.artifactSha256 || workspace.release.hash !== plan.releaseHash) throw changed();
  const release = await loadRelease(workspace.config.resources).catch(() => { throw changed(); });
  if (release.hash !== plan.releaseHash) throw changed();
  const read = async (file: string, expected: string): Promise<Buffer> => {
    const bytes = await readFile(file).catch(() => { throw changed(); });
    if (sha256(bytes) !== expected) throw changed();
    return bytes;
  };
  let packageUpload: Upload | null = null;
  if (workspace.artifact.kind === 'zip') {
    const buffer = await read(workspace.artifact.path, plan.artifactSha256);
    if (plan.operations.some(operation => operation.area === 'package')) {
      packageUpload = { name: basename(workspace.artifact.path), mimeType: 'application/zip', buffer };
    }
  } else if ((await loadArtifact(workspace.artifact.path)).sha256 !== plan.artifactSha256) throw changed();
  const resources = new Map(await Promise.all(Object.entries(workspace.release.resourceHashes)
    .map(async ([file, hash]) => [file, await read(file, hash)] as const)));
  const image = (file: string): Upload => {
    const buffer = resources.get(file);
    if (!buffer) throw changed();
    return { name: basename(file), mimeType: extname(file).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg', buffer };
  };
  return {
    package: packageUpload,
    listing: {
      icon: image(desired.listingFiles.icon),
      screenshots: desired.listingFiles.screenshots.map(image),
      smallPromo: desired.listingFiles.smallPromo ? image(desired.listingFiles.smallPromo) : null,
      marqueePromo: desired.listingFiles.marqueePromo ? image(desired.listingFiles.marqueePromo) : null,
    },
  };
}
