import { describe, expect, it } from 'vitest';
import { ARCH } from '../src/components/logo-paths';
import {
  boundsOf,
  extrude,
  flatShape,
  sampleArc,
  sampleOutline,
  signedArea,
  toLocal,
  triangulate,
  type Point,
} from '../src/scripts/hero-scene/geometry';
import {
  DOCK_PHASES,
  clamp,
  dockDistance,
  dockPath,
  dockProgress,
  easeInOutCubic,
  easeOutBack,
  lerpLog,
  placeInBox,
  smoothstep,
} from '../src/scripts/hero-scene/math';

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

  it('builds the flat shape for the ambient field at unit width', () => {
    const outline = sampleOutline(ARCH, 4);
    const b = boundsOf(outline);
    const unit = toLocal(
      outline,
      (b.minX + b.maxX) / 2,
      (b.minY + b.maxY) / 2,
      1 / (b.maxX - b.minX),
    );
    const shape = flatShape(unit);
    const ub = boundsOf(unit);
    expect(ub.maxX - ub.minX).toBeCloseTo(1, 9);
    expect(shape.position.length).toBe(unit.length * 2);
    expect(shape.index.length % 3).toBe(0);
  });
});

describe('placeInBox (docking target maths)', () => {
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

describe('docking progress and easing', () => {
  it('ends the docking move before the hero bottom reaches the header', () => {
    expect(dockDistance(900, 72)).toBe(630);
    expect(dockDistance(300, 72)).toBe(204);
    expect(dockDistance(50, 72)).toBe(1);
  });

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

  it('interpolates scales geometrically', () => {
    expect(lerpLog(1, 4, 0.5)).toBeCloseTo(2, 9);
    expect(lerpLog(1.2, 0.08, 0)).toBeCloseTo(1.2, 9);
    expect(lerpLog(1.2, 0.08, 1)).toBeCloseTo(0.08, 9);
  });
});

describe('dockPath (plates stay clear of the header band)', () => {
  // 1440 × 900: plates at rest at the right, header logo arches at the top left.
  const desktop = {
    rest: { x: 1060, y: 265, scale: 1.27 },
    dock: { x: 145, y: 25.3, scale: 40 / 440 },
    bandBottom: 72 + 16,
    extent: 130,
  };
  // 390 × 844: plates above the text, logo at the top left, buttons at the top right.
  const mobile = {
    rest: { x: 289, y: 184, scale: 0.594 },
    dock: { x: 104, y: 26.4, scale: 36 / 440 },
    bandBottom: 72 + 16,
    extent: 130,
  };
  const steps = Array.from({ length: 201 }, (_, i) => i / 200);

  for (const [name, input] of [
    ['desktop', desktop],
    ['mobile', mobile],
  ] as const) {
    it(`${name}: starts at rest and ends exactly on the logo`, () => {
      expect(dockPath(0, input)).toEqual(input.rest);
      const end = dockPath(1, input);
      expect(end.x).toBeCloseTo(input.dock.x, 9);
      expect(end.y).toBeCloseTo(input.dock.y, 9);
      expect(end.scale).toBeCloseTo(input.dock.scale, 9);
    });

    it(`${name}: keeps the top edge below the band until the rise, then only moves up`, () => {
      for (const p of steps) {
        const place = dockPath(p, input);
        if (p < DOCK_PHASES.rise) {
          expect(place.y - input.extent * place.scale).toBeGreaterThanOrEqual(
            input.bandBottom - 1e-9,
          );
        } else {
          expect(place.x).toBeCloseTo(input.dock.x, 9);
        }
      }
    });

    it(`${name}: shrinks early and never grows`, () => {
      let previous = Infinity;
      for (const p of steps) {
        const { scale } = dockPath(p, input);
        expect(scale).toBeLessThanOrEqual(previous + 1e-12);
        previous = scale;
      }
      const atApproach = dockPath(DOCK_PHASES.approach, input);
      expect(atApproach.scale).toBeCloseTo(input.dock.scale * 1.6, 9);
      expect(atApproach.x).toBeCloseTo(input.dock.x, 9);
    });

    it(`${name}: is continuous where the rise begins`, () => {
      const before = dockPath(DOCK_PHASES.rise - 1e-7, input);
      const after = dockPath(DOCK_PHASES.rise, input);
      expect(Math.abs(before.x - after.x)).toBeLessThan(1e-3);
      expect(Math.abs(before.y - after.y)).toBeLessThan(1e-3);
      expect(Math.abs(before.scale - after.scale)).toBeLessThan(1e-6);
    });
  }

  it('eases the band guard in when the rest pose is already inside the band', () => {
    const inside = { ...desktop, rest: { x: 1060, y: 120, scale: 1.27 } };
    expect(dockPath(0, inside).y).toBe(120);
    const later = dockPath(0.3, inside);
    expect(later.y - inside.extent * later.scale).toBeGreaterThanOrEqual(inside.bandBottom - 1e-9);
  });
});
