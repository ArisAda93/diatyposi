/**
 * Boot for the living background (LivingBackground.astro, on every page).
 *
 * Never in the critical path, and never competing with the page's own start-up: it waits for
 * `load`, then START_DELAY, then (on pages with `[data-hero]`) for the hero to report its first
 * frame or its static fallback (`html[data-hero-ready="1"]` or the `dt:hero-ready` event; started
 * anyway HERO_WAIT_MAX after `load` if the hero never reports), then for an idle period and the
 * next frame. Only then does it probe for a hardware WebGL context
 * (the pattern hero.ts uses) and import the scene with a dynamic import; the scene builds itself
 * in short tasks (scene.ts). Without a usable context (no WebGL, a software renderer through
 * `failIfMajorPerformanceCaveat`, a failed chunk or shader) no canvas is added and the layer stays
 * paper and grain. Reduced motion still gets the sheet, as one static frame (scene.ts); the
 * preference is followed live.
 *
 * Section accents: `data-bg-accent="cyan|magenta|yellow|key"` on a section blends the field
 * towards that ink while the section holds the viewport centre (an IntersectionObserver on a thin
 * band at the centre). Without one there, the balanced CMYK mix shows.
 *
 * Theme (theme.ts contract): `html[data-theme]` is read at start and again right before the
 * scene starts, and every `dt:themechange` on `document` is routed to it (scene.ts setTheme:
 * new paper, inks, caps and blend; the canvas is hidden, swapped and faded back in).
 */
import type { ThemeChangeDetail } from '~/scripts/theme';
import { parseTheme, pickAccent, type Accent, type Theme } from './math';
import type { GLContext, LivingBackground } from './scene';
import { delay, nextFrame, yieldToMain } from './tasks';

/** requestIdleCallback timeout for loading the scene (ms). */
const IDLE_TIMEOUT = 1500;
/** Pause after `load` before the background starts (ms). */
const START_DELAY = 1200;
/** The hero's signal that its first frame is drawn (or that it stays static). */
const HERO_READY_EVENT = 'dt:hero-ready';
/** Start anyway if the hero has not reported this long after `load` (ms), e.g. if it errored. */
const HERO_WAIT_MAX = 5000;
/** The band at the viewport centre that decides the section accent (rootMargin). */
const CENTRE_BAND = '-49% 0px -49% 0px';
/** Sent on `document` after every theme switch (theme.ts THEME_EVENT). */
const THEME_EVENT = 'dt:themechange';

/** The theme on <html> now (light without the attribute). */
const currentTheme = (): Theme => parseTheme(document.documentElement.dataset['theme']);

/**
 * Context attributes for the probe; the scene draws with this context.
 * `failIfMajorPerformanceCaveat` keeps software renderers on the plain paper.
 */
const GL_ATTRIBUTES: WebGLContextAttributes = {
  alpha: false,
  antialias: true,
  depth: false,
  stencil: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
  powerPreference: 'low-power',
  failIfMajorPerformanceCaveat: true,
};

/** Frees the GPU side of a canvas we will not use, instead of waiting for garbage collection. */
const releaseContext = (canvas: HTMLCanvasElement): void => {
  try {
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (gl && !gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    // Nothing to release.
  }
};

/** A canvas with a usable hardware WebGL context (WebGL 2, or WebGL 1 with instancing). */
const createContext = (): GLContext | null => {
  try {
    const canvas = document.createElement('canvas');
    const gl2 = canvas.getContext('webgl2', GL_ATTRIBUTES);
    if (gl2) return { canvas, gl: gl2 };
    const gl = canvas.getContext('webgl', GL_ATTRIBUTES);
    if (gl?.getExtension('ANGLE_instanced_arrays')) return { canvas, gl };
    if (gl) releaseContext(canvas);
    return null;
  } catch {
    return null;
  }
};

const whenLoaded = (): Promise<void> =>
  document.readyState === 'complete'
    ? Promise.resolve()
    : new Promise((resolve) => window.addEventListener('load', () => resolve(), { once: true }));

const whenIdle = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => resolve(), { timeout: IDLE_TIMEOUT });
    } else {
      window.setTimeout(resolve, 200);
    }
  });

/**
 * Resolves once the hero has drawn its first live frame or settled on its static SVG
 * (`html[data-hero-ready="1"]`, checked first, or the one-time `dt:hero-ready` event); at once on
 * pages without `[data-hero]`, and after `wait` ms if the signal never comes.
 */
const whenHeroReady = (wait: number): Promise<void> => {
  const root = document.documentElement;
  if (!document.querySelector('[data-hero]') || root.dataset['heroReady'] === '1') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = (): void => {
      window.clearTimeout(timer);
      document.removeEventListener(HERO_READY_EVENT, done);
      resolve();
    };
    document.addEventListener(HERO_READY_EVENT, done);
    const timer = window.setTimeout(done, Math.max(0, wait));
  });
};

/** Reports the accent of the section at the viewport centre whenever it changes. */
const watchAccents = (onChange: (accent: Accent | null) => void): void => {
  const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-bg-accent]'));
  if (!sections.length || !('IntersectionObserver' in window)) return;
  const atCentre = new Set<Element>();
  let current: Accent | null = null;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) atCentre.add(entry.target);
        else atCentre.delete(entry.target);
      });
      const next = pickAccent(
        sections.filter((s) => atCentre.has(s)).map((s) => s.getAttribute('data-bg-accent')),
      );
      if (next === current) return;
      current = next;
      onChange(next);
    },
    { rootMargin: CENTRE_BAND },
  );
  sections.forEach((section) => observer.observe(section));
};

export const initLivingBackground = (): void => {
  const host = document.querySelector<HTMLElement>('[data-living-bg]');
  if (!host) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let scene: LivingBackground | null = null;
  let accent: Accent | null = null;

  const boot = async (): Promise<void> => {
    await whenLoaded();
    const loadedAt = performance.now();
    await delay(START_DELAY);
    await whenHeroReady(HERO_WAIT_MAX - (performance.now() - loadedAt));
    await whenIdle();
    await nextFrame();
    const context = createContext();
    if (!context) return;
    const { canvas } = context;
    let built: LivingBackground;
    try {
      await yieldToMain();
      const { createLivingBackground } = await import('./scene');
      built = await createLivingBackground(host, context, {
        reducedMotion: reduce.matches,
        theme: currentTheme(),
        onLost: () => {
          scene = null;
        },
      });
      built.setAccent(accent);
      // Sizing and the first draw in a task of their own.
      await yieldToMain();
      // The preference may have flipped while the scene was built: start in the current state.
      // From here on (no await until `scene` is set) the listener below routes every change.
      built.setReducedMotion(reduce.matches);
      built.setTheme(currentTheme());
      // start() reports false (and has already cleaned up) when the context died meanwhile.
      if (!built.start()) return;
    } catch {
      // Chunk failed to load, the context was lost, or the GPU refused the scene: keep the paper.
      releaseContext(canvas);
      canvas.remove();
      return;
    }
    scene = built;
  };

  // Registered before the build, so no change of the preference is ever missed: before the scene
  // exists it is read again right before start(); afterwards it is routed to the scene.
  reduce.addEventListener('change', () => scene?.setReducedMotion(reduce.matches));
  document.addEventListener(THEME_EVENT, (event: Event) => {
    const detail = (event as CustomEvent<ThemeChangeDetail | undefined>).detail;
    scene?.setTheme(detail ? parseTheme(detail.theme) : currentTheme());
  });

  // Track the accent from the start, so the scene opens on the right ink.
  watchAccents((next) => {
    accent = next;
    scene?.setAccent(next);
  });
  void boot();
};
