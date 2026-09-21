#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { renderAgentPrompt } from './agent-prompt.js';
import { applyReconciliationPlan, connectDashboard, readDashboardState } from './dashboard-v2.js';
import { sha256 } from './hash.js';
import { initialize } from './init.js';
import { createDesiredState, createReconciliationPlan, publicDashboardState, type ReconciliationPlan } from './reconcile.js';
import { compareManifest, loadLatestLock, writeReleaseLock } from './release-lock.js';
import { discoverConfig, loadWorkspace, publicWorkspaceSummary, validateWorkspace, type LoadedWorkspace, type WorkspaceOverrides } from './workspace.js';

type Args = Record<string, string | boolean>;

function parseArgs(values: string[]): { command: string; args: Args } {
  const args: Args = {};
  let command = '';
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index]!;
    if (token === '-h' || token === '--help') { args.help = true; continue; }
    if (token === '--version') { args.version = true; continue; }
    if (!token.startsWith('-') && !command) { command = token; continue; }
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
    const key = token.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith('-')) args[key] = true;
    else { args[key] = next; index += 1; }
  }
  return { command, args };
}

function optional(args: Args, key: string): string | undefined {
  const result = args[key];
  return typeof result === 'string' && result ? result : undefined;
}

function required(args: Args, key: string): string {
  const result = optional(args, key);
  if (!result) throw new Error(`--${key} is required`);
  return result;
}

function help() {
  console.log(`Dashbye
Less dashboard. More shipping.
少填表，多发布。

Version and synchronize Chrome Web Store listing assets, copy, and privacy drafts.

Usage
  dashbye [command] [options]

Commands
  init          Create or reconfigure a project configuration and resource templates
  agent-prompt  Print a copy-paste prompt for an extension repository agent
  validate      Validate artifact, listing assets, permissions, and privacy declarations
  doctor        Check configuration paths and the dedicated Chrome connection
  inspect       Read the current Dashboard draft without changing it
  plan          Compare local intent, the previous release, and the Dashboard draft
  sync-draft    Execute an approved plan, save the draft, and read it back
  -h, --help    Show this complete manual
  --version     Show the installed version

First run
  Run "dashbye init". In an interactive terminal Dashbye asks, in order, for:
    1. project path
    2. extension ZIP, build directory, or manifest path
    3. release resources path (default: ./store)
    4. Chrome Web Store item ID and default language
    5. dedicated Chrome loopback debugging endpoint (default: http://127.0.0.1:9333)
    6. confirmation and configuration output

  Initialization preserves existing copy and assets. Use --overwrite only to replace
  the project configuration. Later runs discover the nearest dashbye.config.yml.

Configuration priority
  command-line option > selected/discovered project config > built-in default

  Paths in YAML resolve from their containing config or resource directory.
  Command-line paths resolve from the current working directory.

Default resources
  store/release.yml                    listing and privacy desired state
  store/listing/                       localized detailed descriptions
  store/assets/                        icon, screenshots, and promotional images
  store/releases/<version>.lock.json   verified artifact and resource fingerprints

Options
  --config <file>          Select a project configuration
  --project <directory>    Set or override the project path
  --artifact <path>        Set or override the ZIP, build directory, or manifest
  --resources <directory>  Set or override the release resources path
  --item-id <id>           Set or override the target item
  --language <label>       Set or override the Dashboard language
  --endpoint <url>         Set or override the loopback CDP endpoint
  --output <file>          Save a generated prompt, inspect result, or plan
  --plan <file>            Approved plan to execute with sync-draft
  --approve-plan <hash>    Exact plan approval hash for non-interactive execution
  --non-interactive        Disable prompts; missing input is an error
  --overwrite              Allow init to replace the project configuration
  --json                   Emit structured output

Examples
  dashbye init
  dashbye agent-prompt --project /path/to/extension --artifact dist/release.zip
  dashbye validate
  dashbye doctor --json
  dashbye inspect --output current-draft.json
  dashbye plan --output draft-plan.json
  dashbye sync-draft --plan draft-plan.json --approve-plan <hash> --non-interactive

Browser and release boundary
  Start official Chrome with a dedicated profile and loopback remote debugging, then
  sign in manually. Dashbye never automates login or stores cookies. It may update a
  reviewed draft plan, but it never submits for review or publishes an item.
`);
}

