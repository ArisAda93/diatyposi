/**
 * The /etaireia/ work-table scene's camera maths (src/scripts/workbench/math.ts).
 */
import { describe, expect, it } from 'vitest';
import {
  BASE_ZOOM,
  EDGE_ROOM,
  FOCUS_ZOOM,
  PARALLAX,
  breathe,
  clampCenter,
  pointerAxis,
  sampleDepth,
  toView,
} from '../src/scripts/workbench/math';

const still = { shift: { x: 0, y: 0 }, focusDepth: 0.5 };

describe('clampCenter', () => {
  it('keeps the view and the parallax room inside the photo', () => {
    for (const target of [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 0.12, y: 0.55 },
      { x: 0.95, y: 0.02 },
    ]) {
      const c = clampCenter(target, FOCUS_ZOOM);
      const half = 0.5 / FOCUS_ZOOM;
      for (const v of [c.x, c.y]) {
        expect(v - half).toBeGreaterThanOrEqual(EDGE_ROOM - 1e-9);
        expect(v + half).toBeLessThanOrEqual(1 - EDGE_ROOM + 1e-9);
      }
    }
  });

  it('goes straight to a target that already fits', () => {
    expect(clampCenter({ x: 0.5, y: 0.45 }, FOCUS_ZOOM)).toEqual({ x: 0.5, y: 0.45 });
  });

  it('centres the photo when the zoom leaves no room, and survives bad input', () => {
    expect(clampCenter({ x: 0.1, y: 0.9 }, 1)).toEqual({ x: 0.5, y: 0.5 });
    const c = clampCenter({ x: Number.NaN, y: 0.3 }, FOCUS_ZOOM);
    expect(c.x).toBe(0.5);
  });

  it('leaves the rest zoom enough room for the full parallax', () => {
    expect(0.5 - 0.5 / BASE_ZOOM).toBeGreaterThan(PARALLAX);
  });
});

describe('toView', () => {
  it('puts the view centre in the middle of the view at any zoom', () => {
    const center = { x: 0.3, y: 0.6 };
    expect(toView(center, 0.8, { center, zoom: FOCUS_ZOOM, ...still })).toEqual({
      x: 0.5,
      y: 0.5,
    });
  });

  it('scales distances from the centre by the zoom', () => {
    const v = toView({ x: 0.7, y: 0.5 }, 0.5, { center: { x: 0.5, y: 0.5 }, zoom: 2, ...still });
    expect(v.x).toBeCloseTo(0.9);
    expect(v.y).toBeCloseTo(0.5);
  });

  it('keeps a point at the focus depth still and moves nearer points against the shift', () => {
    const camera = { center: { x: 0.5, y: 0.5 }, zoom: 1, focusDepth: 0.4 };
    const shift = { x: PARALLAX, y: 0 };
    const p = { x: 0.6, y: 0.5 };
    expect(toView(p, 0.4, { ...camera, shift }).x).toBeCloseTo(0.6);
    expect(toView(p, 0.9, { ...camera, shift }).x).toBeLessThan(0.6);
    expect(toView(p, 0.1, { ...camera, shift }).x).toBeGreaterThan(0.6);
  });
});

describe('sampleDepth', () => {
  const map = [0, 255, 255, 255]; // 2 × 2: top-left black, the rest white

  it('reads corners exactly and blends between them', () => {
    expect(sampleDepth(map, 2, 2, { x: 0, y: 0 })).toBe(0);
    expect(sampleDepth(map, 2, 2, { x: 1, y: 1 })).toBe(1);
    expect(sampleDepth(map, 2, 2, { x: 0.5, y: 0 })).toBeCloseTo(0.5);
  });

  it('clamps outside points and falls back to mid depth for a broken map', () => {
    expect(sampleDepth(map, 2, 2, { x: -3, y: -3 })).toBe(0);
    expect(sampleDepth([], 2, 2, { x: 0.5, y: 0.5 })).toBe(0.5);
  });
});

describe('breathe and pointerAxis', () => {
  it('drifts within ±1 on both axes', () => {
    for (let t = 0; t < 600; t += 0.7) {
      const b = breathe(t);
      expect(Math.abs(b.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(b.y)).toBeLessThanOrEqual(1);
    }
  });

  it('maps the pointer to −1…1 over the element and clamps outside it', () => {
    const rect = { left: 100, top: 50, width: 200, height: 100 };
    expect(pointerAxis(200, 100, rect)).toEqual({ x: 0, y: 0 });
    expect(pointerAxis(100, 50, rect)).toEqual({ x: -1, y: -1 });
    expect(pointerAxis(999, -999, rect)).toEqual({ x: 1, y: -1 });
    expect(pointerAxis(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
  });
});
