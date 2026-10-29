import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../scripts/ignore-build.sh', import.meta.url));

// Vercel's ignored build step: 0 skips the build, 1 builds, anything else fails the
// deployment. Vercel clones only the last 10 commits, so the previous deployment's
// commit can be missing (0.6.2 merged 12 commits and its deployment failed).
test('ignore-build skips only when the previous deployment is present and unchanged', () => {
  const repo = mkdtempSync(join(tmpdir(), 'dashbye-ignore-'));
  try {
    const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: repo, encoding: 'utf8' }).trim();
    mkdirSync(join(repo, 'website', 'scripts'), { recursive: true });
    copyFileSync(script, join(repo, 'website', 'scripts', 'ignore-build.sh'));
    writeFileSync(join(repo, 'package.json'), '{"version":"1.0.0"}\n');
    writeFileSync(join(repo, 'cli.ts'), 'a\n');
    git('init', '-q');
    git('add', '.');
    git('commit', '-qm', 'base');
    const base = git('rev-parse', 'HEAD');
    writeFileSync(join(repo, 'cli.ts'), 'b\n');
    git('commit', '-qam', 'CLI only');
    const cliOnly = git('rev-parse', 'HEAD');
    const run = previous => spawnSync('sh', ['scripts/ignore-build.sh'], {
      cwd: join(repo, 'website'),
      env: { ...process.env, VERCEL_GIT_PREVIOUS_SHA: previous },
    }).status;

    assert.equal(run(base), 0, 'a CLI-only change skips the site build');
    assert.equal(run(''), 1, 'no previous deployment builds');
    assert.equal(run('d0ada46561c76d58a0cfeb650e50eab7351bdf32'), 1, 'a commit outside the clone builds');
    writeFileSync(join(repo, 'package.json'), '{"version":"1.0.1"}\n');
    git('commit', '-qam', 'version');
    assert.equal(run(cliOnly), 1, 'a version change rebuilds the site');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
