import { access, mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import YAML from 'yaml';
import { DEFAULT_ENDPOINT, loadProject, serializeConfig, type ProjectSetup, type Targets } from './project.js';
import { assertEdgeProductId, assertFirefoxAddon, assertItemId, normalizeLoopbackEndpoint } from './security.js';
import { detectStores, type Detection } from './stores/detect.js';
import { parseStoreList, STORE_IDS, STORE_LABELS, type StoreId } from './stores/types.js';
import { CONFIG_NAME } from './workspace.js';

export type InitOptions = {
  project?: string;
  stores?: string;
  artifact?: string;
  itemId?: string;
  language?: string;
  edgeArtifact?: string;
  edgeProductId?: string;
  edgeLanguage?: string;
  firefoxArtifact?: string;
  firefoxAddon?: string;
  resources?: string;
  endpoint?: string;
  config?: string;
  nonInteractive: boolean;
  overwrite: boolean;
};

export type InitInput = Omit<InitOptions, 'nonInteractive'>;

type ValueField = 'project' | 'stores' | 'artifact' | 'itemId' | 'language' | 'edgeArtifact' | 'edgeProductId' | 'edgeLanguage' | 'firefoxArtifact' | 'firefoxAddon' | 'resources' | 'endpoint';

export const INIT_FLAGS: Record<ValueField, string> = {
  project: '--project', stores: '--stores', artifact: '--artifact', itemId: '--item-id', language: '--language',
  edgeArtifact: '--edge-artifact', edgeProductId: '--edge-product-id', edgeLanguage: '--edge-language',
  firefoxArtifact: '--firefox-artifact', firefoxAddon: '--firefox-addon', resources: '--resources', endpoint: '--endpoint',
};

export type AgentInitQuestion = {
  field: ValueField | 'existingConfig';
  flag?: string;
  prompt: string;
  kind: 'path' | 'text' | 'url' | 'choice' | 'multi-choice';
  default?: string;
  choices?: Array<{ label: string; value: string }>;
  validation?: string;
  error?: string;
};

export type AgentInitGuide = {
  mode: 'agent';
  status: 'needs_input';
  question: AgentInitQuestion;
} | {
  mode: 'agent';
  status: 'existing_config';
  configPath: string;
  configuredStores: StoreId[];
  question: AgentInitQuestion;
  actions: { useExisting: string[]; changeStoresWith: string[]; reconfigureWith: string[] };
} | {
  mode: 'agent';
  status: 'ready';
  preview: { configPath: string; releasePath: string; config: Record<string, unknown> };
  writeCommand: string[];
  options: InitInput;
};

type Resolution =
  | { kind: 'question'; question: AgentInitQuestion }
  | { kind: 'existing'; configPath: string; configuredStores: StoreId[] }
  | { kind: 'ready'; configPath: string; setup: Omit<ProjectSetup, 'schema' | 'stores'>; change: boolean; options: InitInput };

const exists = (path: string) => access(path).then(() => true, () => false);

function ask(field: ValueField, prompt: string, extra: Omit<AgentInitQuestion, 'field' | 'flag' | 'prompt' | 'kind'> & { kind?: AgentInitQuestion['kind'] } = {}): Resolution {
  return { kind: 'question', question: { field, flag: INIT_FLAGS[field], prompt, kind: extra.kind ?? 'text', ...extra } };
}

const message = (error: unknown) => error instanceof Error ? error.message : 'Invalid value.';
const choices = (values: string[]) => values.map(value => ({ label: value, value }));

async function artifactField(project: string, field: 'artifact' | 'edgeArtifact' | 'firefoxArtifact', value: string | undefined, candidates: string[], store: StoreId): Promise<Resolution | string> {
  const prompt = `Which ${STORE_LABELS[store]} package (ZIP, XPI, build directory, or manifest) should DashBye use?`;
  const extra = { kind: 'path' as const, ...(candidates.length ? { choices: choices(candidates), default: candidates[0]! } : {}), validation: 'A path inside the project.' };
  if (!value) return ask(field, prompt, extra);
  const path = resolve(project, value);
  if (!await exists(path)) return ask(field, prompt, { ...extra, error: 'The selected package does not exist.' });
  return path;
}

function idField<T>(field: ValueField, prompt: string, value: string | undefined, validate: (value: string) => T, hint: string | undefined, validation: string): Resolution | T {
  if (!value) return ask(field, prompt, { ...(hint ? { default: hint } : {}), validation });
  try {
    return validate(value);
  } catch (error) {
    return ask(field, prompt, { validation, error: message(error) });
  }
}

const isResolution = (value: unknown): value is Resolution => typeof value === 'object' && value !== null && 'kind' in value;

// Resolves the next missing or invalid input, or the complete configuration.
// The terminal wizard and the agent protocol both walk this one sequence.
async function resolveTarget(store: StoreId, input: InitInput, project: string, detection: Detection, chromeLanguage: string | undefined): Promise<Resolution | Targets> {
  const found = detection.stores[store];
  if (store === 'chrome') {
    const artifact = await artifactField(project, 'artifact', input.artifact, found.artifacts, store);
    if (isResolution(artifact)) return artifact;
    const itemId = idField('itemId', 'What is the 32-character Chrome Web Store item ID?', input.itemId, assertItemId, found.idHint, 'Exactly 32 lowercase letters from a to p.');
    if (isResolution(itemId)) return itemId;
    if (!input.language) return ask('language', 'Which Chrome Web Store Dashboard language should DashBye manage?', { default: 'English – en (default)', choices: choices(['English – en (default)']) });
    return { chrome: { artifact, itemId, language: input.language } };
  }
  if (store === 'edge') {
    const artifact = await artifactField(project, 'edgeArtifact', input.edgeArtifact, found.artifacts, store);
    if (isResolution(artifact)) return artifact;
    const productId = idField('edgeProductId', 'What is the Edge product ID (the GUID on the Partner Center extension overview)?', input.edgeProductId, assertEdgeProductId, undefined, 'A GUID such as d34f98f5-f9b7-42b1-bebb-98707202b21d.');
    if (isResolution(productId)) return productId;
    if (!input.edgeLanguage) return ask('edgeLanguage', 'Which Partner Center store listing language should DashBye manage?', { default: chromeLanguage?.split(' – ')[0] ?? 'English' });
    return { edge: { artifact, productId, language: input.edgeLanguage } };
  }
  const artifact = await artifactField(project, 'firefoxArtifact', input.firefoxArtifact, found.artifacts, store);
  if (isResolution(artifact)) return artifact;
  const addon = idField('firefoxAddon', 'What is the Firefox add-on on AMO (slug, numeric ID, or add-on ID)?', input.firefoxAddon, assertFirefoxAddon, found.idHint, 'For example the slug in addons.mozilla.org/firefox/addon/<slug>.');
  if (isResolution(addon)) return addon;
  return { firefox: { artifact, addon } };
}

function storeQuestion(detection: Detection, fallback: StoreId[], error?: string): Resolution {
  const storeChoices = STORE_IDS.map(store => {
    const evidence = detection.stores[store].evidence;
    return { label: `${STORE_LABELS[store]}${evidence.length ? ` (found: ${evidence.slice(0, 2).join('; ')})` : ''}`, value: store };
  });
  return ask('stores', 'Which stores should DashBye manage for this extension?', {
    kind: 'multi-choice', default: fallback.join(','), choices: storeChoices,
    validation: `A comma-separated list of ${STORE_IDS.join(', ')}.`, ...(error ? { error } : {}),
  });
}

async function resolveInit(input: InitInput): Promise<Resolution> {
  if (!input.project) return ask('project', 'Which extension repository should DashBye configure?', { kind: 'path', default: process.cwd(), choices: [{ label: 'Current directory (recommended)', value: process.cwd() }] });
  const project = resolve(input.project);
  if (!await stat(project).then(result => result.isDirectory(), () => false)) {
    return ask('project', 'Which extension repository should DashBye configure?', { kind: 'path', error: 'The selected project directory does not exist.' });
  }
  const configPath = resolve(input.config ?? resolve(project, CONFIG_NAME));
  const existing = !input.overwrite && await exists(configPath) ? await loadProject(configPath).catch(() => null) : null;
  if (!input.overwrite && await exists(configPath) && !input.stores) {
    return { kind: 'existing', configPath, configuredStores: existing?.stores ?? [] };
  }
  const change = !input.overwrite && await exists(configPath);
  if (change && !existing) throw new Error('the existing configuration cannot be read; reconfigure it with --overwrite');
  const detection = await detectStores(project);

  // Chrome flags without --stores keep the original Chrome-only setup working.
  const legacyChrome = (input.artifact || input.itemId) && !input.edgeArtifact && !input.edgeProductId && !input.firefoxArtifact && !input.firefoxAddon;
  const requested = input.stores ?? (legacyChrome ? 'chrome' : undefined);
  if (!requested) return storeQuestion(detection, detection.suggested);
  let stores: StoreId[];
  try {
    stores = parseStoreList(requested);
  } catch (error) {
    return storeQuestion(detection, existing?.stores ?? detection.suggested, message(error));
  }

  let targets: Targets = {};
  for (const store of stores) {
    const kept = existing?.targets[store];
    if (kept) { targets = { ...targets, [store]: kept }; continue; }
    const resolved = await resolveTarget(store, input, project, detection, targets.chrome?.language);
    if (isResolution(resolved)) return resolved;
    targets = { ...targets, ...resolved };
  }

  let resources = existing?.resources;
  if (!resources) {
    if (!input.resources) return ask('resources', 'Where should this project keep its versioned store resources?', { kind: 'path', default: 'store', choices: [{ label: 'store (recommended)', value: 'store' }] });
    resources = resolve(project, input.resources);
  }
  let endpoint = existing?.endpoint ?? DEFAULT_ENDPOINT;
  if (!existing && (targets.chrome || targets.edge)) {
    const question = (error?: string) => ask('endpoint', 'Which dedicated Chrome debugging endpoint should DashBye use?', {
      kind: 'url', default: DEFAULT_ENDPOINT, choices: [{ label: '127.0.0.1:9333 (recommended)', value: DEFAULT_ENDPOINT }],
      validation: 'A loopback HTTP URL with an explicit port.', ...(error ? { error } : {}),
    });
    if (!input.endpoint) return question();
    try {
      endpoint = normalizeLoopbackEndpoint(input.endpoint);
    } catch (error) {
      return question(message(error));
    }
  }
  const options: InitInput = {
    ...input, project, stores: stores.join(','), resources, ...(targets.chrome || targets.edge ? { endpoint } : {}), config: configPath,
  };
  return { kind: 'ready', configPath, setup: { project, resources, endpoint, targets }, change, options };
}

function writeCommand(options: InitInput): string[] {
  const flags = (Object.keys(INIT_FLAGS) as ValueField[])
    .flatMap(field => options[field] ? [INIT_FLAGS[field], options[field] as string] : []);
  return ['dashbye', 'init', ...flags, '--config', options.config!, '--non-interactive', ...(options.overwrite ? ['--overwrite'] : [])];
}

export async function guideInitialization(options: InitInput): Promise<AgentInitGuide> {
  const resolution = await resolveInit(options);
  if (resolution.kind === 'question') return { mode: 'agent', status: 'needs_input', question: resolution.question };
  if (resolution.kind === 'existing') {
    return {
      mode: 'agent', status: 'existing_config', configPath: resolution.configPath, configuredStores: resolution.configuredStores,
      question: {
        field: 'existingConfig', prompt: 'DashBye is already configured. Use it, change its stores, or reconfigure it?', kind: 'choice',
        default: 'use-existing', choices: [
          { label: 'Use existing configuration (recommended)', value: 'use-existing' },
          { label: 'Change stores', value: 'change-stores' },
          { label: 'Reconfigure', value: 'reconfigure' },
        ],
      },
      actions: {
        useExisting: ['dashbye', 'validate', '--config', resolution.configPath],
        changeStoresWith: ['--stores', '<comma-separated stores>'],
        reconfigureWith: ['--overwrite'],
      },
    };
  }
  return {
    mode: 'agent', status: 'ready',
    preview: { configPath: resolution.configPath, releasePath: resolve(resolution.setup.resources, 'release.yml'), config: serializeConfig(resolution.setup, resolution.configPath) },
    writeCommand: writeCommand(resolution.options),
    options: resolution.options,
  };
}

async function promptValue(question: string, fallback: string | undefined): Promise<string> {
  const cli = createInterface({ input, output });
  try {
    const answer = (await cli.question(`${question}${fallback ? ` [${fallback}]` : ''}: `)).trim();
    return answer || fallback || '';
  } finally {
    cli.close();
  }
}

async function writeNew(path: string, content: string, overwrite: boolean): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  if (!overwrite && await exists(path)) return;
  await writeFile(path, content, { flag: overwrite ? 'w' : 'wx', mode: 0o600 });
}

