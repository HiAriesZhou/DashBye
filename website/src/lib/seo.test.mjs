import assert from 'node:assert/strict';
import { test } from 'node:test';
import { serializeSoftwareApplication } from './seo.mjs';

const page = {
  description: 'A local CLI for browser extension releases.',
  url: 'https://dashbye.lol/zh/',
  image: 'https://dashbye.lol/_astro/dashbye-launch.png',
  author: 'https://x.com/AriesZhou',
  repository: 'https://github.com/HiAriesZhou/DashBye',
};

test('software metadata uses the page canonical and public author and repository', () => {
  assert.deepEqual(JSON.parse(serializeSoftwareApplication(page)), {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'DashBye',
    description: page.description,
    url: page.url,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS, Windows, Linux',
    image: page.image,
    sameAs: [page.repository],
    author: { '@type': 'Person', name: 'AriesZhou', url: page.author },
  });
});

test('software metadata escapes markup without changing the JSON value', () => {
  const description = '</script><script>alert("example")</script>';
  const serialized = serializeSoftwareApplication({ ...page, description });
  assert.ok(!serialized.includes('<'));
  assert.equal(JSON.parse(serialized).description, description);
});
