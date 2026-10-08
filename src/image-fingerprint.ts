import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const signatureSize = 16;
const signatureBytes = signatureSize * signatureSize * 3;
const maximumMeanDifference = 0.012;

// Screenshots need finer detail: a UI redesign changes thin lines and text that a
// 16x16 colour average cannot see. v4 pairs a 64x40 greyscale signature (the 16:10
// store screenshot ratio), compared by its worst 8x8 block, with the 16x16 colour
// signature, compared by its mean. Both must match: greyscale alone misses a
// colour-only change at similar luminance. Block tolerance calibrated on Dashboard
// thumbnails (160x100 CSS px) against local sources: re-encoding noise peaked at
// 0.0155, a Settings redesign measured 0.0357 or more.
const detailWidth = 64;
const detailHeight = 40;
const detailBlock = 8;
const detailBytes = detailWidth * detailHeight;
const maximumBlockDifference = 0.025;

function colourSignature(input: Uint8Array): Promise<Buffer> {
  return sharp(input)
    .flatten({ background: '#ffffff' })
    .resize(signatureSize, signatureSize, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer();
}

export async function visualHash(input: Uint8Array): Promise<string> {
  return `v2:${(await colourSignature(input)).toString('base64url')}`;
}

export async function visualHashFile(path: string): Promise<string> {
  return visualHash(await readFile(path));
}

export async function detailHash(input: Uint8Array): Promise<string> {
  const [detail, colour] = await Promise.all([
    sharp(input)
      .flatten({ background: '#ffffff' })
      .resize(detailWidth, detailHeight, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer(),
    colourSignature(input),
  ]);
  return `v4:${Buffer.concat([detail, colour]).toString('base64url')}`;
}

export async function detailHashFile(path: string): Promise<string> {
  return detailHash(await readFile(path));
}

function detailSignature(value: string): { detail: Buffer; colour: Buffer } | null {
  if (!value.startsWith('v4:')) return null;
  const pixels = Buffer.from(value.slice(3), 'base64url');
  if (pixels.length !== detailBytes + signatureBytes) return null;
  return { detail: pixels.subarray(0, detailBytes), colour: pixels.subarray(detailBytes) };
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

function meanDifference(left: Buffer, right: Buffer): number {
  let absoluteDifference = 0;
  for (let index = 0; index < left.length; index += 1) {
    absoluteDifference += Math.abs(left[index]! - right[index]!);
  }
  return absoluteDifference / left.length / 255;
}

// Mean difference between two coarse (v2) fingerprints; other formats compare by identity.
export function visualDifference(left: string, right: string): number {
  const leftPixels = signature(left);
  const rightPixels = signature(right);
  if (!leftPixels || !rightPixels) return left === right ? 0 : 1;
  return meanDifference(leftPixels, rightPixels);
}

export function visuallyEqual(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return left === right;
  const leftDetail = detailSignature(left);
  const rightDetail = detailSignature(right);
  if (leftDetail && rightDetail) {
    return blockDifference(leftDetail.detail, rightDetail.detail) <= maximumBlockDifference
      && meanDifference(leftDetail.colour, rightDetail.colour) <= maximumMeanDifference;
  }
  return visualDifference(left, right) <= maximumMeanDifference;
}
