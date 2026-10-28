import fs from 'node:fs/promises';
import path from 'node:path';
import type { APIRoute } from 'astro';
import sharp from 'sharp';

// Served at the conventional root path, without a content hash, so devices and other
// sites can rely on /apple-touch-icon.png across builds. Base.astro links the same file.
const TOUCH_ICON_SIZE = 180;

export const GET: APIRoute = async () => {
  const iconPath = path.join(process.cwd(), '..', 'brand', 'dashbye-icon.png');
  const source = await fs.readFile(iconPath).catch((error) => {
    throw new Error(`DashBye icon is missing at ${iconPath}: ${error.message}`);
  });
  const icon = await sharp(source).resize(TOUCH_ICON_SIZE, TOUCH_ICON_SIZE, { fit: 'cover' }).png().toBuffer();
  return new Response(new Uint8Array(icon), { headers: { 'Content-Type': 'image/png' } });
};
