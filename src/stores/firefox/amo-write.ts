import type { AmoCredentials } from '../../credentials.js';
import { storeFetch } from '../../net.js';
import { amoJwt } from './amo.js';

// The only module allowed to create AMO versions or edit add-on metadata (see
// scripts/check-release-boundary.mjs). Creating a listed version submits it for
// review and a metadata edit is public at once, so callers reach these methods only
// through an approved plan: `dashbye submit` for versions, and `sync-draft` for the
// listing once AMO has approved the package version.
const API = 'https://addons.mozilla.org/api/v5';

export type AmoVersion = { id: number; version: string; status: string | null; hasSource: boolean; releaseNotes: string | null; reviewerNotes: string | null };

export type AmoListing = Partial<{
  summary: string;
  description: string;
  homepageUrl: string | null;
  supportEmail: string | null;
  categories: string[];
}>;

type Localized = Record<string, string | null> | string | null | undefined;

const localized = (value: Localized, locale: string): string | null =>
  !value ? null : typeof value === 'string' ? value : value[locale] ?? Object.values(value)[0] ?? null;

const versionsPath = (addon: string) => `/addons/addon/${encodeURIComponent(addon)}/versions/`;

export class AmoWriter {
  constructor(private readonly credentials: AmoCredentials, private readonly fetchImpl: typeof fetch = storeFetch) {
    if (!credentials) throw new Error('an AMO API key is required; set DASHBYE_AMO_ISSUER and DASHBYE_AMO_SECRET');
  }

  // Errors carry the operation and HTTP status only: AMO responses can echo the
  // add-on ID, field contents, or reviewer notes.
  private async request(operation: string, path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const headers = { Authorization: `JWT ${amoJwt(this.credentials)}`, ...init.headers as Record<string, string> };
    const response = await this.fetchImpl(`${API}${path}`, { ...init, headers });
    if (!response.ok) throw new Error(`AMO ${operation} failed (${response.status})`);
    return await response.json() as Record<string, unknown>;
  }

  async findVersion(addon: string, version: string): Promise<{ id: number; status: string | null } | null> {
    const page = await this.request('listVersions', `${versionsPath(addon)}?filter=all_with_unlisted`);
    const match = (page.results as Array<Record<string, unknown>> | undefined ?? []).find(entry => entry.version === version);
    return match ? { id: match.id as number, status: (match.file as { status?: string } | null)?.status ?? null } : null;
  }

  async createVersion(addon: string, upload: string, source: { name: string; bytes: Uint8Array } | null): Promise<{ id: number; version: string }> {
    const form = new FormData();
    form.set('upload', upload);
    if (source) form.set('source', new Blob([new Uint8Array(source.bytes)]), source.name);
    const created = await this.request('createVersion', versionsPath(addon), { method: 'POST', body: form });
    return { id: created.id as number, version: String(created.version) };
  }

  async setVersionNotes(addon: string, id: number, notes: { locale: string; releaseNotes: string; reviewerNotes: string | null }): Promise<void> {
    const body = { release_notes: { [notes.locale]: notes.releaseNotes }, ...(notes.reviewerNotes === null ? {} : { approval_notes: notes.reviewerNotes }) };
    await this.request('setVersionNotes', `${versionsPath(addon)}${id}/`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  async getVersion(addon: string, id: number, locale: string): Promise<AmoVersion> {
    const raw = await this.request('getVersion', `${versionsPath(addon)}${id}/`);
    return {
      id: raw.id as number,
      version: String(raw.version),
      status: (raw.file as { status?: string } | null)?.status ?? null,
      hasSource: typeof raw.source === 'string' && raw.source.length > 0,
      releaseNotes: localized(raw.release_notes as Localized, locale),
      reviewerNotes: typeof raw.approval_notes === 'string' ? raw.approval_notes : null,
    };
  }

  async updateListing(addon: string, locale: string, listing: AmoListing): Promise<void> {
    const body: Record<string, unknown> = {};
    if (listing.summary !== undefined) body.summary = { [locale]: listing.summary };
    if (listing.description !== undefined) body.description = { [locale]: listing.description };
    if (listing.homepageUrl !== undefined) body.homepage = { [locale]: listing.homepageUrl };
    if (listing.supportEmail !== undefined) body.support_email = { [locale]: listing.supportEmail };
    if (listing.categories !== undefined) body.categories = listing.categories;
    await this.request('updateListing', `/addons/addon/${encodeURIComponent(addon)}/`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
}
