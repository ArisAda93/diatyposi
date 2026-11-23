/**
 * Home “Μία ιδέα. Παντού.” stills (markup and styles:
 * src/components/home/journey/JourneyStill.astro): the sketch turns into the real product as it
 * scrolls up the screen.
 *
 * Each still stacks the step's line drawing (JourneyArt, still mode) under a product photo whose
 * composition matches the drawing. Without JS, under reduced motion, or while the desktop live
 * stage runs (where the stills are hidden), the photo simply shows: that is the CSS default and
 * this script adds nothing.
 *
 * Where it runs (phones and tablets with motion allowed) every still gets `is-reveal` and starts
 * as its sketch. Once it scrolls well into view, its print plays by itself over STILL_PLAY seconds
 * (the visitor does not have to scroll through it, and it never stops half-way), printing the
 * photo over the sketch like a press would:
 *
 * - Halftone. The photo is masked by a 45° dot screen (two upright dot grids, the second offset
 *   by half a cell, which together form a square lattice turned 45°). The dots grow from nothing
 *   until they merge, so the photo arrives dot by dot and the sketch's lines stay visible between
 *   the dots until ink covers them. Once the dots have merged the halftone is dropped, so the
 *   final photo is crisp (in light theme its edges fade into the paper, see JourneyStill.astro).
 * - Misregistration. While the dots are small, faint magenta and cyan copies of the dot screen
 *   sit a pixel or so off register (two drop shadows on the printed layer), then snap to zero.
 * - Register. The photo starts slightly enlarged and off-centre and settles into place (with a
 *   small overshoot), as a sheet pulled into the lay.
 *
 * When to play comes from where the still sits in the viewport (`stillProgress`, `stillGoal`); a
 * still scrolled back out below the viewport resets to its sketch, so it plays again next time.
 * The look for a given progress `real` is `stillPrint`. Writes are two classes
 * and a few custom properties, only when a value changed, in one rAF per frame that reads every
 * rect first and writes after. The scroll listener is attached only while a still is on screen.
 *
 * Relative imports, so the pure helpers can be unit-tested (tests/journey-stills.test.ts).
 */
import { clamp01, easeOutBack, ramp, smoothstep } from './idea-journey';

// ------------------------------------------------------------------------------------------------
// Pure helpers
// ------------------------------------------------------------------------------------------------

/** Halftone cell in CSS px (the screen's ruling: the dot pitch is cell × √2⁄2 at 45°). */
export const STILL_CELL = 9;

/** Reading lines, as shares of the viewport height from the top. */
const START_LINE = 0.85;
const END_LINE = 0.45;

/**
 * Reveal progress of a still from its viewport rect: 0 while its vertical centre is at or below
 * 85 % of the viewport height, 1 once it is at or above 45 %, linear between. Degenerate input
 * (no viewport, non-finite values) gives 1, the final state.
 */
export const stillProgress = (top: number, height: number, viewportHeight: number): number => {
  if (!Number.isFinite(top) || !Number.isFinite(height) || !(viewportHeight > 0)) return 1;
  const centre = top + Math.max(0, height) / 2;
  const start = viewportHeight * START_LINE;
  return clamp01((start - centre) / (start - viewportHeight * END_LINE));
};

/** The printed look of a still at a given progress. */
export interface StillPrint {
  /** Whether the photo paints at all. */
  shown: boolean;
  /** Whether the halftone mask is on (false once the dots have merged). */
  masked: boolean;
  /** Halftone dot radius, CSS px. */
  dot: number;
  /** Misregistration ghost amount (0…1): the cyan and magenta copies' offset. */
  ghost: number;
  /** Out-of-register offset of the photo (1 fully out, 0 in register; dips below 0 briefly). */
  offset: number;
  /** Photo scale (1 in register). */
  scale: number;
}

