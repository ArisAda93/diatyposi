import { describe, expect, it } from 'vitest';
import {
  DUST,
  DUST_INK,
  DUST_SEED,
  createDustBuffers,
  deviceRect,
  dustDepthRange,
  dustLook,
  dustOnScreen,
  dustPlan,
  fieldExtent,
  layDust,
  type DustBuffers,
  type DustFrame,
} from '../src/scripts/hero-scene/dust';

/** Camera distance at which one unit on the pivot's plane is one CSS px (scene.ts, FOV 30°). */
const distanceFor = (height: number): number => height / 2 / Math.tan((30 * Math.PI) / 360);

/** A desktop hero with the mark in the right column, and a phone hero with it above the copy. */
const desktop: DustFrame = {
  width: 1440,
  height: 900,
  pivotX: 1080,
  pivotY: 470,
  distance: distanceFor(900),
  footprint: { minX: -300, maxX: 300, minY: -140, maxY: 140 },
};
const phone: DustFrame = {
  width: 390,
  height: 844,
  pivotX: 229,
  pivotY: 176,
  distance: distanceFor(844),
  footprint: { minX: -130, maxX: 130, minY: -60, maxY: 60 },
};
const frames = { desktop, phone };

/** Slack for values stored as 32-bit floats. */
const SLACK = 1e-3;

const at = (array: Float32Array, i: number): number => {
  const value = array[i];
  if (value === undefined) throw new Error(`No value at ${i}`);
  return value;
};

interface Speck {
  x: number;
  y: number;
  z: number;
  homeX: number;
  homeY: number;
  ink: number;
  size: number;
  phase: number;
  drift: number;
  blur: number;
}

/** Every speck of a layout as plain records. */
const specksOf = (buffers: DustBuffers, count: number): Speck[] =>
  Array.from({ length: count }, (_, i) => ({
    x: at(buffers.position, i * 3),
    y: at(buffers.position, i * 3 + 1),
    z: at(buffers.position, i * 3 + 2),
    homeX: at(buffers.home, i * 2),
    homeY: at(buffers.home, i * 2 + 1),
    ink: at(buffers.look, i * 4),
    size: at(buffers.look, i * 4 + 1),
    phase: at(buffers.look, i * 4 + 2),
    drift: at(buffers.look, i * 4 + 3),
    blur: at(buffers.blur, i),
  }));

/** The hero's whole field, as the scene lays it out. */
const fieldOf = (frame: DustFrame, seed = DUST_SEED): Speck[] => {
  const plan = dustPlan(frame);
  return specksOf(layDust(frame, plan, seed), plan.count);
};

/**
 * Where a speck shows on the hero (hero px, y down) with the view turned by yaw and pitch as the
 * scene turns it (OGL Euler order YXZ: pitch about x first, then yaw about y, about the pivot),
 * seen from the camera on the hero's centre line; null when it is behind or at the camera.
 */
const project = (frame: DustFrame, speck: Speck, yaw = 0, pitch = 0) => {
  const sp = Math.sin(pitch);
  const cp = Math.cos(pitch);
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  const y1 = speck.y * cp - speck.z * sp;
  const z1 = speck.y * sp + speck.z * cp;
  const x2 = speck.x * cy + z1 * sy;
  const z2 = -speck.x * sy + z1 * cy;
  const depth = frame.distance - z2;
  if (depth < frame.distance * 0.08) return null;
  const perspective = frame.distance / depth;
  const fromCentreX = (frame.pivotX - frame.width / 2 + x2) * perspective;
  const fromCentreY = (frame.height / 2 - frame.pivotY + y1) * perspective;
  return { x: frame.width / 2 + fromCentreX, y: frame.height / 2 - fromCentreY };
};

/** The specks that show on the hero with the view turned so. */
const shownOn = (frame: DustFrame, field: Speck[], yaw = 0, pitch = 0) => {
  const shown: { x: number; y: number; speck: Speck }[] = [];
  for (const speck of field) {
    const p = project(frame, speck, yaw, pitch);
    if (!p) continue;
    if (p.x < 0 || p.x >= frame.width || p.y < 0 || p.y >= frame.height) continue;
    shown.push({ ...p, speck });
  }
  return shown;
};

