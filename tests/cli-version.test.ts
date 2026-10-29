import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

// The release workflow checks the tag against package.json only; VERSION in cli.ts
// is bumped by hand in the same commit, so this keeps `dashbye --version` honest.
test('dashbye --version prints the package.json version', async () => {
  const { version } = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
  const { stdout } = await promisify(execFile)(process.execPath, [fileURLToPath(new URL('../src/cli.js', import.meta.url)), '--version']);
  assert.equal(stdout.trim(), version);
});
