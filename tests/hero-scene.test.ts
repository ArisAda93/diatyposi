import { describe, expect, it } from 'vitest';
import { ARCH, ARCH_PLATES } from '../src/components/logo-paths';
import {
  ART,
  BEATS,
  HANDOFF,
  PERIOD,
  PLATES,
  PRINT,
  PULSE_PEAK,
  SHEET,
  STAGGER,
  archMetrics,
  beatAt,
  blendPose,
  buildLayout,
  easeSnap,
  effectsAt,
  floatPose,
  handoff,
  holdPose,
  loopTime,
  plateShadow,
  platePoseAt,
  poseBounds,
  printAlpha,
  registerPose,
  registrationPulse,
  restTilt,
  tiltAt,
  type BeatName,
  type PlateId,
  type PlateLayout,
  type PlatePose,
  type Tilt,
} from '../src/scripts/hero-scene/choreography';
import {
  boundsOf,
  extrude,
  sampleArc,
  sampleOutline,
  signedArea,
  toLocal,
  triangulate,
  type Point,
} from '../src/scripts/hero-scene/geometry';
import {
  DPR_CAP,
  HANDOFF_DISTANCE,
  clamp,
  cubicBezier,
  dockProgress,
  drawingDpr,
  easeInOutCubic,
  easeOutBack,
  guardY,
  handoffDistance,
  placeInBox,
  smoothstep,
  type HandoffInput,
} from '../src/scripts/hero-scene/math';
import {
  HERO_HANDOFF_EVENT,
  handoffChanged,
  latestHeroHandoff,
  publishHeroHandoff,
  type HeroHandoffDetail,
} from '../src/scripts/hero-scene/handoff-signal';
import { precompile, yieldToMain } from '../src/scripts/hero-scene/startup';
import {
  DARK_KEY_HEX,
  inkModel,
  keyInkFor,
  luminance,
  parseCssColor,
  sceneThemeOf,
  type BlendFactor,
  type Rgb,
} from '../src/scripts/hero-scene/theme';

const triangleArea = (a: Point, b: Point, c: Point): number =>
  ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;

const pointAt = (points: readonly Point[], i: number | undefined): Point => {
  const p = i === undefined ? undefined : points[i];
  if (!p) throw new Error(`missing point ${String(i)}`);
  return p;
};

describe('ARCH outline sampling', () => {
  const outline = sampleOutline(ARCH);

  it('covers the arch in raster space (legs 701–1163, feet on 248, apex at the arc top)', () => {
    const b = boundsOf(outline);
    expect(b.minX).toBeCloseTo(701, 6);
    expect(b.maxX).toBeCloseTo(1163, 6);
    expect(b.maxY).toBeCloseTo(248, 6);
    expect(b.minY).toBeCloseTo(62, 0);
  });

  it('keeps the four foot corners and does not repeat the first point', () => {
    const has = (x: number, y: number) => outline.some((p) => p.x === x && p.y === y);
    expect(has(701, 248)).toBe(true);
    expect(has(802, 248)).toBe(true);
    expect(has(1106, 248)).toBe(true);
    expect(has(1163, 248)).toBe(true);
    const first = pointAt(outline, 0);
    const last = pointAt(outline, outline.length - 1);
    expect(first.x === last.x && first.y === last.y).toBe(false);
  });

  it('rejects path commands it does not support', () => {
    expect(() => sampleOutline('M0 0 C1 1 2 2 3 3')).toThrow(SyntaxError);
  });
});

describe('sampleArc', () => {
  it('follows the circle and ends on the end point', () => {
    const pts = sampleArc({ x: 1, y: 0 }, 1, 1, 0, false, true, { x: 0, y: 1 }, 12);
    for (const p of pts) expect(Math.hypot(p.x, p.y)).toBeCloseTo(1, 9);
    expect(pts.at(-1)).toEqual({ x: 0, y: 1 });
    expect(pts.length).toBeGreaterThan(5);
  });
});

describe('local outline, triangulation and extrusion', () => {
  const local = toLocal(sampleOutline(ARCH), 1110, 152.5);

  it('is counter-clockwise in the y-up space', () => {
    expect(signedArea(local)).toBeGreaterThan(0);
  });

  it('triangulates into CCW triangles that exactly tile the outline', () => {
    const tris = triangulate(local);
    expect(tris.length % 3).toBe(0);
    expect(tris.length / 3).toBeLessThanOrEqual(local.length - 2);
    let sum = 0;
    for (let t = 0; t < tris.length; t += 3) {
      const area = triangleArea(
        pointAt(local, tris[t]),
        pointAt(local, tris[t + 1]),
        pointAt(local, tris[t + 2]),
      );
      expect(area).toBeGreaterThan(0);
      sum += area;
    }
    expect(sum).toBeCloseTo(signedArea(local), 6);
  });

  it('extrudes faces and walls with unit normals', () => {
    const depth = 34;
    const n = local.length;
    const solid = extrude(local, depth);
    const vertices = solid.wall.length;
    expect(vertices).toBe(n * 2 + n * 4);
    expect(solid.position.length).toBe(vertices * 3);
    expect(solid.normal.length).toBe(vertices * 3);
    expect(solid.index.length).toBe(triangulate(local).length * 2 + n * 6);
    for (let v = 0; v < vertices; v++) {
      const nx = solid.normal[v * 3] ?? 0;
      const ny = solid.normal[v * 3 + 1] ?? 0;
      const nz = solid.normal[v * 3 + 2] ?? 0;
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 5);
      expect(Math.abs(solid.position[v * 3 + 2] ?? 0)).toBeCloseTo(depth / 2, 6);
    }
    // Front face first: z = +depth/2, normal +z, not a wall.
    expect(solid.position[2]).toBeCloseTo(depth / 2, 6);
    expect(solid.normal[2]).toBe(1);
    expect(solid.wall[0]).toBe(0);
    expect(solid.wall[vertices - 1]).toBe(1);
  });
});

