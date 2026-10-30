import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import YAML from 'yaml';

type Step = { run?: string };
const workflow = YAML.parse(readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8')) as { jobs: { publish: { steps: Step[] } } };

for (const merged of [true, false]) {
  test(`release workflow ${merged ? 'publishes a main commit' : 'refuses an unmerged commit with a matching tag version'}`, { skip: process.platform === 'win32' }, () => {
    const root = mkdtempSync(join(tmpdir(), 'dashbye-release-gate-'));
    try {
      const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', ...args], { cwd: root, encoding: 'utf8' }).trim();
      git('init', '-q', '-b', 'main');
      writeFileSync(join(root, 'package.json'), '{"version":"1.2.3"}\n');
      git('add', 'package.json');
      git('commit', '-qm', 'main fixture');
      git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD'));
      if (!merged) {
        writeFileSync(join(root, 'feature.txt'), 'unmerged fixture\n');
        git('add', 'feature.txt');
        git('commit', '-qm', 'unmerged fixture');
      }
      const bin = join(root, 'bin');
      mkdirSync(bin);
      writeFileSync(join(bin, 'npm'), '#!/bin/sh\nif [ "$1" = "publish" ]; then printf published > published; fi\n');
      chmodSync(join(bin, 'npm'), 0o755);
      let status: number | null = 0;
      for (const step of workflow.jobs.publish.steps) {
        if (!step.run) continue;
        const child = spawnSync('sh', ['-ec', step.run], { cwd: root, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TAG: 'v1.2.3' } });
        status = child.status;
        if (status !== 0) break;
      }
      const published = (() => { try { return readFileSync(join(root, 'published'), 'utf8') === 'published'; } catch { return false; } })();
      assert.equal(published, merged);
      assert.equal(status === 0, merged);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
