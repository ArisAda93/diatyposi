/**
 * Light and dark theme.
 *
 * Contract (shared with every theme-aware component and canvas script):
 * - `html[data-theme="light"|"dark"]` is set before first paint by the inline script in
 *   BaseLayout.astro (stored choice under `dt-theme`, else `prefers-color-scheme`). Without JS the
 *   attribute is missing and the page is light (global.css keys every dark rule on the attribute).
 * - After every change, `document` receives `dt:themechange` with `detail.theme`. Canvas scripts
 *   read `document.documentElement.dataset.theme` (or `currentTheme()`) and listen for the event.
 * - The page follows system changes only while nothing is stored.
 *
 * Toggles are any `[data-theme-toggle]` button (ThemeToggle.astro). `aria-pressed` means "dark
 * theme on"; `[data-theme-state]` inside a toggle shows the state word from its `data-on` /
 * `data-off` attributes. The switch is a circular reveal from the toggle's centre where the View
 * Transitions API exists and motion is allowed (global.css: `html.theme-vt`), otherwise instant.
 *
 * The pure helpers at the top are unit-tested (tests/theme.test.ts) and run in Node.
 */

export type Theme = 'light' | 'dark';

export interface ThemeChangeDetail {
  theme: Theme;
}

declare global {
  interface DocumentEventMap {
    'dt:themechange': CustomEvent<ThemeChangeDetail>;
  }
}

/** localStorage key of the visitor's explicit choice. */
export const THEME_STORAGE_KEY = 'dt-theme';
/** Event dispatched on `document` after every theme change. */
export const THEME_EVENT = 'dt:themechange';
/** Length of the circular reveal (global.css `theme-reveal`). */
export const THEME_REVEAL_MS = 500;

/**
 * The flipping palette of both themes (WCAG pairs in tests/theme.test.ts; the test also checks
 * that global.css declares exactly these values in `@theme`, `.tokens-light` and the dark block).
 */
export const PALETTE = {
  light: {
    paper: '#FAFAF7',
    paper2: '#F1EFE8',
    line: '#DCD9CF',
    key: '#221F20',
    muted: '#5A5650',
    red: '#C03529',
    ink: '#161514',
    ink2: '#23211F',
    inkLine: '#3A3733',
    inkMuted: '#ABA79E',
  },
  dark: {
    paper: '#141311',
    paper2: '#1C1A18',
    line: '#34312C',
    key: '#F2EFE8',
    muted: '#ADA89F',
    red: '#F26A5B',
    ink: '#0B0A09',
    ink2: '#171513',
    inkLine: '#2E2A26',
    inkMuted: '#ABA79E',
  },
} as const satisfies Record<Theme, Record<string, string>>;

/** `<meta name="theme-color">` per theme: the page paper. */
export const THEME_COLORS: Record<Theme, string> = {
  light: PALETTE.light.paper,
  dark: PALETTE.dark.paper,
};

/** A stored value as a theme, or null when it is missing or not a theme. */
export const parseStoredTheme = (value: unknown): Theme | null =>
  value === 'light' || value === 'dark' ? value : null;

/**
 * The theme to show: a valid stored choice wins, else the system preference. The inline
 * pre-paint script in BaseLayout.astro repeats this decision; keep the two in sync.
 */
export const resolveTheme = (stored: unknown, systemDark: boolean): Theme =>
  parseStoredTheme(stored) ?? (systemDark ? 'dark' : 'light');

/** The theme a toggle switches to. */
export const nextTheme = (theme: Theme): Theme => (theme === 'dark' ? 'light' : 'dark');

/** Radius (px) of a circle at (x, y) that covers a w × h viewport to its farthest corner. */
export const revealRadius = (x: number, y: number, width: number, height: number): number =>
  Math.hypot(Math.max(x, width - x), Math.max(y, height - y));

/** WCAG 2 relative luminance of a `#RRGGBB` colour. */
export const relativeLuminance = (hex: string): number => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) throw new Error(`Not a #RRGGBB colour: ${hex}`);
  const n = Number.parseInt(match[1], 16);
  const channel = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};

/** WCAG 2 contrast ratio of two `#RRGGBB` colours (1–21). */
export const contrastRatio = (a: string, b: string): number => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

// --- DOM ------------------------------------------------------------------------------------

const TOGGLE = '[data-theme-toggle]';
/** On <html> while a change is applied: transitions are off for that frame (global.css). */
const SWITCHING_CLASS = 'theme-switching';
/** On <html> while the circular reveal runs (global.css). */
const REVEAL_CLASS = 'theme-vt';

