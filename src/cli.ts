#!/usr/bin/env node
import { loadConfig, publicConfigSummary } from './config.js';
import { applyDraft, connect, publicSnapshot, snapshot } from './dashboard.js';
import { createPlan, publicPlan } from './plan.js';
import { assertItemId, normalizeLoopbackEndpoint } from './security.js';

type Args = Record<string, string | boolean>;

function parseArgs(values: string[]): { command: string; args: Args } {
  const command = values[0] ?? '';
  const args: Args = {};
  for (let index = 1; index < values.length; index += 1) {
    const token = values[index]!;
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
    const key = token.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith('--')) args[key] = true;
    else { args[key] = next; index += 1; }
  }
  return { command, args };
}

function value(args: Args, key: string): string {
  const result = args[key];
  if (typeof result !== 'string' || !result) throw new Error(`--${key} is required`);
  return result;
}

function help() {
  console.log(`Dashbye
Less dashboard. More shipping.
少填表，多发布。

Commands:
  validate    --config <store.yml>
  inspect     --endpoint <loopback-url> --item-id <id> --language <label>
  plan        --config <store.yml> --endpoint <loopback-url> --item-id <id>
  sync-draft  --config <store.yml> --endpoint <loopback-url> --item-id <id>
              --confirm-item-id <same-id> [--confirm-existing-prefix]
`);
}

async function main() {
  const { command, args } = parseArgs(process.argv.slice(2));
  if (!command || command === 'help' || args.help) { help(); return; }
  if (command === 'validate') {
    console.log(JSON.stringify(publicConfigSummary(await loadConfig(value(args, 'config'))), null, 2));
    return;
  }
  const itemId = assertItemId(value(args, 'item-id'));
  const endpoint = normalizeLoopbackEndpoint(value(args, 'endpoint'));
  const config = command === 'inspect' ? null : await loadConfig(value(args, 'config'));
  const language = config?.language ?? value(args, 'language');
  const { page } = await connect(endpoint, itemId, language);
  const current = await snapshot(page, itemId, language);
  if (command === 'inspect') { console.log(JSON.stringify(publicSnapshot(current), null, 2)); return; }
  const plan = createPlan(config!, current);
  console.log(JSON.stringify(publicPlan(plan), null, 2));
  if (command === 'plan') return;
  if (command !== 'sync-draft') throw new Error(`unknown command: ${command}`);
  if (value(args, 'confirm-item-id') !== itemId) throw new Error('item confirmation does not match');
  if (plan.requiresExistingPrefixConfirmation && args['confirm-existing-prefix'] !== true) {
    throw new Error('partly populated screenshot section requires --confirm-existing-prefix');
  }
  const after = await applyDraft(page, config!, current, plan);
  console.log(JSON.stringify({ result: 'saved_and_reread', snapshot: publicSnapshot(after) }, null, 2));
}

main().then(
  () => process.stdout.write('', () => process.exit(0)),
  error => {
    console.error(error instanceof Error ? error.message : 'unknown error');
    process.stderr.write('', () => process.exit(1));
  },
);
