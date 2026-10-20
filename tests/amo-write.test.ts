import test from 'node:test';
import assert from 'node:assert/strict';
import { AmoWriter } from '../src/stores/firefox/amo-write.js';

const credentials = { issuer: 'user:123:45', secret: 'shhh' };

type Call = { method: string; path: string; search: string; auth: string | null; body: unknown };

function recordingFetch(handler: (call: Call) => unknown) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const call = { method: init?.method ?? 'GET', path: url.pathname, search: url.search, auth: new Headers(init?.headers).get('authorization'), body: init?.body };
    calls.push(call);
    const response = handler(call);
    return response instanceof Response ? response : Response.json(response);
  }) as typeof fetch;
  return { calls, impl };
}

const version = (overrides: Record<string, unknown> = {}) => ({
  id: 77, version: '1.2.0', channel: 'listed', file: { status: 'unreviewed' }, source: 'https://addons.mozilla.org/src/77.zip',
  release_notes: { 'en-US': 'Notes' }, approval_notes: 'Build: npm ci', ...overrides,
});

test('finds an existing version string among the add-on versions', async () => {
  const { impl, calls } = recordingFetch(() => ({ results: [version({ version: '1.1.0' }), version()] }));
  const writer = new AmoWriter(credentials, impl);
  assert.deepEqual(await writer.findVersion('x-toc', '1.2.0'), { id: 77, status: 'unreviewed' });
  assert.equal(await writer.findVersion('x-toc', '9.9.9'), null);
  assert.equal(calls[0]!.path, '/api/v5/addons/addon/x-toc/versions/');
  assert.equal(new URLSearchParams(calls[0]!.search).get('filter'), 'all_with_unlisted');
  assert.match(calls[0]!.auth ?? '', /^JWT /);
});

test('creates a version from an upload and a source archive in one multipart request', async () => {
  const { impl, calls } = recordingFetch(() => version());
  const created = await new AmoWriter(credentials, impl).createVersion('x-toc', 'u1', { name: 'x-source.zip', bytes: new Uint8Array([1, 2]) });
  assert.deepEqual(created, { id: 77, version: '1.2.0' });
  assert.equal(calls[0]!.method, 'POST');
  assert.equal(calls[0]!.path, '/api/v5/addons/addon/x-toc/versions/');
  const form = calls[0]!.body as FormData;
  assert.equal(form.get('upload'), 'u1');
  const source = form.get('source');
  assert.ok(source instanceof File);
  assert.equal(source.name, 'x-source.zip');
  assert.deepEqual([...new Uint8Array(await source.arrayBuffer())], [1, 2]);
});

test('creates a version without a source archive when none is configured', async () => {
  const { impl, calls } = recordingFetch(() => version({ source: null }));
  await new AmoWriter(credentials, impl).createVersion('x-toc', 'u1', null);
  assert.equal((calls[0]!.body as FormData).has('source'), false);
});

test('sets release and reviewer notes with one JSON request', async () => {
  const { impl, calls } = recordingFetch(() => version());
  await new AmoWriter(credentials, impl).setVersionNotes('x-toc', 77, { locale: 'en-US', releaseNotes: 'Notes', reviewerNotes: 'Build: npm ci' });
  assert.equal(calls[0]!.method, 'PATCH');
  assert.equal(calls[0]!.path, '/api/v5/addons/addon/x-toc/versions/77/');
  assert.deepEqual(JSON.parse(String(calls[0]!.body)), { release_notes: { 'en-US': 'Notes' }, approval_notes: 'Build: npm ci' });
});

test('reads a version back with its status, source, and note texts', async () => {
  const { impl } = recordingFetch(() => version());
  assert.deepEqual(await new AmoWriter(credentials, impl).getVersion('x-toc', 77, 'en-US'), {
    id: 77, version: '1.2.0', status: 'unreviewed', hasSource: true, releaseNotes: 'Notes', reviewerNotes: 'Build: npm ci',
  });
});

test('updates listing fields in the default locale', async () => {
  const { impl, calls } = recordingFetch(() => ({}));
  await new AmoWriter(credentials, impl).updateListing('x-toc', 'en-US', { summary: 'S', description: 'D', homepageUrl: 'https://example.com', supportEmail: null, categories: ['other'] });
  assert.equal(calls[0]!.method, 'PATCH');
  assert.equal(calls[0]!.path, '/api/v5/addons/addon/x-toc/');
  assert.deepEqual(JSON.parse(String(calls[0]!.body)), {
    summary: { 'en-US': 'S' }, description: { 'en-US': 'D' }, homepage: { 'en-US': 'https://example.com' }, support_email: { 'en-US': null }, categories: ['other'],
  });
});

test('sends only the listing fields it is given', async () => {
  const { impl, calls } = recordingFetch(() => ({}));
  await new AmoWriter(credentials, impl).updateListing('x-toc', 'en-US', { description: 'D' });
  assert.deepEqual(JSON.parse(String(calls[0]!.body)), { description: { 'en-US': 'D' } });
});

test('write errors name the operation and status, never the add-on or the response', async () => {
  const { impl } = recordingFetch(() => new Response('{"detail":"synthetic@example.com secret"}', { status: 400 }));
  await assert.rejects(new AmoWriter(credentials, impl).createVersion('synthetic@example.com', 'u1', null), error => {
    assert.equal((error as Error).message, 'AMO createVersion failed (400)');
    return true;
  });
});

test('every write requires credentials', () => {
  assert.throws(() => new AmoWriter(null as never, fetch), /AMO API key/);
});
