#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { renderAgentPrompt } from './agent-prompt.js';
import { commandHelp, optional, parseCommandLine, type Args } from './args.js';
import { ensureChrome } from './chrome.js';
import { applyReconciliationPlan, isDashboardUrl, isExactItemEditUrl, readDashboardState } from './dashboard-v2.js';
import { formatDoctor, formatSyncResult, formatValidation } from './format.js';
import { sha256 } from './hash.js';
import { manual } from './help.js';
import { guideInitialization, initialize } from './init.js';
import { projectStateDir, writePrivateFile } from './paths.js';
import { settleReadBack } from './read-back.js';
import { combinePlans, confirmQuestion, formatMultiPlan, parsePlanFile, selectStores, type MultiPlan, type StorePlans } from './multi-plan.js';
import { DEFAULT_ENDPOINT, loadProject } from './project.js';
import { createDesiredState, createReconciliationPlan, publicDashboardState, type ReconciliationPlan } from './reconcile.js';
import { writeReleaseLock } from './release-lock.js';
import { normalizeLoopbackEndpoint } from './security.js';
import { askYesNo, openDashboard } from './session.js';
import { loadAmoCredentials } from './credentials.js';
import { AmoClient } from './stores/firefox/amo.js';
import { planFirefox, uploadFirefoxForValidation, verifyFirefox } from './stores/firefox/index.js';
import type { FirefoxPlan } from './stores/firefox/plan.js';
import { validateStores } from './stores/validate.js';
import { STORE_LABELS, type StoreId } from './stores/types.js';
import { discoverConfig, loadWorkspace, validateWorkspace, type LoadedWorkspace, type WorkspaceOverrides } from './workspace.js';

const VERSION = '0.3.0';
const READ_BACK_ATTEMPTS = 6;
const READ_BACK_DELAY_MS = 5_000;

const WORKSPACE_KEYS = [['project', 'project'], ['artifact', 'artifact'], ['resources', 'resources'], ['item-id', 'itemId'], ['language', 'language'], ['endpoint', 'endpoint']] as const;

function workspaceValues(args: Args): WorkspaceOverrides {
  return Object.fromEntries(WORKSPACE_KEYS
    .map(([flag, key]) => [key, optional(args, flag)] as const)
    .filter((entry): entry is readonly [typeof entry[0], string] => entry[1] !== undefined));
}

// Readable summaries for people at a terminal; JSON for agents, pipes, and --json.
const readable = (args: Args) => args.json !== true && process.stdout.isTTY === true;
const interactive = (args: Args) => args['non-interactive'] !== true && process.stdin.isTTY === true && process.stdout.isTTY === true;
const notify = (message: string) => console.error(message);

async function selectedConfig(args: Args): Promise<string> {
  const explicit = optional(args, 'config');
  if (explicit) return resolve(explicit);
  const discovered = await discoverConfig(optional(args, 'project') ?? process.cwd());
  if (!discovered) throw new Error('no dashbye.config.yml found; run dashbye init');
  return discovered;
}

const loadSelected = async (args: Args) => loadWorkspace(await selectedConfig(args), workspaceValues(args));

async function loadSetup(args: Args) {
  const configPath = await selectedConfig(args);
  const setup = await loadProject(configPath);
  return { configPath, setup, stores: selectStores(setup.stores, optional(args, 'store')) };
}

const statePath = (configPath: string, file: string) => join(projectStateDir(configPath), file);

async function emit(args: Args, value: unknown, summary: () => string): Promise<void> {
  const json = `${JSON.stringify(value, null, 2)}\n`;
  const output = optional(args, 'output');
  if (output) await writeFile(resolve(output), json, { mode: 0o600 });
  console.log(readable(args) ? summary() : json.trimEnd());
}

async function agentPrompt(args: Args) {
  const prompt = renderAgentPrompt(workspaceValues(args));
  const output = optional(args, 'output');
  if (output) await writeFile(resolve(output), `${prompt}\n`, { mode: 0o600 });
  console.log(prompt);
}

async function validate(args: Args) {
  const { configPath, setup, stores } = await loadSetup(args);
  const checked = await validateStores(configPath, setup, stores, workspaceValues(args));
  const valid = !checked.issues.some(issue => issue.severity === 'error');
  // Chrome's summary stays at the top level for agents written against 0.3.
  const result = { ...(checked.chrome ?? {}), stores, packages: checked.packages, issues: checked.issues, hints: checked.hints, valid };
  await emit(args, result, () => formatValidation(checked));
  if (!valid) throw new Error('validation failed');
}

