/**
 * Home hero: decides between the live WebGL scene and the static composition, and plays the
 * once-per-session intro.
 *
 * Static composition (CSS default, no JS, reduced motion, no usable WebGL, or any failure): the
 * logo arches as SVG in the scene's position, the header logo with its arches, no animation.
 *
 * Live scene (src/scripts/hero-scene/scene.ts, OGL): loaded with a dynamic import after first
 * paint, never in the critical path. It takes over from the SVG without a jump: its first frame
 * draws the arches exactly where the SVG has them, then the canvas fades in over it and the plates
 * start their loop (hero-scene/choreography.ts).
 *
 * Intro contract with BaseLayout: `html.hero-intro` is set before first paint only when the intro
 * should play (once per session, never with reduced motion) and is removed by BaseLayout after 4 s
 * as a safety net. While it is present the SVG plates are hidden and the headline's C/M/Y ghosts
 * sit out of register (Hero.astro). Then either
 *  - the 3D intro plays (the plates arrive from depth), if the scene is ready within
 *    INTRO_DEADLINE, or
 *  - the SVG intro plays (CSS keyframes on the SVG plates), and the scene, if available, takes
 *    over afterwards.
 * In both cases the ghosts converge on the headline (CSS, `.hero.is-intro`).
 *
 * Ready signal: once the hero has settled (the live scene drew its first frame, or the page keeps
 * the static composition), `data-hero-ready="1"` is set on <html> and `dt:hero-ready` is
 * dispatched on document, once. The living background waits for it on the home page, so the two
 * WebGL scenes never start up at the same time.
 */
import type { HeroScene, SceneElements } from './hero-scene/scene';

const PLAYED_KEY = 'dt-hero-played';
/** How long the intro waits for the 3D scene before playing the SVG version instead (ms). */
const INTRO_DEADLINE = 1500;
/** Length of the CSS intros (Hero.astro keyframes plus the last plate's delay), ms. */
const INTRO_SVG_MS = 1750;
const INTRO_GHOSTS_MS = 1600;
/** requestIdleCallback timeout for loading the scene when no intro plays (ms). */
const IDLE_TIMEOUT = 2000;

/**
 * Context attributes for the probe. OGL later asks the same canvas for its context and gets this
 * one back. `failIfMajorPerformanceCaveat` keeps software renderers on the static composition.
 */
const GL_ATTRIBUTES: WebGLContextAttributes = {
  alpha: false,
  antialias: true,
  depth: true,
  stencil: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
  powerPreference: 'low-power',
  failIfMajorPerformanceCaveat: true,
};

/** Signals that the hero has settled (see the file comment). Safe to call more than once. */
const markReady = (): void => {
  const root = document.documentElement;
  if (root.dataset['heroReady'] === '1') return;
  root.dataset['heroReady'] = '1';
  document.dispatchEvent(new Event('dt:hero-ready'));
};

const markPlayed = (): void => {
  try {
    sessionStorage.setItem(PLAYED_KEY, '1');
  } catch {
    // Storage blocked: the intro may play again on the next visit, nothing else depends on it.
  }
};

/**
 * Frees the GPU side of a canvas we will not use (its buffers, programs and the context itself)
 * instead of waiting for garbage collection, which browsers cap at a handful of live contexts.
 */
const releaseContext = (canvas: HTMLCanvasElement): void => {
  try {
    // Asking again returns the existing context (null for the other WebGL version).
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

/** Runs after the first frame has been painted. */
const afterFirstPaint = (task: () => void): void => {
  requestAnimationFrame(() => requestAnimationFrame(task));
};

/** Runs once the page has loaded and the main thread is idle. */
const whenIdle = (task: () => void): void => {
  const schedule = (): void => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(task, { timeout: IDLE_TIMEOUT });
    } else {
      window.setTimeout(task, 200);
    }
  };
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
};

