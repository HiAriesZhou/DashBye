import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractAgentPrompt } from './readme.mjs';

const readme = [
  '# Tool',
  '',
  '## Quick start with your agent',
  '',
  'Paste this:',
  '',
  '```text',
  'Set up the tool.',
  'Ask me first.',
  '```',
  '',
  '```bash',
  'tool init',
  '```',
].join('\n');

test('returns the first text block under the heading', () => {
  assert.equal(extractAgentPrompt(readme, 'Quick start with your agent'), 'Set up the tool.\nAsk me first.');
});

test('fails when the heading or block is missing, so the site never ships an empty prompt', () => {
  assert.throws(() => extractAgentPrompt(readme, 'Missing heading'), /Missing heading/);
  assert.throws(() => extractAgentPrompt('## Quick start with your agent\n\nNo block.', 'Quick start with your agent'), /text block/);
});