describe('dust count', () => {
  it('shows about 1000 specks on a desktop hero and about 400 on a phone', () => {
    const big = dustOnScreen(desktop.width, desktop.height);
    const small = dustOnScreen(phone.width, phone.height);
    expect(big).toBeGreaterThan(900);
    expect(big).toBeLessThan(1100);
    expect(small).toBeGreaterThanOrEqual(350);
    expect(small).toBeLessThanOrEqual(450);
  });

  it('never shows more than the cap nor fewer than the floor', () => {
    expect(dustOnScreen(5120, 2880)).toBe(DUST.count.max);
    expect(dustOnScreen(0, 0)).toBe(DUST.count.min);
  });

  it('holds more specks than it shows, for the turned views, within the buffers', () => {
    const huge: DustFrame = { ...desktop, width: 5120, height: 2880, distance: distanceFor(2880) };
    for (const frame of [...Object.values(frames), huge]) {
      const plan = dustPlan(frame);
      expect(plan.count).toBe(plan.crisp + plan.bokeh);
      expect(plan.count).toBeLessThanOrEqual(DUST.count.field);
      expect(plan.count).toBeGreaterThan(dustOnScreen(frame.width, frame.height));
      expect(plan.bokeh).toBeGreaterThan(0);
    }
    expect(createDustBuffers().position.length).toBe(DUST.count.field * 3);
  });
});

