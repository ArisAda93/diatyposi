/**
 * Pure maths of the floating logo plates (covered by tests/living-background.test.ts): the arch
 * plates of the logo, extruded like the hero's, that float through the living background at
 * their own depths. No DOM and no WebGL here: scene.ts runs these functions every frame and
 * uploads the result as instance data.
 *
 * Space. Poses are kept in screen terms: the plate's centre in viewport CSS px (y down), its
 * apparent width in px and its depth factor `depth`, the distance from the camera over the
 * distance of the screen plane (where one world unit is one CSS px; below 1 the plate is nearer
 * than the page, above 1 farther). toWorld turns a pose into the world position the camera sees
 * at exactly that place, so the projection draws every plate where its pose says, with real
 * perspective on its turning.
 *
 * Parallax. A plate at depth d moves 1/d px on screen per px of scroll (parallaxRate): near plates
 * rush past, far plates linger. Each plate travels up a looping band (the viewport plus a margin
 * above and below) and comes back in at the bottom once it has left at the top, at a new place
 * across the page for every pass (`cycle`), so a fixed pool of plates fills a page of any length
 * and the motion is a pure function of the scroll position: scrolling back reverses it.
 */
import {
  cellHash,
  clamp,
  densityFactor,
  lerp,
  modulo,
  smoothstep,
  type DeviceHints,
  type Plate,
} from './math';

// ------------------------------------------------------------------------------------------------
// The plate pool
// ------------------------------------------------------------------------------------------------

/** Shader order of the inks (uCap / uCeil are vec4(k, c, m, y)). */
export const INK_INDEX: Readonly<Record<Plate, number>> = { k: 0, c: 1, m: 2, y: 3 };

export interface PlateTuning {
  /** Depth factor range: near (< 1, in front of the page) to far. */
  depth: { near: number; far: number };
  /** Apparent width at depth 1, as a share of the view unit. */
  size: { min: number; max: number };
  /** View unit: min(width, height × heightRatio), at least `min` px (phones). */
  unit: { heightRatio: number; min: number };
  /** Centres spread across −bleed … 1 + bleed of the viewport width. */
  bleed: number;
  /** Margin beyond a plate's reach before it loops (px). */
  slack: number;
  /** Drift (x) and bob (y) amplitudes as shares of the unit; their angular speeds (rad/s). */
  drift: { x: number; y: number; speedMin: number; speedMax: number };
  /** Turning about the plate's own axes (rad/s) and the largest rest tilt (rad). */
  spin: { min: number; max: number; tilt: number };
}

export interface PlateSpec {
  ink: Plate;
  /** Depth factor (see the file comment). */
  depth: number;
  /** Apparent width at depth 1, share of the view unit. */
  size: number;
  /** Place in the loop at scroll 0, 0–1. */
  phase: number;
  /** Seed of the per-pass position across the page. */
  seed: number;
  drift: { ax: number; ay: number; wx: number; wy: number; px: number; py: number };
  spin: { x: number; y: number; z: number };
  tilt: { x: number; y: number; z: number };
  /** +1: leans towards the pointer; −1: turns away from it. */
  turn: 1 | -1;
}

/** A small deterministic generator (mulberry32), so every visit gets the same composition. */
export const random = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const INK_ORDER: readonly Plate[] = ['c', 'm', 'y', 'k'];

/**
 * The pool: `count` plates in the four inks in turn, with depths stratified over the whole range
 * (each plate takes its own slice of near…far, in shuffled order, so near and far plates of every
 * ink are always present), and sizes, loop phases, drift and turning drawn at random.
 */
