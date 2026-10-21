import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTextChanges } from '../src/text-preview.js';

test('without the store text, shows the new text length and its start', () => {
  const text = formatTextChanges([{ store: 'Chrome Web Store', field: 'description', local: 'Long X/Twitter articles are easier to follow.\nRead more.', remote: undefined }]);
  assert.match(text, /Chrome Web Store · description: new text, 56 characters/);
  assert.match(text, /starts: "Long X\/Twitter articles are easier to follow\. Read more\."/);
});

test('with the store text, lists removed and added lines', () => {
  const text = formatTextChanges([{
    store: 'Firefox Add-ons', field: 'description',
    remote: 'Read\n• Suggest tags using your own API key (OpenAI, Anthropic)\nPrivacy',
    local: 'Read\n• Suggest tags using your own provider API key\nPrivacy',
  }]);
  assert.match(text, /Firefox Add-ons · description:\n    - • Suggest tags using your own API key \(OpenAI, Anthropic\)\n    \+ • Suggest tags using your own provider API key/);
  assert.doesNotMatch(text, /[-+] Read|[-+] Privacy/);
});

test('long lines and many changes are shortened', () => {
  const remote = Array.from({ length: 12 }, (_, i) => `old line ${i}`).join('\n');
  const local = Array.from({ length: 12 }, (_, i) => `new line ${i} ${'x'.repeat(200)}`).join('\n');
  const text = formatTextChanges([{ store: 'Firefox Add-ons', field: 'description', remote, local }]);
  assert.match(text, /… and 6 more removed/);
  assert.match(text, /… and 6 more added/);
  assert.ok(text.split('\n').every(line => line.length <= 110));
});

test('nothing to show for no text changes', () => {
  assert.equal(formatTextChanges([]), '');
});
