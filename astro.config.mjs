// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// `site` drives canonical URLs, OG tags and sitemap.xml. It MUST match the
// hostname the site is actually served from, including the www prefix —
// hudjee.com 301-redirects to www.hudjee.com, so www is the canonical host.
// Getting this wrong points search engines at a domain that isn't yours and
// the site never enters the index.
export default defineConfig({
  site: 'https://www.hudjee.com',
  output: 'static',
  integrations: [
    sitemap({
      // Single-page site for now; drop /privacy from the sitemap only if the
      // page is removed.
      changefreq: 'weekly',
      priority: 0.7,
      lastmod: new Date(),
    }),
  ],
  // The page is one screen of markup; inlining CSS removes a render-blocking
  // request and is a straight LCP win at this size.
  build: { inlineStylesheets: 'always' },
});