export const plateSpecs = (count: number, tuning: PlateTuning, seed = 7): PlateSpec[] => {
  const rand = random(seed);
  const n = Math.max(0, Math.floor(count));
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const swap = order[i] ?? i;
    order[i] = order[j] ?? j;
    order[j] = swap;
  }
  const { drift, spin } = tuning;
  const speed = (): number => lerp(drift.speedMin, drift.speedMax, rand());
  const turn = (): number => lerp(spin.min, spin.max, rand()) * (rand() < 0.5 ? -1 : 1);
  return order.map((stratum, i): PlateSpec => ({
    ink: INK_ORDER[i % INK_ORDER.length] ?? 'c',
    depth: lerp(tuning.depth.near, tuning.depth.far, (stratum + 0.2 + 0.6 * rand()) / n),
    size: lerp(tuning.size.min, tuning.size.max, rand()),
    phase: (i + 0.15 + 0.7 * rand()) / n,
    seed: 11 + i * 17.31,
    drift: {
      ax: drift.x * (0.5 + 0.5 * rand()),
      ay: drift.y * (0.5 + 0.5 * rand()),
      wx: speed(),
      wy: speed(),
      px: rand() * Math.PI * 2,
      py: rand() * Math.PI * 2,
    },
    spin: { x: turn(), y: turn(), z: turn() * 0.6 },
    tilt: {
      x: (rand() * 2 - 1) * spin.tilt,
      y: (rand() * 2 - 1) * spin.tilt,
      z: rand() * Math.PI * 2,
    },
    turn: rand() < 0.5 ? -1 : 1,
  }));
};

// ------------------------------------------------------------------------------------------------
// How many plates
// ------------------------------------------------------------------------------------------------

export interface PlateBudget {
  /** Plates in view at once by viewport width. */
  desktop: number;
  tablet: number;
  phone: number;
  /** Below `phoneWidth` a phone, below `tabletWidth` a tablet (CSS px). */
  phoneWidth: number;
  tabletWidth: number;
  /** Share kept on low-end devices (few cores or little memory). */
  lowEnd: number;
  /** Pool size per plate in view: a plate spends part of its loop outside the viewport. */
  spare: number;
}

/** Plates in view for this device: by width, fewer on low-end hardware (math.ts densityFactor). */
export const visiblePlates = (hints: DeviceHints, b: PlateBudget): number => {
  const base =
    hints.width < b.phoneWidth ? b.phone : hints.width < b.tabletWidth ? b.tablet : b.desktop;
  // Low-end by hardware only: the grid's small-touch rule is already the phone count here.
  const lowEnd = densityFactor({ ...hints, coarse: false }) < 1;
  return lowEnd ? Math.max(2, Math.round(base * b.lowEnd)) : base;
};

/** Pool size for a number of plates in view. */
export const poolSize = (visible: number, b: PlateBudget): number =>
  Math.max(1, Math.ceil(visible * b.spare));

// ------------------------------------------------------------------------------------------------
// Free plates: parallax, the loop, drift and turning
// ------------------------------------------------------------------------------------------------

export interface PlateView {
  width: number;
  height: number;
  /** Size unit (viewUnit). */
  unit: number;
}

export const viewUnit = (width: number, height: number, t: PlateTuning): number =>
  Math.max(t.unit.min, Math.min(width, height * t.unit.heightRatio));

/** Screen px a plate at `depth` moves per px of page scroll (the page itself moves 1). */
export const parallaxRate = (depth: number): number => (depth > 0 ? 1 / depth : 0);

/** Apparent width (px) of a free plate. */
export const apparentWidth = (spec: PlateSpec, unit: number): number =>
  (unit * spec.size) / spec.depth;

/**
 * The band a plate loops through: `margin` px beyond the viewport at either end (its reach when
 * turned, its bob and some slack, so it is always out of sight when it loops), and the length of
 * one pass (viewport height plus both margins).
 */
export const loopBand = (
  spec: PlateSpec,
  view: PlateView,
  t: PlateTuning,
): { margin: number; length: number } => {
  const margin = 0.6 * apparentWidth(spec, view.unit) + spec.drift.ay * view.unit + t.slack;
  return { margin, length: view.height + 2 * margin };
};

