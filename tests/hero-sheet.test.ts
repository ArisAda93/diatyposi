import { describe, expect, it } from 'vitest';
import type { Box, Placement } from '../src/scripts/hero-scene/math';
import {
  SHEET_DOTS,
  deviceRect,
  dotPitch,
  sheetLayout,
  sheetLook,
  toGroup,
  type SheetLayout,
} from '../src/scripts/hero-scene/sheet';

/** The plates rest centred in the art box at the box's width over the art's 900 raster units. */
const restIn = (art: Box): Placement => ({
  x: art.left + art.width / 2,
  y: art.top + art.height / 2,
  scale: art.width / 900,
});

/** The sheet's edges in group units (y up). */
const edges = (sheet: SheetLayout) => ({
  left: sheet.x - sheet.width / 2,
  right: sheet.x + sheet.width / 2,
  bottom: sheet.y - sheet.height / 2,
  top: sheet.y + sheet.height / 2,
});

/** A box in hero px as group-unit edges (y up). */
const boxInGroup = (box: Box, rest: Placement) => {
  const topLeft = toGroup(box.left, box.top, rest);
  const bottomRight = toGroup(box.left + box.width, box.top + box.height, rest);
  return { left: topLeft.x, right: bottomRight.x, top: topLeft.y, bottom: bottomRight.y };
};

const desktop = {
  hero: { width: 1440, height: 780 },
  art: { left: 780, top: 170, width: 660, height: 455 },
};
const phone = {
  hero: { width: 390, height: 700 },
  art: { left: 84, top: 76, width: 290, height: 200 },
};

describe('sheet layout', () => {
  for (const [name, layout] of Object.entries({ desktop, phone })) {
    it(`covers the art box with a margin on every side (${name})`, () => {
      const rest = restIn(layout.art);
      const sheet = edges(sheetLayout(layout.art, layout.hero, rest));
      const art = boxInGroup(layout.art, rest);
      expect(sheet.left).toBeLessThan(art.left);
      expect(sheet.right).toBeGreaterThan(art.right);
      expect(sheet.top).toBeGreaterThan(art.top);
      expect(sheet.bottom).toBeLessThan(art.bottom);
    });
  }

  it('runs from under the copy column to past the hero’s right edge on desktop', () => {
    const rest = restIn(desktop.art);
    const sheet = edges(sheetLayout(desktop.art, desktop.hero, rest));
    const heroRight = toGroup(desktop.hero.width, 0, rest).x;
    const copyColumnRight = toGroup(desktop.hero.width / 2, 0, rest).x;
    expect(sheet.right).toBeGreaterThan(heroRight);
    expect(sheet.left).toBeLessThan(copyColumnRight);
    // Its bottom edge (and the colour strip on it) stays inside the hero.
    expect(sheet.bottom).toBeGreaterThan(toGroup(0, desktop.hero.height, rest).y);
  });

  it('stays centred on the art on a phone', () => {
    const rest = restIn(phone.art);
    const sheet = sheetLayout(phone.art, phone.hero, rest);
    const art = boxInGroup(phone.art, rest);
    expect(sheet.x).toBeGreaterThan(art.left);
    expect(sheet.x).toBeLessThan(art.right);
    expect(sheet.y).toBeLessThan(art.top);
    expect(sheet.y).toBeGreaterThan(art.bottom);
  });

  it('lets the ripple reach every visible corner of the sheet', () => {
    const rest = restIn(desktop.art);
    const sheet = sheetLayout(desktop.art, desktop.hero, rest);
    const e = edges(sheet);
    const heroRight = toGroup(desktop.hero.width, 0, rest).x;
    const corners = [
      [e.left, e.top],
      [Math.min(e.right, heroRight), e.top],
      [e.left, e.bottom],
      [Math.min(e.right, heroRight), e.bottom],
    ] as const;
    for (const [x, y] of corners) {
      expect(sheet.reach).toBeGreaterThanOrEqual(Math.hypot(x, y) - 1e-6);
    }
  });

  it('keeps the colour strip on the sheet and inside the hero', () => {
    for (const layout of [desktop, phone]) {
      const rest = restIn(layout.art);
      const sheet = sheetLayout(layout.art, layout.hero, rest);
      const heroRight = toGroup(layout.hero.width, 0, rest).x;
      expect(sheet.stripX).toBeLessThan(sheet.width / 2);
      expect(sheet.x + sheet.stripX).toBeLessThan(heroRight);
      expect(sheet.stripY).toBeLessThan(0);
      expect(sheet.stripY).toBeGreaterThan(-sheet.height / 2);
    }
  });
});

