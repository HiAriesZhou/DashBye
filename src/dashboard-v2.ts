import { sha256 } from './hash.js';
import { visualHash } from './image-fingerprint.js';
import type { Browser, Locator, Page } from 'playwright-core';
import { chromium } from 'playwright-core';
import type { DashboardState, DesiredState, ReconciliationPlan } from './reconcile.js';
import type { LoadedWorkspace } from './workspace.js';

const sectionSelector = '.TVM7Wc';

const dataLabels = {
  personallyIdentifiableInformation: 'Personally identifiable information',
  healthInformation: 'Health information',
  financialAndPaymentInformation: 'Financial and payment information',
  authenticationInformation: 'Authentication information',
  personalCommunications: 'Personal communications',
  location: 'Location',
  webHistory: 'Web history',
  userActivity: 'User activity',
  websiteContent: 'Website content',
} as const;

const certificationLabels = {
  noSaleOrTransfer: 'I do not sell or transfer user data to third parties, outside of the approved use cases',
  relatedToSinglePurpose: "I do not use or transfer user data for purposes that are unrelated to my item's single purpose",
  noCreditworthinessUse: 'I do not use or transfer user data to determine creditworthiness or for lending purposes',
} as const;

function exactItemPage(page: Page, itemId: string): boolean {
  try {
    const url = new URL(page.url());
    const segments = url.pathname.split('/').filter(Boolean);
    const itemIndex = segments.indexOf(itemId);
    return ['chrome.google.com', 'chromewebstore.google.com'].includes(url.hostname)
      && itemIndex >= 0 && segments[itemIndex + 1] === 'edit';
  } catch {
    return false;
  }
}

export async function connectDashboard(endpoint: string, itemId: string): Promise<{ browser: Browser; page: Page }> {
  const browser = await chromium.connectOverCDP(endpoint, { timeout: 30_000 });
  const pages = browser.contexts().flatMap(context => context.pages()).filter(page => exactItemPage(page, itemId));
  if (pages.length !== 1) throw new Error('expected exactly one open edit tab for the requested item');
  return { browser, page: pages[0]! };
}

async function openPage(page: Page, name: 'Package' | 'Store listing' | 'Privacy'): Promise<void> {
  const link = page.getByRole('link', { name, exact: true }).first();
  if (await link.count() !== 1) throw new Error(`${name} navigation was not found`);
  await link.evaluate(element => (element as HTMLElement).click());
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if ((await page.title()).toLowerCase().includes(name.toLowerCase().split(' ')[0]!)) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`${name} page did not settle`);
}

async function section(page: Page, text: string): Promise<Locator> {
  const candidates = page.locator(sectionSelector).filter({ hasText: text });
  const count = await candidates.count();
  if (count < 1) throw new Error(`Dashboard section not found: ${text}`);
  return candidates.first();
}

async function selectedCombo(page: Page, prefix: string): Promise<string> {
  const combo = page.getByRole('combobox').filter({ hasText: prefix }).first();
  const content = (await combo.innerText()).replace(/\s+/g, ' ').trim();
  return content.startsWith(prefix) ? content.slice(prefix.length).trim() : content;
}

async function selectCombo(page: Page, prefix: string, value: string): Promise<void> {
  const combo = page.getByRole('combobox').filter({ hasText: prefix }).first();
  if ((await selectedCombo(page, prefix)) === value) return;
  await combo.evaluate(element => (element as HTMLElement).click());
  const option = page.getByRole('option', { name: value, exact: true });
  if (await option.count() !== 1) throw new Error(`${prefix} option not found: ${value}`);
  await option.evaluate(element => (element as HTMLElement).click());
}

async function imageHash(locator: Locator): Promise<string | null> {
  if (await locator.count() === 0) return null;
  return visualHash(await locator.first().screenshot({ animations: 'disabled' }));
}

async function imageHashes(locator: Locator): Promise<string[]> {
  const hashes: string[] = [];
  for (let index = 0; index < await locator.count(); index += 1) {
    hashes.push(await visualHash(await locator.nth(index).screenshot({ animations: 'disabled' })));
  }
  return hashes;
}

async function readPackageVersion(page: Page): Promise<string | null> {
  await openPage(page, 'Package');
  const cards = page.locator(sectionSelector);
  for (let index = 0; index < await cards.count(); index += 1) {
    const text = await cards.nth(index).innerText();
    if (!/\bdraft\b/i.test(text)) continue;
    const version = text.match(/\b\d+\.\d+\.\d+(?:\.\d+)?\b/)?.[0];
    if (version) return version;
  }
  const text = await page.locator('body').innerText();
  const versions = [...new Set(text.match(/\b\d+\.\d+\.\d+(?:\.\d+)?\b/g) ?? [])];
  return versions[0] ?? null;
}

async function chooseLanguage(page: Page, language: string): Promise<void> {
  await selectCombo(page, 'Language', language.replace(/^English – en \(default\)$/, 'English'));
}