async function doctor(args: Args) {
  const { configPath, setup } = await loadSetup(args);
  const workspace = setup.targets.chrome ? await loadWorkspace(configPath, workspaceValues(args)) : null;
  const issues = workspace ? validateWorkspace(workspace) : [];
  const endpoint = optional(args, 'endpoint') ? normalizeLoopbackEndpoint(optional(args, 'endpoint')!) : setup.endpoint;
  let browser: { connected: boolean; matchingEditTabs: number; dashboardTabs: number; error?: string };
  try {
    const connection = await chromium.connectOverCDP(endpoint, { timeout: 5_000 });
    const pages = connection.contexts().flatMap(context => context.pages());
    const tabs = workspace ? pages.filter(page => isExactItemEditUrl(page.url(), workspace.config.target.itemId)) : [];
    browser = { connected: true, matchingEditTabs: tabs.length, dashboardTabs: pages.filter(page => isDashboardUrl(page.url())).length };
  } catch (error) {
    const message = error instanceof Error ? (error.message.split('\n')[0] ?? 'connection failed') : 'connection failed';
    browser = { connected: false, matchingEditTabs: 0, dashboardTabs: 0, error: message };
  }
  const result = { config: basename(configPath), stores: setup.stores, artifactVersion: workspace?.artifact.manifest.version ?? null, issues, browser };
  await emit(args, result, () => formatDoctor({ ...result, artifactVersion: result.artifactVersion ?? 'n/a' }));
}

// Only the endpoint is needed, so a missing build or incomplete resources must not
// prevent opening Chrome for sign-in.
async function chromeEndpoint(args: Args): Promise<string> {
  const explicit = optional(args, 'endpoint');
  if (explicit) return normalizeLoopbackEndpoint(explicit);
  const config = optional(args, 'config') ? resolve(optional(args, 'config')!) : await discoverConfig(optional(args, 'project') ?? process.cwd());
  return config ? (await loadProject(config)).endpoint : DEFAULT_ENDPOINT;
}

async function chrome(args: Args) {
  const endpoint = await chromeEndpoint(args);
  const { launched } = await ensureChrome(endpoint, { launch: true });
  const result = { endpoint, launched };
  await emit(args, result, () => `${launched ? 'Opened' : 'Already running:'} the dedicated DashBye Chrome at ${endpoint}. Sign in to Google in that window if it asks.`);
}

async function dashboardPage(args: Args, workspace: LoadedWorkspace) {
  const { endpoint, itemId } = workspace.config.target;
  return (await openDashboard(endpoint, itemId, { launch: args['no-launch'] !== true, waitForLogin: interactive(args), notify })).page;
}

async function chromeWorkspace(args: Args, configPath: string): Promise<LoadedWorkspace> {
  const workspace = await loadWorkspace(configPath, workspaceValues(args));
  if (validateWorkspace(workspace).some(issue => issue.severity === 'error')) throw new Error('validation failed before browser access; run dashbye validate');
  return workspace;
}

async function inspect(args: Args) {
  const { configPath, setup } = await loadSetup(args);
  if (!setup.targets.chrome) throw new Error('inspect currently reads the Chrome Web Store draft, and Chrome is not configured');
  const workspace = await chromeWorkspace(args, configPath);
  const current = await readDashboardState(await dashboardPage(args, workspace), workspace);
  const result = publicDashboardState(current);
  const saved = statePath(configPath, 'inspect.json');
  await writePrivateFile(saved, `${JSON.stringify(result, null, 2)}\n`);
  await emit(args, result, () => `${JSON.stringify(result, null, 2)}\nSaved: ${saved}`);
}

const amoClient = async () => new AmoClient(await loadAmoCredentials());

const chromeTargets = (workspace: LoadedWorkspace | null) => workspace ? { chrome: workspace.config.target } : {};

async function plan(args: Args) {
  const { configPath, setup, stores } = await loadSetup(args);
  const plans: StorePlans = {};
  let workspace: LoadedWorkspace | null = null;
  if (stores.includes('chrome')) {
    workspace = await chromeWorkspace(args, configPath);
    const current = await readDashboardState(await dashboardPage(args, workspace), workspace);
    plans.chrome = createReconciliationPlan(workspace, await createDesiredState(workspace), current);
  }
  if (stores.includes('firefox')) plans.firefox = await planFirefox(setup.targets.firefox!, setup.resources, await amoClient());
  const combined = combinePlans(plans, stores.filter(store => store === 'edge'));
  const saved = statePath(configPath, 'plan.json');
  await writePrivateFile(saved, `${JSON.stringify(combined, null, 2)}\n`);
  await emit(args, combined, () => [formatMultiPlan(combined, chromeTargets(workspace)), '', `Plan saved: ${saved}`, 'Next: dashbye sync-draft'].join('\n'));
}