export interface PlatePose {
  /** Centre in viewport CSS px (y down). */
  x: number;
  y: number;
  /** Apparent width (px). */
  width: number;
  depth: number;
  /** Turn about the plate's own x, y and z axes (radians). */
  rx: number;
  ry: number;
  rz: number;
}

/** Which pass of its loop a plate is on at `scroll`. */
export const plateCycle = (
  spec: PlateSpec,
  scroll: number,
  view: PlateView,
  t: PlateTuning,
): number => {
  const { length } = loopBand(spec, view, t);
  return Math.floor((spec.phase * length - scroll * parallaxRate(spec.depth)) / length);
};

/**
 * A free plate at `scroll` (px) and `time` (s): its place on the loop (moving up at its parallax
 * rate, at a new place across the page for every pass), plus drift, bob and turning. `cycle`
 * holds it on a given pass instead (scene.ts, while it drifts into register), so it moves on
 * continuously past the ends of the band rather than looping.
 */
export const freePose = (
  spec: PlateSpec,
  scroll: number,
  time: number,
  view: PlateView,
  t: PlateTuning,
  cycle?: number,
): PlatePose => {
  const { margin, length } = loopBand(spec, view, t);
  const travel = spec.phase * length - scroll * parallaxRate(spec.depth);
  const pass = cycle ?? Math.floor(travel / length);
  const across = cellHash(pass, spec.seed, 1.7);
  const d = spec.drift;
  return {
    x:
      lerp(-t.bleed, 1 + t.bleed, across) * view.width +
      d.ax * view.unit * Math.sin(d.wx * time + d.px),
    y: travel - pass * length - margin + d.ay * view.unit * Math.sin(d.wy * time + d.py),
    width: apparentWidth(spec, view.unit),
    depth: spec.depth,
    rx: spec.tilt.x + spec.spin.x * time,
    ry: spec.tilt.y + spec.spin.y * time,
    rz: spec.tilt.z + spec.spin.z * time,
  };
};

/** Ink left on far plates: full up to `from`, `floor` from `to` on (depth factors). */
export const depthFade = (
  depth: number,
  fog: { from: number; to: number; floor: number },
): number => lerp(1, fog.floor, smoothstep(fog.from, fog.to, depth));

// ------------------------------------------------------------------------------------------------
// From the hero: the four plates of the mark
// ------------------------------------------------------------------------------------------------

/** Width of the hero art box in raster units (hero-scene/choreography.ts ART). */
export const HERO_ART_WIDTH = 900;
/** Raster point at the centre of the mark's viewBox (Logo.astro `mark`: 690 50 840 205). */
export const HERO_MARK_CENTRE = { x: 1110, y: 152.5 } as const;

/** The arch's bounding box in raster units (centre and width), the plate geometry's origin. */
export interface ArchBox {
  cx: number;
  cy: number;
  width: number;
}

/** Where the hero draws the mark: viewport px of HERO_MARK_CENTRE, and px per raster unit. */
export interface MarkPlacement {
  x: number;
  y: number;
  scale: number;
}

/** The mark in an art box `[data-hero-art]` (the static SVG: centred, 900 raster units wide). */
export const markFromArt = (rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}): MarkPlacement => ({
  x: rect.left + rect.width / 2,
  y: rect.top + rect.height / 2,
  scale: rect.width / HERO_ART_WIDTH,
});

export interface MarkSlot {
  id: string;
  /** Centre (viewport px) and width (px) of the plate in the mark. */
  x: number;
  y: number;
  width: number;
}

/**
 * Each logo plate in the mark: the ARCH outline shifted right by its ARCH_PLATES offset, in
 * raster units around HERO_MARK_CENTRE, placed and scaled as the hero draws it.
 */
export const markSlots = (
  arch: ArchBox,
  plates: readonly { id: string; x: number }[],
  mark: MarkPlacement,
): MarkSlot[] =>
  plates.map((plate) => ({
    id: plate.id,
    x: mark.x + (arch.cx + plate.x - HERO_MARK_CENTRE.x) * mark.scale,
    y: mark.y + (arch.cy - HERO_MARK_CENTRE.y) * mark.scale,
    width: arch.width * mark.scale,
  }));

