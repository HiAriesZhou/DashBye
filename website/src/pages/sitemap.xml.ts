import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const routes = [
    '/', '/zh/', '/docs/', '/zh/docs/',
  ];
  const urls = routes.map(route => `<url><loc>${new URL(route, site).href}</loc></url>`).join('');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
};