function releaseTemplate(language: string, targets: Targets) {
  return {
    schema: 'dashbye/release/v1',
    listing: {
      defaultLanguage: language,
      category: 'Tools',
      locales: { [language]: { description: 'listing/description.txt', screenshots: [], promoVideoUrl: null } },
      assets: { icon: 'assets/icon-128.png', smallPromo: null, marqueePromo: null },
      globalScreenshots: [],
      globalPromoVideoUrl: null,
      officialUrl: null,
      homepageUrl: null,
      supportUrl: null,
      matureContent: false,
    },
    privacy: {
      singlePurpose: 'REPLACE WITH THE IMPLEMENTED SINGLE PURPOSE',
      permissionJustifications: {},
      hostPermissionJustification: null,
      remoteCode: { uses: false, justification: null },
      collectedData: [],
      certifications: { noSaleOrTransfer: false, relatedToSinglePurpose: false, noCreditworthinessUse: false },
      policyUrl: 'https://example.com/privacy',
    },
    ...(targets.firefox ? { stores: { firefox: { summary: 'REPLACE WITH THE AMO SUMMARY (AT MOST 250 CHARACTERS)', categories: [] } } } : {}),
  };
}

async function askInTerminal(question: AgentInitQuestion): Promise<string> {
  if (question.error) output.write(`${question.error}\n`);
  if (question.choices?.length && question.kind !== 'url') {
    output.write(question.choices.map(choice => `  ${choice.value === choice.label ? choice.value : `${choice.value.padEnd(8)} ${choice.label}`}`).join('\n') + '\n');
  }
  const answer = await promptValue(question.prompt, question.default);
  if (!answer) throw new Error(`${question.prompt} is required`);
  return answer;
}

