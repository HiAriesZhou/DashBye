import type { ReconcileOperation, ReconciliationPlan } from './reconcile.js';
import type { ManifestChange } from './release-lock.js';
import type { ValidationIssue } from './workspace.js';

const FIELD_LABELS: Record<string, string> = {
  packageVersion: 'package version',
  description: 'description',
  category: 'category',
  promoVideoUrl: 'promo video URL',
  officialUrl: 'official URL',
  homepageUrl: 'homepage URL',
  supportUrl: 'support URL',
  matureContent: 'mature content',
  icon: 'icon',
  smallPromo: 'small promo tile (440×280)',
  marqueePromo: 'marquee promo tile (1400×560)',
  screenshots: 'screenshots',
  singlePurpose: 'single purpose',
  permissionJustifications: 'permission justifications',
  hostPermissionJustification: 'host permission justification',
  remoteCode: 'remote code declaration',
  collectedData: 'collected data',
  certifications: 'data use certifications',
  policyUrl: 'privacy policy URL',
};

const AREA_LABELS: Record<ReconcileOperation['area'], string> = { package: 'Package', listing: 'Listing', privacy: 'Privacy' };

// Hashes are never shown: only versions, counts, and booleans are readable facts.
function change(operation: ReconcileOperation): string {
  const label = FIELD_LABELS[operation.field] ?? operation.field;
  const { before, after } = operation;
  const readable = (value: unknown) => typeof value === 'number' || typeof value === 'boolean';
  if (operation.field === 'packageVersion') return `${operation.action} ${label} ${before ?? 'none'} → ${after}`;
  if (readable(before) && readable(after)) return `${operation.action} ${label} (${before} → ${after})`;
  return `${operation.action} ${label}`;
}

function warning(operation: ReconcileOperation): string {
  if (!operation.destructive) return '';
  return operation.action === 'remove' ? '  ! removes existing content' : '  ! replaces existing content';
}

export function formatPlan(plan: ReconciliationPlan, target: { itemId: string; language: string }): string {
  const lines = [`Target: item ${target.itemId}, ${target.language}`];
  if (!plan.operations.length) return [...lines, 'No changes: the Dashboard draft already matches.'].join('\n');
  lines.push(`${plan.operations.length} change${plan.operations.length === 1 ? '' : 's'}:`);
  for (const operation of plan.operations) {
    lines.push(`  ${AREA_LABELS[operation.area].padEnd(8)} ${change(operation)}${warning(operation)}`);
  }
  return lines.join('\n');
}

type ValidationView = {
  artifact: { kind: string; version: string };
  release: { locales: string[] };
  issues: ValidationIssue[];
  baseline: { version: string; manifestChanges: ManifestChange[] } | null;
};

export function formatValidation(result: ValidationView): string {
  const lines = [`Extension ${result.artifact.version} (${result.artifact.kind}) · ${result.release.locales.join(', ')}`];
  if (result.baseline?.manifestChanges.length) {
    lines.push(`Since ${result.baseline.version}:`);
    for (const { field, added, removed } of result.baseline.manifestChanges) {
      lines.push(`  ${field}: ${[...added.map(value => `+${value}`), ...removed.map(value => `-${value}`)].join(' ')}`);
    }
  }
  if (!result.issues.length) return [...lines, 'No issues found.'].join('\n');
  for (const issue of result.issues) lines.push(`  ${issue.severity.padEnd(8)} ${issue.message}`);
  return lines.join('\n');
}

export function formatSyncResult(result: { releaseLock: string }): string {
  return `Draft saved and read back with no remaining differences. Release lock: ${result.releaseLock}`;
}

type DoctorView = {
  config: string;
  artifactVersion: string;
  issues: ValidationIssue[];
  browser: { connected: boolean; matchingEditTabs: number; dashboardTabs: number; error?: string };
};

export function formatDoctor(result: DoctorView): string {
  const { browser } = result;
  const chrome = browser.connected
    ? `Chrome: connected · ${browser.dashboardTabs} Dashboard tab${browser.dashboardTabs === 1 ? '' : 's'}, ${browser.matchingEditTabs} for this item`
    : `Chrome: not reachable (${browser.error ?? 'connection failed'}); run "dashbye chrome"`;
  const lines = [`Config: ${result.config} · extension ${result.artifactVersion}`, chrome];
  for (const issue of result.issues) lines.push(`  ${issue.severity.padEnd(8)} ${issue.message}`);
  return lines.join('\n');
}
