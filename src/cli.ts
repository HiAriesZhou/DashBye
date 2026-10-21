#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { renderAgentPrompt } from './agent-prompt.js';
import { assertNoFirefoxPathOverrides, commandHelp, optional, parseCommandLine, type Args } from './args.js';
import { chromeStatus, countPageTargets, endpointReachable, ensureChrome, isNoWindowError } from './chrome.js';
import { applyReconciliationPlan, isDashboardUrl, isExactItemEditUrl, readDashboardState } from './dashboard-v2.js';
import { assertDraftEditable, assertPlanWritable } from './edit-lock.js';
import { formatDoctor, formatSyncResult, formatValidation } from './format.js';
import { sha256 } from './hash.js';
import { manual } from './help.js';
import { guideInitialization, initialize } from './init.js';
import { projectStateDir, writePrivateFile } from './paths.js';
import { applyWithRetry, settleReadBack } from './read-back.js';
import { combinePlans, confirmQuestion, formatMultiPlan, parsePlanFile, planForRun, selectStores, storesToRun, type MultiPlan, type StorePlans } from './multi-plan.js';
import { DEFAULT_ENDPOINT, loadProject, type ProjectSetup } from './project.js';
import { createDesiredState, createReconciliationPlan, publicDashboardState, remainingWithinApproved, type ReconciliationPlan } from './reconcile.js';
import { writeReleaseLock } from './release-lock.js';
import { applyLoopbackNoProxy } from './net.js';
import { placeOnDisplay } from './displays.js';
import { formatTextChanges, type TextChange } from './text-preview.js';
import { loadFirefoxRelease } from './stores/firefox/release.js';
import { amoText } from './stores/firefox/plan.js';
import { normalizeLoopbackEndpoint, publicErrorMessage } from './security.js';
import { askYesNo, openDashboard } from './session.js';
import { loadAmoCredentials, loadEdgeCredentials } from './credentials.js';
import { EdgeClient } from './stores/edge/api.js';
import { planEdge, uploadEdgeDraft, verifyEdge, type EdgePlan, type EdgeUploadRecord } from './stores/edge/index.js';
import { AmoClient } from './stores/firefox/amo.js';
import { AmoWriter } from './stores/firefox/amo-write.js';
import { applyFirefoxListing, planFirefox, uploadFirefoxForValidation, verifyFirefox } from './stores/firefox/index.js';
import type { FirefoxPlan } from './stores/firefox/plan.js';
import { describeSubmission, executeSubmission, formatSubmitPlan, planSubmission, type SubmitResult } from './stores/firefox/submit.js';
import { validateStores } from './stores/validate.js';
import { STORE_LABELS, type StoreId } from './stores/types.js';
import { isFailedResult, syncOutcome } from './sync-outcome.js';
import { discoverConfig, loadWorkspace, validateWorkspace, type LoadedWorkspace, type WorkspaceOverrides } from './workspace.js';

const VERSION = '0.6.0';
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
  assertNoFirefoxPathOverrides(stores, args);
  const checked = await validateStores(configPath, setup, stores, workspaceValues(args));
  const valid = !checked.issues.some(issue => issue.severity === 'error');
  // Chrome's summary stays at the top level for agents written against 0.3.
  const result = { ...(checked.chrome ?? {}), stores, packages: checked.packages, issues: checked.issues, hints: checked.hints, valid };
  await emit(args, result, () => formatValidation(checked));
  if (!valid) throw new Error('validation failed');
}

type DoctorBrowser = { connected: boolean; matchingEditTabs: number; dashboardTabs: number; noWindow?: boolean; error?: string };

const NO_WINDOW: DoctorBrowser = { connected: false, matchingEditTabs: 0, dashboardTabs: 0, noWindow: true, error: 'running without an open window' };

async function doctorBrowser(endpoint: string, itemId: string | undefined): Promise<DoctorBrowser> {
  if (await chromeStatus(endpoint, { reachable: endpointReachable, pageTargets: countPageTargets }) === 'no-window') return NO_WINDOW;
  try {
    const connection = await chromium.connectOverCDP(endpoint, { timeout: 5_000 });
    const pages = connection.contexts().flatMap(context => context.pages());
    const tabs = itemId ? pages.filter(page => isExactItemEditUrl(page.url(), itemId)) : [];
    return { connected: true, matchingEditTabs: tabs.length, dashboardTabs: pages.filter(page => isDashboardUrl(page.url())).length };
  } catch (error) {
    if (isNoWindowError(error)) return NO_WINDOW;
    return { connected: false, matchingEditTabs: 0, dashboardTabs: 0, error: publicErrorMessage(error) };
  }
}

