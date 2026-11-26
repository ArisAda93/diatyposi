/**
 * Home “Μία ιδέα. Παντού.” stills (markup and styles:
 * src/components/home/journey/JourneyStill.astro and the still rules in JourneyArt.astro): on
 * phones and tablets each step's sketch draws itself, holds, and then the real product prints over
 * it, at a pace the visitor can watch.
 *
 * Each still stacks the step's line drawing (JourneyArt, still mode) under a product photo whose
 * composition matches the drawing, on its own sheet of paper. Without JS, under reduced motion, or
 * while the desktop live stage runs (where the stills are hidden), the photo simply shows: that is
 * the CSS default and this script adds nothing.
 *
 * Where it runs (phones and tablets with motion allowed) every still gets `is-reveal`. One wholly
 * below the viewport starts as a blank sheet (one already in view or above keeps its photo, so
 * nothing on screen flips back). Then, in three beats:
 * 1. Sketch: once STILL_DRAW_TRIGGER of it is in view it gets `is-drawn` and its lines draw in by
 *    themselves, the fills follow and the mark's plates slide into register (CSS transitions,
 *    about STILL_DRAW_MS).
 * 2. Hold: the finished sketch stays on its own for at least STILL_HOLD_MS.
 * 3. Print: once STILL_PRINT_TRIGGER of it is in view (and the hold is over, and its photo has
 *    loaded) the photo prints over the sketch on the same WebGL press as the desktop stage
 *    (src/scripts/journey-print/gl.ts): the sheet arrives under the sketch's lines, the Y, M, C
 *    and K halftone plates print in press order, out of register and snapping in, the dots
 *    resolve, and the true photograph takes over, over STILL_PRESS_MS. The press canvas exists
 *    only while a still prints, then the still's own picture takes over and the context is freed.
 *    Without WebGL the photo fades in while the sheet settles into register (CSS).
 * Scrolling only starts each beat; a beat never stops half-way. A still scrolled back out below the
 * viewport returns to its blank sheet (off screen, at once), so it plays again the next time it
 * scrolls in; one scrolled past above shows its product at once.
 *
 * Cost: one IntersectionObserver and class toggles at thresholds. Frames run only while a still
 * prints (one small canvas per printing still); off-screen stills cost nothing.
 *
 * Relative imports, so the pure helpers can be unit-tested (tests/journey-stills.test.ts).
 */
import { LIVE_QUERY, clamp01, fillFade, lineFade, markFade } from './idea-journey';
import type { PrintGL } from './journey-print/gl';
import { printState } from './journey-print/state';

// ------------------------------------------------------------------------------------------------
// Pure helpers
// ------------------------------------------------------------------------------------------------

/** Where a still is: its rect and the viewport's top and bottom (viewport px). */
export interface StillView {
  top: number;
  bottom: number;
  viewTop: number;
  viewBottom: number;
}

/** What a still shows: 0 its blank sheet, 1 its sketch, 2 its product. */
export type StillLook = 0 | 1 | 2;

/**
 * Share of a still that must be in view for its sketch to draw in (of the viewport's height
 * instead, for a still taller than the viewport).
 */
export const STILL_DRAW_TRIGGER = 0.3;

/** Share of a still that must be in view for its product to print: practically all of it. */
export const STILL_PRINT_TRIGGER = 0.85;

/** How long the sketch takes to draw in (ms); keep in step with the still rules in JourneyArt.astro. */
export const STILL_DRAW_MS = 1700;

/** How long the finished sketch holds on its own before it may print (ms). */
export const STILL_HOLD_MS = 450;

/** How long the press takes to print the product over the sketch (ms). */
export const STILL_PRESS_MS = 2600;

/** The observer's thresholds: every twentieth, so both triggers are reported for any still height. */
export const STILL_THRESHOLDS: readonly number[] = Array.from({ length: 21 }, (_, i) => i / 20);

/** Slack on the triggers, so a crossing the observer reports at a threshold always counts. */
const TRIGGER_SLACK = 0.002;

const finite = (view: StillView): boolean =>
  [view.top, view.bottom, view.viewTop, view.viewBottom].every(Number.isFinite);

/**
 * How much of a still is in view (0…1): its visible height over its own height, or over the
 * viewport's for a still taller than the viewport. Degenerate input (no viewport, non-finite
 * values) gives 1, the final state.
 */