describe('placeInBox (rest position of the plates)', () => {
  const markViewBox = { x: 690, y: 50, width: 840, height: 205 };

  it('maps the viewBox centre to the box centre at the box scale', () => {
    const box = { left: 10, top: 20, width: 1680, height: 410 };
    const p = placeInBox(box, markViewBox, 1110, 152.5);
    expect(p.scale).toBeCloseTo(2, 9);
    expect(p.x).toBeCloseTo(10 + 840, 9);
    expect(p.y).toBeCloseTo(20 + 205, 9);
  });

  it('letterboxes like preserveAspectRatio xMidYMid meet', () => {
    const box = { left: 0, top: 0, width: 1000, height: 100 };
    const p = placeInBox(box, markViewBox, 690, 50);
    const scale = 100 / 205;
    expect(p.scale).toBeCloseTo(scale, 9);
    expect(p.x).toBeCloseTo((1000 - 840 * scale) / 2, 9);
    expect(p.y).toBeCloseTo(0, 9);
  });

  it('maps the same raster point into the compact header logo', () => {
    const compact = { x: 40, y: 50, width: 1505, height: 440 };
    const box = { left: 24, top: 18, width: (1505 * 36) / 440, height: 36 };
    const p = placeInBox(box, compact, 1110, 152.5);
    const scale = 36 / 440;
    expect(p.scale).toBeCloseTo(scale, 9);
    expect(p.x).toBeCloseTo(24 + (1110 - 40) * scale, 9);
    expect(p.y).toBeCloseTo(18 + (152.5 - 50) * scale, 9);
  });
});

describe('drawingDpr (drawing-buffer resolution)', () => {
  const MAX = 6_000_000;

  it('caps a portrait phone at 1.5', () => {
    expect(drawingDpr(3, 390, 844, 390, MAX)).toBe(DPR_CAP.phone);
    expect(drawingDpr(2, 320, 640, 320, MAX)).toBe(DPR_CAP.phone);
  });

  it('caps a phone in landscape at 1.5 although it is wider than 768 px', () => {
    expect(drawingDpr(3, 844, 620, 390, MAX)).toBe(DPR_CAP.phone);
    expect(drawingDpr(3, 932, 640, 430, MAX)).toBe(DPR_CAP.phone);
  });

  it('caps tablets and desktops at 2 and keeps lower device ratios', () => {
    expect(drawingDpr(3, 1440, 900, 900, MAX)).toBe(DPR_CAP.other);
    expect(drawingDpr(2, 1024, 768, 768, MAX)).toBe(DPR_CAP.other);
    expect(drawingDpr(1, 1440, 900, 900, MAX)).toBe(1);
    expect(drawingDpr(1.25, 390, 844, 390, MAX)).toBe(1.25);
  });

  it('falls back to 1 for a missing device ratio', () => {
    expect(drawingDpr(0, 1440, 900, 900, MAX)).toBe(1);
    expect(drawingDpr(Number.NaN, 390, 844, 390, MAX)).toBe(1);
  });

  it('never exceeds the pixel budget', () => {
    const dpr = drawingDpr(2, 2560, 1440, 1440, MAX);
    expect(dpr).toBeLessThan(2);
    expect(2560 * 1440 * dpr * dpr).toBeCloseTo(MAX, 0);
  });
});

describe('hand-off progress and easing', () => {
  it('clamps progress to 0–1', () => {
    expect(dockProgress(-20, 630)).toBe(0);
    expect(dockProgress(315, 630)).toBe(0.5);
    expect(dockProgress(2000, 630)).toBe(1);
    expect(dockProgress(10, 0)).toBe(1);
  });

  it('eases with fixed end points', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeOutBack(0)).toBeCloseTo(0, 9);
    expect(easeOutBack(1)).toBe(1);
    expect(Math.max(...[0.6, 0.7, 0.8, 0.9].map((t) => easeOutBack(t)))).toBeGreaterThan(1);
    expect(smoothstep(0.86, 1, 0.5)).toBe(0);
    expect(smoothstep(0.86, 1, 1)).toBe(1);
    expect(clamp(2)).toBe(1);
  });

  it('follows CSS cubic-bezier curves, including the overshoot of --ease-snap', () => {
    const inOut = cubicBezier(0.65, 0, 0.35, 1);
    expect(inOut(0)).toBe(0);
    expect(inOut(1)).toBe(1);
    expect(inOut(0.5)).toBeCloseTo(0.5, 6);
    const near = cubicBezier(0.25, 0.25, 0.75, 0.75);
    expect(near(0.3)).toBeCloseTo(0.3, 6);
    let previous = 0;
    for (let i = 1; i <= 100; i++) {
      const value = inOut(i / 100);
      expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = value;
    }
    const snap = cubicBezier(0.3, 1.5, 0.5, 1);
    const peak = Math.max(...Array.from({ length: 99 }, (_, i) => snap((i + 1) / 100)));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.15);
    expect(snap(1)).toBe(1);
  });
});

describe('hand-off (the plates never reach the header band or the copy)', () => {
  // 1440 × 900: copy beside the art; mark top and bottom at rest, header band at 72 + 12.
  const desktop: HandoffInput = {
    top: 380,
    bottom: 580,
    bandBottom: 84,
    copyTop: null,
    viewportHeight: 900,
  };
  // 390 × 844: art above the copy (copy top less its gap at 265).
  const mobile: HandoffInput = {
    top: 130,
    bottom: 208,
    bandBottom: 84,
    copyTop: 265,
    viewportHeight: 844,
  };

  it('fades out about when the plates would reach the band, within the set limits', () => {
    expect(handoffDistance(desktop)).toBeCloseTo(296, 9);
    expect(handoffDistance({ ...desktop, top: 150 })).toBe(HANDOFF_DISTANCE.min);
    expect(handoffDistance({ ...desktop, top: 2000 })).toBeCloseTo(
      900 * HANDOFF_DISTANCE.maxShare,
      9,
    );
  });

  it('ends before the rising copy leaves the plates too little room', () => {
    const squeeze = 265 - 84 - (208 - 130);
    expect(handoffDistance(mobile)).toBeCloseTo(squeeze * HANDOFF_DISTANCE.squeeze, 9);
    expect(handoffDistance({ ...mobile, copyTop: 0 })).toBe(1);
  });

  for (const [name, input] of [
    ['desktop', desktop],
    ['mobile', mobile],
  ] as const) {
    it(`${name}: holds the plates below the band and above the copy for the whole hand-off`, () => {
      const pivot = (input.top + input.bottom) / 2;
      const up = pivot - input.top;
      const down = input.bottom - pivot;
      const distance = handoffDistance(input);
      for (let i = 0; i <= 200; i++) {
        const scrolled = (distance * i) / 200;
        const copyTop = input.copyTop === null ? null : input.copyTop - scrolled;
        const y = guardY(pivot - scrolled, up, down, input.bandBottom, copyTop);
        expect(y - up).toBeGreaterThanOrEqual(input.bandBottom - 1e-9);
        if (copyTop !== null) expect(y + down).toBeLessThanOrEqual(copyTop + 1e-9);
      }
    });
  }

  it('lets the plates scroll with the page while there is room, and the copy win otherwise', () => {
    expect(guardY(300, 40, 40, 84, null)).toBe(300);
    expect(guardY(100, 40, 40, 84, null)).toBe(124);
    expect(guardY(100, 40, 40, 84, 400)).toBe(124);
    expect(guardY(100, 50, 50, 84, 150)).toBe(100);
  });
});

