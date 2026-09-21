import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const signatureSize = 16;
const signatureBytes = signatureSize * signatureSize * 3;
const maximumMeanDifference = 0.012;

export async function visualHash(input: Uint8Array): Promise<string> {
  const pixels = await sharp(input)
    .flatten({ background: '#ffffff' })
    .resize(signatureSize, signatureSize, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer();
  return `v2:${pixels.toString('base64url')}`;
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

function signature(value: string): Buffer | null {
  if (!value.startsWith('v2:')) return null;
  const pixels = Buffer.from(value.slice(3), 'base64url');
  return pixels.length === signatureBytes ? pixels : null;
}

export function visualDifference(left: string, right: string): number {
  const leftPixels = signature(left);
  const rightPixels = signature(right);
  if (!leftPixels || !rightPixels) return left === right ? 0 : 1;
  let absoluteDifference = 0;
  for (let index = 0; index < leftPixels.length; index += 1) {
    absoluteDifference += Math.abs(leftPixels[index]! - rightPixels[index]!);
  }
  return absoluteDifference / leftPixels.length / 255;
}

export function visuallyEqual(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return left === right;
  return visualDifference(left, right) <= maximumMeanDifference;
}