/** Dots start, and reach full size (well past merging), at these progress values. */
const DOTS_FROM = 0.05;
const DOTS_TO = 0.9;
/** The ghost fades in as the first dots print and is gone before they merge. */
const GHOST_IN = [0.05, 0.2] as const;
const GHOST_OUT = [0.32, 0.62] as const;
/** The photo settles into register over this range. */
const SETTLE = [0.35, 0.95] as const;
/** Extra scale while fully out of register. */
const SETTLE_SCALE = 0.04;

/**
 * The look for progress `real` (clamped to 0…1) with a halftone cell of `cell` px. The largest dot
 * is cell × √2⁄2 plus 1 px of soft edge: on the 45° screen the dots merge at cell ⁄ 2, so they
 * have fully merged well before the mask is dropped.
 */
export const stillPrint = (real: number, cell = STILL_CELL): StillPrint => {
  const r = clamp01(Number.isFinite(real) ? real : 1);
  const dotMax = (Math.max(0, cell) * Math.SQRT2) / 2 + 1;
  const grow = ramp(r, DOTS_FROM, DOTS_TO);
  const dot = dotMax * grow;
  const shown = grow > 0;
  const masked = shown && grow < 1;
  const ghost = shown
    ? smoothstep(ramp(r, GHOST_IN[0], GHOST_IN[1])) *
      (1 - smoothstep(ramp(r, GHOST_OUT[0], GHOST_OUT[1])))
    : 0;
  const offset = 1 - easeOutBack(ramp(r, SETTLE[0], SETTLE[1]));
  const scale = 1 + SETTLE_SCALE * Math.abs(offset);
  return { shown, masked, dot, ghost, offset, scale };
};

// ------------------------------------------------------------------------------------------------
/** Seconds the print takes once it starts. */
export const STILL_PLAY = 1.6;

/**
 * Whether a still should be printed, from its reveal progress (`stillProgress`) and its rect: it
 * starts printing once its centre passes the middle of the reveal band (progress 0.5) and stays
 * printed; once it is wholly below the viewport again it is reset to its sketch, so it plays again
 * the next time it scrolls in. In between it keeps `previous`, so it never stops half-way.
 */
export const stillGoal = (
  progress: number,
  top: number,
  viewportHeight: number,
  previous: 0 | 1,
): 0 | 1 => {
  if (progress >= 0.5) return 1;
  if (top >= viewportHeight) return 0;
  return previous;
};

/**
 * The print's progress one frame on (`dt` in ms): it plays forwards over STILL_PLAY seconds; a
 * reset (to an unseen sketch) is immediate.
 */
export const stillStep = (real: number, goal: 0 | 1, dt: number): number => {
  if (goal === 0) return 0;
  return clamp01(real + Math.max(0, dt) / 1000 / STILL_PLAY);
};

// ------------------------------------------------------------------------------------------------
// Behaviour
// ------------------------------------------------------------------------------------------------

/** Motion allowed. */
const MOTION_QUERY = '(prefers-reduced-motion: no-preference)';
/** The desktop live stage (the same query as LIVE_QUERY in idea-journey.ts); stills are hidden. */
const LIVE_QUERY = '(min-width: 64rem) and (prefers-reduced-motion: no-preference)';

const CLASSES = ['is-reveal', 'is-shown', 'is-masked', 'is-ghost'] as const;
const PROPS = ['--ijs-cell', '--ijs-dot', '--ijs-ghost', '--ijs-offset', '--ijs-scale'] as const;
type Prop = (typeof PROPS)[number];

interface Still {
  el: HTMLElement;
  /** The print's progress (0 sketch … 1 photo) and whether it should play. */
  real: number;
  goal: 0 | 1;
  /** Last written value of each custom property and class, to write only on change. */
  written: Map<string, string>;
}

const setProp = (still: Still, prop: Prop, value: string): void => {
  if (still.written.get(prop) === value) return;
  still.written.set(prop, value);
  still.el.style.setProperty(prop, value);
};

