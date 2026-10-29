import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { loadArtifactWithRaw } from '../../artifact.js';
import { objectHash, sha256 } from '../../hash.js';
import type { FirefoxTarget } from '../../project.js';
import type { AmoClient } from './amo.js';
import type { AmoWriter } from './amo-write.js';
import { assertPackageForAddon } from './index.js';
import { compareVersions } from '../../version.js';
import { amoText } from './plan.js';
import { loadFirefoxRelease, readText } from './release.js';

// AMO has no draft: creating a listed version submits it for review. `dashbye submit`
// is the one command that does this, and only for an approved plan bound to the
// exact package, source archive, notes, and AMO state.

export type FirefoxSubmitPlan = {
  schema: 'dashbye/firefox-submit/v1';
  addonHash: string;
  slug: string;
  version: { local: string; remote: string | null };
  artifactSha256: string;
  sourceSha256: string | null;
  releaseNotesHash: string | null;
  reviewerNotesHash: string | null;
  blocking: string[];
  approvalHash: string;
};

export type SubmitDeps = {
  reader: Pick<AmoClient, 'getAddon' | 'uploadForValidation'>;
  writer: Pick<AmoWriter, 'findVersion' | 'createVersion' | 'setVersionNotes' | 'getVersion'> | null;
};

export type SubmitResult =
  | { result: 'submitted'; version: string; status: string | null; warnings: number }
  | { result: 'submitted_incomplete'; version: string; error: string }
  | { result: 'validation_failed'; errors: number; warnings: number; messages: string[] };

export const releaseNotesPath = (resources: string, version: string) => join(resources, 'releases', `${version}.notes.md`);

export const submitApprovalHash = (plan: Omit<FirefoxSubmitPlan, 'approvalHash'>): string => objectHash(plan);

type Inputs = { version: string; locale: string; packageBytes: Uint8Array; source: { name: string; bytes: Uint8Array } | null; releaseNotes: string | null; reviewerNotes: string | null; plan: FirefoxSubmitPlan };

async function gather(target: FirefoxTarget, resources: string, deps: SubmitDeps): Promise<Inputs> {
  const [{ artifact, raw }, release, addon] = await Promise.all([loadArtifactWithRaw(target.artifact), loadFirefoxRelease(resources), deps.reader.getAddon(target.addon)]);
  assertPackageForAddon(raw, addon);
  const version = artifact.manifest.version;
  const packageBytes = new Uint8Array(await readFile(target.artifact));
  const source = target.source ? { name: basename(target.source), bytes: new Uint8Array(await readFile(target.source)) } : null;
  const notesPath = releaseNotesPath(resources, version);
  const releaseNotes = await readText(notesPath, 'release notes').catch(() => null);
  const existing = deps.writer ? await deps.writer.findVersion(target.addon, version) : null;

  const blocking: string[] = [];
  if (!deps.writer) blocking.push('an AMO API key is required to submit; set DASHBYE_AMO_ISSUER and DASHBYE_AMO_SECRET');
  if (artifact.kind !== 'zip') blocking.push('the Firefox package must be a ZIP or XPI file to submit');
  if (addon.currentVersion && compareVersions(version, addon.currentVersion) <= 0) blocking.push(`package version ${version} is not newer than the AMO version ${addon.currentVersion}`);
  if (existing) blocking.push(`AMO already has version ${version} (${existing.status ?? 'unknown status'})`);
  if (releaseNotes === null) blocking.push(`release notes are missing: releases/${version}.notes.md`);

  const base = {
    schema: 'dashbye/firefox-submit/v1' as const,
    addonHash: sha256(target.addon),
    slug: addon.slug,
    version: { local: version, remote: addon.currentVersion },
    artifactSha256: sha256(packageBytes),
    sourceSha256: source ? sha256(source.bytes) : null,
    releaseNotesHash: releaseNotes === null ? null : sha256(releaseNotes),
    reviewerNotesHash: release.reviewerNotes === null ? null : sha256(release.reviewerNotes),
    blocking,
  };
  const plan = { ...base, approvalHash: submitApprovalHash(base) };
  return { version, locale: addon.defaultLocale, packageBytes, source, releaseNotes, reviewerNotes: release.reviewerNotes, plan };
}

