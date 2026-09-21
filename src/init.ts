import { access, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import YAML from 'yaml';
import { assertItemId, normalizeLoopbackEndpoint } from './security.js';
import { CONFIG_NAME } from './workspace.js';

export type InitOptions = {
  project?: string;
  artifact?: string;
  resources?: string;
  itemId?: string;
  language?: string;
  endpoint?: string;
  config?: string;
  nonInteractive: boolean;
  overwrite: boolean;
};

export type AgentInitQuestion = {
  field: 'project' | 'artifact' | 'resources' | 'itemId' | 'language' | 'endpoint' | 'existingConfig';
  prompt: string;
  kind: 'path' | 'text' | 'url' | 'choice';
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
  question: AgentInitQuestion;
  actions: {
    useExisting: string[];
    reconfigureWith: string[];
  };
} | {
  mode: 'agent';
  status: 'ready';
  preview: {
    configPath: string;
    releasePath: string;
    config: Record<string, unknown>;
  };
  writeCommand: string[];
};

async function promptValue(question: string, fallback: string | undefined): Promise<string> {
  const cli = createInterface({ input, output });
  try {
    const answer = (await cli.question(`${question}${fallback ? ` [${fallback}]` : ''}: `)).trim();
    return answer || fallback || '';
  } finally {
    cli.close();
  }
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(() => true).catch(() => false);
}

function createConfig(project: string, artifact: string, resources: string, itemId: string, language: string, endpoint: string, configPath: string) {
  return {
    schema: 'dashbye/config/v1',
    project: relative(dirname(configPath), project) || '.',
    artifact: relative(project, artifact),
    resources: relative(project, resources) || '.',
    target: { itemId, language, endpoint },
  };
}

async function artifactChoices(project: string): Promise<Array<{ label: string; value: string }>> {
  const known = ['release.zip', 'dist/release.zip', 'build/release.zip', 'manifest.json', 'dist/manifest.json', 'build/manifest.json'];
  const rootZips = await readdir(project, { withFileTypes: true })
    .then(entries => entries.filter(entry => entry.isFile() && entry.name.endsWith('.zip')).map(entry => entry.name))
    .catch(() => []);
  const candidates = [...new Set([...rootZips.sort(), ...known])];
  const available: Array<{ label: string; value: string }> = [];
  for (const candidate of candidates) {
    if (await exists(resolve(project, candidate))) available.push({ label: candidate, value: candidate });
  }
  return available;
}

function needsInput(question: AgentInitQuestion): AgentInitGuide {
  return { mode: 'agent', status: 'needs_input', question };
}

export async function guideInitialization(options: Omit<InitOptions, 'nonInteractive'>): Promise<AgentInitGuide> {
  if (!options.project) {
    const current = process.cwd();
    return needsInput({
      field: 'project', prompt: 'Which extension repository should DashBye configure?', kind: 'path', default: current,
      choices: [{ label: 'Current directory (recommended)', value: current }],
      validation: 'An existing directory that contains the extension project.',
    });
  }
  const project = resolve(options.project);
  const projectIsDirectory = await stat(project).then(result => result.isDirectory()).catch(() => false);
  if (!projectIsDirectory) {
    return needsInput({
      field: 'project', prompt: 'Which extension repository should DashBye configure?', kind: 'path',
      validation: 'An existing directory that contains the extension project.', error: 'The selected project directory does not exist.',
    });
  }
  const configPath = resolve(options.config ?? resolve(project, CONFIG_NAME));
  if (!options.overwrite && await exists(configPath)) {
    return {
      mode: 'agent', status: 'existing_config', configPath,
      question: {
        field: 'existingConfig', prompt: 'DashBye is already configured. Use the existing configuration or reconfigure it?', kind: 'choice',
        default: 'use-existing', choices: [
          { label: 'Use existing configuration (recommended)', value: 'use-existing' },
          { label: 'Reconfigure', value: 'reconfigure' },
        ],
      },
      actions: {
        useExisting: ['dashbye', 'validate', '--config', configPath],
        reconfigureWith: ['--overwrite'],
      },
    };
  }
  if (!options.artifact) {
    const choices = await artifactChoices(project);
    return needsInput({
      field: 'artifact', prompt: 'Which extension ZIP, build directory, or manifest should DashBye inspect?', kind: 'path',
      ...(choices.length ? { choices } : {}), validation: 'A path inside the project to a ZIP, build directory, or manifest.json.',
    });
  }
  const artifact = resolve(project, options.artifact);
  if (!await exists(artifact)) {
    return needsInput({
      field: 'artifact', prompt: 'Which extension ZIP, build directory, or manifest should DashBye inspect?', kind: 'path',
      choices: await artifactChoices(project), validation: 'A path inside the project to a ZIP, build directory, or manifest.json.',
      error: 'The selected artifact does not exist.',
    });
  }
  if (!options.resources) {
    return needsInput({
      field: 'resources', prompt: 'Where should this project keep its versioned Chrome Web Store resources?', kind: 'path', default: 'store',
      choices: [{ label: 'store (recommended)', value: 'store' }],
    });
  }
  if (!options.itemId) {
    return needsInput({
      field: 'itemId', prompt: 'What is the 32-character Chrome Web Store item ID?', kind: 'text',
      validation: 'Exactly 32 lowercase letters from a to p.',
    });
  }
  try {
    assertItemId(options.itemId);
  } catch (error) {
    return needsInput({
      field: 'itemId', prompt: 'What is the 32-character Chrome Web Store item ID?', kind: 'text',
      validation: 'Exactly 32 lowercase letters from a to p.', error: error instanceof Error ? error.message : 'Invalid item ID.',
    });
  }
  if (!options.language) {
    return needsInput({
      field: 'language', prompt: 'Which Dashboard language should DashBye manage?', kind: 'text', default: 'English – en (default)',
      choices: [{ label: 'English – en (default)', value: 'English – en (default)' }],
    });
  }
  if (!options.endpoint) {
    return needsInput({
      field: 'endpoint', prompt: 'Which dedicated Chrome debugging endpoint should DashBye use?', kind: 'url',
      default: 'http://127.0.0.1:9333', choices: [{ label: '127.0.0.1:9333 (recommended)', value: 'http://127.0.0.1:9333' }],
      validation: 'A loopback HTTP URL with an explicit port.',
    });
  }
  let endpoint: string;
  try {
    endpoint = normalizeLoopbackEndpoint(options.endpoint);
  } catch (error) {
    return needsInput({
      field: 'endpoint', prompt: 'Which dedicated Chrome debugging endpoint should DashBye use?', kind: 'url',
      default: 'http://127.0.0.1:9333', validation: 'A loopback HTTP URL with an explicit port.',
      error: error instanceof Error ? error.message : 'Invalid endpoint.',
    });
  }
  const resources = resolve(project, options.resources);
  const config = createConfig(project, artifact, resources, options.itemId, options.language, endpoint, configPath);
  const writeCommand = [
    'dashbye', 'init', '--project', project, '--artifact', artifact, '--resources', resources,
    '--item-id', options.itemId, '--language', options.language, '--endpoint', endpoint,
    '--config', configPath, '--non-interactive', ...(options.overwrite ? ['--overwrite'] : []),
  ];
  return {
    mode: 'agent', status: 'ready',
    preview: { configPath, releasePath: resolve(resources, 'release.yml'), config },
    writeCommand,
  };
}

async function writeNew(path: string, content: string, overwrite: boolean): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  if (!overwrite && await exists(path)) return;
  await writeFile(path, content, { flag: overwrite ? 'w' : 'wx', mode: 0o600 });
}

