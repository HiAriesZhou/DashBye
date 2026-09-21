import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceDir = new URL('../src/', import.meta.url);
const sourcePath = fileURLToPath(sourceDir);
const files = (await readdir(sourceDir)).filter(file => file.endsWith('.ts'));
const forbidden = [
  /getByRole\([^\n]+name:\s*['"`]Submit for review/i,
  /getByRole\([^\n]+name:\s*['"`]Publish/i,
  /getByRole\([^\n]+name:\s*['"`]Archive/i,
  /getByRole\([^\n]+name:\s*['"`]Delete/i,
];

for (const file of files) {
  const text = await readFile(join(sourcePath, file), 'utf8');
  for (const pattern of forbidden) {
    if (pattern.test(text)) throw new Error(`${file} crosses the draft-only release boundary`);
  }
}

console.log('Draft-only release boundary check passed.');
