/**
 * Home “Μία ιδέα. Παντού.” stills (src/scripts/journey-stills.ts): how much of a still is in view,
 * when it prints its photo over its sketch, when it returns to its sketch, and the look it takes
 * when the script first sees it.
 */
import { describe, expect, it } from 'vitest';
import {
  STILL_THRESHOLDS,
  STILL_TRIGGER,
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
  it('prints once enough of the still is in view, and not before', () => {
    const threshold = VH - H * STILL_TRIGGER;
    expect(stillGoal(at(threshold - 1), 0)).toBe(1);
    expect(stillGoal(at(threshold + 20), 0)).toBe(0);
    expect(stillGoal(at(200), 0)).toBe(1);
  });

  it('never stops a print half-way while the still is partly in view', () => {
    // Scrolled back so that only a little of it shows: stays printed.
    expect(stillGoal(at(VH - 30), 1)).toBe(1);
    // Partly off the top: stays printed.
    expect(stillGoal(at(-H + 30), 1)).toBe(1);
  });

  it('returns to the sketch once wholly below the viewport, so it prints again', () => {
    expect(stillGoal(at(VH), 1)).toBe(0);
    expect(stillGoal(at(VH + 400), 1)).toBe(0);
  });

  it('is printed once scrolled past above, even if it was never seen printing', () => {
    expect(stillGoal(at(-H), 0)).toBe(1);
    expect(stillGoal(at(-H - 2000), 0)).toBe(1);
  });

  it('prints a still taller than the viewport once it fills enough of the viewport', () => {
    expect(stillGoal(at(390 * (1 - STILL_TRIGGER) - 1, 600, 390), 0)).toBe(1);
    expect(stillGoal(at(390 * (1 - STILL_TRIGGER) + 20, 600, 390), 0)).toBe(0);
  });

  it('gives the final state for degenerate input', () => {
    expect(stillGoal(at(VH + 100, H, 0), 0)).toBe(1);
    expect(stillGoal({ ...at(VH + 100), bottom: Number.POSITIVE_INFINITY }, 0)).toBe(1);
  });
});

describe('stillFirstGoal', () => {
  it('starts as the sketch only while wholly below the viewport', () => {
    expect(stillFirstGoal(at(VH))).toBe(0);
    expect(stillFirstGoal(at(VH + 2000))).toBe(0);
  });

  it('keeps the product for anything in view or above, so nothing on screen flips back', () => {
    expect(stillFirstGoal(at(VH - 10))).toBe(1);
    expect(stillFirstGoal(at(200))).toBe(1);
    expect(stillFirstGoal(at(-H - 500))).toBe(1);
  });

  it('gives the final state for degenerate input', () => {
    expect(stillFirstGoal(at(VH + 100, H, 0))).toBe(1);
    expect(stillFirstGoal({ ...at(VH + 100), top: Number.NaN })).toBe(1);
  });
});

describe('STILL_THRESHOLDS', () => {
  it('reports entering, leaving and the trigger crossing', () => {
    expect(STILL_THRESHOLDS).toContain(0);
    expect(STILL_THRESHOLDS).toContain(1);
    expect(STILL_THRESHOLDS.some((t) => Math.abs(t - STILL_TRIGGER) < 1e-9)).toBe(true);
  });
});
