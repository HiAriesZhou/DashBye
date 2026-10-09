import { loadArtifact, loadRawManifest } from '../artifact.js';
import type { ProjectSetup } from '../project.js';
import { compareManifest, loadLatestLock } from '../release-lock.js';
import { loadWorkspace, publicWorkspaceSummary, validateWorkspace, type ValidationIssue, type WorkspaceOverrides } from '../workspace.js';
import { detectStores } from './detect.js';
import { loadFirefoxRelease } from './firefox/release.js';
import { STORE_IDS, STORE_LABELS, type StoreId } from './types.js';

export type StoreIssue = ValidationIssue & { store: StoreId };

export type StoresValidation = {
  chrome?: ReturnType<typeof publicWorkspaceSummary> & { baseline: { version: string; manifestChanges: ReturnType<typeof compareManifest> } | null };
  packages: Partial<Record<StoreId, { version: string; kind: string }>>;
  issues: StoreIssue[];
  hints: string[];
};

const message = (error: unknown) => error instanceof Error ? error.message : 'cannot read package';

async function chromeValidation(configPath: string, overrides: WorkspaceOverrides) {
  const workspace = await loadWorkspace(configPath, overrides);
  const issues = validateWorkspace(workspace);
  const baseline = await loadLatestLock(workspace.config.resources, workspace.artifact.manifest.version);
  return {
    ...publicWorkspaceSummary(workspace, issues),
    baseline: baseline ? { version: baseline.version, manifestChanges: compareManifest(baseline.manifest, workspace.artifact.manifest) } : null,
  };
}

// Store-specific listing checks for Edge and Firefox arrive with their adapters;
// here every configured package must load and Firefox must name its add-on ID.
async function packageIssues(store: StoreId, artifact: string): Promise<{ version?: { version: string; kind: string }; issues: StoreIssue[] }> {
  try {
    const facts = await loadArtifact(artifact);
    const issues: StoreIssue[] = [];
    if (store === 'firefox') {
      const settings = (await loadRawManifest(artifact)).browser_specific_settings as { gecko?: { id?: unknown } } | undefined;
      if (typeof settings?.gecko?.id !== 'string') {
        issues.push({ store, severity: 'error', code: 'missing_gecko_id', message: 'Firefox package manifest must set browser_specific_settings.gecko.id' });
      }
    }
    return { version: { version: facts.manifest.version, kind: facts.kind }, issues };
  } catch (error) {
    return { issues: [{ store, severity: 'error', code: 'package_unreadable', message: `${STORE_LABELS[store].split(' ')[0]} package: ${message(error)}` }] };
  }
}

async function unconfiguredHints(setup: ProjectSetup): Promise<string[]> {
  const detection = await detectStores(setup.project);
  return STORE_IDS.flatMap(store => {
    if (setup.targets[store]) return [];
    const own = detection.stores[store].artifacts.filter(path => detection.stores[store].evidence.some(line => line.startsWith(path)));
    return own.length ? [`Found a ${STORE_LABELS[store]} package (${own[0]}), but that store is not configured; run dashbye init to change stores.`] : [];
  });
}

export async function validateStores(configPath: string, setup: ProjectSetup, stores: StoreId[], overrides: WorkspaceOverrides): Promise<StoresValidation> {
  const result: StoresValidation = { packages: {}, issues: [], hints: await unconfiguredHints(setup) };
  for (const store of stores) {
    if (store === 'chrome') {
      const chrome = await chromeValidation(configPath, overrides);
      result.chrome = chrome;
      result.packages.chrome = { version: chrome.artifact.version, kind: chrome.artifact.kind };
      result.issues.push(...chrome.issues.map(issue => ({ ...issue, store })));
      continue;
    }
    const target = setup.targets[store]!;
    const { version, issues } = await packageIssues(store, target.artifact);
    if (version) result.packages[store] = version;
    result.issues.push(...issues);
    if (store === 'firefox') {
      await loadFirefoxRelease(setup.resources).catch(error => {
        result.issues.push({ store, severity: 'error', code: 'firefox_listing', message: message(error) });
      });
    }
  }
  const versions = new Set(Object.values(result.packages).map(entry => entry!.version));
  if (versions.size > 1) {
    const listed = Object.entries(result.packages).map(([store, entry]) => `${store} ${entry!.version}`).join(', ');
    result.issues.push({ store: stores[0]!, severity: 'warning', code: 'version_mismatch', message: `package versions differ across stores: ${listed}` });
  }
  return result;
}