async function agentPrompt(args: Args) {
  const values = {
    project: optional(args, 'project'), artifact: optional(args, 'artifact'), resources: optional(args, 'resources'),
    itemId: optional(args, 'item-id'), language: optional(args, 'language'), endpoint: optional(args, 'endpoint'),
  };
  const prompt = renderAgentPrompt({
    ...(values.project ? { project: values.project } : {}),
    ...(values.artifact ? { artifact: values.artifact } : {}),
    ...(values.resources ? { resources: values.resources } : {}),
    ...(values.itemId ? { itemId: values.itemId } : {}),
    ...(values.language ? { language: values.language } : {}),
    ...(values.endpoint ? { endpoint: values.endpoint } : {}),
  });
  const output = optional(args, 'output');
  if (output) await writeFile(resolve(output), `${prompt}\n`, { mode: 0o600 });
  console.log(prompt);
}

async function selectedConfig(args: Args): Promise<string> {
  const explicit = optional(args, 'config');
  if (explicit) return resolve(explicit);
  const discovered = await discoverConfig(optional(args, 'project') ?? process.cwd());
  if (!discovered) throw new Error('no dashbye.config.yml found; run dashbye init');
  return discovered;
}

function overrides(args: Args): WorkspaceOverrides {
  const values = {
    project: optional(args, 'project'), artifact: optional(args, 'artifact'), resources: optional(args, 'resources'),
    itemId: optional(args, 'item-id'), language: optional(args, 'language'), endpoint: optional(args, 'endpoint'),
  };
  return {
    ...(values.project ? { project: values.project } : {}),
    ...(values.artifact ? { artifact: values.artifact } : {}),
    ...(values.resources ? { resources: values.resources } : {}),
    ...(values.itemId ? { itemId: values.itemId } : {}),
    ...(values.language ? { language: values.language } : {}),
    ...(values.endpoint ? { endpoint: values.endpoint } : {}),
  };
}

async function outputJson(value: unknown, path?: string) {
  const json = `${JSON.stringify(value, null, 2)}\n`;
  if (path) await writeFile(resolve(path), json, { mode: 0o600 });
  console.log(json.trimEnd());
}

async function validate(args: Args) {
  const workspace = await loadWorkspace(await selectedConfig(args), overrides(args));
  const issues = validateWorkspace(workspace);
  const baseline = await loadLatestLock(workspace.config.resources, workspace.artifact.manifest.version);
  const result = {
    ...publicWorkspaceSummary(workspace, issues),
    baseline: baseline ? { version: baseline.version, manifestChanges: compareManifest(baseline.manifest, workspace.artifact.manifest) } : null,
  };
  await outputJson(result, optional(args, 'output'));
  if (issues.some(issue => issue.severity === 'error')) throw new Error('validation failed');
}

async function doctor(args: Args) {
  const workspace = await loadWorkspace(await selectedConfig(args), overrides(args));
  const issues = validateWorkspace(workspace);
  let browser: { connected: boolean; matchingEditTabs: number; error?: string };
  try {
    const connection = await chromium.connectOverCDP(workspace.config.target.endpoint, { timeout: 5_000 });
    const tabs = connection.contexts().flatMap(context => context.pages())
      .filter(page => page.url().includes(`/${workspace.config.target.itemId}/edit`));
    browser = { connected: true, matchingEditTabs: tabs.length };
  } catch (error) {
    const message = error instanceof Error ? (error.message.split('\n')[0] ?? 'connection failed') : 'connection failed';
    browser = { connected: false, matchingEditTabs: 0, error: message };
  }
  await outputJson({ config: basename(workspace.configPath), artifactVersion: workspace.artifact.manifest.version, issues, browser });
}

