/**
 * Home “Μία ιδέα. Παντού.” stills (src/scripts/journey-stills.ts): how much of a still is in view,
 * when its sketch draws in and when its product prints, how long the sketch holds first, when it
 * returns to its blank sheet, the look it takes when the script first sees it, and the press
 * amounts that clear the sketch.
 */
import { describe, expect, it } from 'vitest';
import {
  STILL_DRAW_MS,
  STILL_DRAW_TRIGGER,
  STILL_HOLD_MS,
  STILL_PRINT_TRIGGER,
  STILL_THRESHOLDS,
  pressLook,
  printWait,
  stillAbove,
  stillFirstGoal,
  stillGoal,
  stillInView,
  type StillView,
} from '../src/scripts/journey-stills';

/** A 390 × 844 phone viewport and a 358 px still. */
const VH = 844;
const H = 358;
/** A still whose top is at `top` (viewport px). */
const at = (top: number, height = H, viewBottom = VH): StillView => ({
  top,
  bottom: top + height,
  viewTop: 0,
  viewBottom,
});

describe('stillInView', () => {
  it('is 0 outside the viewport and 1 when wholly inside', () => {
    expect(stillInView(at(VH))).toBe(0);
    expect(stillInView(at(VH + 500))).toBe(0);
    expect(stillInView(at(-H))).toBe(0);
    expect(stillInView(at(200))).toBe(1);
  });

  it('is the visible share of the still while it crosses an edge', () => {
    expect(stillInView(at(VH - H / 2))).toBeCloseTo(0.5, 10);
    expect(stillInView(at(VH - H / 4))).toBeCloseTo(0.25, 10);
    expect(stillInView(at(-H / 4))).toBeCloseTo(0.75, 10);
  });

  it('measures a still taller than the viewport against the viewport', () => {
    // A 600 px still in a 390 px landscape viewport, covering all of it.
    expect(stillInView(at(-100, 600, 390))).toBe(1);
    // Half the viewport covered.
    expect(stillInView(at(195, 600, 390))).toBeCloseTo(0.5, 10);
  });

  it('gives the final state for degenerate input', () => {
    expect(stillInView(at(100, H, 0))).toBe(1);
    expect(stillInView({ ...at(100), top: Number.NaN })).toBe(1);
  });
});

describe('stillGoal', () => {
  /** Top of the still when `share` of it is in view, entering from below. */
  const entering = (share: number): number => VH - H * share;

  it('stays the blank sheet until the draw trigger', () => {
    expect(stillGoal(at(entering(STILL_DRAW_TRIGGER) + 10), 0)).toBe(0);
    expect(stillGoal(at(VH - 5), 0)).toBe(0);
  });

  it('draws the sketch from the draw trigger, and not the product yet', () => {
    expect(stillGoal(at(entering(STILL_DRAW_TRIGGER) - 1), 0)).toBe(1);
    expect(stillGoal(at(entering(STILL_PRINT_TRIGGER) + 10), 0)).toBe(1);
  });

  it('asks for the product once practically all of it is in view', () => {
    expect(stillGoal(at(entering(STILL_PRINT_TRIGGER) - 1), 0)).toBe(2);
    expect(stillGoal(at(entering(STILL_PRINT_TRIGGER) - 1), 1)).toBe(2);
    expect(stillGoal(at(200), 1)).toBe(2);
  });

  it('never stops a beat half-way while the still is partly in view', () => {
    // Scrolled back so that only a little of it shows: keeps what it had.
    expect(stillGoal(at(VH - 30), 1)).toBe(1);
    expect(stillGoal(at(VH - 30), 2)).toBe(2);
    // Back under the print trigger but over the draw trigger: the product stays.
    expect(stillGoal(at(entering(0.5)), 2)).toBe(2);
    // Partly off the top: stays printed.
    expect(stillGoal(at(-H + 30), 2)).toBe(2);
  });

  it('returns to the blank sheet once wholly below the viewport, so it plays again', () => {
    expect(stillGoal(at(VH), 2)).toBe(0);
    expect(stillGoal(at(VH + 400), 1)).toBe(0);
  });

  it('is the product once scrolled past above, even if it never played', () => {
    expect(stillGoal(at(-H), 0)).toBe(2);
    expect(stillGoal(at(-H - 2000), 1)).toBe(2);
  });

  it('measures a still taller than the viewport against the viewport', () => {
    expect(stillGoal(at(390 * (1 - STILL_PRINT_TRIGGER) - 1, 600, 390), 1)).toBe(2);
    expect(stillGoal(at(390 * (1 - STILL_DRAW_TRIGGER) - 1, 600, 390), 0)).toBe(1);
    expect(stillGoal(at(390 * (1 - STILL_DRAW_TRIGGER) + 20, 600, 390), 0)).toBe(0);
  });

  it('gives the final state for degenerate input', () => {
    expect(stillGoal(at(VH + 100, H, 0), 0)).toBe(2);
    expect(stillGoal({ ...at(VH + 100), bottom: Number.POSITIVE_INFINITY }, 0)).toBe(2);
  });
});

