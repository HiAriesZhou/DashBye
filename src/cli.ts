#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { renderAgentPrompt } from './agent-prompt.js';
import { commandHelp, optional, parseCommandLine, type Args } from './args.js';
import { ensureChrome } from './chrome.js';
import { applyReconciliationPlan, isDashboardUrl, isExactItemEditUrl, readDashboardState } from './dashboard-v2.js';
import { formatDoctor, formatPlan, formatSyncResult, formatValidation } from './format.js';
import { sha256 } from './hash.js';
import { manual } from './help.js';
import { guideInitialization, initialize } from './init.js';
import { itemStateDir, writePrivateFile } from './paths.js';
import { settleReadBack } from './read-back.js';
import { createDesiredState, createReconciliationPlan, publicDashboardState, type ReconciliationPlan } from './reconcile.js';
import { compareManifest, loadLatestLock, writeReleaseLock } from './release-lock.js';
import { normalizeLoopbackEndpoint } from './security.js';
import { askYesNo, openDashboard } from './session.js';
import { discoverConfig, loadProjectConfig, loadWorkspace, publicWorkspaceSummary, validateWorkspace, type LoadedWorkspace, type WorkspaceOverrides } from './workspace.js';

const VERSION = '0.3.0';
const DEFAULT_ENDPOINT = 'http://127.0.0.1:9333';
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
  const workspace = await loadSelected(args);
  const issues = validateWorkspace(workspace);
  const baseline = await loadLatestLock(workspace.config.resources, workspace.artifact.manifest.version);
  const result = {
    ...publicWorkspaceSummary(workspace, issues),
    baseline: baseline ? { version: baseline.version, manifestChanges: compareManifest(baseline.manifest, workspace.artifact.manifest) } : null,
  };
  await emit(args, result, () => formatValidation(result));
  if (issues.some(issue => issue.severity === 'error')) throw new Error('validation failed');
}

async function doctor(args: Args) {
  const workspace = await loadSelected(args);
  const issues = validateWorkspace(workspace);
  let browser: { connected: boolean; matchingEditTabs: number; dashboardTabs: number; error?: string };
  try {
    const connection = await chromium.connectOverCDP(workspace.config.target.endpoint, { timeout: 5_000 });
    const pages = connection.contexts().flatMap(context => context.pages());
    const tabs = pages.filter(page => isExactItemEditUrl(page.url(), workspace.config.target.itemId));
    browser = { connected: true, matchingEditTabs: tabs.length, dashboardTabs: pages.filter(page => isDashboardUrl(page.url())).length };
  } catch (error) {
    const message = error instanceof Error ? (error.message.split('\n')[0] ?? 'connection failed') : 'connection failed';
    browser = { connected: false, matchingEditTabs: 0, dashboardTabs: 0, error: message };
  }
  const result = { config: basename(workspace.configPath), artifactVersion: workspace.artifact.manifest.version, issues, browser };
  await emit(args, result, () => formatDoctor(result));
}

