import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractAgentPrompt } from './readme.mjs';

// Builds run from website/ (npm scripts and Vercel's root directory); the bundle moves
// this module, so paths are resolved from the working directory, not import.meta.url.
const read = (path: string) => readFileSync(resolve(process.cwd(), '..', path), 'utf8');

export const version: string = JSON.parse(read('package.json')).version;

export const agentPrompt = {
  en: extractAgentPrompt(read('README.md'), 'Quick start with your agent'),
  zh: extractAgentPrompt(read('README.zh-CN.md'), '交给 Agent 快速上手'),
};

export const links = {
  github: 'https://github.com/HiAriesZhou/DashBye',
  npm: 'https://www.npmjs.com/package/dashbye',
  license: 'https://github.com/HiAriesZhou/DashBye/blob/main/LICENSE',
  brand: 'https://github.com/HiAriesZhou/DashBye/blob/main/TRADEMARK.md',
  validation: 'https://github.com/HiAriesZhou/DashBye/blob/main/docs/validation.md',
  security: 'https://github.com/HiAriesZhou/DashBye/blob/main/docs/security.md',
  schema: 'https://github.com/HiAriesZhou/DashBye/blob/main/docs/store-schema.md',
  author: { en: 'https://www.arieszhou.com/', zh: 'https://www.arieszhou.com/zh/' },
};