export const initHero = (): void => {
  const root = document.documentElement;
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  const stage = hero?.querySelector<HTMLElement>('[data-hero-stage]');
  const markBox = hero?.querySelector<HTMLElement>('[data-hero-mark]');
  const mark = markBox?.querySelector<SVGSVGElement>('svg');
  if (!hero || !stage || !markBox || !mark) {
    root.classList.remove('hero-intro');
    markReady();
    return;
  }

  const header = document.querySelector<HTMLElement>('[data-header]');
  const elements: SceneElements = {
    hero,
    stage,
    markBox,
    mark,
    copy: hero.querySelector<HTMLElement>('[data-hero-copy]'),
    header,
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  // The scroll cue's loop rests while the hero is off-screen.
  new IntersectionObserver(([entry]) => {
    hero.toggleAttribute('data-offscreen', !(entry?.isIntersecting ?? true));
  }).observe(hero);

  let prepared: HeroScene | null = null; // created, not started
  let scene: HeroScene | null = null; // running
  let loading: Promise<HeroScene | null> | null = null;
  let failed = false; // WebGL unusable on this page: stay static
  let introState: 'none' | 'pending' | 'svg' | '3d' = 'none';

  const onLost = (): void => {
    scene = null;
    prepared = null;
    failed = true;
  };

  const buildScene = async (): Promise<HeroScene | null> => {
    const canvas = createCanvas();
    if (!canvas) {
      failed = true;
      return null;
    }
    try {
      const { createHeroScene } = await import('./hero-scene/scene');
      // Reduced motion may have been switched on while the chunk loaded.
      if (reduce.matches) {
        releaseContext(canvas);
        return null;
      }
      // Built in short steps that yield to the main thread (hero-scene/startup.ts).
      const built = await createHeroScene(elements, canvas, onLost);
      // Reduced motion may have been switched on while it was being built.
      if (reduce.matches) {
        built.destroy();
        return null;
      }
      return built;
    } catch {
      // Chunk failed to load, or the GPU refused the scene (shaders, layout): free what the
      // renderer allocated and keep the static composition.
      releaseContext(canvas);
      failed = true;
      return null;
    }
  };

  const loadScene = (): Promise<HeroScene | null> => {
    if (scene || failed) return Promise.resolve(null);
    if (prepared) return Promise.resolve(prepared);
    loading ??= buildScene()
      .then((built) => {
        prepared = built;
        return built;
      })
      .finally(() => {
        loading = null;
      });
    return loading;
  };

  /** Starts a prepared scene; false if it could not run (the static composition stays). */
  const run = (built: HeroScene, intro: boolean): boolean => {
    prepared = null;
    scene = built;
    if (built.start({ intro })) return true;
    scene = null;
    return false;
  };

  const startAlive = async (): Promise<void> => {
    if (scene) return;
    if (reduce.matches || failed) {
      markReady();
      return;
    }
    const built = await loadScene();
    if (built && built === prepared && !scene && !reduce.matches && introState !== 'svg') {
      run(built, false);
    }
    // Live (first frame drawn) or settled on the static composition. A scene held back for the
    // SVG intro signals once it starts.
    if (scene || !built || failed || reduce.matches) markReady();
  };

  const playGhosts = (): void => {
    hero.classList.add('is-intro');
    window.setTimeout(() => hero.classList.remove('is-intro'), INTRO_GHOSTS_MS);
  };

  const playSvgIntro = (): void => {
    if (!root.classList.contains('hero-intro')) {
      // BaseLayout's safety net already showed the composed hero: never replay over it.
      introState = 'none';
      whenIdle(() => void startAlive());
      return;
    }
    introState = 'svg';
    hero.classList.add('is-intro', 'is-intro-svg');
    root.classList.remove('hero-intro');
    window.setTimeout(() => {
      hero.classList.remove('is-intro', 'is-intro-svg');
      introState = 'none';
      whenIdle(() => void startAlive());
    }, INTRO_SVG_MS);
  };

  reduce.addEventListener('change', () => {
    if (reduce.matches) {
      scene?.destroy();
      prepared?.destroy();
      scene = null;
      prepared = null;
      // Stop any intro where it is: composed state, no animation.
      hero.classList.remove('is-intro', 'is-intro-svg');
      root.classList.remove('hero-intro');
      markReady();
    } else {
      whenIdle(() => void startAlive());
    }
  });

  if (!root.classList.contains('hero-intro')) {
    whenIdle(() => void startAlive());
    return;
  }
  if (reduce.matches) {
    root.classList.remove('hero-intro');
    markReady();
    return;
  }

  introState = 'pending';
  markPlayed();
  const deadline = window.setTimeout(() => {
    if (introState === 'pending') playSvgIntro();
  }, INTRO_DEADLINE);

  afterFirstPaint(() => {
    void loadScene().then((built) => {
      if (introState !== 'pending') return; // too late: the SVG intro is playing or done
      if (!built || !root.classList.contains('hero-intro') || reduce.matches) {
        window.clearTimeout(deadline);
        playSvgIntro();
        return;
      }
      window.clearTimeout(deadline);
      // start() draws the first frame and hides the SVG mark before the pre-paint class goes.
      if (!run(built, true)) {
        // The scene died while loading (context lost): play the SVG intro instead.
        playSvgIntro();
        return;
      }
      introState = '3d';
      playGhosts();
      root.classList.remove('hero-intro');
      markReady();
    });
  });
};