describe('stillAbove', () => {
  it('is true only once the still is wholly above the viewport', () => {
    expect(stillAbove(at(-H))).toBe(true);
    expect(stillAbove(at(-H - 500))).toBe(true);
    expect(stillAbove(at(-H + 1))).toBe(false);
    expect(stillAbove(at(200))).toBe(false);
    expect(stillAbove(at(VH + 10))).toBe(false);
  });

  it('is false for degenerate input', () => {
    expect(stillAbove(at(-H - 10, H, 0))).toBe(false);
    expect(stillAbove({ ...at(-H - 10), top: Number.NaN })).toBe(false);
  });
});

describe('stillFirstGoal', () => {
  it('starts as the blank sheet only while wholly below the viewport', () => {
    expect(stillFirstGoal(at(VH))).toBe(0);
    expect(stillFirstGoal(at(VH + 2000))).toBe(0);
  });

  it('keeps the product for anything in view or above, so nothing on screen flips back', () => {
    expect(stillFirstGoal(at(VH - 10))).toBe(2);
    expect(stillFirstGoal(at(200))).toBe(2);
    expect(stillFirstGoal(at(-H - 500))).toBe(2);
  });

  it('gives the final state for degenerate input', () => {
    expect(stillFirstGoal(at(VH + 100, H, 0))).toBe(2);
    expect(stillFirstGoal({ ...at(VH + 100), top: Number.NaN })).toBe(2);
  });
});

describe('printWait', () => {
  const sketchTime = STILL_DRAW_MS + STILL_HOLD_MS;

  it('lets the sketch draw in and hold before the print', () => {
    expect(printWait(1000, 1000)).toBe(sketchTime);
    expect(printWait(1000, 1000 + STILL_DRAW_MS)).toBe(STILL_HOLD_MS);
  });

  it('prints at once when the sketch has already been shown long enough', () => {
    expect(printWait(1000, 1000 + sketchTime)).toBe(0);
    expect(printWait(1000, 1000 + sketchTime + 5000)).toBe(0);
  });

  it('gives the sketch a watchable moment of its own', () => {
    expect(STILL_DRAW_MS).toBeGreaterThanOrEqual(1200);
    expect(STILL_HOLD_MS).toBeGreaterThanOrEqual(300);
  });

  it('prints at once for non-finite input', () => {
    expect(printWait(Number.NaN, 1000)).toBe(0);
    expect(printWait(0, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('pressLook', () => {
  it('shows the whole sketch before the press and none of it after', () => {
    expect(pressLook(0, false)).toEqual({ fill: 1, line: 1, mark: 1, plate: 1 });
    expect(pressLook(1, false)).toEqual({ fill: 0, line: 0, mark: 0, plate: 1 });
    expect(pressLook(1, true)).toEqual({ fill: 0, line: 0, mark: 0, plate: 0 });
  });

  it('keeps the lines over the first inks while the paper clears for the sheet', () => {
    const early = pressLook(0.3, false);
    expect(early.fill).toBe(0);
    expect(early.line).toBe(1);
    expect(early.mark).toBe(1);
  });

  it('lets only the plates leave with the paper in dark theme, where the sheet is light', () => {
    expect(pressLook(0.3, true).plate).toBe(0);
    expect(pressLook(0.1, true).plate).toBeCloseTo(pressLook(0.1, true).fill, 10);
    expect(pressLook(0.3, false).plate).toBe(1);
  });

  it('keeps the pencil sketch (the mark group) over the first inks in both themes', () => {
    expect(pressLook(0.3, true).mark).toBe(1);
    expect(pressLook(0.3, true)).toEqual({ ...pressLook(0.3, false), plate: 0 });
  });

  it('never runs backwards over the press', () => {
    let previous = pressLook(0, false);
    for (let i = 1; i <= 50; i += 1) {
      const next = pressLook(i / 50, false);
      expect(next.fill).toBeLessThanOrEqual(previous.fill);
      expect(next.line).toBeLessThanOrEqual(previous.line);
      expect(next.mark).toBeLessThanOrEqual(previous.mark);
      expect(next.plate).toBeLessThanOrEqual(previous.plate);
      previous = next;
    }
  });

  it('gives the final state for out-of-range and non-finite input', () => {
    expect(pressLook(-1, false)).toEqual({ fill: 1, line: 1, mark: 1, plate: 1 });
    expect(pressLook(2, true)).toEqual({ fill: 0, line: 0, mark: 0, plate: 0 });
    expect(pressLook(Number.NaN, false)).toEqual({ fill: 0, line: 0, mark: 0, plate: 1 });
  });
});

describe('STILL_THRESHOLDS', () => {
  it('reports entering, leaving and both trigger crossings', () => {
    expect(STILL_THRESHOLDS).toContain(0);
    expect(STILL_THRESHOLDS).toContain(1);
    expect(STILL_THRESHOLDS.some((t) => Math.abs(t - STILL_DRAW_TRIGGER) < 1e-9)).toBe(true);
    expect(STILL_THRESHOLDS.some((t) => Math.abs(t - STILL_PRINT_TRIGGER) < 1e-9)).toBe(true);
  });
});
