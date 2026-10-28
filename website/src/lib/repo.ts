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

// Star count for the hero link, read once at build time so visitors never contact GitHub.
// The link still works without it.
async function readStars(): Promise<number | null> {
  try {
    const response = await fetch('https://api.github.com/repos/HiAriesZhou/DashBye', {
      headers: { accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const { stargazers_count: count } = await response.json() as { stargazers_count?: unknown };
    return typeof count === 'number' ? count : null;
  } catch {
    return null;
  }
}

export const stars = await readStars();

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
