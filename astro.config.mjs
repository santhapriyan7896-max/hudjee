// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Update `site` to your real domain before deploying — it drives
// canonical URLs, OG tags and sitemap.xml.
export default defineConfig({
  site: 'https://hudjee.app',
  output: 'static',
  integrations: [sitemap()],
  // The page is one screen of markup; inlining CSS removes a render-blocking
  // request and is a straight LCP win at this size.
  build: { inlineStylesheets: 'always' },
});