export const stillInView = (view: StillView): number => {
  const viewHeight = view.viewBottom - view.viewTop;
  if (!finite(view) || !(viewHeight > 0)) return 1;
  const visible = Math.min(view.bottom, view.viewBottom) - Math.max(view.top, view.viewTop);
  const whole = Math.min(Math.max(0, view.bottom - view.top), viewHeight);
  if (whole <= 0) return view.top < view.viewBottom && view.bottom > view.viewTop ? 1 : 0;
  return Math.min(1, Math.max(0, visible / whole));
};

/** Whether a still has scrolled past, wholly above the viewport (degenerate input: false). */
export const stillAbove = (view: StillView): boolean =>
  finite(view) && view.viewBottom > view.viewTop && view.bottom <= view.viewTop;

/**
 * The look a still should reach: its product once STILL_PRINT_TRIGGER of it is in view or once it
 * has scrolled past above; at least its sketch once STILL_DRAW_TRIGGER of it is in view; back to the
 * blank sheet once it is wholly below the viewport again, so it plays again the next time it
 * scrolls in. In between it keeps `previous`, so a beat never stops half-way. Degenerate input
 * gives the product.
 */
export const stillGoal = (view: StillView, previous: StillLook): StillLook => {
  if (!finite(view) || !(view.viewBottom > view.viewTop)) return 2;
  if (view.bottom <= view.viewTop) return 2;
  if (view.top >= view.viewBottom) return 0;
  const seen = stillInView(view);
  if (seen >= STILL_PRINT_TRIGGER - TRIGGER_SLACK) return 2;
  if (seen >= STILL_DRAW_TRIGGER - TRIGGER_SLACK) return previous === 2 ? 2 : 1;
  return previous;
};

/**
 * The look a still takes when the script first sees it: the blank sheet only while it is wholly
 * below the viewport (it will play in front of the visitor); anything already in view or above
 * stays the product, so nothing on screen flips back.
 */
export const stillFirstGoal = (view: StillView): StillLook =>
  finite(view) && view.viewBottom > view.viewTop && view.top >= view.viewBottom ? 0 : 2;

/**
 * Milliseconds before a sketch that started drawing at `drawnAt` may print (0: now): it draws for
 * STILL_DRAW_MS, then holds for STILL_HOLD_MS. Non-finite input gives 0.
 */
export const printWait = (drawnAt: number, now: number): number => {
  if (!Number.isFinite(drawnAt) || !Number.isFinite(now)) return 0;
  return Math.max(0, STILL_DRAW_MS + STILL_HOLD_MS - (now - drawnAt));
};

/**
 * The still's CSS amounts at press run `real` (0…1): `fill` clears the sketch's paper for the
 * photo's sheet, `line` lifts its lines off as the photo resolves, `mark` hands the vector mark
 * over to the photographed one (the desktop stage's fades, src/scripts/idea-journey.ts). The
 * photo's sheet is light in both themes, so in dark theme the mark's screen-blended plates leave as
 * the sheet lands (`plate`); the pencil sketch on the sketchbook stays with the mark, its lines
 * turned to dark ink by the CSS.
 */
export const pressLook = (
  real: number,
  dark: boolean,
): { fill: number; line: number; mark: number; plate: number } => {
  const r = clamp01(Number.isFinite(real) ? real : 1);
  const fill = fillFade(r);
  return { fill, line: lineFade(r), mark: markFade(r), plate: dark ? fill : 1 };
};

// ------------------------------------------------------------------------------------------------
// Behaviour
// ------------------------------------------------------------------------------------------------

/** Motion allowed. */
const MOTION_QUERY = '(prefers-reduced-motion: no-preference)';

/** Halftone pitch on screen (CSS px): a little finer than the desktop stage's, for the smaller sheet. */
const CELL = 6;

/** How long the still's own picture takes to take over from the finished press (ms; CSS too). */
const HANDOVER_MS = 320;

/** What a still is doing right now. */
type Phase = 'blank' | 'sketch' | 'press' | 'product';

