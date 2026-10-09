import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { AmoCredentials } from '../../credentials.js';

const API = 'https://addons.mozilla.org/api/v5';
const UPLOAD_POLLS = 60;
const UPLOAD_POLL_MS = 3_000;

export type AmoAddon = {
  id: number;
  slug: string;
  currentVersion: string | null;
  summary: string | null;
  description: string | null;
  homepageUrl: string | null;
  supportUrl: string | null;
  supportEmail: string | null;
  categories: string[];
  previewUrls: string[];
};

export type AmoValidation = { uuid: string; valid: boolean; errors: number; warnings: number; notices: number; messages: string[] };

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

// AMO accepts a JWT signed with the API secret; it must expire within five minutes.
export function amoJwt(credentials: AmoCredentials, now = Date.now(), jti: string = randomUUID()): string {
  const iat = Math.floor(now / 1000);
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ iss: credentials.issuer, jti, iat, exp: iat + 60 })}`;
  return `${unsigned}.${createHmac('sha256', credentials.secret).update(unsigned).digest('base64url')}`;
}

type Localized = Record<string, string> | string | null | undefined;

function localized(value: Localized, locale: string): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value[locale] ?? Object.values(value)[0] ?? null;
}

// Only reads and validation uploads exist here. Creating a version submits it for
// review and editing add-on metadata publishes immediately, so neither is called.
export class AmoClient {
  constructor(private readonly credentials: AmoCredentials | null, private readonly fetchImpl: typeof fetch = fetch) {}

  private headers(): Record<string, string> {
    return this.credentials ? { Authorization: `JWT ${amoJwt(this.credentials)}` } : {};
  }

  private async json(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const response = await this.fetchImpl(`${API}${path}`, { ...init, headers: { ...this.headers(), ...init.headers as Record<string, string> } });
    if (!response.ok) throw new Error(`AMO request failed (${response.status}) for ${path.split('?')[0]}`);
    return await response.json() as Record<string, unknown>;
  }

  async getAddon(addon: string): Promise<AmoAddon> {
    const raw = await this.json(`/addons/addon/${encodeURIComponent(addon)}/`);
    const locale = typeof raw.default_locale === 'string' ? raw.default_locale : 'en-US';
    const url = (value: unknown) => localized((value as { url?: Localized } | null)?.url, locale);
    return {
      id: raw.id as number,
      slug: raw.slug as string,
      currentVersion: (raw.current_version as { version?: string } | null)?.version ?? null,
      summary: localized(raw.summary as Localized, locale),
      description: localized(raw.description as Localized, locale),
      homepageUrl: url(raw.homepage),
      supportUrl: url(raw.support_url),
      supportEmail: localized(raw.support_email as Localized, locale),
      categories: Array.isArray(raw.categories) ? (raw.categories as string[]).slice().sort() : [],
      previewUrls: Array.isArray(raw.previews) ? (raw.previews as Array<{ image_url?: string }>).flatMap(preview => preview.image_url ? [preview.image_url] : []) : [],
    };
  }

  async fetchImage(url: string): Promise<Uint8Array> {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !/(^|\.)(mozilla\.org|mozilla\.net)$/.test(parsed.hostname)) throw new Error('preview is not an AMO image URL');
    const response = await this.fetchImpl(url);
    if (!response.ok) throw new Error(`cannot download an AMO preview (${response.status})`);
    return new Uint8Array(await response.arrayBuffer());
  }

  async uploadForValidation(path: string, options: { sleep?: (ms: number) => Promise<void> } = {}): Promise<AmoValidation> {
    if (!this.credentials) throw new Error('an AMO API key is required to validate the Firefox package; set DASHBYE_AMO_ISSUER and DASHBYE_AMO_SECRET');
    const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
    const form = new FormData();
    form.set('upload', new Blob([await readFile(path)]), basename(path));
    form.set('channel', 'listed');
    let upload = await this.json('/addons/upload/', { method: 'POST', body: form });
    for (let attempt = 0; !upload.processed; attempt += 1) {
      if (attempt >= UPLOAD_POLLS) throw new Error('AMO did not finish validating the package in time');
      await sleep(UPLOAD_POLL_MS);
      upload = await this.json(`/addons/upload/${encodeURIComponent(String(upload.uuid))}/`);
    }
    const validation = (upload.validation ?? {}) as { errors?: number; warnings?: number; notices?: number; messages?: Array<{ type?: string; message?: string }> };
    return {
      uuid: String(upload.uuid),
      valid: upload.valid === true,
      errors: validation.errors ?? 0,
      warnings: validation.warnings ?? 0,
      notices: validation.notices ?? 0,
      messages: (validation.messages ?? []).filter(entry => entry.type !== 'notice').slice(0, 20).map(entry => `${entry.type ?? 'message'}: ${entry.message ?? ''}`),
    };
  }
}
