import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';
import sharp from 'sharp';
import YAML from 'yaml';
import { UNLOCKED } from '../src/edit-lock.js';
import { combinePlans } from '../src/multi-plan.js';
import { createDesiredState, createReconciliationPlan } from '../src/reconcile.js';
import { loadWorkspace } from '../src/workspace.js';

const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));

// A Chrome project whose manifest version the Dashboard reader cannot read back.
async function project(version: string): Promise<{ root: string; configPath: string }> {
  const root = await mkdtemp(join(tmpdir(), 'dashbye-sync-'));
  const files: Record<string, string | Uint8Array> = {
    'dist/x.zip': zipSync({ 'manifest.json': strToU8(JSON.stringify({ manifest_version: 3, name: 'X', version, description: 'X' })) }),
    'store/listing/en.txt': 'Description\n',
    'store/assets/icon.png': await sharp({ create: { width: 128, height: 128, channels: 3, background: '#336699' } }).png().toBuffer(),
    'store/release.yml': YAML.stringify({
      schema: 'dashbye/release/v1',
      listing: {
        defaultLanguage: 'English', category: 'Tools', matureContent: false,
        locales: { English: { description: 'listing/en.txt', screenshots: [] } },
        assets: { icon: 'assets/icon.png' },
      },
      privacy: {
        singlePurpose: 'Purpose', permissionJustifications: {}, hostPermissionJustification: null,
        remoteCode: { uses: false, justification: null }, collectedData: [],
        certifications: { noSaleOrTransfer: true, relatedToSinglePurpose: true, noCreditworthinessUse: true },
        policyUrl: 'https://example.com/privacy',
      },
    }),
    // Nothing listens on port 9; with --no-launch, reaching the browser step fails.
    'dashbye.config.yml': YAML.stringify({
      schema: 'dashbye/config/v2', browser: { endpoint: 'http://127.0.0.1:9' },
      targets: { chrome: { artifact: 'dist/x.zip', itemId: 'a'.repeat(32), language: 'English' } },
    }),
  };
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return { root, configPath: join(root, 'dashbye.config.yml') };
}

// A plan saved before the version check existed is still a valid, approved plan.
async function savedPlan(root: string, configPath: string): Promise<{ path: string; hash: string }> {
  const workspace = await loadWorkspace(configPath);
  const desired = await createDesiredState(workspace);
  const current = { itemId: desired.itemId, packageVersion: null, listing: desired.listing, privacy: desired.privacy, editLock: UNLOCKED };
  const plan = combinePlans({ chrome: createReconciliationPlan(workspace, desired, current) }, []);
  const path = join(root, 'plan.json');
  await writeFile(path, JSON.stringify(plan));
  return { path, hash: plan.approvalHash };
}

test('sync-draft refuses an unreadable Chrome version before opening the browser', async () => {
  const { root, configPath } = await project('1.0');
  try {
    const plan = await savedPlan(root, configPath);
    const args = [cli, 'sync-draft', '--config', configPath, '--plan', plan.path, '--approve-plan', plan.hash, '--no-launch', '--json'];
    const failure = await new Promise<{ code: number | null; stderr: string }>(resolve => {
      execFile(process.execPath, args, (error, _stdout, stderr) => resolve({ code: error ? (error as { code?: number }).code ?? 1 : 0, stderr }));
    });
    assert.equal(failure.code, 1);
    assert.match(failure.stderr, /validation failed before browser access/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