interface Still {
  el: HTMLElement;
  /** Whether the observer has reported this still since the script turned on. */
  seen: boolean;
  goal: StillLook;
  phase: Phase;
  /** When its sketch started drawing (performance.now()). */
  drawnAt: number;
  /** Bumped whenever the still is reset or finished, so stale timers and promises do nothing. */
  run: number;
  timer: number;
  frame: number;
  press: PrintGL | null;
  canvas: HTMLCanvasElement | null;
}

const PRESS_VARS = ['--ijs-fill', '--ijs-line', '--ijs-mark', '--ijs-plate'] as const;

const isDark = (): boolean => document.documentElement.dataset['theme'] === 'dark';

const viewOf = (entry: IntersectionObserverEntry): StillView => {
  const root = entry.rootBounds;
  return {
    top: entry.boundingClientRect.top,
    bottom: entry.boundingClientRect.bottom,
    viewTop: root ? root.top : 0,
    viewBottom: root ? root.bottom : window.innerHeight,
  };
};

/** Resolves once `img` has loaded (true) or failed (false). */
const imageReady = (img: HTMLImageElement | null): Promise<boolean> => {
  if (!img) return Promise.resolve(false);
  if (img.complete) return Promise.resolve(img.naturalWidth > 0);
  return new Promise((resolve) => {
    img.addEventListener('load', () => resolve(true), { once: true });
    img.addEventListener('error', () => resolve(false), { once: true });
  });
};

/** The press module (OGL and the shader), loaded once, on the first print. */
let pressModule: Promise<typeof import('./journey-print/gl') | null> | null = null;
const loadPress = (): Promise<typeof import('./journey-print/gl') | null> => {
  pressModule ??= import('./journey-print/gl').catch(() => null);
  return pressModule;
};

/**
 * Drives every `[data-journey-still]` inside `root` while motion is allowed and the desktop live
 * stage is off; follows both conditions live and, when it turns off, removes everything it set.
 */
