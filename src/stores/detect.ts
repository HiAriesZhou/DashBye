import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { loadRawManifest } from '../artifact.js';
import { STORE_IDS, type StoreId } from './types.js';

export type StoreDetection = { artifacts: string[]; evidence: string[]; idHint?: string };

export type Detection = { stores: Record<StoreId, StoreDetection>; suggested: StoreId[] };

// Directories where extension build tools put packages: plain builds, web-ext,
// WXT (.output), and per-browser build folders.
const PACKAGE_DIRS = ['.', 'dist', 'build', 'release', 'releases', 'web-ext-artifacts', '.output', 'output'];
const NAME_HINTS: Array<[StoreId, RegExp]> = [
  ['firefox', /firefox|gecko|(?:^|[-_.])ff(?:[-_.]|$)/i],
  ['edge', /edge/i],
  ['chrome', /chrome|chromium/i],
];
const PACKAGING = /build|zip|pack|bundle|release|dist|web-ext|publish|submit/i;
const SCRIPT_HINTS: Array<[StoreId, RegExp]> = [
  ['firefox', /firefox|web-ext|gecko/i],
  ['edge', /\bedge\b|edge-mv[23]/i],
  ['chrome', /chrome/i],
];

async function isDirectory(path: string): Promise<boolean> {
  return stat(path).then(result => result.isDirectory(), () => false);
}

async function packageCandidates(root: string): Promise<string[]> {
  const found: string[] = [];
  for (const directory of PACKAGE_DIRS) {
    const absolute = join(root, directory);
    const entries = await readdir(absolute, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const path = join(absolute, entry.name);
      if (entry.isFile() && ['.zip', '.xpi'].includes(extname(entry.name).toLowerCase())) found.push(path);
      else if (entry.isDirectory() && directory !== '.' && await stat(join(path, 'manifest.json')).then(() => true, () => false)) found.push(path);
    }
  }
  return [...new Set(found)].sort();
}

function hintedStore(name: string): StoreId | null {
  return NAME_HINTS.find(([, pattern]) => pattern.test(name))?.[0] ?? null;
}

function empty(): Record<StoreId, StoreDetection> {
  return { chrome: { artifacts: [], evidence: [] }, edge: { artifacts: [], evidence: [] }, firefox: { artifacts: [], evidence: [] } };
}

async function classifyPackages(root: string, stores: Record<StoreId, StoreDetection>): Promise<string[]> {
  const generic: string[] = [];
  for (const path of await packageCandidates(root)) {
    const manifest = await loadRawManifest(path).catch(() => null);
    if (!manifest) continue;
    const name = relative(root, path);
    const settings = manifest.browser_specific_settings as { gecko?: unknown } | undefined;
    const store = hintedStore(name) ?? (settings?.gecko ? 'firefox' : extname(path).toLowerCase() === '.xpi' ? 'firefox' : null);
    if (!store) { generic.push(name); continue; }
    stores[store].artifacts.push(name);
    stores[store].evidence.push(settings?.gecko && store === 'firefox' ? `${name} (manifest declares gecko settings)` : `${name}`);
  }
  return generic;
}

async function scriptEvidence(root: string, stores: Record<StoreId, StoreDetection>): Promise<void> {
  const raw = await readFile(join(root, 'package.json'), 'utf8').catch(() => null);
  if (!raw) return;
  let scripts: Record<string, unknown> = {};
  try {
    scripts = (JSON.parse(raw) as { scripts?: Record<string, unknown> }).scripts ?? {};
  } catch {
    return;
  }
  for (const [name, command] of Object.entries(scripts)) {
    const text = `${name} ${typeof command === 'string' ? command : ''}`;
    // Only scripts that produce a package say which stores the project ships to.
    if (/\b(?:test|e2e|lint|dev|watch|serve|start)\b/i.test(name) || !PACKAGING.test(text)) continue;
    for (const [store, pattern] of SCRIPT_HINTS) {
      if (pattern.test(text)) stores[store].evidence.push(`package.json script "${name}"`);
    }
  }
}

async function linkEvidence(root: string, stores: Record<StoreId, StoreDetection>): Promise<void> {
  const files = [
    ...(await readdir(root).catch(() => [])).filter(name => /^readme.*\.md$/i.test(name)),
    ...(await isDirectory(join(root, 'docs')) ? (await readdir(join(root, 'docs'))).filter(name => name.endsWith('.md')).map(name => join('docs', name)) : []),
  ];
  for (const file of files) {
    const text = await readFile(join(root, file), 'utf8').catch(() => '');
    const chrome = text.match(/(?:chromewebstore\.google\.com|chrome\.google\.com\/webstore)\/detail\/(?:[^/\s)]+\/)?([a-p]{32})/);
    if (chrome) { stores.chrome.idHint ??= chrome[1]!; stores.chrome.evidence.push(`store link in ${file}`); }
    const firefox = text.match(/addons\.mozilla\.org\/(?:[a-z-]+\/)?firefox\/addon\/([^/\s)?#]+)/i);
    if (firefox) { stores.firefox.idHint ??= decodeURIComponent(firefox[1]!); stores.firefox.evidence.push(`store link in ${file}`); }
    if (/microsoftedge\.microsoft\.com\/addons\/detail\//i.test(text)) stores.edge.evidence.push(`store link in ${file}`);
  }
}

// Read-only. Suggests stores from evidence; the owner decides which to configure.
export async function detectStores(root: string): Promise<Detection> {
  const stores = empty();
  const generic = await classifyPackages(root, stores);
  await scriptEvidence(root, stores);
  await linkEvidence(root, stores);
  // A package without a browser hint is a Chrome-style package, also usable for Edge.
  if (generic.length) {
    stores.chrome.artifacts.unshift(...generic);
    stores.chrome.evidence.push(...generic);
  }
  if (!stores.edge.artifacts.length) stores.edge.artifacts.push(...stores.chrome.artifacts);
  for (const store of STORE_IDS) stores[store].evidence = [...new Set(stores[store].evidence)];
  const suggested = STORE_IDS.filter(store => stores[store].evidence.length);
  return { stores, suggested: suggested.length ? suggested : ['chrome'] };
}
