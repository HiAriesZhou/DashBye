import { defineConfig } from 'astro/config';
import { rewriteDocHref } from './src/lib/doc-links.mjs';

// Rewrites relative links in docs/*.md (see doc-links.mjs) and opens off-site links in place.
function rehypeDocLinks() {
  const visit = node => {
    if (node.type === 'element' && node.tagName === 'a' && typeof node.properties?.href === 'string') {
      node.properties.href = rewriteDocHref(node.properties.href);
    }
    node.children?.forEach(visit);
  };
  return tree => visit(tree);
}

export default defineConfig({
  site: 'https://dashbye.lol',
  trailingSlash: 'always',
  markdown: {
    rehypePlugins: [rehypeDocLinks],
    shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } },
  },
});
