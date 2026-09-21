import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

export async function visualHash(input: Uint8Array): Promise<string> {
  const pixels = await sharp(input)
    .flatten({ background: '#ffffff' })
    .resize(8, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer();
  const average = pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
  let bits = '';
  for (const value of pixels) bits += value >= average ? '1' : '0';
  return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
}

export async function visualHashFile(path: string): Promise<string> {
  return visualHash(await readFile(path));
}

export function hammingDistance(left: string, right: string): number {
  const xor = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let value = xor;
  let count = 0;
  while (value) {
    count += Number(value & 1n);
    value >>= 1n;
  }
  return count;
}

export function visuallyEqual(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return left === right;
  return hammingDistance(left, right) <= 8;
}
