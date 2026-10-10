import type { StoreId } from './stores/types.js';

export type Args = Record<string, string | boolean>;

export function assertNoFirefoxPathOverrides(stores: StoreId[], args: Args): void {
  if (stores.includes('firefox') && (args.artifact !== undefined || args.resources !== undefined)) {
    throw new Error('--artifact and --resources apply only to Chrome; for Firefox change targets.firefox.artifact / resources in dashbye.config.yml');
  }
}

export type ParsedCommandLine = { command: string; args: Args; help: boolean; version: boolean };

type OptionSpec = { value?: string; description: string };

const OPTIONS: Record<string, OptionSpec> = {
  config: { value: 'file', description: 'Select a project configuration' },
  project: { value: 'directory', description: 'Set or override the project path' },
  artifact: { value: 'path', description: 'Set or override the ZIP, build directory, or manifest' },
  resources: { value: 'directory', description: 'Set or override the release resources path' },
  'item-id': { value: 'id', description: 'Set or override the target item' },
  language: { value: 'label', description: 'Set or override the Dashboard language' },
  endpoint: { value: 'url', description: 'Set or override the loopback CDP endpoint' },
  output: { value: 'file', description: 'Also save the result to this file' },
  plan: { value: 'file', description: 'Plan to execute (default: the latest saved plan)' },
  'approve-plan': { value: 'hash', description: 'Approve the plan without a prompt; must equal its approvalHash' },
  'non-interactive': { description: 'Never prompt; missing input or approval is an error' },
  'no-launch': { description: 'Do not open the dedicated Chrome automatically' },
  agent: { description: 'Return the next init question or a ready preview as JSON' },
  overwrite: { description: 'Allow init to replace the project configuration' },
  json: { description: 'Emit JSON instead of a readable summary' },
  stores: { value: 'list', description: 'Stores to manage, e.g. chrome,edge,firefox' },
  store: { value: 'list', description: 'Limit to these configured stores, e.g. chrome,edge' },
  'edge-artifact': { value: 'path', description: 'Edge package (ZIP or build directory)' },
  'edge-product-id': { value: 'guid', description: 'Edge Partner Center product ID' },
  'edge-language': { value: 'label', description: 'Edge store listing language' },
  'firefox-artifact': { value: 'path', description: 'Firefox package (XPI, ZIP, or build directory)' },
  'firefox-addon': { value: 'id', description: 'Firefox add-on slug, numeric ID, or add-on ID' },
};

const WORKSPACE = ['config', 'project', 'artifact', 'resources', 'item-id', 'language', 'endpoint'];

type CommandSpec = { summary: string; options: string[] };

export const COMMANDS: Record<string, CommandSpec> = {
  init: { summary: 'Choose stores and create or change the project configuration', options: [...WORKSPACE, 'stores', 'edge-artifact', 'edge-product-id', 'edge-language', 'firefox-artifact', 'firefox-addon', 'agent', 'json', 'overwrite', 'non-interactive'] },
  'agent-prompt': { summary: 'Print a copy-paste prompt for an extension repository agent', options: ['project', 'artifact', 'resources', 'item-id', 'language', 'endpoint', 'output'] },
  validate: { summary: 'Validate each configured store package, listing assets, and privacy declarations', options: [...WORKSPACE, 'store', 'output', 'json'] },
  doctor: { summary: 'Check configuration paths and the dedicated Chrome connection', options: [...WORKSPACE, 'json'] },
  chrome: { summary: 'Open the dedicated Chrome profile for Dashboard sign-in', options: [...WORKSPACE, 'json'] },
  inspect: { summary: 'Read the current Dashboard draft without changing it', options: [...WORKSPACE, 'output', 'json', 'no-launch', 'non-interactive'] },
  plan: { summary: 'Compare local intent with each configured store draft and save the plan', options: [...WORKSPACE, 'store', 'output', 'json', 'no-launch', 'non-interactive'] },
  'sync-draft': { summary: 'Confirm and execute the plan, save each store draft, and read it back', options: [...WORKSPACE, 'store', 'plan', 'approve-plan', 'non-interactive', 'json', 'no-launch'] },
};

function distance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = row[0]!;
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = row[j]!;
      row[j] = Math.min(above + 1, row[j - 1]! + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[right.length]!;
}

function suggestion(name: string, allowed: string[]): string {
  const [best] = allowed
    .map(candidate => ({ candidate, score: distance(name, candidate) }))
    .sort((left, right) => left.score - right.score);
  return best && best.score <= 2 ? `; did you mean --${best.candidate}?` : '';
}

function readOptions(values: string[]): { positionals: string[]; args: Args; help: boolean; version: boolean } {
  const positionals: string[] = [];
  const args: Args = {};
  let help = false;
  let version = false;
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index]!;
    if (token === '-h' || token === '--help') { help = true; continue; }
    if (token === '--version') { version = true; continue; }
    if (!token.startsWith('-')) { positionals.push(token); continue; }
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
    const [name, inline] = token.slice(2).split(/=(.*)/s, 2) as [string, string | undefined];
    const spec = OPTIONS[name];
    if (!spec) { args[name] = inline ?? true; continue; }
    if (!spec.value) {
      if (inline !== undefined) throw new Error(`--${name} does not take a value`);
      args[name] = true;
      continue;
    }
    const next = inline ?? values[index + 1];
    if (next === undefined || next === '' || (inline === undefined && next.startsWith('-'))) throw new Error(`--${name} requires a value`);
    args[name] = next;
    if (inline === undefined) index += 1;
  }
  return { positionals, args, help, version };
}

export function parseCommandLine(values: string[]): ParsedCommandLine {
  const { positionals, args, help, version } = readOptions(values);
  let command = positionals.shift() ?? '';
  let wantsHelp = help;
  if (command === 'help') {
    command = positionals.shift() ?? '';
    wantsHelp = true;
  }
  if (command && !COMMANDS[command]) throw new Error(`unknown command: ${command}; run dashbye -h`);
  const allowed = command ? COMMANDS[command]!.options : [];
  for (const name of Object.keys(args)) {
    if (!allowed.includes(name)) {
      throw new Error(`unknown option --${name}${command ? ` for "${command}"` : ''}${suggestion(name, allowed.length ? allowed : Object.keys(OPTIONS))}`);
    }
  }
  if (positionals.length) throw new Error(`unexpected argument: ${positionals[0]}`);
  return { command, args, help: wantsHelp, version };
}

export function commandHelp(command: string): string {
  const spec = COMMANDS[command];
  if (!spec) throw new Error(`unknown command: ${command}`);
  const lines = spec.options.map(name => {
    const option = OPTIONS[name]!;
    const flag = `--${name}${option.value ? ` <${option.value}>` : ''}`;
    return `  ${flag.padEnd(26)} ${option.description}`;
  });
  return [`Usage: dashbye ${command} [options]`, '', spec.summary, '', 'Options', ...lines, '  -h, --help                 Show this help'].join('\n');
}

export function optional(args: Args, key: string): string | undefined {
  const result = args[key];
  return typeof result === 'string' && result ? result : undefined;
}

export function required(args: Args, key: string): string {
  const result = optional(args, key);
  if (!result) throw new Error(`--${key} is required`);
  return result;
}