async function loadPlan(args: Args, configPath: string): Promise<MultiPlan> {
  const path = optional(args, 'plan') ? resolve(optional(args, 'plan')!) : statePath(configPath, 'plan.json');
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new Error(optional(args, 'plan') ? `cannot read plan: ${path}` : 'no saved plan for this project; run dashbye plan first');
  }
  return parsePlanFile(raw);
}

// Decided before Chrome is opened, so a wrong hash or a non-terminal run fails fast.
function approvalMode(args: Args, plan: MultiPlan): 'hash' | 'prompt' {
  const hash = optional(args, 'approve-plan');
  if (hash !== undefined) {
    if (hash !== plan.approvalHash) throw new Error(`--approve-plan must equal ${plan.approvalHash}`);
    return 'hash';
  }
  if (!interactive(args)) throw new Error('--approve-plan <approvalHash> is required outside an interactive terminal');
  return 'prompt';
}

function confirm(plan: MultiPlan, workspace: LoadedWorkspace | null): Promise<boolean> {
  console.log(formatMultiPlan(plan, chromeTargets(workspace)));
  return askYesNo(confirmQuestion(plan), { input: process.stdin, output: process.stdout });
}

type ChromeRun = { workspace: LoadedWorkspace; page: Awaited<ReturnType<typeof dashboardPage>>; desired: Awaited<ReturnType<typeof createDesiredState>>; approved: ReconciliationPlan };

// Every check that can run without writing happens before the confirmation.
async function prepareChrome(args: Args, configPath: string, approved: ReconciliationPlan): Promise<ChromeRun> {
  const workspace = await loadWorkspace(configPath, workspaceValues(args));
  const desired = await createDesiredState(workspace);
  if (approved.itemIdHash !== sha256(workspace.config.target.itemId)
    || approved.artifactSha256 !== workspace.artifact.sha256
    || approved.releaseHash !== workspace.release.hash) {
    throw new Error('plan is stale because the target, artifact, or resources changed; run dashbye plan again');
  }
  return { workspace, desired, approved, page: await dashboardPage(args, workspace) };
}

async function verifyChrome(run: ChromeRun): Promise<void> {
  const current = await readDashboardState(run.page, run.workspace);
  if (createReconciliationPlan(run.workspace, run.desired, current).approvalHash !== run.approved.approvalHash) {
    throw new Error('plan is stale because the Chrome Web Store draft changed; run dashbye plan again');
  }
}

async function syncChrome(run: ChromeRun) {
  const applied = await applyReconciliationPlan(run.page, run.workspace, run.desired, run.approved);
  const { state: after, remaining } = await settleReadBack(
    applied,
    () => readDashboardState(run.page, run.workspace),
    state => createReconciliationPlan(run.workspace, run.desired, state).operations.length,
    { attempts: READ_BACK_ATTEMPTS, delayMs: READ_BACK_DELAY_MS },
  );
  if (remaining) throw new Error('draft read-back still differs from the approved desired state');
  const lockPath = await writeReleaseLock(run.workspace);
  return { result: 'saved_and_reread' as const, snapshot: publicDashboardState(after), releaseLock: basename(lockPath) };
}

type StoreResult = { result: string; releaseLock?: string; error?: string; errors?: number; warnings?: number; messages?: string[]; listingChanges?: number; developerHub?: string };

function describeResult(entry: StoreResult): string {
  if (entry.result === 'failed') return `failed: ${entry.error}`;
  if (entry.result === 'saved_and_reread') return formatSyncResult({ releaseLock: entry.releaseLock ?? '' });
  const counts = `${entry.errors} errors, ${entry.warnings} warnings`;
  if (entry.result === 'validation_failed') return `AMO validation failed (${counts}). Fix the package and run dashbye plan again.`;
  const listing = entry.listingChanges ? ` and update ${entry.listingChanges} listing field${entry.listingChanges === 1 ? '' : 's'}` : '';
  return `validated by AMO (${counts}). Nothing was submitted. Next, upload this version${listing} in AMO Developer Hub: ${entry.developerHub}`;
}

