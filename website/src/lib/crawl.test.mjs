import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('sitemap covers every indexable route in both locales using the primary domain', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', `
    const { GET } = await import('./src/pages/sitemap.xml.ts');
    const response = await GET({ site: new URL('https://dashbye.lol') });
    console.log(JSON.stringify({ status: response.status, type: response.headers.get('Content-Type'), xml: await response.text() }));
  `], { cwd: root });
  const { status, type, xml } = JSON.parse(stdout);
  assert.equal(status, 200);
  assert.equal(type, 'application/xml; charset=utf-8');
  assert.match(xml, /<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  const files = await readdir(new URL('../pages/', import.meta.url), { recursive: true });
  const expected = files.filter(file => file.endsWith('.astro') && file !== '404.astro').map(file => {
    const route = `/${file.replace(/index\.astro$/, '').replace(/\.astro$/, '/')}`;
    return new URL(route, 'https://dashbye.lol').href;
  });
  assert.deepEqual(urls.sort(), expected.sort());
});

test('robots allows crawling and points to the primary sitemap', async () => {
  const robots = await readFile(new URL('../../public/robots.txt', import.meta.url), 'utf8');
  assert.equal(robots, 'User-agent: *\nAllow: /\n\nSitemap: https://dashbye.lol/sitemap.xml\n');
});