describe('choreography (the press run)', () => {
  const outline = sampleOutline(ARCH, 9);
  const metrics = archMetrics(outline);
  // The mark's viewBox is 690 50 840 205: the group pivots on its centre.
  const layout = buildLayout(metrics, ARCH_PLATES, { x: 1110, y: 152.5 });
  const plateOutline = toLocal(outline, metrics.anchor.x, metrics.anchor.y);
  const plate = (id: PlateId): PlateLayout => {
    const found = layout.plates.find((p) => p.id === id);
    if (!found) throw new Error(`missing plate ${id}`);
    return found;
  };
  const beat = (name: BeatName): { start: number; end: number } => {
    const found = BEATS.find((b) => b.name === name);
    if (!found) throw new Error(`missing beat ${name}`);
    return found;
  };
  const times = (from: number, to: number, step: number): number[] =>
    Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);
  const posesAt = (t: number): PlatePose[] => layout.plates.map((p) => platePoseAt(t, p));
  const fields = ['x', 'y', 'z', 'rx', 'rz', 'scale'] as const;
  const spread = (t: number): number => {
    const z = posesAt(t).map((pose) => pose.z);
    return Math.max(...z) - Math.min(...z);
  };
  // Each plate's own move (seconds), and when it starts: register in print order, release in
  // reverse print order.
  const REGISTER_MOVE = 1.9;
  const RELEASE_MOVE = 2.4;
  const registerStart = (p: PlateLayout): number =>
    beat('register').start + p.print * STAGGER.register;
  const releaseStart = (p: PlateLayout): number =>
    beat('release').start + (3 - p.print) * STAGGER.release;
  /** Half the plates' depth: they are extruded ±17 about their pose's z (scene.ts THICKNESS 34). */
  const HALF_THICKNESS = 17;
  /**
   * Where a group-space point shows on screen, straight on (no perspective), once the group is
   * turned by `tilt`. The scene sets the tilt as the group's Euler rotation in OGL's default order
   * YXZ (ogl Euler, QuatFunc.fromEuler), whose matrix is Ry·Rx·Rz: turn about z, then x, then y.
   */
  const project = (tilt: Tilt, x: number, y: number, z: number): { x: number; y: number } => {
    const x1 = x * Math.cos(tilt.z) - y * Math.sin(tilt.z);
    const y1 = x * Math.sin(tilt.z) + y * Math.cos(tilt.z);
    const y2 = y1 * Math.cos(tilt.x) - z * Math.sin(tilt.x);
    const z2 = y1 * Math.sin(tilt.x) + z * Math.cos(tilt.x);
    return { x: x1 * Math.cos(tilt.y) + z2 * Math.sin(tilt.y), y: y2 };
  };

  it('measures the arch: anchor at its box centre, feet on the base line', () => {
    expect(metrics.anchor.x).toBeCloseTo(932, 6);
    expect(metrics.anchor.y).toBeCloseTo(155, 0);
    expect(metrics.halfWidth).toBeCloseTo(231, 6);
    expect(metrics.halfHeight).toBeCloseTo(93, 0);
    expect(metrics.leftFoot[0]).toBeCloseTo(-231, 6);
    expect(metrics.leftFoot[1]).toBeCloseTo(-130, 6);
    expect(metrics.rightFoot[0]).toBeCloseTo(174, 6);
    expect(metrics.rightFoot[1]).toBeCloseTo(231, 6);
  });

  it('puts the plates in register at the logo offsets', () => {
    for (const logoPlate of ARCH_PLATES) {
      const p = registerPose(plate(logoPlate.id));
      expect(p.x - registerPose(plate('c')).x).toBeCloseTo(logoPlate.x, 9);
      expect(p.y).toBeCloseTo(registerPose(plate('c')).y, 9);
      expect(p.z).toBe(0);
      expect(p.rz).toBe(0);
    }
  });

  it('is seamless: the end of the loop meets its start', () => {
    for (const p of layout.plates) {
      const start = platePoseAt(0, p);
      // The press is fastest at contact (an ease-in into the sheet), so a microsecond before the
      // seam a plate is still a few hundredths of a raster unit above it: far below a pixel.
      const end = platePoseAt(PERIOD - 1e-6, p);
      for (const field of ['x', 'y', 'z'] as const) {
        expect(Math.abs(end[field] - start[field])).toBeLessThan(0.1);
      }
      for (const field of ['rx', 'rz', 'scale'] as const) {
        expect(end[field]).toBeCloseTo(start[field], 6);
      }
      const again = platePoseAt(PERIOD * 3 + 7, p);
      const once = platePoseAt(7, p);
      for (const field of fields) expect(again[field]).toBeCloseTo(once[field], 9);
    }
    const tiltStart = tiltAt(0);
    const tiltEnd = tiltAt(PERIOD - 1e-6);
    expect(tiltEnd.x).toBeCloseTo(tiltStart.x, 6);
    expect(tiltEnd.y).toBeCloseTo(tiltStart.y, 6);
    expect(tiltEnd.z).toBeCloseTo(tiltStart.z, 6);
    expect(tiltAt(PERIOD * 2 + 5).y).toBeCloseTo(tiltAt(5).y, 9);
    expect(loopTime(-1)).toBeCloseTo(PERIOD - 1, 9);
    expect(loopTime(PERIOD)).toBe(0);
    expect(loopTime(PERIOD * 2 + 3)).toBeCloseTo(3, 9);
  });

  it('tilts the plates and the sheet in one frame that only drifts slightly', () => {
    const rest = restTilt();
    expect(rest).toEqual(SHEET.tilt);
    let furthest = 0;
    for (const t of times(0, PERIOD, 0.05)) {
      const tilt = tiltAt(t);
      expect(Math.abs(tilt.x - rest.x)).toBeLessThanOrEqual(SHEET.drift.pitch + 1e-12);
      expect(Math.abs(tilt.y - rest.y)).toBeLessThanOrEqual(SHEET.drift.yaw + 1e-12);
      expect(tilt.z).toBe(rest.z);
      furthest = Math.max(furthest, Math.abs(tilt.y - rest.y));
    }
    expect(furthest).toBeGreaterThan(SHEET.drift.yaw / 2);
  });

  it('never jumps: every frame moves each plate by a small step only', () => {
    const step = 1 / 240;
    let previous = posesAt(0);
    for (const t of times(step, PERIOD, step)) {
      const current = posesAt(t);
      current.forEach((pose, i) => {
        const before = previous[i];
        if (!before) throw new Error('missing pose');
        expect(Math.abs(pose.x - before.x)).toBeLessThan(5);
        expect(Math.abs(pose.y - before.y)).toBeLessThan(5);
        expect(Math.abs(pose.z - before.z)).toBeLessThan(5);
        expect(Math.abs(pose.rz - before.rz)).toBeLessThan(0.05);
        expect(Math.abs(pose.rx - before.rx)).toBeLessThan(0.05);
        expect(Math.abs(pose.scale - before.scale)).toBeLessThan(0.01);
      });
      previous = current;
    }
  });

  it('keeps every value finite, and every pose inside the art box', () => {
    for (const t of times(0, PERIOD, 1 / 60)) {
      const poses = posesAt(t);
      for (const pose of poses) {
        for (const field of fields) expect(Number.isFinite(pose[field])).toBe(true);
      }
      const b = poseBounds(poses, plateOutline);
      expect(b.minX).toBeGreaterThanOrEqual(-ART.width / 2);
      expect(b.maxX).toBeLessThanOrEqual(ART.width / 2);
      expect(b.minY).toBeGreaterThanOrEqual(-ART.height / 2);
      expect(b.maxY).toBeLessThanOrEqual(ART.height / 2);

      // In 3D: the front and back faces of every plate, seen through the group's tilt.
      const tilt = tiltAt(t);
      const seen = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      for (const pose of poses) {
        const cos = Math.cos(pose.rz) * pose.scale;
        const sin = Math.sin(pose.rz) * pose.scale;
        for (const face of [-1, 1]) {
          const z = pose.z + face * HALF_THICKNESS * pose.scale;
          for (const q of plateOutline) {
            const x = pose.x + q.x * cos - q.y * sin;
            const y = pose.y + q.x * sin + q.y * cos;
            const on = project(tilt, x, y, z);
            seen.minX = Math.min(seen.minX, on.x);
            seen.minY = Math.min(seen.minY, on.y);
            seen.maxX = Math.max(seen.maxX, on.x);
            seen.maxY = Math.max(seen.maxY, on.y);
          }
        }
      }
      expect(seen.minX).toBeGreaterThanOrEqual(-ART.width / 2);
      expect(seen.maxX).toBeLessThanOrEqual(ART.width / 2);
      expect(seen.minY).toBeGreaterThanOrEqual(-ART.height / 2);
      expect(seen.maxY).toBeLessThanOrEqual(ART.height / 2);
    }
  });

  it('runs the beats back to back, from contact to the next press, over one period', () => {
    expect(BEATS.map((b) => b.name)).toEqual([
      'settle',
      'hold',
      'release',
      'float',
      'register',
      'press',
    ]);
    expect(BEATS[0]?.start).toBe(0);
    expect(BEATS[BEATS.length - 1]?.end).toBe(PERIOD);
    for (let i = 1; i < BEATS.length; i++) expect(BEATS[i]?.start).toBe(BEATS[i - 1]?.end);
    for (const b of BEATS) {
      expect(b.end).toBeGreaterThan(b.start);
      expect(beatAt(b.start)).toBe(b.name);
      expect(beatAt((b.start + b.end) / 2)).toBe(b.name);
      expect(beatAt(b.end - 1e-6)).toBe(b.name);
      expect(beatAt((b.start + b.end) / 2 + PERIOD * 2)).toBe(b.name);
    }
    expect(beatAt(PERIOD)).toBe('settle');
    expect(beatAt(-0.3)).toBe('press');
  });

  it('starts at contact, pressed into the sheet in register, then settles and holds', () => {
    const settle = beat('settle');
    const hold = beat('hold');
    for (const p of layout.plates) {
      const rest = holdPose(p);
      expect(rest).toEqual(registerPose(p));
      expect(platePoseAt(0, p)).toEqual({ ...rest, z: -SHEET.dip });
      let previousZ = -SHEET.dip;
      for (const t of times(0, settle.end, 0.01)) {
        const pose = platePoseAt(t, p);
        expect(pose.x).toBe(rest.x);
        expect(pose.y).toBe(rest.y);
        expect(pose.rz).toBe(0);
        expect(pose.z).toBeGreaterThanOrEqual(previousZ);
        expect(pose.z).toBeLessThanOrEqual(0);
        previousZ = pose.z;
      }
      expect(platePoseAt(settle.end, p)).toEqual(rest);
      for (const t of times(hold.start, hold.end - 1e-3, 0.05)) {
        expect(platePoseAt(t, p)).toEqual(rest);
      }
    }
  });

  it('releases in reverse print order K, C, M, Y, lifting each plate depth first', () => {
    const t = beat('release').start + STAGGER.release * 1.5;
    expect(platePoseAt(t, plate('k'))).not.toEqual(holdPose(plate('k')));
    expect(platePoseAt(t, plate('c'))).not.toEqual(holdPose(plate('c')));
    expect(platePoseAt(t, plate('m'))).toEqual(holdPose(plate('m')));
    expect(platePoseAt(t, plate('y'))).toEqual(holdPose(plate('y')));
    for (const p of layout.plates) {
      const start = releaseStart(p);
      const { float } = PLATES[p.id];
      expect(platePoseAt(start - 0.01, p)).toEqual(holdPose(p));
      // A quarter of the way in, the plate has risen much further (as a share of its float height)
      // than it has drifted out of register (as a share of its float offset).
      const early = platePoseAt(start + RELEASE_MOVE / 4, p);
      const risen = early.z / float.z;
      const drifted = (early.x - p.markX) / float.x;
      expect(risen).toBeGreaterThan(0.4);
      expect(risen).toBeGreaterThan(drifted * 2);
      // Each plate is still on its way just before its move ends, and floating just after it (Y,
      // the last, as the release beat ends).
      const end = start + RELEASE_MOVE;
      expect(platePoseAt(end - 0.05, p)).not.toEqual(floatPose(p, end - 0.05));
      expect(platePoseAt(end + 0.01, p)).toEqual(floatPose(p, end + 0.01));
    }
  });

  it('floats the plates apart in depth, breathing gently about their float offsets', () => {
    const float = beat('float');
    for (const t of times(float.start + 0.01, float.end - 0.01, 0.05)) {
      for (const p of layout.plates) {
        const pose = platePoseAt(t, p);
        const offset = PLATES[p.id].float;
        expect(pose).toEqual(floatPose(p, t));
        expect(pose.x).toBeCloseTo(p.markX + offset.x, 9);
        expect(Math.abs(pose.y - (p.markY + offset.y))).toBeLessThanOrEqual(8 + 1e-9);
        expect(Math.abs(pose.z - offset.z)).toBeLessThanOrEqual(12 + 1e-9);
        expect(Math.abs(pose.rz - offset.rz)).toBeLessThanOrEqual(0.008 + 1e-9);
      }
      expect(spread(t)).toBeGreaterThan(spread(beat('hold').start + 1) + 200);
    }
    expect(spread(beat('hold').start + 1)).toBe(0);
  });

  it('registers in print order Y, M, C, K, snapping in with a small overshoot, then hovers', () => {
    const t = beat('register').start + STAGGER.register * 1.5;
    expect(platePoseAt(t, plate('y'))).not.toEqual(floatPose(plate('y'), t));
    expect(platePoseAt(t, plate('m'))).not.toEqual(floatPose(plate('m'), t));
    expect(platePoseAt(t, plate('c'))).toEqual(floatPose(plate('c'), t));
    expect(platePoseAt(t, plate('k'))).toEqual(floatPose(plate('k'), t));
    for (const p of layout.plates) {
      const { float } = PLATES[p.id];
      const start = registerStart(p);
      const end = start + REGISTER_MOVE;
      // The snap carries the plate a little past register, to the side away from where it floated.
      const past = times(start, end, 0.01).map(
        (s) => (platePoseAt(s, p).x - p.markX) * -Math.sign(float.x),
      );
      expect(Math.max(...past)).toBeGreaterThan(0);
      expect(Math.max(...past)).toBeLessThan(0.15 * Math.abs(float.x));
      // Still on its way just before its move ends, all but there at the end, hovering after it.
      const hovering = { ...registerPose(p), z: SHEET.hover };
      expect(platePoseAt(end - 0.05, p)).not.toEqual(hovering);
      const arriving = platePoseAt(end - 1e-4, p);
      expect(arriving.x).toBeCloseTo(p.markX, 3);
      expect(arriving.y).toBeCloseTo(p.markY, 3);
      expect(arriving.z).toBeCloseTo(SHEET.hover, 2);
      for (const s of times(end + 0.01, beat('press').start - 0.01, 0.05)) {
        expect(platePoseAt(s, p)).toEqual(hovering);
      }
    }
  });

  it('presses every plate from its hover into the sheet, gathering speed to contact', () => {
    const press = beat('press');
    for (const p of layout.plates) {
      expect(platePoseAt(press.start, p).z).toBeCloseTo(SHEET.hover, 6);
      let previousZ = Infinity;
      for (const t of times(press.start, PERIOD - 1e-3, 0.01)) {
        const pose = platePoseAt(t, p);
        expect(pose.x).toBeCloseTo(p.markX, 9);
        expect(pose.y).toBeCloseTo(p.markY, 9);
        expect(pose.rz).toBeCloseTo(0, 9);
        expect(pose.z).toBeLessThanOrEqual(previousZ);
        previousZ = pose.z;
      }
      expect(platePoseAt(PERIOD - 1e-6, p).z).toBeLessThan(-SHEET.dip + 0.1);
      const first = platePoseAt(press.start, p).z - platePoseAt(press.start + 0.1, p).z;
      const last = platePoseAt(PERIOD - 0.1, p).z - platePoseAt(PERIOD - 1e-6, p).z;
      expect(last).toBeGreaterThan(first);
    }
  });

  it('answers the contact on the sheet: a ripple, a bloom and a sheen from left to right', () => {
    // Ripple: from nothing at contact, spreading steadily, faded out after 2.4 s.
    const contact = effectsAt(0);
    expect(contact.ripple).toBe(0);
    expect(contact.rippleAlpha).toBe(0);
    let previous = contact;
    for (const t of times(0, 2.39, 0.01)) {
      const e = effectsAt(t);
      expect(e.ripple).toBeGreaterThanOrEqual(previous.ripple);
      expect(e.ripple).toBeLessThanOrEqual(1);
      expect(e.rippleAlpha).toBeGreaterThanOrEqual(0);
      expect(e.rippleAlpha).toBeLessThanOrEqual(1);
      previous = e;
    }
    const strongest = Math.max(...times(0, 2.39, 0.01).map((t) => effectsAt(t).rippleAlpha));
    expect(strongest).toBeGreaterThan(0.5);
    expect(effectsAt(2.39).rippleAlpha).toBeLessThan(0.01);
    for (const t of times(2.4, PERIOD - 0.01, 0.05)) {
      expect(effectsAt(t).ripple).toBe(0);
      expect(effectsAt(t).rippleAlpha).toBe(0);
    }

    // Bloom: only in the first 1.1 s.
    expect(contact.bloom).toBe(0);
    for (const t of times(0.01, 1.09, 0.01)) {
      expect(effectsAt(t).bloom).toBeGreaterThan(0);
      expect(effectsAt(t).bloom).toBeLessThanOrEqual(1);
    }
    for (const t of times(1.1, PERIOD - 0.01, 0.05)) expect(effectsAt(t).bloom).toBe(0);

    // Sheen: crosses the mark from left to right between 0.9 s and 2.5 s, nowhere else.
    for (const t of [0, 0.5, 0.9, 2.5, 3, 6, PERIOD - 0.01]) {
      expect(effectsAt(t).sheen).toBe(0);
      expect(effectsAt(t).sheenAlpha).toBe(0);
    }
    let left = -Infinity;
    for (const t of times(0.91, 2.49, 0.01)) {
      const e = effectsAt(t);
      expect(e.sheen).toBeGreaterThan(left);
      expect(e.sheenAlpha).toBeGreaterThan(0);
      left = e.sheen;
    }
    expect(effectsAt(0.91).sheen).toBeLessThan(0.01);
    expect(effectsAt(2.49).sheen).toBeGreaterThan(0.99);
    expect(effectsAt(PERIOD + 1)).toEqual(effectsAt(1));
  });

  it('leaves each plate’s print on the sheet as it lifts off, fading before the press', () => {
    const t = beat('release').start + STAGGER.release / 2;
    expect(printAlpha(t, plate('k'))).toBeGreaterThan(0);
    expect(printAlpha(t, plate('c'))).toBe(0);
    expect(printAlpha(t, plate('m'))).toBe(0);
    expect(printAlpha(t, plate('y'))).toBe(0);
    for (const p of layout.plates) {
      const start = releaseStart(p);
      for (const s of times(0, start - 0.01, 0.05)) expect(printAlpha(s, p)).toBe(0);
      expect(printAlpha(start - 0.01, p)).toBe(0);
      let previous = 0;
      for (const s of times(start, 4.9, 0.02)) {
        const alpha = printAlpha(s, p);
        expect(alpha).toBeGreaterThanOrEqual(previous);
        expect(alpha).toBeLessThanOrEqual(PRINT.alpha);
        previous = alpha;
      }
      expect(printAlpha(start + 0.5, p)).toBeGreaterThan(0);
      expect(printAlpha(start + 0.8, p)).toBeCloseTo(PRINT.alpha, 9);
      for (const s of times(4.9, 6, 0.02)) {
        expect(printAlpha(s, p)).toBeLessThanOrEqual(PRINT.alpha);
      }
      for (const s of times(6, PERIOD - 0.01, 0.05)) expect(printAlpha(s, p)).toBe(0);
    }
  });

  it('casts no shadow from a plate on the sheet, and a further, softer one higher up', () => {
    for (const z of [-SHEET.dip, -1, 0]) expect(plateShadow(z).alpha).toBe(0);
    let previous = plateShadow(0);
    for (const z of [2, SHEET.hover, 85, 190, 300, 420, 600]) {
      const shadow = plateShadow(z);
      expect(shadow.alpha).toBeGreaterThan(0);
      expect(shadow.alpha).toBeLessThanOrEqual(1);
      // Light from the upper left: the shadow falls down and to the right.
      expect(shadow.x).toBeGreaterThan(previous.x);
      expect(shadow.y).toBeLessThan(previous.y);
      expect(shadow.softness).toBeGreaterThan(previous.softness);
      previous = shadow;
    }
    expect(plateShadow(420).alpha).toBeLessThan(plateShadow(SHEET.hover).alpha);
  });

  it('hands off: to the hold, collapse, then shrink and fade while the header prints in', () => {
    const atTop = handoff(0);
    expect(atTop).toEqual({ toMark: 0, collapse: 0, scale: 1, ink: 1, dock: 0 });
    const blended = handoff(HANDOFF.toMark);
    expect(blended.toMark).toBe(1);
    expect(blended.collapse).toBeLessThan(0.05);
    expect(blended.ink).toBe(1);
    const gone = handoff(1);
    expect(gone.collapse).toBe(1);
    expect(gone.scale).toBeCloseTo(1 - HANDOFF.shrink, 9);
    expect(gone.ink).toBe(0);
    expect(gone.dock).toBe(1);
    let previous = atTop;
    for (const p of times(0, 1, 0.01)) {
      const now = handoff(p);
      expect(now.toMark).toBeGreaterThanOrEqual(previous.toMark);
      expect(now.collapse).toBeGreaterThanOrEqual(previous.collapse);
      expect(now.scale).toBeLessThanOrEqual(previous.scale);
      expect(now.dock).toBeGreaterThanOrEqual(previous.dock);
      expect(now.ink + now.dock).toBeCloseTo(1, 9);
      previous = now;
    }
    // Whatever the loop shows, a full blend lands on the hold pose.
    for (const t of [0.1, 4, 7, 9.5, 11.7]) {
      for (const p of layout.plates) {
        const out = blendPose(platePoseAt(t, p), holdPose(p), blended.toMark);
        const rest = holdPose(p);
        for (const field of fields) expect(out[field]).toBeCloseTo(rest[field], 9);
      }
    }
  });

  it('pulses the header logo out of register mid hand-off, then snaps it back exactly', () => {
    expect(registrationPulse(0)).toBe(0);
    expect(registrationPulse(1)).toBe(0);
    expect(registrationPulse(PULSE_PEAK)).toBeCloseTo(1, 9);
    for (const d of [0.1, 0.3, 0.5, 0.7]) expect(registrationPulse(d)).toBeGreaterThan(0);
    const values = times(0, 1, 0.005).map((d) => registrationPulse(d));
    // The snap passes register slightly (--ease-snap overshoot), and never jumps.
    expect(Math.min(...values)).toBeLessThan(0);
    expect(Math.min(...values)).toBeGreaterThan(-0.15);
    expect(Math.max(...values)).toBeLessThanOrEqual(1 + 1e-9);
    for (let i = 1; i < values.length; i++) {
      expect(Math.abs((values[i] ?? 0) - (values[i - 1] ?? 0))).toBeLessThan(0.1);
    }
  });

  it('snaps into register with a small overshoot (--ease-snap)', () => {
    expect(easeSnap(0)).toBe(0);
    expect(easeSnap(1)).toBe(1);
    expect(Math.max(...times(0, 1, 0.01).map((u) => easeSnap(u)))).toBeGreaterThan(1);
  });
});

