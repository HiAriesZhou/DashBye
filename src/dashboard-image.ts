import type { Locator } from 'playwright-core';

// Dashboard previews are lossy WebP renditions from Google's image service
// (`=w320-h200-rw` for a 1280x800 screenshot, `=s256-rw` for the icon). Fingerprints
// of those renditions drifted up to 0.032 from unchanged sources, above the 0.025
// redesign tolerance. The same service returns the stored upload for `=s0`, which
// compared pixel-identical, so DashBye fingerprints that instead of the preview.
const imageServiceHost = /^lh\d+\.googleusercontent\.com$/;
const sizeOptions = /=[\w-]*$/;
const maximumImageBytes = 16 * 1024 * 1024;
const fetchTimeout = 30_000;

// Returns the URL of the stored original, or null for a source DashBye does not
// recognise. blob: and data: sources are local upload previews and already hold the
// uploaded bytes.
export function originalImageSource(source: string): string | null {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return null;
  }
  if (url.protocol === 'blob:' || (url.protocol === 'data:' && /^image\//.test(url.pathname))) return source;
  if (url.protocol !== 'https:' || !imageServiceHost.test(url.hostname) || url.search || url.hash) return null;
  url.pathname = `${url.pathname.replace(sizeOptions, '')}=s0`;
  return url.toString();
}

// Fetches through the page so the request uses the browser's own network settings.
// Error messages never include the image URL.
export async function readOriginalImage(image: Locator): Promise<Buffer> {
  const rendered = await image.evaluate(element => {
    const img = element as HTMLImageElement;
    return img.currentSrc || img.src;
  });
  const source = originalImageSource(rendered);
  if (!source) throw new Error('Dashboard image source is not a recognised store image; stopping instead of comparing a preview');
  const result = await image.evaluate(async (_, options) => {
    try {
      const response = await fetch(options.source, { credentials: 'omit', signal: AbortSignal.timeout(options.timeout) });
      if (!response.ok) return { error: `HTTP ${response.status}` };
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) return { error: 'response is not an image' };
      if (blob.size > options.limit) return { error: 'image is too large' };
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(blob);
      });
      return { data: dataUrl.slice(dataUrl.indexOf(',') + 1) };
    } catch (error) {
      return { error: error instanceof Error ? error.name : 'fetch failed' };
    }
  }, { source, limit: maximumImageBytes, timeout: fetchTimeout });
  if (!('data' in result) || !result.data) throw new Error(`Dashboard image could not be read: ${result.error ?? 'empty response'}`);
  return Buffer.from(result.data, 'base64');
}