export async function initialize(options: InitOptions) {
  const interactive = !options.nonInteractive && input.isTTY && output.isTTY;
  const choose = async (provided: string | undefined, question: string, fallback?: string) => {
    if (provided) return provided;
    if (!interactive) throw new Error(`${question.toLowerCase()} is required in non-interactive mode`);
    const value = await promptValue(question, fallback);
    if (!value) throw new Error(`${question.toLowerCase()} is required`);
    return value;
  };
  const project = resolve(await choose(options.project, 'Project path', process.cwd()));
  const configPath = resolve(options.config ?? resolve(project, CONFIG_NAME));
  let overwrite = options.overwrite;
  if (interactive && !overwrite && await exists(configPath)) {
    const existing = await promptValue('Existing DashBye configuration found. Use it or reconfigure? (use/reconfigure)', 'use');
    if (/^(?:u|use)$/i.test(existing)) return { configPath, reusedExisting: true };
    if (!/^(?:r|reconfigure)$/i.test(existing)) throw new Error('choose use or reconfigure');
    overwrite = true;
  }
  const detectedArtifacts = interactive ? await artifactChoices(project) : [];
  if (detectedArtifacts.length) {
    output.write(`Detected artifacts:\n${detectedArtifacts.map(candidate => `  - ${candidate.value}`).join('\n')}\n`);
  }
  const artifact = resolve(project, await choose(
    options.artifact,
    'Artifact ZIP, directory, or manifest',
    detectedArtifacts.length === 1 ? detectedArtifacts[0]!.value : undefined,
  ));
  const resources = resolve(project, await choose(options.resources, 'Release resources path', 'store'));
  const itemId = await choose(options.itemId, 'Chrome Web Store item ID');
  const language = await choose(options.language, 'Default Dashboard language', 'English – en (default)');
  const endpoint = await choose(options.endpoint, 'Chrome debugging endpoint', 'http://127.0.0.1:9333');
  const config = createConfig(project, artifact, resources, assertItemId(itemId), language, normalizeLoopbackEndpoint(endpoint), configPath);
  if (interactive) {
    output.write(`\nConfiguration preview\n${YAML.stringify(config)}\n`);
    const confirmed = await promptValue('Write this configuration and any missing resource templates? (yes/no)', 'yes');
    if (!/^(?:y|yes)$/i.test(confirmed)) throw new Error('initialization cancelled');
  }
  await writeNew(configPath, YAML.stringify(config), overwrite);

  const releasePath = resolve(resources, 'release.yml');
  const releaseTemplate = {
    schema: 'dashbye/release/v1',
    listing: {
      defaultLanguage: language,
      category: 'Tools',
      locales: {
        [language]: {
          description: 'listing/description.txt',
          screenshots: [],
          promoVideoUrl: null,
        },
      },
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
      certifications: {
        noSaleOrTransfer: false,
        relatedToSinglePurpose: false,
        noCreditworthinessUse: false,
      },
      policyUrl: 'https://example.com/privacy',
    },
  };
  const releaseExisted = await exists(releasePath);
  await writeNew(releasePath, YAML.stringify(releaseTemplate), false);
  await writeNew(resolve(resources, 'listing/description.txt'), 'Replace with the detailed store description.\n', false);
  return { configPath, releasePath, createdTemplates: !releaseExisted };
}
