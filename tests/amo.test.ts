import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { chmod, mkdtemp, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAmoCredentials } from '../src/credentials.js';
import { AmoClient, amoJwt } from '../src/stores/firefox/amo.js';

const credentials = { issuer: 'user:123:45', secret: 'shhh' };

function decode(part: string) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

test('signs a short-lived HS256 JWT for AMO', () => {
  const token = amoJwt(credentials, 1_700_000_000_000, 'nonce');
  const [header, payload, signature] = token.split('.');
  assert.deepEqual(decode(header!), { alg: 'HS256', typ: 'JWT' });
  assert.deepEqual(decode(payload!), { iss: 'user:123:45', jti: 'nonce', iat: 1_700_000_000, exp: 1_700_000_060 });
  assert.equal(signature, createHmac('sha256', 'shhh').update(`${header}.${payload}`).digest('base64url'));
});

test('reads AMO credentials from the environment first, then a private file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dashbye-cred-'));
  const file = join(dir, 'credentials.json');
  assert.deepEqual(await loadAmoCredentials({ DASHBYE_AMO_ISSUER: 'a', DASHBYE_AMO_SECRET: 'b' }, file), { issuer: 'a', secret: 'b' });
  assert.equal(await loadAmoCredentials({}, file), null);
  await writeFile(file, JSON.stringify({ amo: { issuer: 'c', secret: 'd' } }), { mode: 0o600 });
  assert.deepEqual(await loadAmoCredentials({}, file), { issuer: 'c', secret: 'd' });
  await chmod(file, 0o644);
  await assert.rejects(loadAmoCredentials({}, file), /readable only by you/);
});

type Call = { url: string; method: string; auth: string | null };

function fakeFetch(responses: Array<[RegExp, unknown]>) {
  const calls: Call[] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, method: init?.method ?? 'GET', auth: headers.get('authorization') });
    const match = responses.find(([pattern]) => pattern.test(url));
    if (!match) return new Response('not found', { status: 404 });
    const [, body] = match;
    return body instanceof Uint8Array ? new Response(Buffer.from(body)) : Response.json(body);
  };
  return { calls, impl: impl as typeof fetch };
}

test('reads an add-on and normalizes localized fields to its default locale', async () => {
  const { impl, calls } = fakeFetch([[/\/addons\/addon\/x-toc\/$/, {
    id: 9, guid: 'x@example.com', slug: 'x-toc', default_locale: 'en-US', current_version: { version: '1.1.0' },
    summary: { 'en-US': 'Summary' }, description: { 'en-US': 'Body' },
    homepage: { url: { 'en-US': 'https://example.com' } }, support_url: { url: { 'en-US': 'https://example.com/help' } },
    support_email: { 'en-US': 'help@example.com' }, categories: ['other'],
    previews: [{ image_url: 'https://addons.mozilla.org/user-media/previews/full/1.png' }],
  }]]);
  const addon = await new AmoClient(credentials, impl).getAddon('x-toc');
  assert.deepEqual(addon, {
    id: 9, guid: 'x@example.com', slug: 'x-toc', currentVersion: '1.1.0', summary: 'Summary', description: 'Body', homepageUrl: 'https://example.com',
    supportUrl: 'https://example.com/help', supportEmail: 'help@example.com', categories: ['other'],
    previewUrls: ['https://addons.mozilla.org/user-media/previews/full/1.png'],
  });
  assert.equal(calls[0]!.method, 'GET');
  assert.match(calls[0]!.auth ?? '', /^JWT /);
});

test('reads public add-on data without credentials', async () => {
  const { impl, calls } = fakeFetch([[/\/addons\/addon\/x-toc\/$/, { id: 9, guid: 'x@example.com', slug: 'x-toc', default_locale: 'en-US', current_version: null, summary: null, description: null, homepage: null, support_url: null, support_email: null, categories: [], previews: [] }]]);
  const addon = await new AmoClient(null, impl).getAddon('x-toc');
  assert.equal(addon.currentVersion, null);
  assert.equal(calls[0]!.auth, null);
});

test('AMO getAddon errors report the operation and status without the add-on ID', async () => {
  const { impl } = fakeFetch([]);
  await assert.rejects(new AmoClient(null, impl).getAddon('synthetic@example.com'), error => {
    assert.equal((error as Error).message, 'AMO getAddon failed (404)');
    assert.doesNotMatch((error as Error).message, /synthetic|example\.com|addons\/addon/i);
    return true;
  });
});

test('uploads for validation only and polls until processed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dashbye-xpi-'));
  const xpi = join(dir, 'x.xpi');
  await writeFile(xpi, 'xpi');
  let polls = 0;
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? 'GET', auth: new Headers(init?.headers).get('authorization') });
    if (init?.method === 'POST') {
      assert.ok(init.body instanceof FormData);
      assert.equal((init.body as FormData).get('channel'), 'listed');
      return Response.json({ uuid: 'u1', processed: false });
    }
    polls += 1;
    return Response.json(polls < 2
      ? { uuid: 'u1', processed: false }
      : { uuid: 'u1', processed: true, valid: true, validation: { errors: 0, warnings: 2, notices: 1, messages: [{ type: 'warning', message: 'unsafe assignment' }] } });
  }) as typeof fetch;
  const result = await new AmoClient(credentials, impl).uploadForValidation(xpi, { sleep: async () => {} });
  assert.deepEqual(result, { uuid: 'u1', valid: true, errors: 0, warnings: 2, notices: 1, messages: ['warning: unsafe assignment'] });
  assert.deepEqual(calls.map(call => `${call.method} ${new URL(call.url).pathname}`), ['POST /api/v5/addons/upload/', 'GET /api/v5/addons/upload/u1/', 'GET /api/v5/addons/upload/u1/']);
});

test('uses supplied package bytes without reopening the path', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dashbye-xpi-bytes-'));
  const xpi = join(dir, 'x.xpi');
  await writeFile(xpi, 'old bytes');
  const bytes = new TextEncoder().encode('approved bytes');
  await unlink(xpi);
  const impl = (async (_input: string | URL | Request, init?: RequestInit) => {
    const upload = (init?.body as FormData).get('upload');
    assert.ok(upload instanceof File);
    assert.equal(upload.name, 'x.xpi');
    assert.deepEqual(new Uint8Array(await upload.arrayBuffer()), bytes);
    return Response.json({ uuid: 'u1', processed: true, valid: true });
  }) as typeof fetch;
  await new AmoClient(credentials, impl).uploadForValidation(xpi, { bytes });
});

test('uploading requires credentials', async () => {
  await assert.rejects(new AmoClient(null, fetch).uploadForValidation('/nope.xpi'), /AMO API key.*DASHBYE_AMO_ISSUER/);
});

test('fetches preview images only from Mozilla over HTTPS', async () => {
  const { impl } = fakeFetch([[/previews/, new Uint8Array([1, 2, 3])]]);
  const client = new AmoClient(null, impl);
  assert.deepEqual([...await client.fetchImage('https://addons.mozilla.org/user-media/previews/full/1.png')], [1, 2, 3]);
  await assert.rejects(client.fetchImage('https://example.com/a.png'), /not an AMO image/);
});
