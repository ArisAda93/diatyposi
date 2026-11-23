// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// The live domain (Cloudflare Worker `diatyposi`): canonical links, sitemap, structured data.
const SITE_URL = 'https://diatyposi.com';

export default defineConfig({
  site: SITE_URL,
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  i18n: {
    locales: ['el'],
    defaultLocale: 'el',
  },
  integrations: [
    sitemap({
      i18n: { defaultLocale: 'el', locales: { el: 'el' } },
      // /erga/ is hidden while under development. Keep in step with hiddenSections.work in
      // src/data/site.ts: remove this filter when the flag goes back to false.
      filter: (page) => !page.endsWith('/erga/'),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