const setClass = (still: Still, name: (typeof CLASSES)[number], on: boolean): void => {
  const value = on ? '1' : '0';
  if (still.written.get(name) === value) return;
  still.written.set(name, value);
  still.el.classList.toggle(name, on);
};

/**
 * Drives every `[data-journey-still]` inside `root` while motion is allowed and the desktop live
 * stage is off; follows both conditions live and, when it turns off, removes everything it set.
 */
export const initJourneyStills = (root: HTMLElement): void => {
  const stills: Still[] = Array.from(
    root.querySelectorAll<HTMLElement>('[data-journey-still]'),
    (el) => ({ el, written: new Map(), real: 0, goal: 0 as 0 | 1 }),
  );
  if (stills.length === 0) return;

  const motion = matchMedia(MOTION_QUERY);
  const live = matchMedia(LIVE_QUERY);

  let active = false;
  let listening = false;
  let raf = 0;
  let lastTime = 0;
  const onScreen = new Set<Element>();

  const frame = (time: number): void => {
    raf = 0;
    if (!active) return;
    const dt = lastTime ? Math.min(64, time - lastTime) : 16;
    lastTime = time;
    const viewportHeight = window.innerHeight;
    // Read every rect first, then write.
    const rects = stills.map(({ el }) => el.getBoundingClientRect());
    let playing = false;
    const looks = stills.map((still, i) => {
      const rect = rects[i];
      if (rect) {
        const progress = stillProgress(rect.top, rect.height, viewportHeight);
        still.goal = stillGoal(progress, rect.top, viewportHeight, still.goal);
      }
      still.real = stillStep(still.real, still.goal, dt);
      if (still.goal === 1 && still.real < 1) playing = true;
      return stillPrint(still.real);
    });
    looks.forEach((look, i) => {
      const still = stills[i];
      if (!still) return;
      setClass(still, 'is-shown', look.shown);
      setClass(still, 'is-masked', look.masked);
      setClass(still, 'is-ghost', look.ghost > 0);
      setProp(still, '--ijs-dot', `${look.dot.toFixed(2)}px`);
      setProp(still, '--ijs-ghost', look.ghost.toFixed(3));
      setProp(still, '--ijs-offset', look.offset.toFixed(4));
      setProp(still, '--ijs-scale', look.scale.toFixed(4));
    });
    // Keep playing until every started print has finished (it never stops half-way).
    if (playing) raf = requestAnimationFrame(frame);
    else lastTime = 0;
  };

  const schedule = (): void => {
    if (active && !raf) raf = requestAnimationFrame(frame);
  };

  /** Listen to scroll and resize only while a still is on screen. */
  const syncListening = (): void => {
    const on = active && onScreen.size > 0;
    if (on && !listening) {
      window.addEventListener('scroll', schedule, { passive: true });
      window.addEventListener('resize', schedule, { passive: true });
      listening = true;
    } else if (!on && listening) {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      listening = false;
    }
  };

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) onScreen.add(entry.target);
      else onScreen.delete(entry.target);
    }
    syncListening();
    // One more frame either way: a still that just left settles on its clamped end state.
    schedule();
  });

  const activate = (): void => {
    active = true;
    for (const still of stills) {
      still.written.clear();
      // Stills already scrolled past start printed; the rest start as sketches.
      const above = still.el.getBoundingClientRect().bottom <= 0;
      still.real = above ? 1 : 0;
      still.goal = above ? 1 : 0;
      setClass(still, 'is-reveal', true);
      setProp(still, '--ijs-cell', `${STILL_CELL}px`);
      observer.observe(still.el);
    }
    // Place every still now (those above the viewport printed, the rest sketches until they play).
    frame(performance.now());
  };

  const deactivate = (): void => {
    active = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    observer.disconnect();
    onScreen.clear();
    syncListening();
    for (const still of stills) {
      still.el.classList.remove(...CLASSES);
      for (const prop of PROPS) still.el.style.removeProperty(prop);
      still.written.clear();
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