async function readListing(page: Page, language: string): Promise<DashboardState['listing']> {
  await openPage(page, 'Store listing');
  await chooseLanguage(page, language);
  const description = await page.locator('textarea').first().inputValue();
  const screenshotsSection = await section(page, await page.getByText('Localized screenshots', { exact: true }).count() ? 'Localized screenshots' : 'Screenshots');
  const videoSection = await section(page, await page.getByText('Localized promo video', { exact: true }).count() ? 'Localized promo video' : 'Global promo video');
  const official = await selectedCombo(page, 'Official URL');
  const homepage = await (await section(page, 'Homepage URL')).locator('input[type="text"]').inputValue();
  const support = await (await section(page, 'Support URL')).locator('input[type="text"]').inputValue();
  const mature = await (await section(page, 'Mature content')).getByRole('switch').getAttribute('aria-checked');
  return {
    language,
    descriptionHash: sha256(description),
    category: await selectedCombo(page, 'Category'),
    promoVideoUrlHash: await videoSection.locator('input[type="text"]').inputValue().then(value => value ? sha256(value) : null),
    iconVisualHash: await imageHash(page.locator('img[alt="Store icon"]')),
    screenshotVisualHashes: await imageHashes(screenshotsSection.locator('img[alt^="Screenshot"]')),
    smallPromoVisualHash: await imageHash(page.locator('img[alt="Small promo tile"]')),
    marqueePromoVisualHash: await imageHash(page.locator('img[alt="Marquee promo tile"]')),
    officialUrlHash: official && official !== 'None' ? sha256(official) : null,
    homepageUrlHash: homepage ? sha256(homepage) : null,
    supportUrlHash: support ? sha256(support) : null,
    matureContent: mature === 'true',
  };
}

async function sectionTextArea(page: Page, label: string): Promise<string> {
  const target = await section(page, label);
  const textarea = target.locator('textarea').first();
  if (await textarea.count() !== 1) throw new Error(`privacy textarea not found: ${label}`);
  return textarea.inputValue();
}

async function readPermissionJustifications(page: Page): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  const cards = page.locator(sectionSelector);
  for (let index = 0; index < await cards.count(); index += 1) {
    const card = cards.nth(index);
    const label = (await card.innerText()).match(/^([A-Za-z][A-Za-z0-9_.-]*) justification\b/m)?.[1];
    if (!label) continue;
    const textarea = card.locator('textarea').first();
    if (await textarea.count() !== 1) continue;
    hashes[label] = sha256(await textarea.inputValue());
  }
  return hashes;
}

async function readPrivacy(page: Page): Promise<DashboardState['privacy']> {
  await openPage(page, 'Privacy');
  const permissionJustificationHashes = await readPermissionJustifications(page);
  const hostSection = page.locator(sectionSelector).filter({ hasText: 'Host permission justification' }).first();
  const hostPermissionJustificationHash = await hostSection.count()
    ? sha256(await hostSection.locator('textarea').first().inputValue())
    : null;
  const remote = await section(page, 'Remote code');
  const radios = remote.locator('input[type="radio"]');
  const remoteUses = await radios.nth(1).isChecked();
  const remoteJustification = await remote.locator('textarea').inputValue();
  const collectedData: string[] = [];
  for (const [key, label] of Object.entries(dataLabels)) {
    if (await page.getByRole('checkbox', { name: label, exact: true }).isChecked()) collectedData.push(key);
  }
  const certifications = {} as DashboardState['privacy']['certifications'];
  for (const [key, label] of Object.entries(certificationLabels) as Array<[keyof typeof certificationLabels, string]>) {
    certifications[key] = await page.getByRole('checkbox', { name: label, exact: true }).isChecked();
  }
  const policy = await (await section(page, 'Privacy policy URL')).locator('input[type="text"]').inputValue();
  return {
    singlePurposeHash: sha256(await sectionTextArea(page, 'Single purpose description')),
    permissionJustificationHashes,
    hostPermissionJustificationHash,
    remoteCode: { uses: remoteUses, justificationHash: remoteJustification ? sha256(remoteJustification) : null },
    collectedData: collectedData.sort(),
    certifications,
    policyUrlHash: sha256(policy),
  };
}

export async function readDashboardState(page: Page, workspace: LoadedWorkspace): Promise<DashboardState> {
  if (!exactItemPage(page, workspace.config.target.itemId)) throw new Error('Dashboard item changed during read');
  const packageVersion = await readPackageVersion(page);
  const listing = await readListing(page, workspace.config.target.language);
  const privacy = await readPrivacy(page);
  return { itemId: workspace.config.target.itemId, packageVersion, listing, privacy };
}

async function saveDraft(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: 'Save draft', exact: true });
  for (let attempt = 0; attempt < 120 && !await button.isEnabled(); attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!await button.isEnabled()) throw new Error('Save draft did not become enabled');
  await button.evaluate(element => (element as HTMLElement).click());
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (!await button.isEnabled()) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Save draft did not settle');
}