// Only the endpoint is needed, so a missing build or incomplete resources must not
// prevent opening Chrome for sign-in.
async function chromeEndpoint(args: Args): Promise<string> {
  const explicit = optional(args, 'endpoint');
  if (explicit) return normalizeLoopbackEndpoint(explicit);
  const config = optional(args, 'config') ? resolve(optional(args, 'config')!) : await discoverConfig(optional(args, 'project') ?? process.cwd());
  return config ? (await loadProjectConfig(config)).target.endpoint : DEFAULT_ENDPOINT;
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

const statePath = (workspace: LoadedWorkspace, file: string) => join(itemStateDir(workspace.config.target.itemId), file);

async function inspectOrPlan(args: Args, command: 'inspect' | 'plan') {
  const workspace = await loadSelected(args);
  const issues = validateWorkspace(workspace);
  if (issues.some(issue => issue.severity === 'error')) throw new Error('validation failed before browser access; run dashbye validate');
  const page = await dashboardPage(args, workspace);
  const current = await readDashboardState(page, workspace);
  if (command === 'inspect') {
    const result = publicDashboardState(current);
    const saved = statePath(workspace, 'inspect.json');
    await writePrivateFile(saved, `${JSON.stringify(result, null, 2)}\n`);
    await emit(args, result, () => `${JSON.stringify(result, null, 2)}\nSaved: ${saved}`);
    return;
  }
  const plan = createReconciliationPlan(workspace, await createDesiredState(workspace), current);
  const saved = statePath(workspace, 'plan.json');
  await writePrivateFile(saved, `${JSON.stringify(plan, null, 2)}\n`);
  await emit(args, plan, () => [
    formatPlan(plan, workspace.config.target),
    '',
    `Plan saved: ${saved}`,
    plan.operations.length ? 'Next: dashbye sync-draft' : 'Next: dashbye sync-draft to verify the draft and record the release lock',
  ].join('\n'));
}

async function loadPlan(args: Args, workspace: LoadedWorkspace): Promise<ReconciliationPlan> {
  const path = optional(args, 'plan') ? resolve(optional(args, 'plan')!) : statePath(workspace, 'plan.json');
  try {
    return JSON.parse(await readFile(path, 'utf8')) as ReconciliationPlan;
  } catch {
    throw new Error(optional(args, 'plan') ? `cannot read plan: ${path}` : 'no saved plan for this item; run dashbye plan first');
  }
}

// Decided before Chrome is opened, so a wrong hash or a non-terminal run fails fast.
function approvalMode(args: Args, plan: ReconciliationPlan): 'hash' | 'prompt' {
  const hash = optional(args, 'approve-plan');
  if (hash !== undefined) {
    if (hash !== plan.approvalHash) throw new Error(`--approve-plan must equal ${plan.approvalHash}`);
    return 'hash';
  }
  if (!interactive(args)) throw new Error('--approve-plan <approvalHash> is required outside an interactive terminal');
  return 'prompt';
}

function confirm(plan: ReconciliationPlan, workspace: LoadedWorkspace): Promise<boolean> {
  console.log(formatPlan(plan, workspace.config.target));
  const question = plan.operations.length
    ? 'Save these changes to the Dashboard draft?'
    : 'Verify the draft and record the release lock?';
  return askYesNo(question, { input: process.stdin, output: process.stdout });
}

async function syncDraft(args: Args) {
  const workspace = await loadSelected(args);
  const approved = await loadPlan(args, workspace);
  const desired = await createDesiredState(workspace);
  if (approved.itemIdHash !== sha256(workspace.config.target.itemId)
    || approved.artifactSha256 !== workspace.artifact.sha256
    || approved.releaseHash !== workspace.release.hash) {
    throw new Error('plan is stale because the target, artifact, or resources changed; run dashbye plan again');
  }
  const mode = approvalMode(args, approved);
  const page = await dashboardPage(args, workspace);
  const current = await readDashboardState(page, workspace);
  if (createReconciliationPlan(workspace, desired, current).approvalHash !== approved.approvalHash) {
    throw new Error('plan is stale because the Dashboard draft changed; run dashbye plan again');
  }
  // Ask only after the plan is confirmed against the current draft, so the person
  // approves exactly what will be written.
  if (mode === 'prompt' && !await confirm(approved, workspace)) {
    console.log('Cancelled. Nothing was written to the Dashboard.');
    return;
  }
  const applied = await applyReconciliationPlan(page, workspace, desired, approved);
  const { state: after, remaining } = await settleReadBack(
    applied,
    () => readDashboardState(page, workspace),
    state => createReconciliationPlan(workspace, desired, state).operations.length,
    { attempts: READ_BACK_ATTEMPTS, delayMs: READ_BACK_DELAY_MS },
  );
  if (remaining) throw new Error('draft read-back still differs from the approved desired state');
  const lockPath = await writeReleaseLock(workspace);
  const result = { result: 'saved_and_reread', snapshot: publicDashboardState(after), releaseLock: basename(lockPath) };
  await emit(args, result, () => formatSyncResult(result));
}

async function init(args: Args) {
  const options = { ...workspaceValues(args), ...(optional(args, 'config') ? { config: optional(args, 'config')! } : {}), overwrite: args.overwrite === true };
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
  inspect: args => inspectOrPlan(args, 'inspect'),
  plan: args => inspectOrPlan(args, 'plan'),
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