export async function initialize(options: InitOptions) {
  const interactive = !options.nonInteractive && input.isTTY && output.isTTY;
  let current: InitInput = { ...options };
  for (;;) {
    const resolution = await resolveInit(current);
    if (resolution.kind === 'question') {
      if (!interactive) throw new Error(`${resolution.question.error ?? resolution.question.prompt} (${resolution.question.flag})`);
      current = { ...current, [resolution.question.field]: await askInTerminal(resolution.question) };
      continue;
    }
    if (resolution.kind === 'existing') {
      if (!interactive) return { configPath: resolution.configPath, reusedExisting: true, createdTemplates: false };
      const choice = await promptValue('Existing DashBye configuration found. Use it, change stores, or reconfigure? (use/stores/reconfigure)', 'use');
      if (/^(?:u|use)$/i.test(choice)) return { configPath: resolution.configPath, reusedExisting: true, createdTemplates: false };
      if (/^(?:s|stores|change)$/i.test(choice)) {
        current = { ...current, stores: await promptValue(`Stores to manage (${STORE_IDS.join(', ')})`, resolution.configuredStores.join(',')) };
        continue;
      }
      if (!/^(?:r|reconfigure)$/i.test(choice)) throw new Error('choose use, stores, or reconfigure');
      current = { ...current, overwrite: true };
      continue;
    }
    const config = serializeConfig(resolution.setup, resolution.configPath);
    if (interactive) {
      output.write(`\nConfiguration preview\n${YAML.stringify(config)}\n`);
      const confirmed = await promptValue('Write this configuration and any missing resource templates? (yes/no)', 'yes');
      if (!/^(?:y|yes)$/i.test(confirmed)) throw new Error('initialization cancelled');
    }
    await writeNew(resolution.configPath, YAML.stringify(config), current.overwrite || resolution.change);
    const { resources, targets } = resolution.setup;
    const releasePath = resolve(resources, 'release.yml');
    const releaseExisted = await exists(releasePath);
    const language = targets.chrome?.language ?? targets.edge?.language ?? 'English';
    await writeNew(releasePath, YAML.stringify(releaseTemplate(language, targets)), false);
    await writeNew(resolve(resources, 'listing/description.txt'), 'Replace with the detailed store description.\n', false);
    const notes = releaseExisted && targets.firefox ? ['Add stores.firefox.summary to release.yml for Firefox Add-ons.'] : [];
    return { configPath: resolution.configPath, releasePath, stores: Object.keys(targets), createdTemplates: !releaseExisted, notes };
  }
}
