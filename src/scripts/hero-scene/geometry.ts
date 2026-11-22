/**
 * Procedural geometry for the hero scene, built from the logo's ARCH path (logo-paths.ts):
 * the outline is sampled into a polygon, triangulated (ear clipping) and extruded into a solid
 * with depth. boundsOf also measures the arch for the choreography (choreography.ts). Pure
 * functions on plain arrays, run once per page.
 */

export interface Point {
  x: number;
  y: number;
}

/** Returns list[i], or throws: keeps the strict index checks honest without silent fallbacks. */
const at = <T>(list: readonly T[], i: number): T => {
  const value = list[i];
  if (value === undefined) throw new RangeError(`Index ${i} out of range`);
  return value;
};

/**
 * Numbers first (so an exponent "e" stays inside its number), then any single command letter, so
 * unsupported commands reach the parser and are rejected instead of being skipped.
 */
const TOKEN = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?|[a-z]/gi;

/**
 * Samples an absolute SVG path made of M, L, A and Z commands (the form ARCH is written in) into
 * the points of one closed outline. Arcs get about `arcStepsPerRadian` points per radian of turn.
 */
export const sampleOutline = (d: string, arcStepsPerRadian = 9): Point[] => {
  const tokens = d.match(TOKEN) ?? [];
  const points: Point[] = [];
  let i = 0;
  let command = '';
  const num = (): number => {
    const value = Number(at(tokens, i++));
    if (!Number.isFinite(value)) throw new SyntaxError(`Bad number in path near token ${i}`);
    return value;
  };

  while (i < tokens.length) {
    const token = at(tokens, i);
    if (/^[a-z]$/i.test(token)) {
      command = token;
      i++;
      if (command.toUpperCase() === 'Z') continue;
    }
    switch (command) {
      case 'M':
      case 'L':
        points.push({ x: num(), y: num() });
        break;
      case 'A': {
        const rx = num();
        const ry = num();
        const rotation = num();
        const largeArc = num() !== 0;
        const sweep = num() !== 0;
        const end = { x: num(), y: num() };
        const start = points.at(-1);
        if (!start) throw new SyntaxError('Arc without a start point');
        points.push(...sampleArc(start, rx, ry, rotation, largeArc, sweep, end, arcStepsPerRadian));
        break;
      }
      default:
        throw new SyntaxError(`Unsupported path command "${command}"`);
    }
  }

  // A closing point equal to the first adds nothing to a closed outline.
  const first = points[0];
  const last = points.at(-1);
  if (first && last && points.length > 1 && first.x === last.x && first.y === last.y) points.pop();
  return points;
};

/** Signed angle from vector u to vector v. */
const angleBetween = (ux: number, uy: number, vx: number, vy: number): number =>
  Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);

/**
 * Points along an SVG elliptical arc (endpoint parameterisation, SVG 1.1 appendix F.6.5),
 * excluding the start point and including the end point.
 */
export const sampleArc = (
  start: Point,
  rxIn: number,
  ryIn: number,
  rotationDeg: number,
  largeArc: boolean,
  sweep: boolean,
  end: Point,
  stepsPerRadian: number,
): Point[] => {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) return [end];

  const phi = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (start.x - end.x) / 2;
  const dy = (start.y - end.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;

  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }

  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const coef = (largeArc !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1) / ry;
  const cyp = (-coef * ry * x1) / rx;
  const cx = cos * cxp - sin * cyp + (start.x + end.x) / 2;
  const cy = sin * cxp + cos * cyp + (start.y + end.y) / 2;

  const ux = (x1 - cxp) / rx;
  const uy = (y1 - cyp) / ry;
  const vx = (-x1 - cxp) / rx;
  const vy = (-y1 - cyp) / ry;
  const theta = angleBetween(1, 0, ux, uy);
  let delta = angleBetween(ux, uy, vx, vy);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;

  const steps = Math.max(2, Math.ceil(Math.abs(delta) * stepsPerRadian));
  const out: Point[] = [];
  for (let k = 1; k < steps; k++) {
    const t = theta + (delta * k) / steps;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    out.push({ x: cos * ex - sin * ey + cx, y: sin * ex + cos * ey + cy });
  }
  out.push({ x: end.x, y: end.y });
  return out;
};

/** Shoelace area: positive for counter-clockwise outlines in a y-up space. */
export const signedArea = (points: readonly Point[]): number => {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = at(points, i);
    const b = at(points, (i + 1) % points.length);
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
};

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const boundsOf = (points: readonly Point[]): Bounds => {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of points) {
    b.minX = Math.min(b.minX, p.x);
    b.minY = Math.min(b.minY, p.y);
    b.maxX = Math.max(b.maxX, p.x);
    b.maxY = Math.max(b.maxY, p.y);
  }
  return b;
};

/**
 * Moves an outline from the raster space (y down) into a y-up space centred on (cx, cy), scaled
 * by `scale`, and makes it counter-clockwise (front faces wind CCW).
 */
