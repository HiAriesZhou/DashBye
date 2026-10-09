import type { Page } from 'playwright-core';

const ITEM_ID = /^[a-p]{32}$/;

export function assertItemId(value: string): string {
  if (!ITEM_ID.test(value)) throw new Error('item ID must contain exactly 32 lowercase letters from a to p');
  return value;
}

export function normalizeLoopbackEndpoint(value: string): string {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error('endpoint must be an HTTP URL on loopback');
  }
  if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)) {
    throw new Error('endpoint must use loopback HTTP');
  }
  if (!endpoint.port) throw new Error('endpoint must include an explicit port');
  endpoint.pathname = '';
  endpoint.search = '';
  endpoint.hash = '';
  return endpoint.toString().replace(/\/$/, '');
}

export function isExactItemEditPage(page: Page, itemId: string): boolean {
  const url = new URL(page.url());
  return ['chrome.google.com', 'chromewebstore.google.com'].includes(url.hostname)
    && url.pathname.includes(`/${itemId}/edit`);
}

export function sanitizedPageLabel(page: Page): string {
  const url = new URL(page.url());
  return `${url.hostname}/…/${url.pathname.endsWith('/edit') ? 'edit' : 'item'}`;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function assertEdgeProductId(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!GUID.test(normalized)) throw new Error('Edge product ID must be the Partner Center product GUID');
  return normalized;
}

// AMO accepts the numeric ID, the slug, or the add-on GUID ({uuid} or email-like).
const FIREFOX_ADDON = /^(?:\d+|[a-z0-9][a-z0-9_-]*|\{[0-9a-f-]{36}\}|[\w.+-]+@[\w.-]+)$/i;

export function assertFirefoxAddon(value: string): string {
  const trimmed = value.trim();
  if (!FIREFOX_ADDON.test(trimmed)) throw new Error('Firefox add-on must be its AMO slug, numeric ID, or add-on ID');
  return trimmed;
}
