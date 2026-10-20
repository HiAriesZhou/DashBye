import { fetch as undiciFetch, ProxyAgent } from 'undici';

type Env = Record<string, string | undefined>;

const LOOPBACK = ['127.0.0.1', 'localhost', '::1'];

// The dedicated Chrome listens on loopback. A proxy cannot reach it, and Playwright
// honours HTTP(S)_PROXY, so loopback is always added to NO_PROXY.
export function loopbackNoProxy(env: Env): string {
  const existing = (env.NO_PROXY ?? env.no_proxy ?? '').split(',').map(entry => entry.trim()).filter(Boolean);
  return [...existing, ...LOOPBACK.filter(host => !existing.includes(host))].join(',');
}

export function applyLoopbackNoProxy(env: Env = process.env): void {
  const value = loopbackNoProxy(env);
  env.NO_PROXY = value;
  env.no_proxy = value;
}

// Only HTTP(S) proxies are used; a SOCKS-only setup connects directly.
export function proxyFromEnv(env: Env): string | null {
  const value = env.https_proxy || env.HTTPS_PROXY || env.http_proxy || env.HTTP_PROXY;
  return value && /^https?:\/\//i.test(value) ? value : null;
}

function bypassed(url: string, env: Env): boolean {
  const host = new URL(url).hostname;
  return (env.NO_PROXY ?? env.no_proxy ?? '').split(',').map(entry => entry.trim().toLowerCase()).filter(Boolean)
    .some(entry => entry === '*' || host === entry.replace(/^\./, '') || host.endsWith(entry.startsWith('.') ? entry : `.${entry}`));
}

const viaUndiciProxy = (proxy: string): typeof fetch => {
  const dispatcher = new ProxyAgent(proxy);
  return ((input: string | URL | Request, init?: RequestInit) => undiciFetch(input as never, { ...init, dispatcher } as never)) as unknown as typeof fetch;
};

// Store APIs: use a configured proxy, fall back to a direct connection when the proxy
// cannot connect, and connect directly when no proxy is set. Only connection failures
// are retried; any HTTP response is returned as is.
export function createNetFetch(options: { env?: Env; direct?: typeof fetch; viaProxy?: (proxy: string) => typeof fetch } = {}): typeof fetch {
  const env = options.env ?? process.env;
  const direct = options.direct ?? fetch;
  const proxy = proxyFromEnv(env);
  const proxied = proxy ? (options.viaProxy ?? viaUndiciProxy)(proxy) : null;
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!proxied || bypassed(url, env)) return direct(input, init);
    try {
      return await proxied(input, init);
    } catch (error) {
      try {
        return await direct(input, init);
      } catch {
        throw error;
      }
    }
  }) as typeof fetch;
}

let shared: typeof fetch | null = null;

// Default transport for store APIs, created on first use from the process environment.
export const storeFetch = ((input: string | URL | Request, init?: RequestInit) => (shared ??= createNetFetch())(input, init)) as typeof fetch;