/** The theme the page shows now (light when the attribute is missing, as without JS). */
export const currentTheme = (): Theme =>
  parseStoredTheme(document.documentElement.dataset['theme']) ?? 'light';

const readStored = (): Theme | null => {
  try {
    return parseStoredTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return null; // Storage blocked: behave as if nothing is stored.
  }
};

const writeStored = (theme: Theme): void => {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage blocked or full: the switch still applies to this page.
  }
};

/** Brings every toggle on the page in line with the theme. */
const syncToggles = (theme: Theme): void => {
  document.querySelectorAll<HTMLElement>(TOGGLE).forEach((toggle) => {
    toggle.setAttribute('aria-pressed', String(theme === 'dark'));
    toggle.querySelectorAll<HTMLElement>('[data-theme-state]').forEach((state) => {
      const text = theme === 'dark' ? state.dataset['on'] : state.dataset['off'];
      if (text !== undefined) state.textContent = text;
    });
  });
};

/**
 * Applies a theme: the attribute, both metas, the toggles, then the event. Transitions are held
 * for a frame so colours change in one step (the toggle's own icon morph is exempt).
 */
const applyTheme = (theme: Theme): void => {
  const root = document.documentElement;
  root.classList.add(SWITCHING_CLASS);
  root.dataset['theme'] = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme);
  syncToggles(theme);
  // Commit the new styles with transitions off, then allow them again.
  void window.getComputedStyle(root).color;
  window.requestAnimationFrame(() =>
    window.requestAnimationFrame(() => root.classList.remove(SWITCHING_CLASS)),
  );
  document.dispatchEvent(new CustomEvent<ThemeChangeDetail>(THEME_EVENT, { detail: { theme } }));
};

/** Counts reveals, so a skipped one never clears the state of the one that replaced it. */
let revealId = 0;

/** Switches to `theme`, revealing it in a circle from `origin` where possible. */
const switchTheme = (theme: Theme, origin: HTMLElement | null): void => {
  const root = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !origin || typeof document.startViewTransition !== 'function') {
    applyTheme(theme);
    return;
  }

  const id = ++revealId;
  const box = origin.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  const r = revealRadius(x, y, window.innerWidth, window.innerHeight);
  root.style.setProperty('--theme-vt-x', `${x.toFixed(1)}px`);
  root.style.setProperty('--theme-vt-y', `${y.toFixed(1)}px`);
  root.style.setProperty('--theme-vt-r', `${Math.ceil(r)}px`);
  root.classList.add(REVEAL_CLASS);

  const cleanUp = (): void => {
    if (id !== revealId) return;
    root.classList.remove(REVEAL_CLASS);
    root.style.removeProperty('--theme-vt-x');
    root.style.removeProperty('--theme-vt-y');
    root.style.removeProperty('--theme-vt-r');
  };

  try {
    const transition = document.startViewTransition(() => applyTheme(theme));
    // `ready` rejects when the transition is skipped (hidden tab, another transition); the
    // update has still run then, so there is nothing to recover.
    transition.ready.catch(() => undefined);
    transition.finished.then(cleanUp, cleanUp);
  } catch {
    cleanUp();
    if (currentTheme() !== theme) applyTheme(theme);
  }
};

let initialised = false;

/**
 * Wires every theme toggle on the page (one delegated listener, so toggles inside the menu
 * dialog work too), follows the system while nothing is stored, and picks up changes made in
 * another tab or before a back/forward-cache restore. Safe to call more than once.
 */
export const initThemeToggle = (): void => {
  if (initialised || typeof document === 'undefined') return;
  initialised = true;

  const system = window.matchMedia('(prefers-color-scheme: dark)');
  // The pre-paint script normally sets the attribute; repair it if it did not run.
  if (!parseStoredTheme(document.documentElement.dataset['theme'])) {
    applyTheme(resolveTheme(readStored(), system.matches));
  }
  syncToggles(currentTheme());

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const toggle = event.target.closest<HTMLElement>(TOGGLE);
    if (!toggle) return;
    const theme = nextTheme(currentTheme());
    writeStored(theme);
    switchTheme(theme, toggle);
  });

  system.addEventListener('change', (event) => {
    if (readStored() !== null) return;
    const theme: Theme = event.matches ? 'dark' : 'light';
    if (theme !== currentTheme()) applyTheme(theme);
  });

  const resync = (): void => {
    const theme = resolveTheme(readStored(), system.matches);
    if (theme !== currentTheme()) applyTheme(theme);
  };
  window.addEventListener('storage', (event) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) resync();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) resync();
  });
};
