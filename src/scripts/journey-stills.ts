/**
 * Home “Μία ιδέα. Παντού.” stills (markup and styles:
 * src/components/home/journey/JourneyStill.astro): the sketch turns into the real product as it
 * scrolls into view.
 *
 * Each still stacks the step's line drawing (JourneyArt, still mode) under a product photo whose
 * composition matches the drawing, on its own sheet of paper. Without JS, under reduced motion, or
 * while the desktop live stage runs (where the stills are hidden), the photo simply shows: that is
 * the CSS default and this script adds nothing.
 *
 * Where it runs (phones and tablets with motion allowed) every still gets `is-reveal`; one below
 * the viewport starts as its sketch (one already in view or above keeps its photo, so nothing on
 * screen flips back). Once enough of it is in view (`stillGoal`, STILL_TRIGGER) and its photo
 * has loaded, it gets `is-printed` and the photo prints over the sketch by itself, as a CSS
 * transition of opacity and transform
 * only (the sheet pulled into register; JourneyStill.astro): the visitor never scrolls through an
 * effect and it never stops half-way. A still scrolled back out below the viewport returns to its
 * sketch (off screen, at once), so it prints again the next time it scrolls in; one already
 * scrolled past stays printed.
 *
 * Cost: one IntersectionObserver and a class toggle when a still crosses a threshold. No scroll
 * listener, no animation frame, no layout reads (the observer reports the rects), nothing per
 * frame; off-screen stills cost nothing.
 *
 * Relative imports, so the pure helpers can be unit-tested (tests/journey-stills.test.ts).
 */
import { LIVE_QUERY } from './idea-journey';

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

/**
 * Share of a still that must be in view for it to print (of the viewport's height instead, for a
 * still taller than the viewport).
 */
export const STILL_TRIGGER = 0.4;

/** The observer's thresholds: every tenth, so the trigger is reported for any still height. */
export const STILL_THRESHOLDS: readonly number[] = Array.from({ length: 11 }, (_, i) => i / 10);

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

/**
 * Whether a still shows its product (1) or its sketch (0): printed once STILL_TRIGGER of it is in
 * view, and printed once it has scrolled past above the viewport; back to the sketch once it is
 * wholly below the viewport again, so it prints again the next time it scrolls in. In between it
 * keeps `previous`, so a print never stops half-way. Degenerate input gives 1.
 */
export const stillGoal = (view: StillView, previous: 0 | 1): 0 | 1 => {
  if (!finite(view) || !(view.viewBottom > view.viewTop)) return 1;
  if (view.bottom <= view.viewTop) return 1;
  if (view.top >= view.viewBottom) return 0;
  return stillInView(view) >= STILL_TRIGGER ? 1 : previous;
};

/**
 * The look a still takes when the script first sees it: its sketch only while it is wholly below
 * the viewport (it will print in front of the visitor); anything already in view or above stays
 * the product, so nothing on screen flips back to a sketch.
 */
export const stillFirstGoal = (view: StillView): 0 | 1 =>
  finite(view) && view.viewBottom > view.viewTop && view.top >= view.viewBottom ? 0 : 1;

// ------------------------------------------------------------------------------------------------
// Behaviour
// ------------------------------------------------------------------------------------------------

/** Motion allowed. */
const MOTION_QUERY = '(prefers-reduced-motion: no-preference)';

interface Still {
  el: HTMLElement;
  /** Whether the observer has reported this still since the script turned on. */
  seen: boolean;
  goal: 0 | 1;
  /** Waiting for its photo to load before printing it. */
  waiting: boolean;
}

const viewOf = (entry: IntersectionObserverEntry): StillView => {
  const root = entry.rootBounds;
  return {
    top: entry.boundingClientRect.top,
    bottom: entry.boundingClientRect.bottom,
    viewTop: root ? root.top : 0,
    viewBottom: root ? root.bottom : window.innerHeight,
  };
};

/**
 * Drives every `[data-journey-still]` inside `root` while motion is allowed and the desktop live
 * stage is off; follows both conditions live and, when it turns off, removes everything it set.
 */
export const initJourneyStills = (root: HTMLElement): void => {
  const elements = Array.from(root.querySelectorAll<HTMLElement>('[data-journey-still]'));
  if (elements.length === 0 || !('IntersectionObserver' in window)) return;
  const stills = new Map(
    elements.map((el): [Element, Still] => [el, { el, seen: false, goal: 0, waiting: false }]),
  );

  const motion = matchMedia(MOTION_QUERY);
  const live = matchMedia(LIVE_QUERY);
  let active = false;

  /**
   * Shows the product (1) or the sketch (0). A print waits for the photo (lazy, so normally loaded
   * long before), so it never fades in empty and pops in later; a failed photo does not hold it.
   */
  const show = (still: Still, goal: 0 | 1): void => {
    if (goal === 0) {
      still.el.classList.remove('is-printed');
      return;
    }
    const img = still.el.querySelector('img');
    if (!img || img.complete) {
      still.el.classList.add('is-printed');
      return;
    }
    if (still.waiting) return;
    still.waiting = true;
    const ready = (): void => {
      still.waiting = false;
      if (active && still.goal === 1) still.el.classList.add('is-printed');
    };
    img.addEventListener('load', ready, { once: true });
    img.addEventListener('error', ready, { once: true });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const still = stills.get(entry.target);
        if (!still) continue;
        const view = viewOf(entry);
        if (!still.seen) {
          // First sight: settle the look with no transition. With `is-printed` set first, adding
          // `is-reveal` changes nothing on screen; without it, the photo hides at once (the
          // hidden state has no transition), and only `is-printed` added later animates.
          still.seen = true;
          still.goal = stillFirstGoal(view);
          still.el.classList.toggle('is-printed', still.goal === 1);
          still.el.classList.add('is-reveal');
          continue;
        }
        const goal = stillGoal(view, still.goal);
        if (goal !== still.goal) {
          still.goal = goal;
          show(still, goal);
        }
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
      still.seen = false;
      still.goal = 0;
      still.el.classList.remove('is-reveal', 'is-printed');
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
