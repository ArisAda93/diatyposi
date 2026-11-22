/**
 * Boot for the living background (LivingBackground.astro, on every page).
 *
 * Never in the critical path: after the first frame is painted and the page is idle, it probes
 * for a hardware WebGL context (the pattern hero.ts uses) and only then imports the scene (OGL)
 * with a dynamic import. Without a usable context (no WebGL, a software renderer through
 * `failIfMajorPerformanceCaveat`, a failed chunk or shader) no canvas is added and the layer stays
 * paper and grain. Reduced motion still gets the sheet, as one static frame (scene.ts); the
 * preference is followed live.
 *
 * Section accents: `data-bg-accent="cyan|magenta|yellow|key"` on a section blends the field
 * towards that ink while the section holds the viewport centre (an IntersectionObserver on a thin
 * band at the centre). Without one there, the balanced CMYK mix shows.
 */
import { pickAccent, type Accent } from './math';
import type { LivingBackground } from './scene';

/** requestIdleCallback timeout for loading the scene (ms). */
const IDLE_TIMEOUT = 1500;
/** The band at the viewport centre that decides the section accent (rootMargin). */
const CENTRE_BAND = '-49% 0px -49% 0px';

/**
 * Context attributes for the probe. OGL later asks the same canvas for its context and gets this
 * one back. `failIfMajorPerformanceCaveat` keeps software renderers on the plain paper.
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

/** A canvas with a usable hardware WebGL context (WebGL 2, or WebGL 1 with what OGL needs). */
const createCanvas = (): HTMLCanvasElement | null => {
  try {
    const canvas = document.createElement('canvas');
    if (canvas.getContext('webgl2', GL_ATTRIBUTES)) return canvas;
    const gl = canvas.getContext('webgl', GL_ATTRIBUTES);
    if (gl?.getExtension('OES_vertex_array_object') && gl.getExtension('ANGLE_instanced_arrays')) {
      return canvas;
    }
    if (gl) releaseContext(canvas);
    return null;
  } catch {
    return null;
  }
};

/** Runs after the first frame has been painted, once the page has loaded and the thread is idle. */
const afterFirstPaintIdle = (task: () => void): void => {
  const idle = (): void => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(task, { timeout: IDLE_TIMEOUT });
    } else {
      window.setTimeout(task, 200);
    }
  };
  const schedule = (): void => requestAnimationFrame(() => requestAnimationFrame(idle));
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
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
    const canvas = createCanvas();
    if (!canvas) return;
    let built: LivingBackground;
    try {
      const { createLivingBackground } = await import('./scene');
      built = createLivingBackground(host, canvas, {
        reducedMotion: reduce.matches,
        onLost: () => {
          scene = null;
        },
      });
      built.setAccent(accent);
      // start() reports false (and has already cleaned up) when the context died meanwhile.
      if (!built.start()) return;
    } catch {
      // Chunk failed to load, or the GPU refused the scene: keep the paper.
      releaseContext(canvas);
      canvas.remove();
      return;
    }
    scene = built;
    reduce.addEventListener('change', () => scene?.setReducedMotion(reduce.matches));
  };

  // Track the accent from the start, so the scene opens on the right ink.
  watchAccents((next) => {
    accent = next;
    scene?.setAccent(next);
  });
  afterFirstPaintIdle(() => void boot());
};
