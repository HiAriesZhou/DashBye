import test from 'node:test';
import assert from 'node:assert/strict';
import { assertNoFirefoxPathOverrides, commandHelp, parseCommandLine } from '../src/args.js';

test('parses a command with string and boolean options', () => {
  const parsed = parseCommandLine(['plan', '--output', 'plan.json', '--json']);
  assert.equal(parsed.command, 'plan');
  assert.deepEqual(parsed.args, { output: 'plan.json', json: true });
  assert.equal(parsed.help, false);
});

test('accepts --key=value and options before the command', () => {
  const parsed = parseCommandLine(['--item-id=abc', 'validate', '--config=dashbye.config.yml']);
  assert.equal(parsed.command, 'validate');
  assert.deepEqual(parsed.args, { 'item-id': 'abc', config: 'dashbye.config.yml' });
});

test('rejects an option the command does not accept, with a suggestion', () => {
  assert.throws(() => parseCommandLine(['plan', '--itemid', 'abc']), /unknown option --itemid for "plan"; did you mean --item-id\?/);
  assert.throws(() => parseCommandLine(['validate', '--approve-plan', 'x']), /unknown option --approve-plan for "validate"/);
});

test('requires values for string options and rejects values for flags', () => {
  assert.throws(() => parseCommandLine(['sync-draft', '--plan']), /--plan requires a value/);
  assert.throws(() => parseCommandLine(['sync-draft', '--plan', '--json']), /--plan requires a value/);
  assert.throws(() => parseCommandLine(['plan', '--json=yes']), /--json does not take a value/);
});

test('rejects unknown commands and stray arguments', () => {
  assert.throws(() => parseCommandLine(['publish']), /unknown command: publish/);
  assert.throws(() => parseCommandLine(['plan', 'extra']), /unexpected argument: extra/);
  assert.throws(() => parseCommandLine(['plan', '-x']), /unexpected argument: -x/);
});

test('recognizes help and version anywhere', () => {
  assert.equal(parseCommandLine(['plan', '-h']).help, true);
  assert.equal(parseCommandLine(['--help']).help, true);
  assert.equal(parseCommandLine(['--version']).version, true);
  assert.equal(parseCommandLine(['help', 'plan']).command, 'plan');
  assert.equal(parseCommandLine(['help', 'plan']).help, true);
});

test('command help lists only that command\'s options', () => {
  const text = commandHelp('sync-draft');
  assert.match(text, /dashbye sync-draft/);
  assert.match(text, /--approve-plan <hash>/);
  assert.match(text, /--no-launch/);
  assert.doesNotMatch(text, /--overwrite/);
});

test('path overrides are rejected when Firefox is selected for plan, sync, or validate', () => {
  for (const command of ['plan', 'sync-draft', 'validate']) {
    for (const flag of ['artifact', 'resources']) {
      const { args } = parseCommandLine([command, `--${flag}`, 'synthetic-path']);
      assert.throws(() => assertNoFirefoxPathOverrides(['firefox'], args), /--artifact and --resources apply only to Chrome/);
      assert.doesNotThrow(() => assertNoFirefoxPathOverrides(['chrome'], args));
    }
  }
});
