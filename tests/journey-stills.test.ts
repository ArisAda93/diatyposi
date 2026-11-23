/**
 * Home “Μία ιδέα. Παντού.” stills (src/scripts/journey-stills.ts): the scroll progress of a still
 * and the printed look it maps to (halftone dots, misregistration ghost, register settle).
 */
import { describe, expect, it } from 'vitest';
import {
  STILL_CELL,
  STILL_PLAY,
  stillGoal,
  stillPrint,
  stillStep,
  stillProgress,
} from '../src/scripts/journey-stills';

const VH = 1000;
const H = 200;
/** `top` that puts a still's centre at `share` of the viewport height. */
const topAt = (share: number, height = H): number => share * VH - height / 2;

const samples = (count: number): number[] => Array.from({ length: count + 1 }, (_, i) => i / count);

describe('stillProgress', () => {
  it('is 0 while the centre is at or below the start line (85 %)', () => {
    expect(stillProgress(topAt(0.85), H, VH)).toBe(0);
    expect(stillProgress(topAt(0.95), H, VH)).toBe(0);
    expect(stillProgress(VH * 3, H, VH)).toBe(0);
  });

  it('is 1 once the centre is at or above the end line (45 %)', () => {
    expect(stillProgress(topAt(0.45), H, VH)).toBe(1);
    expect(stillProgress(topAt(0.1), H, VH)).toBe(1);
    expect(stillProgress(-VH * 3, H, VH)).toBe(1);
  });

  it('runs linearly between the lines', () => {
    expect(stillProgress(topAt(0.65), H, VH)).toBeCloseTo(0.5, 10);
    expect(stillProgress(topAt(0.75), H, VH)).toBeCloseTo(0.25, 10);
  });

  it('grows monotonically as the still scrolls up, and stays within 0…1', () => {
    let previous = -Infinity;
    for (let top = VH * 1.5; top >= -VH; top -= 7) {
      const value = stillProgress(top, H, VH);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('handles a zero-height still by its top edge', () => {
    expect(stillProgress(0.9 * VH, 0, VH)).toBe(0);
    expect(stillProgress(0.65 * VH, 0, VH)).toBeCloseTo(0.5, 10);
    expect(stillProgress(0.4 * VH, 0, VH)).toBe(1);
  });

  it('falls back to the final state without a viewport', () => {
    expect(stillProgress(100, H, 0)).toBe(1);
    expect(stillProgress(Number.NaN, H, VH)).toBe(1);
  });
});

describe('stillPrint', () => {
  const merged = (STILL_CELL * Math.SQRT2) / 2;

  it('shows only the sketch at the start', () => {
    const look = stillPrint(0);
    expect(look.shown).toBe(false);
    expect(look.dot).toBe(0);
    expect(look.ghost).toBe(0);
  });

  it('ends on the plain photo: unmasked, shown, in register, no ghost', () => {
    const look = stillPrint(1);
    expect(look.shown).toBe(true);
    expect(look.masked).toBe(false);
    expect(look.ghost).toBe(0);
    expect(look.offset).toBeCloseTo(0, 10);
    expect(look.scale).toBeCloseTo(1, 10);
  });

  it('clamps progress outside 0…1', () => {
    expect(stillPrint(-0.5)).toEqual(stillPrint(0));
    expect(stillPrint(1.5)).toEqual(stillPrint(1));
  });

  it('merges the dots fully before progress reaches 1, and drops the mask only after', () => {
    const first = samples(400).find((real) => stillPrint(real).dot >= merged);
    expect(first).toBeDefined();
    expect(first ?? 1).toBeLessThan(1);
    const unmasked = samples(400).find((real) => {
      const look = stillPrint(real);
      return look.shown && !look.masked;
    });
    expect(unmasked).toBeDefined();
    expect(stillPrint(unmasked ?? 1).dot).toBeGreaterThanOrEqual(merged);
  });

  it('grows the dots monotonically', () => {
    let previous = -Infinity;
    for (const real of samples(500)) {
      const { dot } = stillPrint(real);
      expect(dot).toBeGreaterThanOrEqual(previous);
      previous = dot;
    }
  });

  it('paints the photo whenever it is masked, and prints dots once it is shown', () => {
    for (const real of samples(500)) {
      const look = stillPrint(real);
      if (look.masked) expect(look.shown).toBe(true);
      if (look.shown) expect(look.dot).toBeGreaterThan(0);
    }
  });

  it('keeps every value finite and in range', () => {
    for (const real of samples(500)) {
      const look = stillPrint(real);
      for (const value of [look.dot, look.ghost, look.offset, look.scale]) {
        expect(Number.isFinite(value)).toBe(true);
      }
      expect(look.dot).toBeGreaterThanOrEqual(0);
      expect(look.dot).toBeLessThanOrEqual(merged + 1);
      expect(look.ghost).toBeGreaterThanOrEqual(0);
      expect(look.ghost).toBeLessThanOrEqual(1);
      expect(Math.abs(look.offset)).toBeLessThanOrEqual(1);
      expect(look.scale).toBeGreaterThanOrEqual(1);
      expect(look.scale).toBeLessThan(1.1);
    }
  });

  it('shows the misregistration ghost while the dots print, gone before they merge', () => {
    const ghosted = samples(400).filter((real) => stillPrint(real).ghost > 0);
    expect(ghosted.length).toBeGreaterThan(0);
    for (const real of ghosted) expect(stillPrint(real).dot).toBeLessThan(merged);
  });

  it('scales the dots with the cell', () => {
    expect(stillPrint(0.5, 18).dot).toBeGreaterThan(stillPrint(0.5, 9).dot);
  });
});

describe('stillGoal and stillStep (the print plays by itself once triggered)', () => {
  it('starts the print once the still is well in view and keeps it', () => {
    expect(stillGoal(0.5, topAt(0.65), VH, 0)).toBe(1);
    expect(stillGoal(0.2, topAt(0.77), VH, 1)).toBe(1);
  });

  it('does not start before, and resets once the still is below the viewport again', () => {
    expect(stillGoal(0.2, topAt(0.77), VH, 0)).toBe(0);
    expect(stillGoal(0, VH + 10, VH, 1)).toBe(0);
  });

  it('plays forwards over STILL_PLAY seconds and never stops half-way while triggered', () => {
    let real = 0;
    let ms = 0;
    while (real < 1 && ms < 10_000) {
      real = stillStep(real, 1, 16);
      ms += 16;
    }
    expect(real).toBe(1);
    expect(ms / 1000).toBeCloseTo(STILL_PLAY, 1);
    expect(stillStep(1, 1, 16)).toBe(1);
  });

  it('resets to the sketch at once', () => {
    expect(stillStep(0.6, 0, 16)).toBe(0);
  });
});