/** Where a plate goes as it leaves the mark: offset (shares of the viewport), depth, growth. */
export interface Travel {
  x: number;
  y: number;
  depth: number;
  grow: number;
}

/**
 * A plate leaving the mark. `slot` is its place in the mark now (it scrolls with the page);
 * `t` (0–1) how far it has scattered and `since` the scroll (px) since it started. At t = 0 it is
 * exactly the flat plate of the mark; as t grows it drifts out by `travel`, takes its own depth
 * (and parallax), grows or shrinks, and starts turning, drifting and bobbing like a free plate.
 */
export const travellerPose = (
  slot: MarkSlot,
  spec: PlateSpec,
  travel: Travel,
  t: number,
  since: number,
  time: number,
  view: PlateView,
): PlatePose => {
  const e = smoothstep(0, 1, t);
  const depth = lerp(1, travel.depth, e);
  const rate = lerp(1, parallaxRate(travel.depth), e);
  const d = spec.drift;
  return {
    x: slot.x + e * (travel.x * view.width + d.ax * view.unit * Math.sin(d.wx * time + d.px)),
    y:
      slot.y -
      Math.max(0, since) * (rate - 1) +
      e * (travel.y * view.height + d.ay * view.unit * Math.sin(d.wy * time + d.py)),
    width: slot.width * lerp(1, travel.grow, e),
    depth,
    rx: e * (spec.tilt.x + spec.spin.x * time),
    ry: e * (spec.tilt.y + spec.spin.y * time),
    rz: e * spec.spin.z * time,
  };
};

// ------------------------------------------------------------------------------------------------
// Registration: plates drifting into register now and then
// ------------------------------------------------------------------------------------------------

export interface RegisterTiming {
  /** Seconds to drift into register, held in it, and to part again. */
  in: number;
  hold: number;
  out: number;
}

/** 0 → 1 → 0 over an event (smooth at both ends), 0 outside it. */
export const registerEnvelope = (elapsed: number, r: RegisterTiming): number => {
  if (elapsed <= 0) return 0;
  if (elapsed < r.in) return smoothstep(0, r.in, elapsed);
  if (elapsed < r.in + r.hold) return 1;
  return 1 - smoothstep(r.in + r.hold, r.in + r.hold + r.out, elapsed);
};

export interface RegisterCandidate {
  index: number;
  ink: Plate;
  x: number;
  y: number;
  depth: number;
}

/**
 * Picks plates to drift into register: the one nearest `centre`, then its nearest neighbours of
 * other inks at a similar depth and within `reach` px, up to `size`. Null if fewer than two.
 */
export const pickRegisterGroup = (
  candidates: readonly RegisterCandidate[],
  centre: { x: number; y: number },
  size: number,
  depthGap: number,
  reach: number,
): number[] | null => {
  if (candidates.length < 2) return null;
  const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
    Math.hypot(a.x - b.x, a.y - b.y);
  const leader = candidates.reduce((best, c) =>
    distance(c, centre) < distance(best, centre) ? c : best,
  );
  const group = [leader];
  const others = candidates
    .filter((c) => c !== leader)
    .sort((a, b) => distance(a, leader) - distance(b, leader));
  for (const c of others) {
    if (group.length >= size) break;
    if (group.some((g) => g.ink === c.ink)) continue;
    if (Math.abs(c.depth - leader.depth) > depthGap || distance(c, leader) > reach) continue;
    group.push(c);
  }
  return group.length >= 2 ? group.map((g) => g.index) : null;
};

/** Angle difference folded into (−π, π]. */
export const wrapAngle = (angle: number): number => {
  const a = modulo(angle + Math.PI, Math.PI * 2) - Math.PI;
  return a === -Math.PI ? Math.PI : a;
};

/**
 * Where a registering group meets: the mean place, width and depth of its plates, turned like the
 * first (the leader), so at full weight they lie exactly on top of each other and overprint.
 */
