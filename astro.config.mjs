// @ts-check
import { rm } from 'node:fs/promises';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { hiddenSections } from './src/data/site.ts';

// The live domain (Cloudflare Worker `diatyposi`): canonical links, sitemap, structured data.
const SITE_URL = 'https://diatyposi.com';

/**
 * Pages of the sections still under development (`hiddenSections` in src/data/site.ts). They are
 * served by `astro dev` for previewing, but left out of the sitemap and deleted from the build, so
 * the live site answers them with its 404 page.
 */
const hiddenPages = hiddenSections.work ? ['/erga/'] : [];

/** @type {import('astro').AstroIntegration} */
const dropHiddenPages = {
  name: 'drop-hidden-pages',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      for (const page of hiddenPages) {
        await rm(new URL(`.${page}`, dir), { recursive: true, force: true });
      }
    },
  },
};

export default defineConfig({
  site: SITE_URL,
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  i18n: {
    locales: ['el'],
    defaultLocale: 'el',
  },
  security: {
    // Content-Security-Policy, as a <meta> tag on every page. Astro adds the hash of every inline
    // <script> and <style> it renders, so only the site's own code runs. Style attributes
    // (style="--logo-bg: …") stay allowed; inline event handlers (onclick=…) do not. The headers
    // a <meta> policy cannot carry (frame-ancestors) are in public/_headers.
    csp: {
      directives: [
        "default-src 'self'",
        // data: for the CSS grain, tick and mask images.
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "manifest-src 'self'",
        // The contact page's Google map (maps.google.com redirects to www.google.com).
        'frame-src https://maps.google.com https://www.google.com',
        "worker-src 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        'upgrade-insecure-requests',
      ],
      styleDirective: {
        resources: ["'self'", { resource: "'unsafe-inline'", kind: 'attribute' }],
      },
    },
  },
  integrations: [
    sitemap({
      i18n: { defaultLocale: 'el', locales: { el: 'el' } },
      filter: (page) => !hiddenPages.some((hidden) => page.endsWith(hidden)),
    }),
    dropHiddenPages,
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
