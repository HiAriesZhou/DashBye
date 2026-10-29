import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLatestLock } from '../src/release-lock.js';

async function resourcesWithLocks(versions: string[]): Promise<string> {
  const resources = await mkdtemp(join(tmpdir(), 'dashbye-lock-'));
  await mkdir(join(resources, 'releases'));
  for (const version of versions) {
    await writeFile(join(resources, 'releases', `${version}.lock.json`), JSON.stringify({ schema: 'dashbye/lock/v1', version }));
  }
  return resources;
}

// File names sort as text, where 1.10.0 comes before 1.9.0.
test('the baseline is the newest release before the current version, by version order', async () => {
  const resources = await resourcesWithLocks(['1.9.0', '1.10.0', '1.2.0']);
  try {
    assert.equal((await loadLatestLock(resources, '1.11.0'))?.version, '1.10.0');
    assert.equal((await loadLatestLock(resources, '1.10.0'))?.version, '1.9.0');
  } finally {
    await rm(resources, { recursive: true, force: true });
  }
});

test('locks of the current or a newer version are not a baseline', async () => {
  const resources = await resourcesWithLocks(['1.1.0', '2.0.0']);
  try {
    assert.equal((await loadLatestLock(resources, '1.5.0'))?.version, '1.1.0');
    assert.equal(await loadLatestLock(resources, '1.0.0'), null);
  } finally {
    await rm(resources, { recursive: true, force: true });
  }
});
