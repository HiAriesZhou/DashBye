import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAgentPrompt } from '../src/agent-prompt.js';

test('renders a product-neutral repository handoff prompt', () => {
  const prompt = renderAgentPrompt({
    project: '/workspace/example-extension',
    artifact: 'release.zip',
    resources: 'store',
    itemId: 'a'.repeat(32),
    language: 'English',
  });
  assert.match(prompt, /extension repository owns all release resources/);
  assert.match(prompt, /dashbye\/release\/v1/);
  assert.match(prompt, /actual artifact manifest/);
  assert.match(prompt, /dashbye init --agent --json/);
  assert.match(prompt, /text-based CLI protocol/);
  assert.doesNotMatch(prompt, /native menu UI/);
  assert.match(prompt, /Stop for explicit owner confirmation/);
  assert.match(prompt, /Never submit for review or publish/);
});

test('uses explicit placeholders instead of inventing target details', () => {
  const prompt = renderAgentPrompt();
  assert.match(prompt, /<extension repository path>/);
  assert.match(prompt, /<ask the owner for the Chrome Web Store item ID>/);
  assert.match(prompt, /http:\/\/127\.0\.0\.1:9333/);
});
