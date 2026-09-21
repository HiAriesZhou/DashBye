import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import YAML from 'yaml';
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
  const artifact = resolve(project, await choose(options.artifact, 'Artifact ZIP, directory, or manifest'));
  const resources = resolve(project, await choose(options.resources, 'Release resources path', 'store'));
  const itemId = await choose(options.itemId, 'Chrome Web Store item ID');
  const language = await choose(options.language, 'Default Dashboard language', 'English – en (default)');
  const endpoint = await choose(options.endpoint, 'Chrome debugging endpoint', 'http://127.0.0.1:9333');
  const configPath = resolve(options.config ?? resolve(project, CONFIG_NAME));
  const config = {
    schema: 'dashbye/config/v1',
    project: relative(dirname(configPath), project) || '.',
    artifact: relative(project, artifact),
    resources: relative(project, resources) || '.',
    target: { itemId, language, endpoint },
  };
  await writeNew(configPath, YAML.stringify(config), options.overwrite);

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
