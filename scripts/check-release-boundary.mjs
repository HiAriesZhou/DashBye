import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourcePath = fileURLToPath(new URL('../src/', import.meta.url));
const files = (await readdir(sourcePath, { recursive: true })).filter(file => file.endsWith('.ts'));
const forbidden = [
  // Dashboard and Partner Center buttons that submit, publish, or remove an item.
  /getByRole\([^\n]+name:\s*['"`]Submit for review/i,
  /getByRole\([^\n]+name:\s*['"`]Publish/i,
  /getByRole\([^\n]+name:\s*['"`]Archive/i,
  /getByRole\([^\n]+name:\s*['"`]Delete/i,
  // AMO: creating a version submits it for review; metadata and preview edits go live.
  /addons\/addon\/[^'"`\n]*\/versions/,
  /\/previews\//,
  /method:\s*['"`](?:PATCH|PUT|DELETE)['"`]/,
  // Edge Add-ons API: only the draft package endpoint is allowed, never publishing.
  /\/submissions(?!\/draft)/,
];

for (const file of files) {
  const text = await readFile(join(sourcePath, file), 'utf8');
  for (const pattern of forbidden) {
    if (pattern.test(text)) throw new Error(`${relative(sourcePath, join(sourcePath, file))} crosses the draft-only release boundary (${pattern})`);
  }
}

console.log(`Draft-only release boundary check passed (${files.length} files).`);
