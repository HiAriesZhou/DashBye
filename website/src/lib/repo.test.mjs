import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

test('loads build metadata and both agent prompts without network access', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', `
    let requests = 0;
    globalThis.fetch = async () => {
      requests += 1;
      return Response.json({ stargazers_count: 1 });
    };
    const { version, agentPrompt, links } = await import('./src/lib/repo.ts');
    console.log(JSON.stringify({ version, promptLengths: Object.values(agentPrompt).map(text => text.length), github: links.github, requests }));
  `], { cwd: fileURLToPath(new URL('../../', import.meta.url)) });
  const result = JSON.parse(stdout);
  const { version } = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8'));
  assert.equal(result.version, version);
  assert.deepEqual(result.promptLengths.map(length => length > 100), [true, true]);
  assert.equal(result.github, 'https://github.com/HiAriesZhou/DashBye');
  assert.equal(result.requests, 0);
});