async function removeImages(page: Page, pattern: RegExp): Promise<void> {
  while (true) {
    const button = page.getByRole('button', { name: pattern }).first();
    if (await button.count() === 0) return;
    await button.evaluate(element => (element as HTMLElement).click());
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}

async function uploadToSection(page: Page, heading: string, files: string[]): Promise<void> {
  const target = await section(page, heading);
  for (const file of files) {
    await target.locator('input[type="file"]').setInputFiles(file);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

async function applyListing(page: Page, desired: DesiredState, plan: ReconciliationPlan): Promise<void> {
  const operations = plan.operations.filter(operation => operation.area === 'listing');
  if (!operations.length) return;
  await openPage(page, 'Store listing');
  await chooseLanguage(page, desired.listing.language);
  const has = (field: string) => operations.some(operation => operation.field === field);
  if (has('description')) await page.locator('textarea').first().fill(desired.listingValues.description);
  if (has('category')) await selectCombo(page, 'Category', desired.listing.category);
  const videoHeading = await page.getByText('Localized promo video', { exact: true }).count() ? 'Localized promo video' : 'Global promo video';
  if (has('promoVideoUrl')) await (await section(page, videoHeading)).locator('input[type="text"]').fill(desired.listingValues.promoVideoUrl ?? '');
  if (has('homepageUrl')) await (await section(page, 'Homepage URL')).locator('input[type="text"]').fill(desired.listingValues.homepageUrl ?? '');
  if (has('supportUrl')) await (await section(page, 'Support URL')).locator('input[type="text"]').fill(desired.listingValues.supportUrl ?? '');
  if (has('officialUrl')) await selectCombo(page, 'Official URL', desired.listingValues.officialUrl ?? 'None');
  if (has('matureContent')) {
    const toggle = (await section(page, 'Mature content')).getByRole('switch');
    if ((await toggle.getAttribute('aria-checked')) !== String(desired.listing.matureContent)) await toggle.click();
  }
  if (has('icon')) {
    await removeImages(page, /Remove image Store icon/);
    await uploadToSection(page, 'Store icon', [desired.listingFiles.icon]);
  }
  if (has('screenshots')) {
    await removeImages(page, /Remove image Screenshot/);
    const screenshotHeading = await page.getByText('Localized screenshots', { exact: true }).count() ? 'Localized screenshots' : 'Screenshots';
    await uploadToSection(page, screenshotHeading, desired.listingFiles.screenshots);
  }
  for (const [field, heading, alt, file] of [
    ['smallPromo', 'Small promo tile', 'Small promo tile', desired.listingFiles.smallPromo],
    ['marqueePromo', 'Marquee promo tile', 'Marquee promo tile', desired.listingFiles.marqueePromo],
  ] as const) {
    if (!has(field)) continue;
    await removeImages(page, new RegExp(`Remove image ${alt}`));
    if (file) await uploadToSection(page, heading, [file]);
  }
  await saveDraft(page);
}

async function setCheckbox(page: Page, label: string, checked: boolean): Promise<void> {
  const checkbox = page.getByRole('checkbox', { name: label, exact: true });
  if (await checkbox.isChecked() !== checked) await checkbox.setChecked(checked);
}

async function applyPrivacy(page: Page, desired: DesiredState, plan: ReconciliationPlan): Promise<void> {
  if (!plan.operations.some(operation => operation.area === 'privacy')) return;
  await openPage(page, 'Privacy');
  const values = desired.privacyValues;
  await (await section(page, 'Single purpose description')).locator('textarea').fill(values.singlePurpose);
  for (const [permission, justification] of Object.entries(values.permissionJustifications)) {
    await (await section(page, `${permission} justification`)).locator('textarea').fill(justification);
  }
  if (values.hostPermissionJustification) {
    await (await section(page, 'Host permission justification')).locator('textarea').fill(values.hostPermissionJustification);
  }
  const remote = await section(page, 'Remote code');
  await remote.locator('input[type="radio"]').nth(values.remoteCode.uses ? 1 : 0).setChecked(true);
  await remote.locator('textarea').fill(values.remoteCode.justification ?? '');
  for (const [key, label] of Object.entries(dataLabels)) await setCheckbox(page, label, values.collectedData.includes(key));
  for (const [key, label] of Object.entries(certificationLabels) as Array<[keyof typeof certificationLabels, string]>) {
    await setCheckbox(page, label, values.certifications[key]);
  }
  await (await section(page, 'Privacy policy URL')).locator('input[type="text"]').fill(values.policyUrl);
  await saveDraft(page);
}

async function applyPackage(page: Page, workspace: LoadedWorkspace, plan: ReconciliationPlan): Promise<void> {
  if (!plan.operations.some(operation => operation.area === 'package')) return;
  if (workspace.artifact.kind !== 'zip') throw new Error('package upload requires a ZIP artifact');
  await openPage(page, 'Package');
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload new package', exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(workspace.artifact.path);
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const body = await page.locator('body').innerText();
    if (body.includes(workspace.artifact.manifest.version)) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('package upload did not reach the expected version');
}

export async function applyReconciliationPlan(page: Page, workspace: LoadedWorkspace, desired: DesiredState, plan: ReconciliationPlan): Promise<DashboardState> {
  await applyPackage(page, workspace, plan);
  await applyListing(page, desired, plan);
  await applyPrivacy(page, desired, plan);
  return readDashboardState(page, workspace);
}