async function inspectOrPlan(args: Args, command: 'inspect' | 'plan') {
  const workspace = await loadWorkspace(await selectedConfig(args), overrides(args));
  const issues = validateWorkspace(workspace);
  if (issues.some(issue => issue.severity === 'error')) throw new Error('validation failed before browser access');
  const { page } = await connectDashboard(workspace.config.target.endpoint, workspace.config.target.itemId);
  const current = await readDashboardState(page, workspace);
  if (command === 'inspect') {
    await outputJson(publicDashboardState(current), optional(args, 'output'));
    return;
  }
  const desired = await createDesiredState(workspace);
  const result = createReconciliationPlan(workspace, desired, current);
  await outputJson(result, optional(args, 'output'));
}

async function syncDraft(args: Args) {
  const workspace = await loadWorkspace(await selectedConfig(args), overrides(args));
  const approved = JSON.parse(await readFile(resolve(required(args, 'plan')), 'utf8')) as ReconciliationPlan;
  const desired = await createDesiredState(workspace);
  if (optional(args, 'approve-plan') !== approved.approvalHash) throw new Error(`--approve-plan must equal ${approved.approvalHash}`);
  if (approved.itemIdHash !== sha256(workspace.config.target.itemId)
    || approved.artifactSha256 !== workspace.artifact.sha256
    || approved.releaseHash !== workspace.release.hash) {
    throw new Error('plan is stale because the target, artifact, or resources changed');
  }
  const { page } = await connectDashboard(workspace.config.target.endpoint, workspace.config.target.itemId);
  const current = await readDashboardState(page, workspace);
  const freshPlan = createReconciliationPlan(workspace, desired, current);
  if (freshPlan.approvalHash !== approved.approvalHash) throw new Error('plan is stale because the Dashboard draft changed');
  const after = await applyReconciliationPlan(page, workspace, desired, approved);
  const remaining = createReconciliationPlan(workspace, desired, after);
  if (remaining.operations.length) throw new Error('draft read-back still differs from the approved desired state');
  const lockPath = await writeReleaseLock(workspace);
  await outputJson({ result: 'saved_and_reread', snapshot: publicDashboardState(after), releaseLock: basename(lockPath) });
}

async function main() {
  const { command, args } = parseArgs(process.argv.slice(2));
  if (args.version) { console.log('0.2.0'); return; }
  if (args.help || command === 'help') { help(); return; }
  if (!command) {
    if (!await discoverConfig() && process.stdin.isTTY) {
      await initialize({ nonInteractive: false, overwrite: false });
      return;
    }
    help();
    return;
  }
  if (command === 'init') {
    const values = {
      project: optional(args, 'project'), artifact: optional(args, 'artifact'), resources: optional(args, 'resources'),
      itemId: optional(args, 'item-id'), language: optional(args, 'language'), endpoint: optional(args, 'endpoint'),
      config: optional(args, 'config'),
    };
    const result = await initialize({
      ...(values.project ? { project: values.project } : {}),
      ...(values.artifact ? { artifact: values.artifact } : {}),
      ...(values.resources ? { resources: values.resources } : {}),
      ...(values.itemId ? { itemId: values.itemId } : {}),
      ...(values.language ? { language: values.language } : {}),
      ...(values.endpoint ? { endpoint: values.endpoint } : {}),
      ...(values.config ? { config: values.config } : {}),
      nonInteractive: args['non-interactive'] === true,
      overwrite: args.overwrite === true,
    });
    await outputJson(result);
    return;
  }
  if (command === 'agent-prompt') { await agentPrompt(args); return; }
  if (command === 'validate') { await validate(args); return; }
  if (command === 'doctor') { await doctor(args); return; }
  if (command === 'inspect' || command === 'plan') { await inspectOrPlan(args, command); return; }
  if (command === 'sync-draft') { await syncDraft(args); return; }
  throw new Error(`unknown command: ${command}; run dashbye -h`);
}

main().then(
  () => process.stdout.write('', () => process.exit(0)),
  error => {
    console.error(error instanceof Error ? error.message : 'unknown error');
    process.stderr.write('', () => process.exit(1));
  },
);
