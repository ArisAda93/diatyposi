/**
 * The press run that prints a journey step's photograph over its sketch
 * (src/scripts/journey-print/state.ts): sheet, plates in press order, register, halftone to tone,
 * true photo.
 */
import { describe, expect, it } from 'vitest';
import { PRINT_PLATES, printState } from '../src/scripts/journey-print/state';

describe('printState', () => {
  it('prints nothing before the run starts', () => {
    const s = printState(0);
    expect(s.paper).toBe(0);
    expect(s.plates.every((p) => p.cover === 0)).toBe(true);
    expect(s.resolve).toBe(0);
    expect(s.photo).toBe(0);
  });

  it('ends on the true photograph, every plate fully down and in register', () => {
    const s = printState(1);
    expect(s.paper).toBe(1);
    for (const plate of s.plates) {
      expect(plate.cover).toBe(1);
      expect(plate.shift).toBeCloseTo(0, 10);
    }
    expect(s.resolve).toBe(1);
    expect(s.photo).toBe(1);
  });

  it('prints the plates in press order, Y, M, C, K', () => {
    expect(PRINT_PLATES.map((p) => p.id)).toEqual(['y', 'm', 'c', 'k']);
    const [y, m, c, k] = printState(0.3).plates.map((p) => p.cover);
    expect(y).toBeGreaterThan(m ?? 1);
    expect(m).toBeGreaterThan(c ?? 1);
    expect(c).toBeGreaterThanOrEqual(k ?? 1);
  });

  it('slides each plate in out of register and snaps it in with an overshoot', () => {
    const shifts = (index: number) =>
      Array.from({ length: 101 }, (_, i) => printState(i / 100).plates[index]?.shift ?? 0);
    PRINT_PLATES.forEach((_, j) => {
      const run = shifts(j);
      expect(run[0]).toBe(1);
      expect(Math.min(...run)).toBeLessThan(0);
      expect(run[100]).toBeCloseTo(0, 10);
    });
  });

  it('shows the halftone before resolving it, and the four-ink print before the photo', () => {
    const mid = printState(0.5);
    expect(mid.plates.some((p) => p.cover > 0.5)).toBe(true);
    expect(mid.resolve).toBe(0);
    const late = printState(0.9);
    expect(late.resolve).toBeGreaterThan(late.photo);
  });

  it('clamps and stays in range', () => {
    expect(printState(-2)).toEqual(printState(0));
    expect(printState(5)).toEqual(printState(1));
    for (let r = 0; r <= 1; r += 0.02) {
      const s = printState(r);
      for (const v of [s.paper, s.resolve, s.photo, ...s.plates.map((p) => p.cover)]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});