export const toLocal = (points: readonly Point[], cx: number, cy: number, scale = 1): Point[] => {
  const local = points.map((p) => ({ x: (p.x - cx) * scale, y: (cy - p.y) * scale }));
  return signedArea(local) < 0 ? local.reverse() : local;
};

const cross = (o: Point, a: Point, b: Point): number =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

const inTriangle = (p: Point, a: Point, b: Point, c: Point): boolean =>
  cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;

/**
 * Ear-clipping triangulation of a simple counter-clockwise polygon. Returns index triples into
 * `points`; every triangle winds counter-clockwise.
 */
export const triangulate = (points: readonly Point[]): number[] => {
  const remaining = points.map((_, i) => i);
  const triangles: number[] = [];
  const epsilon = 1e-9;

  while (remaining.length > 3) {
    const n = remaining.length;
    let clipped = false;
    for (let i = 0; i < n; i++) {
      const ia = at(remaining, (i - 1 + n) % n);
      const ib = at(remaining, i);
      const ic = at(remaining, (i + 1) % n);
      const a = at(points, ia);
      const b = at(points, ib);
      const c = at(points, ic);
      const turn = cross(a, b, c);
      if (Math.abs(turn) <= epsilon) {
        // Collinear vertex: drop it, it encloses no area.
        remaining.splice(i, 1);
        clipped = true;
        break;
      }
      if (turn < 0) continue; // reflex corner
      const blocked = remaining.some((ip) => {
        if (ip === ia || ip === ib || ip === ic) return false;
        return inTriangle(at(points, ip), a, b, c);
      });
      if (blocked) continue;
      triangles.push(ia, ib, ic);
      remaining.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) throw new Error('Outline is not a simple counter-clockwise polygon');
  }
  if (remaining.length === 3) triangles.push(...remaining);
  return triangles;
};

export interface SolidGeometry {
  /** xyz per vertex. */
  position: Float32Array;
  /** Unit normal per vertex. */
  normal: Float32Array;
  /** 0 on the two faces, 1 on the side walls (the walls get the depth shading). */
  wall: Float32Array;
  index: Uint16Array;
}

/** Normals of neighbouring wall segments are blended when they turn less than this. */
const SMOOTH_ANGLE = (28 * Math.PI) / 180;

/**
 * Extrudes a counter-clockwise outline into a solid `depth` deep, centred on z = 0: a front face
 * (normal +z), a back face (normal -z) and side walls with outward normals, smoothed along the
 * curves and kept sharp at the corners (the cut feet, the leg junctions).
 */
export const extrude = (outline: readonly Point[], depth: number): SolidGeometry => {
  const n = outline.length;
  const tris = triangulate(outline);
  const half = depth / 2;
  const positions: number[] = [];
  const normals: number[] = [];
  const walls: number[] = [];
  const indices: number[] = [];

  const push = (x: number, y: number, z: number, nx: number, ny: number, nz: number, w: number) => {
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    walls.push(w);
    return walls.length - 1;
  };

  // Front and back faces.
  const front = outline.map((p) => push(p.x, p.y, half, 0, 0, 1, 0));
  const back = outline.map((p) => push(p.x, p.y, -half, 0, 0, -1, 0));
  for (let t = 0; t < tris.length; t += 3) {
    const a = at(tris, t);
    const b = at(tris, t + 1);
    const c = at(tris, t + 2);
    indices.push(at(front, a), at(front, b), at(front, c));
    indices.push(at(back, a), at(back, c), at(back, b));
  }

  // Outward normal of each edge i -> i+1 (right-hand normal of a CCW outline).
  const edgeNormals: Point[] = outline.map((p, i) => {
    const q = at(outline, (i + 1) % n);
    const ex = q.x - p.x;
    const ey = q.y - p.y;
    const len = Math.hypot(ex, ey) || 1;
    return { x: ey / len, y: -ex / len };
  });
  const blend = (a: Point, b: Point): Point => {
    const angle = Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y)));
    if (angle > SMOOTH_ANGLE) return a;
    const x = a.x + b.x;
    const y = a.y + b.y;
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  };

  for (let i = 0; i < n; i++) {
    const p = at(outline, i);
    const q = at(outline, (i + 1) % n);
    const own = at(edgeNormals, i);
    const nStart = blend(own, at(edgeNormals, (i - 1 + n) % n));
    const nEnd = blend(own, at(edgeNormals, (i + 1) % n));
    const pf = push(p.x, p.y, half, nStart.x, nStart.y, 0, 1);
    const pb = push(p.x, p.y, -half, nStart.x, nStart.y, 0, 1);
    const qb = push(q.x, q.y, -half, nEnd.x, nEnd.y, 0, 1);
    const qf = push(q.x, q.y, half, nEnd.x, nEnd.y, 0, 1);
    indices.push(pf, pb, qb, pf, qb, qf);
  }

  if (walls.length > 0xffff) throw new RangeError('Too many vertices for 16-bit indices');
  return {
    position: new Float32Array(positions),
    normal: new Float32Array(normals),
    wall: new Float32Array(walls),
    index: new Uint16Array(indices),
  };
};
