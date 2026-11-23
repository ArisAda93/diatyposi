// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// TODO(owner): replace with the real domain before going live.
const SITE_URL = 'https://www.diatyposi.gr';

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
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
