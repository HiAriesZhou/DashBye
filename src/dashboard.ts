import { createHash } from 'node:crypto';
import { chromium, type Browser, type Page } from 'playwright-core';
import { isExactItemEditPage, sanitizedPageLabel } from './security.js';
import type { DashboardSnapshot, DraftPlan, PublicDashboardSnapshot, ResolvedStoreConfig } from './types.js';

const sectionSelector = '.TVM7Wc';

async function section(page: Page, heading: string) {
  const locator = page.locator(sectionSelector).filter({ hasText: heading });
  if (await locator.count() !== 1) throw new Error(`expected one ${heading} section`);
  return locator;
}

async function selectLanguage(page: Page, language: string): Promise<void> {
  const combo = page.getByRole('combobox').filter({ hasText: 'Language' });
  if ((await combo.innerText()).includes(language)) return;
  await combo.evaluate(element => (element as HTMLElement).click());
  const option = page.getByRole('option', { name: language, exact: true });
  if (await option.count() !== 1) throw new Error(`language option not found: ${language}`);
  await option.evaluate(element => (element as HTMLElement).click());
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if ((await combo.innerText()).includes(language)) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('language selection did not settle');
}

async function openListing(page: Page, itemId: string, language: string): Promise<void> {
  if (!isExactItemEditPage(page, itemId)) throw new Error(`wrong Dashboard page: ${sanitizedPageLabel(page)}`);
  const listing = page.getByRole('link', { name: 'Store listing', exact: true }).first();
  if (await listing.count()) await listing.evaluate(element => (element as HTMLElement).click());
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await selectLanguage(page, language);
  if ((await page.title()) !== 'Store Listing') throw new Error('Store Listing page did not open');
}

async function findPage(browser: Browser, itemId: string): Promise<Page> {
  const pages = browser.contexts().flatMap(context => context.pages()).filter(page => isExactItemEditPage(page, itemId));
  if (pages.length !== 1) throw new Error('expected exactly one open edit tab for the requested item');
  return pages[0]!;
}

export async function connect(endpoint: string, itemId: string, language: string) {
  const browser = await chromium.connectOverCDP(endpoint, { timeout: 30_000 });
  const page = await findPage(browser, itemId);
  await openListing(page, itemId, language);
  return { browser, page };
}

export async function snapshot(page: Page, itemId: string, language: string): Promise<DashboardSnapshot> {
  if (!isExactItemEditPage(page, itemId)) throw new Error('item changed during run');
  await selectLanguage(page, language);
  const description = await page.locator('textarea').first().inputValue();
  const localized = await section(page, 'Localized screenshots');
  const global = await section(page, 'Global screenshots');
  return {
    itemId,
    language,
    descriptionLength: description.length,
    descriptionSha256: createHash('sha256').update(description).digest('hex'),
    localizedScreenshotCount: await localized.locator('img[alt^="Screenshot"]').count(),
    globalScreenshotCount: await global.locator('img[alt^="Screenshot"]').count(),
    hasIcon: await page.locator('img[alt="Store icon"]').count() === 1,
    hasSmallPromo: await page.locator('img[alt="Small promo tile"]').count() === 1,
    hasMarqueePromo: await page.locator('img[alt="Marquee promo tile"]').count() === 1,
    saveDraftEnabled: await page.getByRole('button', { name: 'Save draft', exact: true }).isEnabled(),
  };
}

export function publicSnapshot(snapshot: DashboardSnapshot): PublicDashboardSnapshot {
  const { itemId: _itemId, ...publicFields } = snapshot;
  return { itemIdMatched: true, ...publicFields };
}

async function waitForCount(page: Page, heading: string, count: number): Promise<void> {
  const target = await section(page, heading);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await target.locator('img[alt^="Screenshot"]').count() === count) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`${heading} upload did not reach count ${count}`);
}

async function appendScreenshots(page: Page, heading: string, files: string[], initialCount: number) {
  const target = await section(page, heading);
  for (const [index, file] of files.entries()) {
    await target.locator('input[type="file"]').setInputFiles(file);
    await waitForCount(page, heading, initialCount + index + 1);
  }
}

async function uploadSingleton(page: Page, heading: string, alt: string, file: string | null) {
  if (!file) return;
  const target = await section(page, heading);
  await target.locator('input[type="file"]').setInputFiles(file);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await page.locator(`img[alt="${alt}"]`).count() === 1) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`${heading} upload did not produce a preview`);
}

async function saveDraft(page: Page, itemId: string, language: string): Promise<void> {
  const save = page.getByRole('button', { name: 'Save draft', exact: true });
  if (!await save.isEnabled()) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 });
    await openListing(page, itemId, language);
  }
  if (!await save.isEnabled()) throw new Error('Save draft is not enabled after changes');
  await save.evaluate(element => (element as HTMLElement).click());
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (!await save.isEnabled()) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Save draft did not settle');
}

export async function applyDraft(
  page: Page,
  config: ResolvedStoreConfig,
  before: DashboardSnapshot,
  plan: DraftPlan,
): Promise<DashboardSnapshot> {
  const hasChanges = plan.description === 'update'
    || plan.appendLocalizedScreenshots.length > 0
    || plan.appendGlobalScreenshots.length > 0
    || Boolean(plan.uploadIcon || plan.uploadSmallPromo || plan.uploadMarqueePromo);
  if (!hasChanges) return before;
  if (plan.description === 'update') await page.locator('textarea').first().fill(config.descriptionText);
  await uploadSingleton(page, 'Store icon', 'Store icon', plan.uploadIcon);
  await appendScreenshots(page, 'Localized screenshots', plan.appendLocalizedScreenshots, before.localizedScreenshotCount);
  await appendScreenshots(page, 'Global screenshots', plan.appendGlobalScreenshots, before.globalScreenshotCount);
  await uploadSingleton(page, 'Small promo tile', 'Small promo tile', plan.uploadSmallPromo);
  await uploadSingleton(page, 'Marquee promo tile', 'Marquee promo tile', plan.uploadMarqueePromo);
  await saveDraft(page, before.itemId, before.language);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 });
  await openListing(page, before.itemId, before.language);
  const after = await snapshot(page, before.itemId, before.language);
  const expectedHash = createHash('sha256').update(config.descriptionText).digest('hex');
  if (after.descriptionSha256 !== expectedHash
    || after.localizedScreenshotCount !== config.assets.localizedScreenshots.length
    || after.globalScreenshotCount !== config.assets.globalScreenshots.length) {
    throw new Error('draft read-back did not match configuration');
  }
  return after;
}