describe('start-up (short tasks, shaders linked in the background)', () => {
  const sources = [
    { vertex: 'v1', fragment: 'f1' },
    { vertex: 'v2', fragment: 'f2' },
  ];
  /** A stand-in context: links finish after `doneAfter` status checks (never if Infinity). */
  const fakeGl = (parallel: boolean, doneAfter: number) => {
    const calls = { created: 0, deletedPrograms: 0, deletedShaders: 0, checks: 0 };
    const gl = {
      VERTEX_SHADER: 0x8b31,
      FRAGMENT_SHADER: 0x8b30,
      getExtension: (name: string) =>
        parallel && name === 'KHR_parallel_shader_compile'
          ? { COMPLETION_STATUS_KHR: 0x91b1 }
          : null,
      createProgram: () => {
        calls.created += 1;
        return {};
      },
      createShader: () => ({}),
      shaderSource: () => undefined,
      compileShader: () => undefined,
      attachShader: () => undefined,
      linkProgram: () => undefined,
      isContextLost: () => false,
      getProgramParameter: () => {
        calls.checks += 1;
        return calls.checks > doneAfter;
      },
      deleteProgram: () => {
        calls.deletedPrograms += 1;
      },
      deleteShader: () => {
        calls.deletedShaders += 1;
      },
    };
    return { gl: gl as unknown as WebGLRenderingContextBase, calls };
  };

  it('yields through scheduler.yield where the browser has it, else via a new task', async () => {
    const previous: unknown = Reflect.get(globalThis, 'scheduler');
    Reflect.deleteProperty(globalThis, 'scheduler');
    try {
      await expect(yieldToMain()).resolves.toBeUndefined();
      let used = 0;
      Reflect.set(globalThis, 'scheduler', {
        yield: () => {
          used += 1;
          return Promise.resolve();
        },
      });
      await yieldToMain();
      expect(used).toBe(1);
    } finally {
      if (previous === undefined) Reflect.deleteProperty(globalThis, 'scheduler');
      else Reflect.set(globalThis, 'scheduler', previous);
    }
  });

  it('links in the background, waits for the links, then drops its copies', async () => {
    const { gl, calls } = fakeGl(true, 6);
    await precompile(gl, sources, 2000);
    expect(calls.created).toBe(2);
    expect(calls.checks).toBeGreaterThan(6);
    expect(calls.deletedPrograms).toBe(2);
    expect(calls.deletedShaders).toBe(4);
  });

  it('does nothing without the extension, and gives up waiting after the timeout', async () => {
    const without = fakeGl(false, 0);
    await precompile(without.gl, sources, 2000);
    expect(without.calls.created).toBe(0);

    const stuck = fakeGl(true, Infinity);
    const started = performance.now();
    await precompile(stuck.gl, sources, 60);
    expect(performance.now() - started).toBeGreaterThanOrEqual(55);
    expect(stuck.calls.deletedPrograms).toBe(2);
  });
});

