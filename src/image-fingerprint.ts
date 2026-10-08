import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const signatureSize = 16;
const signatureBytes = signatureSize * signatureSize * 3;
const maximumMeanDifference = 0.012;

// Screenshots need finer detail: a UI redesign changes thin lines and text that a
// 16x16 colour average cannot see. v3 keeps a 64x40 greyscale signature (the 16:10
// store screenshot ratio) and compares the worst 8x8 block instead of the global
// mean. Calibrated on Dashboard thumbnails (160x100 CSS px) against local sources:
// re-encoding noise peaked at 0.0155, a Settings redesign measured 0.0357 or more.
const detailWidth = 64;
const detailHeight = 40;
const detailBlock = 8;
const maximumBlockDifference = 0.025;

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

export async function detailHash(input: Uint8Array): Promise<string> {
  const pixels = await sharp(input)
    .flatten({ background: '#ffffff' })
    .resize(detailWidth, detailHeight, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer();
  return `v3:${pixels.toString('base64url')}`;
}

export async function detailHashFile(path: string): Promise<string> {
  return detailHash(await readFile(path));
}

function detailSignature(value: string): Buffer | null {
  if (!value.startsWith('v3:')) return null;
  const pixels = Buffer.from(value.slice(3), 'base64url');
  return pixels.length === detailWidth * detailHeight ? pixels : null;
}

function blockDifference(left: Buffer, right: Buffer): number {
  let worst = 0;
  for (let top = 0; top < detailHeight; top += detailBlock) {
    for (let start = 0; start < detailWidth; start += detailBlock) {
      let sum = 0;
      for (let y = top; y < top + detailBlock; y += 1) {
        for (let x = start; x < start + detailBlock; x += 1) {
          const index = y * detailWidth + x;
          sum += Math.abs(left[index]! - right[index]!);
        }
      }
      worst = Math.max(worst, sum / (detailBlock * detailBlock) / 255);
    }
  }
  return worst;
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
  const leftDetail = detailSignature(left);
  const rightDetail = detailSignature(right);
  if (leftDetail && rightDetail) return blockDifference(leftDetail, rightDetail);
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
  const tolerance = left.startsWith('v3:') && right.startsWith('v3:') ? maximumBlockDifference : maximumMeanDifference;
  return visualDifference(left, right) <= tolerance;
}
