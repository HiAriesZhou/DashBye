import type { EdgeCredentials } from '../../credentials.js';
import { storeFetch } from '../../net.js';

// Edge Add-ons API v1.1. Only the draft package endpoint is used: the upload
// replaces the package in the product's draft submission, and publishing that
// draft stays a manual step in Partner Center (see check-release-boundary.mjs).
const API = 'https://api.addons.microsoftedge.microsoft.com/v1';
const POLLS = 60;
const POLL_MS = 5_000;

export type EdgePackageResult = { status: 'Succeeded' | 'Failed'; errorCode: string | null };

export class EdgeClient {
  constructor(private readonly credentials: EdgeCredentials, private readonly fetchImpl: typeof fetch = storeFetch) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { Authorization: `ApiKey ${this.credentials.apiKey}`, 'X-ClientID': this.credentials.clientId, ...extra };
  }

  // Errors carry the operation and status only; responses can name the product.
  private async call(operation: string, url: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.fetchImpl(url, init);
    if (!response.ok) throw new Error(`Edge ${operation} failed (${response.status})`);
    return response;
  }

  async uploadDraftPackage(productId: string, bytes: Uint8Array, options: { sleep?: (ms: number) => Promise<void>; polls?: number } = {}): Promise<EdgePackageResult> {
    const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
    const base = `${API}/products/${encodeURIComponent(productId)}/submissions/draft/package`;
    const upload = await this.call('uploadPackage', base, { method: 'POST', headers: this.headers({ 'Content-Type': 'application/zip' }), body: new Uint8Array(bytes) });
    const operation = upload.headers.get('location')?.split('/').pop();
    if (!operation) throw new Error('Edge uploadPackage did not return an operation to follow');
    for (let attempt = 0; attempt < (options.polls ?? POLLS); attempt += 1) {
      if (attempt) await sleep(POLL_MS);
      const status = await (await this.call('packageStatus', `${base}/operations/${encodeURIComponent(operation)}`, { headers: this.headers() })).json() as { status?: string; errorCode?: string | null };
      if (status.status === 'Succeeded' || status.status === 'Failed') return { status: status.status, errorCode: status.errorCode ?? null };
    }
    throw new Error('Edge did not finish processing the package in time');
  }
}