describe('dust layout', () => {
  it('is the same for the same seed and different for another', () => {
    const plan = dustPlan(desktop);
    const a = layDust(desktop, plan, DUST_SEED);
    const b = layDust(desktop, plan, DUST_SEED);
    const c = layDust(desktop, plan, DUST_SEED + 1);
    expect([...b.position]).toEqual([...a.position]);
    expect([...b.look]).toEqual([...a.look]);
    expect([...b.home]).toEqual([...a.home]);
    expect([...b.blur]).toEqual([...a.blur]);
    expect([...c.position]).not.toEqual([...a.position]);
  });

  it('writes into the buffers it is given and refuses a plan they cannot hold', () => {
    const plan = dustPlan(phone);
    const out = createDustBuffers(plan.count);
    expect(layDust(phone, plan, DUST_SEED, out)).toBe(out);
    const small = createDustBuffers(plan.count - 1);
    expect(() => layDust(phone, plan, DUST_SEED, small)).toThrow();
  });

  for (const [name, frame] of Object.entries(frames)) {
    it(`keeps every speck within the field's depths and its spread there (${name})`, () => {
      const depth = dustDepthRange(frame.distance);
      const field = fieldOf(frame);
      for (const speck of field) {
        expect(speck.z).toBeGreaterThanOrEqual(depth.min - SLACK);
        expect(speck.z).toBeLessThanOrEqual(depth.max + SLACK);
        const extent = fieldExtent(frame, speck.z);
        expect(speck.x).toBeGreaterThanOrEqual(extent.minX - SLACK);
        expect(speck.x).toBeLessThanOrEqual(extent.maxX + SLACK);
        expect(speck.y).toBeGreaterThanOrEqual(extent.minY - SLACK);
        expect(speck.y).toBeLessThanOrEqual(extent.maxY + SLACK);
      }
      // Crisp specks reach well behind the pivot's plane; the bokeh ones float in front of it.
      expect(field.some((s) => s.blur === 0 && s.z < -frame.distance)).toBe(true);
      for (const speck of field.filter((s) => s.blur > 0)) {
        expect(speck.z).toBeGreaterThanOrEqual(DUST.bokeh.from * frame.distance - SLACK);
      }
    });

    it(`spreads the deep layers wider than the pivot's plane (${name})`, () => {
      const deep = fieldExtent(frame, -DUST.depth.far * frame.distance);
      const plane = fieldExtent(frame, 0);
      expect(deep.maxX - deep.minX).toBeGreaterThan(plane.maxX - plane.minX);
      expect(deep.maxY - deep.minY).toBeGreaterThan(plane.maxY - plane.minY);
    });

    it(`shows the planned density evenly over the hero at rest (${name})`, () => {
      const target = dustOnScreen(frame.width, frame.height);
      const shown = shownOn(frame, fieldOf(frame));
      expect(shown.length).toBeGreaterThan(target * 0.8);
      expect(shown.length).toBeLessThan(target * 1.2);
      // About 6–10 % of them are bokeh.
      const bokeh = shown.filter((p) => p.speck.blur > 0).length / shown.length;
      expect(bokeh).toBeGreaterThan(0.04);
      expect(bokeh).toBeLessThan(0.13);
      // Every quarter of the hero gets its share.
      for (const [qx, qy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        const inQuarter = shown.filter(
          (p) =>
            Math.floor((p.x / frame.width) * 2) === qx &&
            Math.floor((p.y / frame.height) * 2) === qy,
        );
        expect(inQuarter.length).toBeGreaterThan(shown.length * 0.15);
      }
    });

    it(`keeps every edge of the hero filled with the view turned furthest (${name})`, () => {
      const field = fieldOf(frame);
      const target = dustOnScreen(frame.width, frame.height);
      const band = 0.15;
      for (const yaw of [DUST.turn.yaw, -DUST.turn.yaw]) {
        for (const pitch of [DUST.turn.pitch, -DUST.turn.pitch]) {
          const shown = shownOn(frame, field, yaw, pitch);
          expect(shown.length).toBeGreaterThan(target * 0.5);
          // A band along an edge, 15 % of the hero deep, keeps a fair share of the density it
          // shows at rest. Measured against the rest density, not the turned view's own total:
          // in a rigid field the side turning away gathers more specks per px and the side
          // turning towards the camera fewer (perspective), so the turned total is inflated and
          // the near side thins to about half by geometry alone. A sparse strip, where the field
          // runs out, keeps almost none.
          const fair = target * band * 0.4;
          const edges = {
            left: shown.filter((p) => p.x < frame.width * band),
            right: shown.filter((p) => p.x >= frame.width * (1 - band)),
            top: shown.filter((p) => p.y < frame.height * band),
            bottom: shown.filter((p) => p.y >= frame.height * (1 - band)),
          };
          for (const specks of Object.values(edges)) {
            expect(specks.length).toBeGreaterThan(fair);
          }
        }
      }
    });
  }

  it('prints only cyan, magenta and yellow, mostly cyan and magenta', () => {
    const field = fieldOf(desktop);
    const tally = { c: 0, m: 0, y: 0 };
    for (const speck of field) {
      if (speck.ink === DUST_INK.c) tally.c++;
      else if (speck.ink === DUST_INK.m) tally.m++;
      else if (speck.ink === DUST_INK.y) tally.y++;
      else throw new Error(`Unexpected ink ${speck.ink}`);
    }
    expect(tally.c + tally.m).toBeGreaterThan(field.length / 2);
    expect(tally.c).toBeGreaterThan(tally.y);
    expect(tally.m).toBeGreaterThan(tally.y);
    expect(tally.y).toBeGreaterThan(0);
  });

  it('gathers absorbed specks inside the mark’s footprint', () => {
    for (const frame of Object.values(frames)) {
      const { footprint } = frame;
      for (const speck of fieldOf(frame)) {
        expect(speck.homeX).toBeGreaterThanOrEqual(footprint.minX - SLACK);
        expect(speck.homeX).toBeLessThanOrEqual(footprint.maxX + SLACK);
        expect(speck.homeY).toBeGreaterThanOrEqual(footprint.minY - SLACK);
        expect(speck.homeY).toBeLessThanOrEqual(footprint.maxY + SLACK);
      }
    }
  });

  it('gives crisp specks a fine size and bokeh specks a large, soft one', () => {
    for (const speck of fieldOf(desktop)) {
      if (speck.blur === 0) {
        expect(speck.size).toBeGreaterThanOrEqual(DUST.size.min - SLACK);
        expect(speck.size).toBeLessThanOrEqual(DUST.size.largeMax + SLACK);
      } else {
        expect(speck.size).toBeGreaterThanOrEqual(DUST.bokeh.min - SLACK);
        expect(speck.size).toBeLessThanOrEqual(DUST.bokeh.max + SLACK);
        expect(speck.size).toBeGreaterThan(DUST.size.largeMax);
        expect(speck.blur).toBeGreaterThanOrEqual(DUST.bokeh.blur - SLACK);
        expect(speck.blur).toBeLessThanOrEqual(1 + SLACK);
      }
      expect(speck.drift).toBeGreaterThanOrEqual(DUST.drift.min - SLACK);
      expect(speck.drift).toBeLessThanOrEqual(DUST.drift.max + SLACK);
      expect(speck.phase).toBeGreaterThanOrEqual(0);
      expect(speck.phase).toBeLessThanOrEqual(Math.PI * 2 + SLACK);
    }
  });
});

describe('dust looks', () => {
  it('keeps every strength within 0–1 in both themes: present, yet quiet', () => {
    for (const theme of ['light', 'dark'] as const) {
      const look = dustLook(theme);
      for (const value of Object.values(look)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      expect(look.alpha).toBeGreaterThanOrEqual(0.6);
      expect(look.alpha).toBeLessThanOrEqual(0.8);
      // A bokeh speck prints about a quarter of the ink at its centre; far specks print less.
      expect(look.alpha * look.bokeh).toBeGreaterThanOrEqual(0.2);
      expect(look.alpha * look.bokeh).toBeLessThanOrEqual(0.3);
      expect(look.far).toBeLessThan(1);
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
