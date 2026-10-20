import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEdgeCredentials } from '../src/credentials.js';
import { EdgeClient } from '../src/stores/edge/api.js';

const credentials = { clientId: '00000000-0000-4000-8000-000000000001', apiKey: 'synthetic-key' };
const product = '11111111-1111-4111-8111-111111111111';

test('reads Edge credentials from the environment first, then the private file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dashbye-edge-cred-'));
  const file = join(dir, 'credentials.json');
  assert.deepEqual(await loadEdgeCredentials({ DASHBYE_EDGE_CLIENT_ID: 'c', DASHBYE_EDGE_API_KEY: 'k' }, file), { clientId: 'c', apiKey: 'k' });
  assert.equal(await loadEdgeCredentials({}, file), null);
  await writeFile(file, JSON.stringify({ amo: { issuer: 'a', secret: 'b' }, edge: { clientId: 'c2', apiKey: 'k2' } }), { mode: 0o600 });
  assert.deepEqual(await loadEdgeCredentials({}, file), { clientId: 'c2', apiKey: 'k2' });
  await chmod(file, 0o644);
  await assert.rejects(loadEdgeCredentials({}, file), /readable only by you/);
});

type Call = { method: string; path: string; headers: Headers; body: unknown };

function edgeFetch(statuses: string[], upload: Response = new Response(null, { status: 202, headers: { Location: 'op-1' } })) {
  const calls: Call[] = [];
  let polls = 0;
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ method: init?.method ?? 'GET', path: url.pathname, headers: new Headers(init?.headers), body: init?.body });
    if (init?.method === 'POST') return upload;
    const status = statuses[Math.min(polls, statuses.length - 1)]!;
    polls += 1;
    return Response.json({ id: 'op-1', status, message: status === 'Failed' ? 'synthetic failure for x@example.com' : null, errorCode: status === 'Failed' ? 'InvalidPackage' : null });
  }) as typeof fetch;
  return { calls, impl };
}

test('uploads the package to the draft submission and polls the operation until it succeeds', async () => {
  const { calls, impl } = edgeFetch(['InProgress', 'Succeeded']);
  const result = await new EdgeClient(credentials, impl).uploadDraftPackage(product, new Uint8Array([1, 2, 3]), { sleep: async () => {} });
  assert.deepEqual(result, { status: 'Succeeded', errorCode: null });
  assert.deepEqual(calls.map(call => `${call.method} ${call.path}`), [
    `POST /v1/products/${product}/submissions/draft/package`,
    `GET /v1/products/${product}/submissions/draft/package/operations/op-1`,
    `GET /v1/products/${product}/submissions/draft/package/operations/op-1`,
  ]);
  assert.equal(calls[0]!.headers.get('authorization'), 'ApiKey synthetic-key');
  assert.equal(calls[0]!.headers.get('x-clientid'), credentials.clientId);
  assert.equal(calls[0]!.headers.get('content-type'), 'application/zip');
  assert.deepEqual([...new Uint8Array(calls[0]!.body as Uint8Array)], [1, 2, 3]);
});

test('reports a failed package operation by code, without the store message', async () => {
  const { impl } = edgeFetch(['Failed']);
  const result = await new EdgeClient(credentials, impl).uploadDraftPackage(product, new Uint8Array([1]), { sleep: async () => {} });
  assert.deepEqual(result, { status: 'Failed', errorCode: 'InvalidPackage' });
});

test('stops polling after a bounded wait', async () => {
  const { impl } = edgeFetch(['InProgress']);
  await assert.rejects(new EdgeClient(credentials, impl).uploadDraftPackage(product, new Uint8Array([1]), { sleep: async () => {}, polls: 3 }), /did not finish processing the package in time/);
});

test('upload errors name the operation and status, never the product', async () => {
  const { impl } = edgeFetch([], new Response('denied for 11111111', { status: 401 }));
  await assert.rejects(new EdgeClient(credentials, impl).uploadDraftPackage(product, new Uint8Array([1])), error => {
    assert.equal((error as Error).message, 'Edge uploadPackage failed (401)');
    return true;
  });
});

test('refuses an upload response without an operation location', async () => {
  const { impl } = edgeFetch([], new Response(null, { status: 202 }));
  await assert.rejects(new EdgeClient(credentials, impl).uploadDraftPackage(product, new Uint8Array([1])), /did not return an operation/);
});