describe('theme (light ink on paper, light on a dark sheet)', () => {
  /** A WebGL blend factor for one channel (source s, target d). */
  const factor = (name: BlendFactor, s: number, d: number): number => {
    switch (name) {
      case 'ZERO':
        return 0;
      case 'ONE':
        return 1;
      case 'DST_COLOR':
        return d;
      case 'ONE_MINUS_SRC_COLOR':
        return 1 - s;
    }
  };
  /** What gl.blendFunc(src, dst) with the default gl.FUNC_ADD makes of one channel. */
  const blendChannel = (blend: { src: BlendFactor; dst: BlendFactor }, s: number, d: number) =>
    s * factor(blend.src, s, d) + d * factor(blend.dst, s, d);
  const print = (theme: 'light' | 'dark', inks: readonly Rgb[]): number[] => {
    const model = inkModel(theme);
    return inks.reduce<number[]>(
      (target, ink) => target.map((d, i) => blendChannel(model.blend, ink[i] ?? 0, d)),
      [...model.paper],
    );
  };
  const cyan = parseCssColor('#00AEEF');
  const magenta = parseCssColor('#ED008C');
  const rgbOf = (value: Rgb | null): Rgb => {
    if (!value) throw new Error('colour did not parse');
    return value;
  };

  it('reads the theme from html[data-theme], light by default', () => {
    expect(sceneThemeOf('dark')).toBe('dark');
    expect(sceneThemeOf('light')).toBe('light');
    expect(sceneThemeOf(undefined)).toBe('light');
    expect(sceneThemeOf(null)).toBe('light');
    expect(sceneThemeOf('sepia')).toBe('light');
  });

  it('multiplies on white in light and screens on black in dark, canvas and page alike', () => {
    expect(inkModel('light')).toMatchObject({
      paper: [1, 1, 1],
      cssBlend: 'multiply',
      blend: { src: 'DST_COLOR', dst: 'ZERO' },
    });
    expect(inkModel('dark')).toMatchObject({
      paper: [0, 0, 0],
      cssBlend: 'screen',
      blend: { src: 'ONE', dst: 'ONE_MINUS_SRC_COLOR' },
    });
  });

  it('leaves the page untouched where nothing prints (paper is neutral under the blend)', () => {
    for (const theme of ['light', 'dark'] as const) {
      const { paper } = inkModel(theme);
      // A plate faded to nothing prints the paper colour (shaders.ts uPaper).
      expect(print(theme, [paper, paper])).toEqual([...paper]);
    }
  });

  it('overprints C + M towards blue in light and combines them towards light in dark', () => {
    const c = rgbOf(cyan);
    const m = rgbOf(magenta);
    const light = print('light', [c, m]);
    const dark = print('dark', [c, m]);
    // Multiply: darker than either ink in every channel; screen: lighter than either.
    light.forEach((value, i) => {
      expect(value).toBeLessThanOrEqual(Math.min(c[i] ?? 0, m[i] ?? 0) + 1e-9);
    });
    dark.forEach((value, i) => {
      expect(value).toBeGreaterThanOrEqual(Math.max(c[i] ?? 0, m[i] ?? 0) - 1e-9);
      // Screen: s + d − s·d.
      expect(value).toBeCloseTo((c[i] ?? 0) + (m[i] ?? 0) - (c[i] ?? 0) * (m[i] ?? 0), 9);
    });
    // Blue on paper; a light lavender on the dark sheet.
    expect(light[2]).toBeGreaterThan(light[0] ?? 1);
    expect(luminance(dark as unknown as Rgb)).toBeGreaterThan(luminance(c));
    // The order of printing does not change the result in either theme.
    expect(print('dark', [m, c])).toEqual(dark.map((v) => expect.closeTo(v, 9)));
    expect(print('light', [m, c])).toEqual(light.map((v) => expect.closeTo(v, 9)));
  });

  it('parses the colours getComputedStyle reports', () => {
    expect(parseCssColor('#221F20')).toEqual([0x22 / 255, 0x1f / 255, 0x20 / 255]);
    expect(parseCssColor('  #f2efe8 ')).toEqual([0xf2 / 255, 0xef / 255, 0xe8 / 255]);
    expect(parseCssColor('#fff')).toEqual([1, 1, 1]);
    expect(parseCssColor('#0008')).toEqual([0, 0, 0]);
    expect(parseCssColor('#F2EFE8CC')).toEqual([0xf2 / 255, 0xef / 255, 0xe8 / 255]);
    expect(parseCssColor('rgb(242, 239, 232)')).toEqual([242 / 255, 239 / 255, 232 / 255]);
    expect(parseCssColor('rgba(242,239,232,0.5)')).toEqual([242 / 255, 239 / 255, 232 / 255]);
    expect(parseCssColor('rgb(242 239 232 / 50%)')).toEqual([242 / 255, 239 / 255, 232 / 255]);
    expect(parseCssColor('rgb(100% 50% 0%)')).toEqual([1, 0.5, 0]);
    expect(parseCssColor('rgb(300, -4, 0)')).toEqual([1, 0, 0]);
    for (const bad of [
      '',
      'white',
      '#12',
      '#12345',
      'oklch(0.95 0.01 90)',
      'rgb(1, 2)',
      'rgb(a, b, c)',
    ]) {
      expect(parseCssColor(bad)).toBeNull();
    }
  });

  it('prints the key plate in the logo key in light and in the page’s light key in dark', () => {
    const logoKey = parseCssColor('#221F20');
    // Light: the logo's key black, whatever the page says.
    expect(keyInkFor('light', null)).toEqual(logoKey);
    expect(keyInkFor('light', '#ffffff')).toEqual(logoKey);
    // Dark: the computed --color-key.
    expect(keyInkFor('dark', ' #F4F1EA')).toEqual(parseCssColor('#F4F1EA'));
    expect(keyInkFor('dark', 'rgb(240, 238, 230)')).toEqual([240 / 255, 238 / 255, 230 / 255]);
    // Unreadable, missing, or not light (the token has not flipped): the contract's light key.
    const fallback = parseCssColor(DARK_KEY_HEX);
    expect(keyInkFor('dark', null)).toEqual(fallback);
    expect(keyInkFor('dark', '')).toEqual(fallback);
    expect(keyInkFor('dark', 'oklch(0.95 0.01 90)')).toEqual(fallback);
    expect(keyInkFor('dark', '#221F20')).toEqual(fallback);
    expect(luminance(rgbOf(fallback))).toBeGreaterThan(0.8);
  });
});