export const initJourneyStills = (root: HTMLElement): void => {
  const elements = Array.from(root.querySelectorAll<HTMLElement>('[data-journey-still]'));
  if (elements.length === 0 || !('IntersectionObserver' in window)) return;
  const stills = new Map(
    elements.map((el): [Element, Still] => [
      el,
      {
        el,
        seen: false,
        goal: 0,
        phase: 'blank',
        drawnAt: 0,
        run: 0,
        timer: 0,
        frame: 0,
        press: null,
        canvas: null,
      },
    ]),
  );

  const motion = matchMedia(MOTION_QUERY);
  const live = matchMedia(LIVE_QUERY);
  let active = false;
  /** Set once WebGL turned out to be unavailable: every later print uses the CSS fade. */
  let noPress = false;

  const stopPress = (still: Still): void => {
    cancelAnimationFrame(still.frame);
    still.frame = 0;
    still.press?.destroy();
    still.press = null;
    still.canvas?.remove();
    still.canvas = null;
    still.el.classList.remove('is-pressing');
  };

  /** Cancels whatever the still is doing (timers, frames, the press, pending promises). */
  const halt = (still: Still): void => {
    still.run += 1;
    window.clearTimeout(still.timer);
    still.timer = 0;
    stopPress(still);
  };

  /** Back to the blank sheet, at once (it is off screen). */
  const reset = (still: Still): void => {
    halt(still);
    still.phase = 'blank';
    still.el.classList.remove('is-drawn', 'is-printed', 'is-pressed');
    PRESS_VARS.forEach((name) => still.el.style.removeProperty(name));
  };

  /** Straight to the product (first sight in view, or scrolled past above). */
  const finish = (still: Still): void => {
    halt(still);
    still.phase = 'product';
    still.el.classList.add('is-drawn', 'is-printed');
  };

  /** The photo fades in while the sheet settles into register (no WebGL, or the context was lost). */
  const fadeIn = (still: Still): void => {
    stopPress(still);
    still.phase = 'product';
    PRESS_VARS.forEach((name) => still.el.style.removeProperty(name));
    still.el.classList.remove('is-pressed');
    still.el.classList.add('is-printed');
  };

  const setLook = (still: Still, real: number): void => {
    const look = pressLook(real, isDark());
    still.el.style.setProperty('--ijs-fill', look.fill.toFixed(4));
    still.el.style.setProperty('--ijs-line', look.line.toFixed(4));
    still.el.style.setProperty('--ijs-mark', look.mark.toFixed(4));
    still.el.style.setProperty('--ijs-plate', look.plate.toFixed(4));
  };

  const print = async (still: Still): Promise<void> => {
    const run = still.run;
    still.phase = 'press';
    const img = still.el.querySelector('img');
    const loaded = await imageReady(img);
    if (run !== still.run || !active) return;
    if (!loaded || !img || noPress) {
      fadeIn(still);
      return;
    }
    const host = still.el.querySelector<HTMLElement>('[data-journey-press]');
    const pressLib = host ? await loadPress() : null;
    if (run !== still.run || !active) return;
    const canvas = document.createElement('canvas');
    const press = pressLib?.createPrintGL(canvas, 1, () => {
      // Context lost mid-print: the photo fades in instead.
      if (run === still.run && still.phase === 'press') fadeIn(still);
    });
    if (!host || !press) {
      noPress = true;
      fadeIn(still);
      return;
    }
    still.press = press;
    still.canvas = canvas;
    host.append(canvas);
    press.setPhoto(0, img);
    press.resize(host.clientWidth, host.clientHeight, Math.min(window.devicePixelRatio || 1, 2));
    still.el.classList.add('is-pressing');

    const start = performance.now();
    const step = (now: number): void => {
      if (run !== still.run || !still.press) return;
      const real = clamp01((now - start) / STILL_PRESS_MS);
      setLook(still, real);
      still.press.draw(0, printState(real), { cell: CELL, softEdge: !isDark() });
      if (real < 1) {
        still.frame = requestAnimationFrame(step);
        return;
      }
      // Printed: the still's own picture takes over (identical at this point), then the canvas
      // and its context go.
      still.frame = 0;
      still.phase = 'product';
      still.el.classList.add('is-printed', 'is-pressed');
      still.timer = window.setTimeout(() => {
        if (run === still.run) stopPress(still);
      }, HANDOVER_MS + 60);
    };
    setLook(still, 0);
    press.draw(0, printState(0), { cell: CELL, softEdge: !isDark() });
    still.frame = requestAnimationFrame(step);
  };

  /** The sketch draws in by itself (CSS). */
  const draw = (still: Still): void => {
    still.phase = 'sketch';
    still.drawnAt = performance.now();
    still.el.classList.add('is-drawn');
  };

  /** Prints the still once its sketch has drawn and held. */
  const schedulePrint = (still: Still): void => {
    if (still.phase !== 'sketch' || still.timer) return;
    const run = still.run;
    still.timer = window.setTimeout(
      () => {
        still.timer = 0;
        if (run === still.run && active && still.phase === 'sketch' && still.goal === 2) {
          void print(still);
        }
      },
      printWait(still.drawnAt, performance.now()),
    );
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const still = stills.get(entry.target);
        if (!still) continue;
        const view = viewOf(entry);
        if (!still.seen) {
          // First sight: settle the look with no transition. With `is-printed` set first, adding
          // `is-reveal` changes nothing on screen; without it, the sheet clears at once (the
          // hidden state has no transition), and only the beats added later animate.
          still.seen = true;
          still.goal = stillFirstGoal(view);
          if (still.goal === 2) finish(still);
          else reset(still);
          still.el.classList.add('is-reveal');
          continue;
        }
        still.goal = stillGoal(view, still.goal);
        if (still.goal === 0) {
          if (still.phase !== 'blank') reset(still);
          continue;
        }
        if (stillAbove(view)) {
          if (still.phase !== 'product') finish(still);
          continue;
        }
        if (still.phase === 'blank') draw(still);
        if (still.goal === 2) schedulePrint(still);
      }
    },
    { threshold: [...STILL_THRESHOLDS] },
  );

  const activate = (): void => {
    active = true;
    for (const still of stills.values()) {
      still.seen = false;
      observer.observe(still.el);
    }
  };

  const deactivate = (): void => {
    active = false;
    observer.disconnect();
    for (const still of stills.values()) {
      reset(still);
      still.seen = false;
      still.goal = 0;
      still.el.classList.remove('is-reveal');
    }
  };

  const update = (): void => {
    const want = motion.matches && !live.matches;
    if (want && !active) activate();
    else if (!want && active) deactivate();
  };

  motion.addEventListener('change', update);
  live.addEventListener('change', update);
  update();
};
