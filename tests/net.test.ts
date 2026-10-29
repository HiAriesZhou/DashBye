import test from 'node:test';
import assert from 'node:assert/strict';
import { createNetFetch, loopbackNoProxy, proxyFromEnv } from '../src/net.js';

test('loopback addresses are added to NO_PROXY, keeping existing entries', () => {
  assert.equal(loopbackNoProxy({}), '127.0.0.1,localhost,::1');
  assert.equal(loopbackNoProxy({ NO_PROXY: 'corp.example' }), 'corp.example,127.0.0.1,localhost,::1');
  assert.equal(loopbackNoProxy({ no_proxy: 'localhost,corp.example' }), 'localhost,corp.example,127.0.0.1,::1');
});

test('reads an HTTP(S) proxy from the environment and ignores SOCKS', () => {
  assert.equal(proxyFromEnv({}), null);
  assert.equal(proxyFromEnv({ https_proxy: 'http://127.0.0.1:7897' }), 'http://127.0.0.1:7897');
  assert.equal(proxyFromEnv({ HTTP_PROXY: 'http://proxy.example:8080' }), 'http://proxy.example:8080');
  assert.equal(proxyFromEnv({ all_proxy: 'socks5://127.0.0.1:7897' }), null);
});

type Route = 'direct' | 'proxy';

// A string fails with undici's shape: TypeError('fetch failed') with that cause code.
function routes(fail: Partial<Record<Route, boolean | string>> = {}) {
  const calls: Route[] = [];
  const make = (route: Route) => (async () => {
    calls.push(route);
    const failure = fail[route];
    if (typeof failure === 'string') throw new TypeError('fetch failed', { cause: Object.assign(new Error(failure), { code: failure }) });
    if (failure) throw new TypeError('fetch failed');
    return new Response(route);
  }) as unknown as typeof fetch;
  return { calls, direct: make('direct'), viaProxy: (_proxy: string) => make('proxy') };
}

test('uses the proxy when one is configured', async () => {
  const r = routes();
  const net = createNetFetch({ env: { https_proxy: 'http://127.0.0.1:7897' }, direct: r.direct, viaProxy: r.viaProxy });
  assert.equal(await (await net('https://addons.mozilla.org/api/v5/x')).text(), 'proxy');
  assert.deepEqual(r.calls, ['proxy']);
});

test('falls back to a direct connection when the proxy cannot connect', async () => {
  const r = routes({ proxy: true });
  const net = createNetFetch({ env: { https_proxy: 'http://127.0.0.1:7897' }, direct: r.direct, viaProxy: r.viaProxy });
  assert.equal(await (await net('https://addons.mozilla.org/api/v5/x')).text(), 'direct');
  assert.deepEqual(r.calls, ['proxy', 'direct']);
});

// A write the proxy already forwarded may have reached the store; sending it again
// directly could, for example, create an AMO version twice.
test('a write that reached the proxy is not sent again directly', async () => {
  const r = routes({ proxy: 'UND_ERR_SOCKET' });
  const net = createNetFetch({ env: { https_proxy: 'http://127.0.0.1:7897' }, direct: r.direct, viaProxy: r.viaProxy });
  await assert.rejects(net('https://addons.mozilla.org/api/v5/addons/addon/x/versions/', { method: 'POST', body: 'x' }), /fetch failed/);
  assert.deepEqual(r.calls, ['proxy']);
});

test('a write falls back to a direct connection only when the proxy was never reached', async () => {
  for (const code of ['ECONNREFUSED', 'ENOTFOUND']) {
    const r = routes({ proxy: code });
    const net = createNetFetch({ env: { https_proxy: 'http://127.0.0.1:7897' }, direct: r.direct, viaProxy: r.viaProxy });
    assert.equal(await (await net('https://addons.mozilla.org/api/v5/addons/upload/', { method: 'POST', body: 'x' })).text(), 'direct');
    assert.deepEqual(r.calls, ['proxy', 'direct']);
  }
  const unknown = routes({ proxy: true });
  const net = createNetFetch({ env: { https_proxy: 'http://127.0.0.1:7897' }, direct: unknown.direct, viaProxy: unknown.viaProxy });
  await assert.rejects(net('https://addons.mozilla.org/api/v5/addons/addon/x/', { method: 'PATCH', body: '{}' }), /fetch failed/);
  assert.deepEqual(unknown.calls, ['proxy']);
});

test('connects directly without a proxy, and for NO_PROXY hosts', async () => {
  const none = routes();
  await createNetFetch({ env: {}, direct: none.direct, viaProxy: none.viaProxy })('https://addons.mozilla.org/');
  assert.deepEqual(none.calls, ['direct']);
  const excluded = routes();
  await createNetFetch({ env: { https_proxy: 'http://p:1', NO_PROXY: '.mozilla.org' }, direct: excluded.direct, viaProxy: excluded.viaProxy })('https://addons.mozilla.org/');
  assert.deepEqual(excluded.calls, ['direct']);
});

test('an HTTP error is an answer, not a connection failure, and is not retried', async () => {
  const calls: Route[] = [];
  const net = createNetFetch({
    env: { https_proxy: 'http://p:1' },
    direct: (async () => { calls.push('direct'); return new Response('', { status: 500 }); }) as unknown as typeof fetch,
    viaProxy: () => (async () => { calls.push('proxy'); return new Response('', { status: 401 }); }) as unknown as typeof fetch,
  });
  assert.equal((await net('https://addons.mozilla.org/')).status, 401);
  assert.deepEqual(calls, ['proxy']);
});

test('reports the original failure when both routes fail', async () => {
  const r = routes({ proxy: true, direct: true });
  const net = createNetFetch({ env: { https_proxy: 'http://p:1' }, direct: r.direct, viaProxy: r.viaProxy });
  await assert.rejects(net('https://addons.mozilla.org/'), /fetch failed/);
  assert.deepEqual(r.calls, ['proxy', 'direct']);
});