describe('group units', () => {
  it('measures from the pivot, flips y up and divides by the scale', () => {
    const rest: Placement = { x: 200, y: 300, scale: 0.5 };
    expect(toGroup(200, 300, rest)).toEqual({ x: 0, y: 0 });
    expect(toGroup(210, 280, rest)).toEqual({ x: 20, y: 40 });
    expect(toGroup(190, 320, rest)).toEqual({ x: -20, y: -40 });
  });

  it('scales the drawn details with the plates', () => {
    const big = sheetLayout(desktop.art, desktop.hero, { ...restIn(desktop.art), scale: 1 });
    const small = sheetLayout(desktop.art, desktop.hero, { ...restIn(desktop.art), scale: 0.5 });
    expect(small.marks.pitch).toBeCloseTo(big.marks.pitch * 2);
    expect(small.marks.line).toBeCloseTo(big.marks.line * 2);
  });

  it('keeps the sheet within one sheet unit of its centre (small numbers for the shader)', () => {
    for (const layout of [desktop, phone]) {
      const sheet = sheetLayout(layout.art, layout.hero, restIn(layout.art));
      expect(sheet.width / 2 / sheet.unit).toBeLessThanOrEqual(1);
      expect(sheet.height / 2 / sheet.unit).toBeLessThanOrEqual(1);
      expect(Math.max(sheet.width, sheet.height) / 2 / sheet.unit).toBeCloseTo(1);
    }
  });
});

describe('ripple dots', () => {
  it('keep a fine on-screen pitch on every hero width', () => {
    for (const width of [320, 390, 768, 1440, 2560]) {
      expect(dotPitch(width)).toBeGreaterThanOrEqual(SHEET_DOTS.min);
      expect(dotPitch(width)).toBeLessThanOrEqual(SHEET_DOTS.max);
    }
    expect(dotPitch(390)).toBeLessThanOrEqual(dotPitch(1440));
  });

  it('are laid out at that pitch on screen whatever the plates’ scale', () => {
    for (const layout of [desktop, phone]) {
      const rest = restIn(layout.art);
      const sheet = sheetLayout(layout.art, layout.hero, rest);
      expect(sheet.marks.pitch * rest.scale).toBeCloseTo(dotPitch(layout.hero.width));
    }
  });
});

describe('device rectangles for the readability mask', () => {
  it('flips y against the canvas height and multiplies by the DPR', () => {
    const rect = deviceRect({ left: 10, top: 20, width: 100, height: 50 }, 400, 2);
    expect([...rect]).toEqual([20, 660, 220, 760]);
  });

  it('puts a missing or empty box outside the canvas', () => {
    for (const box of [null, { left: 10, top: 10, width: 0, height: 40 }]) {
      const rect = deviceRect(box, 400, 2);
      expect(Math.max(...rect)).toBeLessThan(0);
    }
  });

  it('writes into the array it is given', () => {
    const out = new Float32Array(4);
    expect(deviceRect({ left: 0, top: 0, width: 1, height: 1 }, 10, 1, out)).toBe(out);
  });
});

describe('sheet looks', () => {
  it('lays paper on paper in light, with a drop shadow', () => {
    const look = sheetLook('light');
    expect(look.face).toBe(0);
    expect(look.shadow).toBeGreaterThan(0);
    expect(look.bloomInk).toBe('cyan');
  });

  it('lifts the sheet faintly in dark, without a drop shadow (screen cannot darken)', () => {
    const look = sheetLook('dark');
    expect(look.face).toBeGreaterThan(0);
    expect(look.shadow).toBe(0);
    expect(look.bloomInk).toBe('key');
  });

  it('keeps every strength within 0–1', () => {
    for (const theme of ['light', 'dark'] as const) {
      const look = sheetLook(theme);
      for (const value of Object.values(look)) {
        if (typeof value !== 'number') continue;
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
});
