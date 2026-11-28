/**
 * The pre-paint script that BaseLayout.astro inlines in <head>. It marks JS support (removes
 * `no-js`), sets `html[data-theme]` and both theme metas (a valid stored choice, else the system;
 * keep in sync with resolveTheme() in theme.ts, which tests/theme.test.ts covers), and decides
 * whether the hero intro plays (once per session, never with reduced motion; the safety net never
 * leaves the hero in its pre-intro state if scripts fail). Blocked storage falls back to the
 * system theme and the composed hero.
 *
 * It is a fixed string, not an `is:inline define:vars` script, because the Content-Security-Policy
 * must carry its hash: Astro does not hash inline scripts itself, so astro.config.mjs hashes this
 * exact text (scriptDirective.hashes) and tests/security.test.ts checks that it does.
 */
import { THEME_COLORS, THEME_STORAGE_KEY } from './theme';

export const THEME_BOOT_SCRIPT = `(function () {
  const themeKey = ${JSON.stringify(THEME_STORAGE_KEY)};
  const themeColors = ${JSON.stringify(THEME_COLORS)};
  const d = document.documentElement;
  d.classList.remove('no-js');

  let stored = null;
  try {
    stored = localStorage.getItem(themeKey);
  } catch {}
  const theme =
    stored === 'light' || stored === 'dark'
      ? stored
      : matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  d.setAttribute('data-theme', theme);
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute('content', themeColors[theme]);
  const colorScheme = document.querySelector('meta[name="color-scheme"]');
  if (colorScheme) colorScheme.setAttribute('content', theme);

  try {
    if (
      !sessionStorage.getItem('dt-hero-played') &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      d.classList.add('hero-intro');
      setTimeout(function () {
        d.classList.remove('hero-intro');
      }, 4000);
    }
  } catch {}
})();`;