describe('hand-over signal (where the hero plates are while they fade out)', () => {
  const detail = (overrides: Partial<HeroHandoffDetail> = {}): HeroHandoffDetail => ({
    live: true,
    progress: 0.4,
    ink: 1,
    endScroll: 315,
    rect: { left: 700, top: 120, width: 640, height: 441 },
    mark: { x: 1020, y: 340, scale: 0.71 },
    ...overrides,
  });

  it('sends only real changes, beyond rounding noise', () => {
    const base = detail();
    expect(handoffChanged(null, base)).toBe(true);
    expect(handoffChanged(base, detail())).toBe(false);
    expect(handoffChanged(base, detail({ progress: 0.4004 }))).toBe(false);
    expect(handoffChanged(base, detail({ progress: 0.402 }))).toBe(true);
    expect(handoffChanged(base, detail({ ink: 0.99 }))).toBe(true);
    expect(handoffChanged(base, detail({ live: false }))).toBe(true);
    // The end of the hand-off moves with the layout (resize), not with the scroll.
    expect(handoffChanged(base, detail({ endScroll: 315.1 }))).toBe(false);
    expect(handoffChanged(base, detail({ endScroll: 290 }))).toBe(true);
    expect(handoffChanged(base, detail({ endScroll: null }))).toBe(true);
    expect(handoffChanged(detail({ endScroll: null }), detail({ endScroll: null }))).toBe(false);
    expect(handoffChanged(detail({ endScroll: null }), base)).toBe(true);
    expect(handoffChanged(base, detail({ rect: { ...base.rect, top: 120.1 } }))).toBe(false);
    expect(handoffChanged(base, detail({ rect: { ...base.rect, top: 118 } }))).toBe(true);
    expect(handoffChanged(base, detail({ rect: { ...base.rect, width: 600 } }))).toBe(true);
    expect(handoffChanged(base, detail({ mark: { ...base.mark, y: 300 } }))).toBe(true);
    expect(handoffChanged(base, detail({ mark: { ...base.mark, scale: 0.7 } }))).toBe(true);
  });

  it('dispatches dt:hero-handoff with the detail and keeps it as the latest', () => {
    const target = new EventTarget();
    const received: HeroHandoffDetail[] = [];
    target.addEventListener(HERO_HANDOFF_EVENT, (event) => {
      received.push((event as CustomEvent<HeroHandoffDetail>).detail);
    });
    expect(HERO_HANDOFF_EVENT).toBe('dt:hero-handoff');

    const first = detail({ progress: 0.1 });
    expect(publishHeroHandoff(first, target)).toBe(true);
    expect(latestHeroHandoff()).toBe(first);
    // The same frame again (the plates breathe at the top): nothing sent.
    expect(publishHeroHandoff(detail({ progress: 0.1 }), target)).toBe(false);
    const gone = detail({ progress: 1, ink: 0 });
    expect(publishHeroHandoff(gone, target)).toBe(true);
    expect(publishHeroHandoff({ ...gone, live: false }, target)).toBe(true);

    expect(received.map((d) => [d.live, d.progress, d.ink, d.endScroll])).toEqual([
      [true, 0.1, 1, 315],
      [true, 1, 0, 315],
      [false, 1, 0, 315],
    ]);
    expect(latestHeroHandoff()?.live).toBe(false);
    // A resize past the hand-off: the new end is sent even though nothing else changed.
    expect(publishHeroHandoff({ ...gone, live: false, endScroll: 280 }, target)).toBe(true);
    expect(latestHeroHandoff()?.endScroll).toBe(280);
  });
});
