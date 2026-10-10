import { readFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import YAML from 'yaml';
import { pathFrom, record, text } from './parse.js';
import { assertEdgeProductId, assertFirefoxAddon, assertItemId, normalizeLoopbackEndpoint } from './security.js';
import { parseStoreList, STORE_IDS, type StoreId } from './stores/types.js';

export const DEFAULT_ENDPOINT = 'http://127.0.0.1:9333';

export type ChromeTarget = { artifact: string; itemId: string; language: string };
export type EdgeTarget = { artifact: string; productId: string; language: string };
export type FirefoxTarget = { artifact: string; addon: string };
export type Targets = { chrome?: ChromeTarget; edge?: EdgeTarget; firefox?: FirefoxTarget };

export type ProjectSetup = {
  schema: 'dashbye/config/v1' | 'dashbye/config/v2';
  project: string;
  resources: string;
  endpoint: string;
  targets: Targets;
  stores: StoreId[];
};

async function readConfig(configPath: string): Promise<Record<string, unknown>> {
  try {
    return record(YAML.parse(await readFile(configPath, 'utf8')), 'config');
  } catch (error) {
    if (error instanceof Error && error.message !== 'config must be an object') throw new Error(`cannot read config: ${basename(configPath)}`);
    throw error;
  }
}

function parseTargets(raw: Record<string, unknown>, project: string): Targets {
  parseStoreList(Object.keys(raw).join(','));
  const targets: Targets = {};
  for (const store of STORE_IDS) {
    if (raw[store] === undefined) continue;
    const value = record(raw[store], `targets.${store}`);
    const artifact = pathFrom(project, text(value.artifact, `targets.${store}.artifact`));
    if (store === 'chrome') targets.chrome = { artifact, itemId: assertItemId(text(value.itemId, 'targets.chrome.itemId')), language: text(value.language, 'targets.chrome.language') };
    if (store === 'edge') targets.edge = { artifact, productId: assertEdgeProductId(text(value.productId, 'targets.edge.productId')), language: text(value.language, 'targets.edge.language') };
    if (store === 'firefox') targets.firefox = { artifact, addon: assertFirefoxAddon(text(value.addon, 'targets.firefox.addon')) };
  }
  return targets;
}

// A v1 config is the original Chrome-only layout; v2 lists only the chosen stores.
export async function loadProject(configPath: string): Promise<ProjectSetup> {
  const absolute = resolve(configPath);
  const raw = await readConfig(absolute);
  const project = pathFrom(dirname(absolute), text(raw.project ?? '.', 'project'));
  const resources = pathFrom(project, text(raw.resources ?? 'store', 'resources'));
  if (raw.schema === 'dashbye/config/v1') {
    const target = record(raw.target, 'target');
    return {
      schema: 'dashbye/config/v1', project, resources,
      endpoint: normalizeLoopbackEndpoint(text(target.endpoint ?? DEFAULT_ENDPOINT, 'target.endpoint')),
      targets: { chrome: { artifact: pathFrom(project, text(raw.artifact, 'artifact')), itemId: assertItemId(text(target.itemId, 'target.itemId')), language: text(target.language, 'target.language') } },
      stores: ['chrome'],
    };
  }
  if (raw.schema !== 'dashbye/config/v2') throw new Error('unsupported project config schema');
  const browser = raw.browser === undefined ? {} : record(raw.browser, 'browser');
  const rawTargets = record(raw.targets ?? {}, 'targets');
  if (!Object.keys(rawTargets).length) throw new Error('targets must configure at least one store');
  const targets = parseTargets(rawTargets, project);
  return {
    schema: 'dashbye/config/v2', project, resources,
    endpoint: normalizeLoopbackEndpoint(text(browser.endpoint ?? DEFAULT_ENDPOINT, 'browser.endpoint')),
    targets,
    stores: STORE_IDS.filter(store => targets[store]),
  };
}

const relativeTo = (base: string, path: string) => relative(base, path) || '.';

export function serializeConfig(setup: Pick<ProjectSetup, 'project' | 'resources' | 'endpoint' | 'targets'>, configPath: string) {
  const { project, targets } = setup;
  const out: Record<string, Record<string, string>> = {};
  if (targets.chrome) out.chrome = { artifact: relativeTo(project, targets.chrome.artifact), itemId: targets.chrome.itemId, language: targets.chrome.language };
  if (targets.edge) out.edge = { artifact: relativeTo(project, targets.edge.artifact), productId: targets.edge.productId, language: targets.edge.language };
  if (targets.firefox) out.firefox = { artifact: relativeTo(project, targets.firefox.artifact), addon: targets.firefox.addon };
  return {
    schema: 'dashbye/config/v2',
    project: relativeTo(dirname(resolve(configPath)), project),
    resources: relativeTo(project, setup.resources),
    browser: { endpoint: setup.endpoint },
    targets: out,
  };
}