export const registerTarget = (poses: readonly PlatePose[]): PlatePose | null => {
  const first = poses[0];
  if (!first) return null;
  const mean = (pick: (p: PlatePose) => number): number =>
    poses.reduce((sum, p) => sum + pick(p), 0) / poses.length;
  return {
    x: mean((p) => p.x),
    y: mean((p) => p.y),
    width: mean((p) => p.width),
    depth: mean((p) => p.depth),
    rx: first.rx,
    ry: first.ry,
    rz: first.rz,
  };
};

/** `pose` moved `w` (0–1) of the way to `target`, turning the short way round. */
export const blendPose = (pose: PlatePose, target: PlatePose, w: number): PlatePose => ({
  x: lerp(pose.x, target.x, w),
  y: lerp(pose.y, target.y, w),
  width: lerp(pose.width, target.width, w),
  depth: lerp(pose.depth, target.depth, w),
  rx: pose.rx + w * wrapAngle(target.rx - pose.rx),
  ry: pose.ry + w * wrapAngle(target.ry - pose.ry),
  rz: pose.rz + w * wrapAngle(target.rz - pose.rz),
});

// ------------------------------------------------------------------------------------------------
// Pointer and springs
// ------------------------------------------------------------------------------------------------

/** How strongly the pointer at (dx, dy) px from a plate moves it: 1 on it, fading by `radius`. */
export const pointerInfluence = (dx: number, dy: number, radius: number): number =>
  radius > 0 ? Math.exp(-(dx * dx + dy * dy) / (radius * radius)) : 0;

/**
 * One step of a damped spring (mass 1) towards `target`, in sub-steps of at most 1/120 s, so long
 * frames stay stable. Returns [position, velocity].
 */
export const springStep = (
  x: number,
  v: number,
  target: number,
  stiffness: number,
  damping: number,
  dt: number,
): [number, number] => {
  let left = clamp(dt, 0, 0.1);
  let pos = x;
  let vel = v;
  while (left > 1e-6) {
    const h = Math.min(left, 1 / 120);
    vel += (stiffness * (target - pos) - damping * vel) * h;
    pos += vel * h;
    left -= h;
  }
  return [pos, vel];
};

// ------------------------------------------------------------------------------------------------
// Into the world
// ------------------------------------------------------------------------------------------------

/**
 * The world point (camera at the origin looking down −z, y up) that the camera sees at viewport
 * px (x, y) at depth factor `depth`; `distance` is the screen plane's (one unit = one CSS px).
 */
export const toWorld = (
  x: number,
  y: number,
  depth: number,
  width: number,
  height: number,
  distance: number,
): [number, number, number] => [
  (x - width / 2) * depth,
  (height / 2 - y) * depth,
  -distance * depth,
];

/**
 * Writes a plate's model transform as three rows (rotation × scale | translation) at `offset`:
 * R = Rz · Ry · Rx (tipped about x, turned about y, rolled about z), scaled by `scale` (the
 * geometry is one unit wide), placed at (x, y, z). The shader computes world = rows · (p, 1).
 */
export const plateRows = (
  out: Float32Array,
  offset: number,
  rx: number,
  ry: number,
  rz: number,
  scale: number,
  x: number,
  y: number,
  z: number,
): void => {
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  out[offset] = cz * cy * scale;
  out[offset + 1] = (cz * sy * sx - sz * cx) * scale;
  out[offset + 2] = (cz * sy * cx + sz * sx) * scale;
  out[offset + 3] = x;
  out[offset + 4] = sz * cy * scale;
  out[offset + 5] = (sz * sy * sx + cz * cx) * scale;
  out[offset + 6] = (sz * sy * cx - cz * sx) * scale;
  out[offset + 7] = y;
  out[offset + 8] = -sy * scale;
  out[offset + 9] = cy * sx * scale;
  out[offset + 10] = cy * cx * scale;
  out[offset + 11] = z;
};