export async function planSubmission(target: FirefoxTarget, resources: string, deps: SubmitDeps): Promise<FirefoxSubmitPlan> {
  return (await gather(target, resources, deps)).plan;
}

const same = (left: string | null, right: string | null) => (amoText(left) ?? '') === (amoText(right) ?? '');

// Re-reads everything after approval and uses the bytes it hashed, so a file
// replaced in between cannot be submitted.
export async function executeSubmission(target: FirefoxTarget, resources: string, deps: SubmitDeps, approved: FirefoxSubmitPlan): Promise<SubmitResult> {
  const inputs = await gather(target, resources, deps);
  if (inputs.plan.approvalHash !== approved.approvalHash) throw new Error('plan is stale because the Firefox package, source, notes, or AMO add-on changed; run dashbye submit again');
  if (inputs.plan.blocking.length) throw new Error(`Firefox: ${inputs.plan.blocking.join('; ')}`);
  const writer = deps.writer!;

  const validation = await deps.reader.uploadForValidation(target.artifact, { bytes: inputs.packageBytes });
  if (!validation.valid) return { result: 'validation_failed', errors: validation.errors, warnings: validation.warnings, messages: validation.messages };

  const created = await writer.createVersion(target.addon, validation.uuid, inputs.source);
  // From here the version exists and is in review. Report what happened instead of
  // retrying: a second create would fail or duplicate the submission.
  try {
    await writer.setVersionNotes(target.addon, created.id, { locale: inputs.locale, releaseNotes: inputs.releaseNotes!, reviewerNotes: inputs.reviewerNotes });
    const read = await writer.getVersion(target.addon, created.id, inputs.locale);
    const mismatch = [
      read.version !== inputs.version && 'version',
      read.hasSource !== (inputs.source !== null) && 'source archive',
      !same(read.releaseNotes, inputs.releaseNotes) && 'release notes',
      inputs.reviewerNotes !== null && !same(read.reviewerNotes, inputs.reviewerNotes) && 'reviewer notes',
    ].filter(Boolean);
    if (mismatch.length) throw new Error(`AMO read-back differs: ${mismatch.join(', ')}`);
    return { result: 'submitted', version: read.version, status: read.status, warnings: validation.warnings };
  } catch (error) {
    return { result: 'submitted_incomplete', version: created.version, error: error instanceof Error ? error.message : 'unknown error' };
  }
}

export function formatSubmitPlan(plan: FirefoxSubmitPlan): string {
  const sent = ['Package', plan.sourceSha256 && 'source archive', plan.releaseNotesHash && 'release notes', plan.reviewerNotesHash && 'reviewer notes'].filter(Boolean).join(', ');
  const lines = [
    `Submit Firefox ${plan.version.local} to AMO for review (current: ${plan.version.remote ?? 'no version yet'})`,
    `  ${sent}`,
    ...(plan.sourceSha256 ? [] : ['  No source archive is configured (targets.firefox.source); AMO asks for one when the code is built or minified.']),
    '  AMO has no draft: once created, the version is in the review queue.',
    ...plan.blocking.map(reason => `  Blocked: ${reason}`),
  ];
  if (!plan.blocking.length) lines.push(`  Approval: ${plan.approvalHash}`);
  return lines.join('\n');
}

export function describeSubmission(result: SubmitResult): string {
  if (result.result === 'submitted') return `Submitted ${result.version} to AMO (${result.status ?? 'status unknown'}, ${result.warnings} validation warnings). Release notes and reviewer notes were read back.`;
  if (result.result === 'submitted_incomplete') return `${result.version} was created and is in review, but ${result.error}. Finish the notes in AMO Developer Hub. Do not run submit again for this version.`;
  return `AMO validation failed (${result.errors} errors, ${result.warnings} warnings). Nothing was submitted.`;
}