async function doctor(args: Args) {
  if (args.login === true) await openForLogin(args);
  const { configPath, setup } = await loadSetup(args);
  const workspace = setup.targets.chrome ? await loadWorkspace(configPath, workspaceValues(args)) : null;
  const issues = workspace ? validateWorkspace(workspace) : [];
  const endpoint = optional(args, 'endpoint') ? normalizeLoopbackEndpoint(optional(args, 'endpoint')!) : setup.endpoint;
  const browser = await doctorBrowser(endpoint, workspace?.config.target.itemId);
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

// `doctor --login`: open the dedicated Chrome so the person can sign in to the stores.
async function openForLogin(args: Args) {
  const endpoint = await chromeEndpoint(args);
  const { launched, windowOpened } = await ensureChrome(endpoint, { launch: true });
  const state = launched ? 'Opened the dedicated DashBye Chrome' : windowOpened ? 'Opened a Dashboard window in the running DashBye Chrome' : 'Already running: the dedicated DashBye Chrome';
  notify(`${state} at ${endpoint}. Sign in to the store dashboards in that window.`);
}

async function dashboardPage(args: Args, workspace: LoadedWorkspace) {
  const { endpoint, itemId } = workspace.config.target;
  const page = (await openDashboard(endpoint, itemId, { launch: args['no-launch'] !== true, waitForLogin: interactive(args), notify })).page;
  // Optional: keep DashBye's window on its own display (browser.display).
  const { display } = await loadProject(workspace.configPath, { resolveVersions: false });
  if (display) {
    const session = await page.context().newCDPSession(page) as unknown as Parameters<typeof placeOnDisplay>[0];
    const placed = await placeOnDisplay(session, display, { notify }).catch(error => notify(`could not move the DashBye window: ${publicErrorMessage(error)}`));
    if (placed === 'moved') notify(`Moved the DashBye window to display "${display}".`);
  }
  return page;
}

async function chromeWorkspace(args: Args, configPath: string): Promise<LoadedWorkspace> {
  const workspace = await loadWorkspace(configPath, workspaceValues(args));
  if (validateWorkspace(workspace).some(issue => issue.severity === 'error')) throw new Error('validation failed before browser access; run dashbye validate');
  return workspace;
}


const amoClient = async () => new AmoClient(await loadAmoCredentials());

const chromeTargets = (workspace: LoadedWorkspace | null) => workspace ? { chrome: workspace.config.target } : {};

const lastEdgeUpload = async (configPath: string): Promise<EdgeUploadRecord | null> =>
  JSON.parse(await readFile(statePath(configPath, 'edge-upload.json'), 'utf8').catch(() => 'null')) as EdgeUploadRecord | null;

type Planned = { combined: MultiPlan; workspace: LoadedWorkspace | null; remote: ReturnType<typeof publicDashboardState> | null };

// Plans every selected store and saves the plan (and the Chrome draft state read).
async function buildPlans(args: Args, configPath: string, setup: ProjectSetup, stores: StoreId[]): Promise<Planned> {
  const plans: StorePlans = {};
  let workspace: LoadedWorkspace | null = null;
  let remote: Planned['remote'] = null;
  if (stores.includes('chrome')) {
    workspace = await chromeWorkspace(args, configPath);
    const current = await readDashboardState(await dashboardPage(args, workspace), workspace);
    remote = publicDashboardState(current);
    plans.chrome = createReconciliationPlan(workspace, await createDesiredState(workspace), current);
  }
  if (stores.includes('edge')) plans.edge = await planEdge(setup.targets.edge!, await loadEdgeCredentials() !== null, await lastEdgeUpload(configPath));
  if (stores.includes('firefox')) plans.firefox = await planFirefox(setup.targets.firefox!, setup.resources, await amoClient());
  const combined = combinePlans(plans, []);
  await writePrivateFile(statePath(configPath, 'plan.json'), `${JSON.stringify(combined, null, 2)}\n`);
  if (remote) await writePrivateFile(statePath(configPath, 'inspect.json'), `${JSON.stringify(remote, null, 2)}\n`);
  return { combined, workspace, remote };
}

// Text the person is about to approve, for the terminal only. Chrome is read as
// hashes, so it shows the new text; AMO is read as text, so it shows changed lines.
async function textChanges(planned: Planned, setup: ProjectSetup): Promise<TextChange[]> {
  const changes: TextChange[] = [];
  const chromePlan = planned.combined.stores.chrome;
  if (chromePlan && planned.workspace && chromePlan.operations.some(operation => operation.field === 'description')) {
    const locale = planned.workspace.release.listing.locales[planned.workspace.config.target.language];
    changes.push({ store: STORE_LABELS.chrome, field: 'description', local: locale?.descriptionText ?? null, remote: undefined });
  }
  const fields = (planned.combined.stores.firefox?.differences ?? []).map(difference => difference.field).filter(field => field === 'summary' || field === 'description');
  if (fields.length) {
    const [release, addon] = await Promise.all([loadFirefoxRelease(setup.resources), (await amoClient()).getAddon(setup.targets.firefox!.addon)]);
    for (const field of fields) {
      const [local, remote] = field === 'summary' ? [release.summary, addon.summary] : [release.description, addon.description];
      changes.push({ store: STORE_LABELS.firefox, field, local: amoText(local), remote: amoText(remote) });
    }
  }
  return changes;
}

const withPreview = (summary: string, changes: TextChange[]) => changes.length ? `${summary}\n\nText changes\n${formatTextChanges(changes)}` : summary;

async function plan(args: Args) {
  const { configPath, setup, stores } = await loadSetup(args);
  assertNoFirefoxPathOverrides(stores, args);
  const planned = await buildPlans(args, configPath, setup, stores);
  const { combined, workspace, remote } = planned;
  const showRemote = args.remote === true && remote !== null;
  const changes = readable(args) ? await textChanges(planned, setup) : [];
  await emit(args, showRemote ? { ...combined, remote } : combined, () => [
    withPreview(formatMultiPlan(combined, chromeTargets(workspace)), changes),
    ...(showRemote ? ['', 'Chrome Web Store draft (hashes and counts):', JSON.stringify(remote, null, 2)] : []),
    '', `Plan saved: ${statePath(configPath, 'plan.json')}`, 'Next: dashbye sync-draft, or dashbye release for the whole release',
  ].join('\n'));
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

function confirm(plan: Pick<MultiPlan, 'stores' | 'pending'>, workspace: LoadedWorkspace | null): Promise<boolean> {
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
  // A lock is reported as such rather than as a stale plan.
  assertDraftEditable(current.editLock);
  if (createReconciliationPlan(run.workspace, run.desired, current).approvalHash !== run.approved.approvalHash) {
    throw new Error('plan is stale because the Chrome Web Store draft changed; run dashbye plan again');
  }
}

async function syncChrome(run: ChromeRun) {
  const plan = (state: Awaited<ReturnType<typeof readDashboardState>>) => createReconciliationPlan(run.workspace, run.desired, state);
  const applied = await applyWithRetry({
    approved: run.approved,
    apply: approved => applyReconciliationPlan(run.page, run.workspace, run.desired, approved),
    read: async () => {
      notify('Save draft was not confirmed; reading the draft to retry only the remaining approved changes.');
      const state = await readDashboardState(run.page, run.workspace);
      assertDraftEditable(state.editLock);
      return state;
    },
    remaining: state => plan(state).operations,
    withinApproved: remaining => remainingWithinApproved(run.approved.operations, remaining),
    retryPlan: plan,
  });
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

type StoreResult = {
  result: string; releaseLock?: string; error?: string; errors?: number; warnings?: number; messages?: string[];
  listingChanges?: number; manualChanges?: string[]; developerHub?: string; version?: string; errorCode?: string | null;
};

function describeResult(entry: StoreResult): string {
  if (entry.result === 'failed') return `failed: ${entry.error}`;
  if (entry.result === 'draft_uploaded') return `uploaded ${entry.version} to the draft submission. Review the listing and publish in Partner Center.`;
  if (entry.result === 'unchanged') return `package ${entry.version} is already in the draft submission; nothing was uploaded.`;
  if (entry.result === 'upload_failed') return `Edge rejected the package (${entry.errorCode ?? 'no error code'}). Nothing was published.`;
  if (entry.result === 'saved_and_reread' && entry.manualChanges !== undefined) {
    const manual = entry.manualChanges.length ? ` Update by hand in AMO Developer Hub: ${entry.manualChanges.join(', ')}.` : '';
    return `updated ${entry.listingChanges} listing field${entry.listingChanges === 1 ? '' : 's'} on AMO and re-read them.${manual}`;
  }
  if (entry.result === 'saved_and_reread') return formatSyncResult({ releaseLock: entry.releaseLock ?? '' });
  const counts = `${entry.errors} errors, ${entry.warnings} warnings`;
  if (entry.result === 'validation_failed') return `AMO validation failed (${counts}). Fix the package and run dashbye plan again.`;
  const listing = entry.listingChanges ? ` and update ${entry.listingChanges} listing field${entry.listingChanges === 1 ? '' : 's'}` : '';
  return `validated by AMO (${counts}). Nothing was submitted. Next, upload this version${listing} in AMO Developer Hub: ${entry.developerHub}`;
}

type Execution = {
  result: ReturnType<typeof syncOutcome>;
  stores: Partial<Record<StoreId, StoreResult>>;
  pending: StoreId[];
  snapshot?: ReturnType<typeof publicDashboardState>;
  releaseLock?: string;
};

// Re-verifies each plan against the current drafts, asks `approve`, then writes and
// reads back. Returns null when the person declines.
async function executePlan(args: Args, configPath: string, approved: MultiPlan, run: StoreId[], pending: StoreId[],
  approve: (shown: Pick<MultiPlan, 'stores' | 'pending'>, workspace: LoadedWorkspace | null) => Promise<boolean>): Promise<Execution | null> {
  // A plan read while the item was in review is refused before Chrome is opened.
  if (run.includes('chrome') && approved.stores.chrome) assertPlanWritable(approved.stores.chrome);
  const setup = await loadProject(configPath);
  const chrome = run.includes('chrome') && approved.stores.chrome ? await prepareChrome(args, configPath, approved.stores.chrome) : null;
  if (chrome) await verifyChrome(chrome);
  const edgeCredentials = run.includes('edge') && approved.stores.edge ? await loadEdgeCredentials() : null;
  const edge: EdgePlan | null = run.includes('edge') && approved.stores.edge ? await verifyEdge(setup.targets.edge!, edgeCredentials !== null, approved.stores.edge, await lastEdgeUpload(configPath)) : null;
  const client = run.includes('firefox') && approved.stores.firefox ? await amoClient() : null;
  const firefox: FirefoxPlan | null = client ? await verifyFirefox(setup.targets.firefox!, setup.resources, client, approved.stores.firefox!) : null;
  const amoCredentials = firefox?.mode === 'listing' ? await loadAmoCredentials() : null;
  if (firefox?.mode === 'listing' && !amoCredentials) throw new Error('an AMO API key is required to update the listing; set DASHBYE_AMO_ISSUER and DASHBYE_AMO_SECRET');
  // Ask only after every plan is confirmed against the current drafts, so the person
  // approves exactly what will be written.
  if (!await approve(planForRun(approved, run, pending), chrome?.workspace ?? null)) return null;
  const results: Partial<Record<StoreId, StoreResult>> = {};
  let chromeResult: Awaited<ReturnType<typeof syncChrome>> | null = null;
  if (chrome) {
    try {
      chromeResult = await syncChrome(chrome);
      results.chrome = { result: chromeResult.result, releaseLock: chromeResult.releaseLock };
    } catch (error) {
      results.chrome = { result: 'failed', error: publicErrorMessage(error) };
    }
  }
  if (edge && !edge.operations.length) results.edge = { result: 'unchanged', version: edge.version };
  else if (edge && edgeCredentials) {
    try {
      results.edge = await uploadEdgeDraft(setup.targets.edge!, new EdgeClient(edgeCredentials), edge);
      if (results.edge.result === 'draft_uploaded') {
        await writePrivateFile(statePath(configPath, 'edge-upload.json'), `${JSON.stringify({ productIdHash: edge.productIdHash, artifactSha256: edge.artifactSha256 })}\n`);
      }
    } catch (error) {
      results.edge = { result: 'failed', error: publicErrorMessage(error) };
    }
  }
  if (firefox && client) {
    try {
      results.firefox = firefox.mode === 'listing'
        ? await applyFirefoxListing(setup.targets.firefox!, setup.resources, client, new AmoWriter(amoCredentials!), firefox)
        : await uploadFirefoxForValidation(setup.targets.firefox!, client, firefox);
    } catch (error) {
      results.firefox = { result: 'failed', error: publicErrorMessage(error) };
    }
  }
  return {
    result: syncOutcome(results),
    stores: results,
    pending,
    ...(chromeResult ? { snapshot: chromeResult.snapshot, releaseLock: chromeResult.releaseLock } : {}),
  };
}

const failedStores = (execution: Execution | null) => Object.entries(execution?.stores ?? {}).filter(([, entry]) => isFailedResult(entry?.result)).map(([store]) => store);

const describeStores = (stores: Execution['stores']) =>
  Object.entries(stores).map(([store, entry]) => `${STORE_LABELS[store as StoreId]}: ${describeResult(entry!)}`).join('\n');

async function syncDraft(args: Args) {
  const { configPath } = await loadSetup({ ...args, store: false });
  const approved = await loadPlan(args, configPath);
  const { run, pending } = storesToRun(approved, optional(args, 'store'));
  assertNoFirefoxPathOverrides(run, args);
  if (run.includes('chrome') && approved.stores.chrome) assertPlanWritable(approved.stores.chrome);
  const mode = run.length ? approvalMode(args, approved) : null;
  const execution = await executePlan(args, configPath, approved, run, pending,
    (shown, workspace) => mode === 'prompt' ? confirm(shown, workspace) : Promise.resolve(true));
  if (!execution) {
    console.log('Cancelled. Nothing was written to any store.');
    return;
  }
  await emit(args, execution, () => Object.keys(execution.stores).length ? describeStores(execution.stores) : 'Only pending stores were selected. Nothing was written.');
  const failed = failedStores(execution);
  if (failed.length) throw new Error(`synchronization failed for ${failed.join(', ')}`);
}

// One command for a release: validate, plan every store, ask once for the drafts and
// once more (default no) for the irreversible Firefox submission, then run both and
// say what is left to do in the store dashboards.
async function release(args: Args) {
  const { configPath, setup, stores } = await loadSetup(args);
  const checked = await validateStores(configPath, setup, stores, {});
  if (checked.issues.some(issue => issue.severity === 'error')) {
    await emit(args, { stage: 'validate', issues: checked.issues }, () => formatValidation(checked));
    throw new Error('validation failed');
  }
  const planned = await buildPlans(args, configPath, setup, stores);
  const { combined, workspace } = planned;
  // A Firefox package AMO has not approved yet is submitted, not only validated.
  const pendingFirefox = combined.stores.firefox?.mode === 'validate';
  const amoCredentials = pendingFirefox ? await loadAmoCredentials() : null;
  const submitDeps = pendingFirefox ? { reader: new AmoClient(amoCredentials), writer: amoCredentials ? new AmoWriter(amoCredentials) : null } : null;
  const submission = submitDeps ? await planSubmission(setup.targets.firefox!, setup.resources, submitDeps) : null;
  const run = (Object.keys(combined.stores) as StoreId[]).filter(store => !(store === 'firefox' && pendingFirefox));
  const shown = planForRun(combined, run, []);
  const summary = withPreview([
    formatMultiPlan(shown, chromeTargets(workspace)),
    ...(submission ? ['', STORE_LABELS.firefox, formatSubmitPlan(submission).split('\n').map(line => `  ${line.trim()}`).join('\n')] : []),
  ].join('\n'), interactive(args) || readable(args) ? await textChanges({ ...planned, combined: { ...combined, stores: shown.stores } as MultiPlan }, setup) : []);
  const submittable = submission !== null && !submission.blocking.length;

  const draftHash = optional(args, 'approve-plan');
  const submitHash = optional(args, 'approve-submit');
  if (draftHash !== undefined && draftHash !== combined.approvalHash) throw new Error(`--approve-plan must equal ${combined.approvalHash}`);
  if (submitHash !== undefined && submitHash !== submission?.approvalHash) throw new Error(submission ? `--approve-submit must equal ${submission.approvalHash}` : '--approve-submit was given, but there is no Firefox submission');
  if (draftHash === undefined && submitHash === undefined && !interactive(args)) {
    const approve = [`--approve-plan ${combined.approvalHash}`, ...(submittable ? [`--approve-submit ${submission!.approvalHash}`] : [])].join(' ');
    await emit(args, { plan: combined, submission, approve: { plan: combined.approvalHash, submit: submittable ? submission!.approvalHash : null } },
      () => `${summary}\n\nNothing was written. To run this release: dashbye release ${approve}`);
    return;
  }
  if (draftHash === undefined && submitHash === undefined) console.log(summary);
  const draftsApproved = run.length > 0 && (draftHash !== undefined
    || (submitHash === undefined && await askYesNo(confirmQuestion(shown), { input: process.stdin, output: process.stdout })));
  const submitApproved = submittable && (submitHash !== undefined
    || (draftHash === undefined && await askYesNo(`Submit Firefox ${submission!.version.local} to AMO for review? This cannot be undone.`, { input: process.stdin, output: process.stdout }, { defaultYes: false })));

  const drafts = draftsApproved ? await executePlan(args, configPath, combined, run, [], async () => true) : null;
  let submitted: SubmitResult | { result: 'failed'; error: string } | null = null;
  if (submitApproved) {
    submitted = await executeSubmission(setup.targets.firefox!, setup.resources, submitDeps!, submission!)
      .catch(error => ({ result: 'failed' as const, error: publicErrorMessage(error) }));
  }
  const next = [
    ...(drafts?.stores.chrome?.result === 'saved_and_reread' ? ['Chrome Web Store: review the saved draft and submit it for review in the Developer Dashboard.'] : []),
    ...(drafts?.stores.edge?.result === 'draft_uploaded' ? ['Microsoft Edge Add-ons: update the store listing if needed, then publish in Partner Center.'] : []),
    ...(submitted?.result === 'submitted' ? ['Firefox Add-ons: after AMO approves the version, run dashbye release again to update the listing.'] : []),
    ...(submission?.blocking.length ? [`Firefox Add-ons: not submitted (${submission.blocking.join('; ')}).`] : []),
  ];
  const outcome = { drafts, submission: submitted, next };
  await emit(args, outcome, () => [
    drafts ? describeStores(drafts.stores) : run.length ? 'Drafts: nothing was written.' : '',
    submitted ? `${STORE_LABELS.firefox}: ${'error' in submitted && submitted.result === 'failed' ? `failed: ${submitted.error}` : describeSubmission(submitted as SubmitResult)}` : '',
    ...(next.length ? ['', 'Next:', ...next.map(line => `  - ${line}`)] : []),
  ].filter(Boolean).join('\n'));
  const failed = [...failedStores(drafts), ...(submitted && submitted.result !== 'submitted' ? ['firefox'] : [])];
  if (failed.length) throw new Error(`release failed for ${failed.join(', ')}`);
}

// AMO has no draft, so a Firefox version is created only here and only for the plan
// the person approved: by its hash, or by answering the prompt in a terminal.
async function submit(args: Args) {
  const { configPath, setup } = await loadSetup({ ...args, store: false });
  const store = optional(args, 'store');
  if (store !== undefined && store !== 'firefox') throw new Error('submit applies only to Firefox; Chrome and Edge stop at a saved draft');
  const target = setup.targets.firefox;
  if (!target) throw new Error('Firefox is not configured; run dashbye init to add it');
  const credentials = await loadAmoCredentials();
  const deps = { reader: new AmoClient(credentials), writer: credentials ? new AmoWriter(credentials) : null };
  const plan = await planSubmission(target, setup.resources, deps);
  await writePrivateFile(statePath(configPath, 'submit-plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
  const hash = optional(args, 'approve-plan');
  if (plan.blocking.length) {
    await emit(args, plan, () => formatSubmitPlan(plan));
    throw new Error('submission is blocked');
  }
  if (hash === undefined && !interactive(args)) {
    await emit(args, plan, () => `${formatSubmitPlan(plan)}\n\nNothing was submitted. To submit, run: dashbye submit --approve-plan ${plan.approvalHash}`);
    return;
  }
  if (hash !== undefined && hash !== plan.approvalHash) throw new Error(`--approve-plan must equal ${plan.approvalHash}; the package, notes, or AMO state changed since it was shown`);
  if (hash === undefined) {
    console.log(formatSubmitPlan(plan));
    const question = `Submit Firefox ${plan.version.local} to AMO for review? This cannot be undone.`;
    if (!await askYesNo(question, { input: process.stdin, output: process.stdout }, { defaultYes: false })) {
      console.log('Cancelled. Nothing was submitted.');
      return;
    }
  }
  const result = await executeSubmission(target, setup.resources, deps, plan);
  await emit(args, result, () => describeSubmission(result));
  if (result.result !== 'submitted') throw new Error(result.result === 'validation_failed' ? 'AMO validation failed' : 'submission is incomplete');
}

async function init(args: Args) {
  if (args.prompt === true) return agentPrompt(args);
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
  doctor,
  release,
  validate,
  plan,
  'sync-draft': syncDraft,
  submit,
};

async function main() {
  applyLoopbackNoProxy();
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
    console.error(publicErrorMessage(error));
    process.stderr.write('', () => process.exit(1));
  },
);
