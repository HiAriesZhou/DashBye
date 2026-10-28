const REPOSITORY_BLOB = 'https://github.com/HiAriesZhou/DashBye/blob/main';
const GUIDE_PAGES = { 'docs/usage.md': '/docs/', 'docs/usage.zh-CN.md': '/zh/docs/' };

// Links in docs/*.md are relative to docs/ on GitHub. On the site the usage guides
// have their own pages and every other file is read on GitHub.
export function rewriteDocHref(href) {
  if (href.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
  const hashAt = href.indexOf('#');
  const path = hashAt === -1 ? href : href.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : href.slice(hashAt);
  const resolved = new URL(path, 'https://repo.invalid/docs/').pathname.slice(1);
  const page = GUIDE_PAGES[resolved];
  return page ? `${page}${hash}` : `${REPOSITORY_BLOB}/${resolved}${hash}`;
}
