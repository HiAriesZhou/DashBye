import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import sharp from 'sharp';
import YAML from 'yaml';
import { fileHash, objectHash } from '../../hash.js';
import { nullableText, pathFrom, record, stringList, text } from '../../parse.js';

export type FirefoxRelease = {
  summary: string;
  description: string | null;
  homepageUrl: string | null;
  supportUrl: string | null;
  supportEmail: string | null;
  categories: string[];
  screenshots: string[];
  hash: string;
};

async function readText(path: string): Promise<string> {
  return (await readFile(path, 'utf8').catch(() => { throw new Error(`cannot read description: ${basename(path)}`); }))
    .replace(/\r\n/g, '\n').replace(/\n+$/, '');
}

async function checkImage(path: string): Promise<void> {
  const metadata = await sharp(path).metadata().catch(() => { throw new Error(`cannot read Firefox screenshot: ${basename(path)}`); });
  if (!['png', 'jpeg'].includes(metadata.format ?? '')) throw new Error(`Firefox screenshots must be PNG or JPEG: ${basename(path)}`);
}

// `stores.firefox` in release.yml holds AMO-only fields; anything it omits falls back
// to the shared listing. Chrome-specific requirements do not apply here.
export async function loadFirefoxRelease(resources: string): Promise<FirefoxRelease> {
  const path = join(resources, 'release.yml');
  const raw = record(YAML.parse(await readFile(path, 'utf8').catch(() => { throw new Error('cannot read release definition: release.yml'); })), 'release');
  const listing = record(raw.listing ?? {}, 'listing');
  const stores = record(raw.stores ?? {}, 'stores');
  if (stores.firefox === undefined) throw new Error('release.yml must define stores.firefox.summary for Firefox Add-ons');
  const firefox = record(stores.firefox, 'stores.firefox');
  const summary = text(firefox.summary, 'stores.firefox.summary');
  if (summary.length > 250) throw new Error('stores.firefox.summary must contain at most 250 characters');

  const language = nullableText(listing.defaultLanguage, 'listing.defaultLanguage');
  const locales = record(listing.locales ?? {}, 'listing.locales');
  const locale = language && locales[language] !== undefined ? record(locales[language], `listing.locales.${language}`) : {};
  const descriptionFile = nullableText(firefox.description, 'stores.firefox.description') ?? nullableText(locale.description, `listing.locales.${language}.description`);
  const descriptionPath = descriptionFile ? pathFrom(resources, descriptionFile) : null;
  const screenshots = (firefox.screenshots !== undefined
    ? stringList(firefox.screenshots, 'stores.firefox.screenshots')
    : [...stringList(locale.screenshots, `listing.locales.${language}.screenshots`), ...stringList(listing.globalScreenshots, 'listing.globalScreenshots')]
  ).map(file => pathFrom(resources, file));
  for (const file of screenshots) await checkImage(file);

  const release = {
    summary,
    description: descriptionPath ? await readText(descriptionPath) : null,
    homepageUrl: firefox.homepageUrl !== undefined ? nullableText(firefox.homepageUrl, 'stores.firefox.homepageUrl') : nullableText(listing.homepageUrl, 'listing.homepageUrl'),
    supportUrl: firefox.supportUrl !== undefined ? nullableText(firefox.supportUrl, 'stores.firefox.supportUrl') : nullableText(listing.supportUrl, 'listing.supportUrl'),
    supportEmail: nullableText(firefox.supportEmail, 'stores.firefox.supportEmail'),
    categories: stringList(firefox.categories, 'stores.firefox.categories'),
    screenshots,
  };
  const files = await Promise.all([...(descriptionPath ? [descriptionPath] : []), ...screenshots].map(fileHash));
  return { ...release, hash: objectHash({ release, files }) };
}