function storesToRun(args: Args, approved: MultiPlan): StoreId[] {
  const planned = Object.keys(approved.stores) as StoreId[];
  const requested = optional(args, 'store');
  if (!requested) return planned;
  const selected = selectStores([...planned, ...approved.pending], requested);
  const notPlanned = selected.filter(store => !planned.includes(store));
  if (notPlanned.length) throw new Error(`${notPlanned.join(', ')} cannot be synchronized by this DashBye version`);
  return selected;
}

async function syncDraft(args: Args) {
  const { configPath } = await loadSetup({ ...args, store: false });
  const approved = await loadPlan(args, configPath);
  const run = storesToRun(args, approved);
  const mode = approvalMode(args, approved);
  const setup = await loadProject(configPath);
  const chrome = run.includes('chrome') && approved.stores.chrome ? await prepareChrome(args, configPath, approved.stores.chrome) : null;
  if (chrome) await verifyChrome(chrome);
  const client = run.includes('firefox') && approved.stores.firefox ? await amoClient() : null;
  const firefox: FirefoxPlan | null = client ? await verifyFirefox(setup.targets.firefox!, setup.resources, client, approved.stores.firefox!) : null;
  // Ask only after every plan is confirmed against the current drafts, so the person
  // approves exactly what will be written.
  if (mode === 'prompt' && !await confirm(approved, chrome?.workspace ?? null)) {
    console.log('Cancelled. Nothing was written to any store.');
    return;
  }
  const results: Partial<Record<StoreId, StoreResult>> = {};
  let chromeResult: Awaited<ReturnType<typeof syncChrome>> | null = null;
  if (chrome) {
    try {
      chromeResult = await syncChrome(chrome);
      results.chrome = { result: chromeResult.result, releaseLock: chromeResult.releaseLock };
    } catch (error) {
      results.chrome = { result: 'failed', error: error instanceof Error ? error.message : 'unknown error' };
    }
  }
  if (firefox && client) {
    try {
      results.firefox = await uploadFirefoxForValidation(setup.targets.firefox!, client, firefox);
    } catch (error) {
      results.firefox = { result: 'failed', error: error instanceof Error ? error.message : 'unknown error' };
    }
  }
  const failed = Object.entries(results).filter(([, entry]) => entry?.result === 'failed' || entry?.result === 'validation_failed');
  const result = {
    result: failed.length ? 'failed' : 'saved_and_reread',
    stores: results,
    pending: approved.pending,
    ...(chromeResult ? { snapshot: chromeResult.snapshot, releaseLock: chromeResult.releaseLock } : {}),
  };
  await emit(args, result, () => Object.entries(results).map(([store, entry]) => `${STORE_LABELS[store as StoreId]}: ${describeResult(entry!)}`).join('\n'));
  if (failed.length) throw new Error(`synchronization failed for ${failed.map(([store]) => store).join(', ')}`);
}

async function init(args: Args) {
  const storeFlags = Object.fromEntries(([
    ['stores', 'stores'], ['edge-artifact', 'edgeArtifact'], ['edge-product-id', 'edgeProductId'], ['edge-language', 'edgeLanguage'],
    ['firefox-artifact', 'firefoxArtifact'], ['firefox-addon', 'firefoxAddon'], ['config', 'config'],
  ] as const).flatMap(([flag, key]) => optional(args, flag) ? [[key, optional(args, flag)!]] : []));
  const options = { ...workspaceValues(args), ...storeFlags, overwrite: args.overwrite === true };
  if (args.agent === true) {
    if (args.json !== true) throw new Error('init --agent requires --json');
    console.log(JSON.stringify(await guideInitialization(options), null, 2));
    return;
  }
  const result = await initialize({ ...options, nonInteractive: args['non-interactive'] === true });
  console.log(JSON.stringify(result, null, 2));
}

const handlers: Record<string, (args: Args) => Promise<void>> = {
  init,
  'agent-prompt': agentPrompt,
  validate,
  doctor,
  chrome,
  inspect,
  plan,
  'sync-draft': syncDraft,
};

async function main() {
  const { command, args, help, version } = parseCommandLine(process.argv.slice(2));
  if (version) { console.log(VERSION); return; }
  if (help) { console.log(command ? commandHelp(command) : manual()); return; }
  if (!command) {
    if (!await discoverConfig() && process.stdin.isTTY) {
      await initialize({ nonInteractive: false, overwrite: false });
      return;
    }
    console.log(manual());
    return;
  }
  await handlers[command]!(args);
}

main().then(
  () => process.stdout.write('', () => process.exit(0)),
  error => {
    console.error(error instanceof Error ? error.message : 'unknown error');
    process.stderr.write('', () => process.exit(1));
  },
);
