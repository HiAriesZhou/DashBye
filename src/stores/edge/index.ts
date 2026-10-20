import { readFile } from 'node:fs/promises';
import { loadArtifact } from '../../artifact.js';
import { objectHash, sha256 } from '../../hash.js';
import type { EdgeTarget } from '../../project.js';
import type { EdgeClient } from './api.js';

// The Edge Add-ons API exposes no read of the current draft, so the plan binds the
// local package and the operation; the read-back is the upload operation's outcome.
// Store-listing fields live only in Partner Center and are not changed here.
export type EdgePlan = {
  schema: 'dashbye/edge-plan/v1';
  productIdHash: string;
  artifactSha256: string;
  version: string;
  operations: Array<{ area: 'package'; action: 'upload'; field: 'draftPackage'; after: string }>;
  blocking: string[];
  approvalHash: string;
};

export function edgeApprovalHash(plan: Omit<EdgePlan, 'approvalHash'> & { approvalHash?: string }): string {
  const { approvalHash: _bound, ...rest } = plan;
  return objectHash(rest);
}

export async function planEdge(target: EdgeTarget, hasCredentials: boolean): Promise<EdgePlan> {
  const artifact = await loadArtifact(target.artifact);
  const blocking: string[] = [];
  if (!hasCredentials) blocking.push('Edge API credentials are required; set DASHBYE_EDGE_CLIENT_ID and DASHBYE_EDGE_API_KEY or add "edge" to credentials.json');
  if (artifact.kind !== 'zip') blocking.push('the Edge package must be a ZIP file to upload');
  const base = {
    schema: 'dashbye/edge-plan/v1' as const,
    productIdHash: sha256(target.productId),
    artifactSha256: artifact.sha256,
    version: artifact.manifest.version,
    operations: [{ area: 'package' as const, action: 'upload' as const, field: 'draftPackage' as const, after: artifact.manifest.version }],
    blocking,
  };
  return { ...base, approvalHash: edgeApprovalHash(base) };
}

export async function verifyEdge(target: EdgeTarget, hasCredentials: boolean, approved: EdgePlan): Promise<EdgePlan> {
  const fresh = await planEdge(target, hasCredentials);
  if (fresh.approvalHash !== approved.approvalHash) throw new Error('plan is stale because the Edge package or product changed; run dashbye plan again');
  if (fresh.blocking.length) throw new Error(`Edge: ${fresh.blocking.join('; ')}`);
  return fresh;
}

export async function uploadEdgeDraft(target: EdgeTarget, client: Pick<EdgeClient, 'uploadDraftPackage'>, plan: EdgePlan) {
  const bytes = new Uint8Array(await readFile(target.artifact));
  if (sha256(bytes) !== plan.artifactSha256) throw new Error('Edge package changed after approval; run dashbye plan again');
  const outcome = await client.uploadDraftPackage(target.productId, bytes);
  return outcome.status === 'Succeeded'
    ? { result: 'draft_uploaded' as const, version: plan.version }
    : { result: 'upload_failed' as const, errorCode: outcome.errorCode };
}
