import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourcePath = fileURLToPath(new URL('../src/', import.meta.url));
const files = (await readdir(sourcePath, { recursive: true })).filter(file => file.endsWith('.ts'));
// AMO: creating a version submits it for review; metadata edits go live.
const amoVersions = /addons\/addon\/[^'"`\n]*\/versions/;
const amoWrite = /method:\s*['"`](?:PATCH|PUT|DELETE)['"`]/;
const forbidden = [
  // Dashboard and Partner Center buttons that submit, publish, or remove an item.
  /getByRole\([^\n]+name:\s*['"`]Submit for review/i,
  /getByRole\([^\n]+name:\s*['"`]Publish/i,
  /getByRole\([^\n]+name:\s*['"`]Archive/i,
  /getByRole\([^\n]+name:\s*['"`]Delete/i,
  amoVersions,
  /\/previews\//,
  amoWrite,
  /method:\s*['"`](?:PUT|DELETE)['"`]/,
  // Edge Add-ons API: only the draft package endpoint is allowed, never publishing.
  /\/submissions(?!\/draft)/,
];
// AMO has no draft, so the approved `dashbye submit` path and the post-approval
// listing update live in one module, which may create versions and edit metadata.
// It still may not touch previews, delete anything, or reach Edge publishing.
const exceptions = { [join('stores', 'firefox', 'amo-write.ts')]: [amoVersions, amoWrite] };

for (const file of files) {
  const text = await readFile(join(sourcePath, file), 'utf8');
  const allowed = exceptions[file] ?? [];
  for (const pattern of forbidden) {
    if (allowed.includes(pattern)) continue;
    if (pattern.test(text)) throw new Error(`${relative(sourcePath, join(sourcePath, file))} crosses the draft-only release boundary (${pattern})`);
  }
}
for (const file of Object.keys(exceptions)) {
  if (!files.includes(file)) throw new Error(`boundary exception names a missing file: ${file}`);
}

console.log(`Draft-only release boundary check passed (${files.length} files).`);
