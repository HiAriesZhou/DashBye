import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

// The usage guides stay in docs/ for GitHub and npm readers; the site renders the same files.
export const collections = {
  guides: defineCollection({ loader: glob({ pattern: ['usage.md', 'usage.zh-CN.md'], base: '../docs' }) }),
};
