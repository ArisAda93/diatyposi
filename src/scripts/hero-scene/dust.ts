/**
 * The ink dust of the hero scene (scene.ts, drawn by shaders.ts dustVertex and dustFragment): a
 * field of fine cyan, magenta and yellow specks at many depths that fills the whole hero and turns
 * with the view, so its parallax shows the depth of the space the plates hang in. A few large,
 * soft specks float in front of the plates (bokeh). At the click the specks near the mark are
 * drawn into the plates and released again (choreography.ts effectsAt `absorb`).
 *
 * Here: how many specks a hero gets, where each one lies (a seeded, repeatable layout), how
 * strongly the dust prints in each theme, and the conversion of page boxes into the device-pixel
 * rectangles inside which it is kept faint (the copy and the header band, so the text stays
 * readable). Pure functions with no DOM or WebGL access, so they can be unit tested
 * (tests/hero-dust.test.ts).
 *
 * Units: CSS px. Hero px run from the hero's top left corner, y down. Dust positions are relative
 * to the plates' pivot (the centre of the mark at rest), y up, z towards the camera; the dust's
 * frame sits at the pivot with the group's rotation (Euler order YXZ: pitch about x first, then
 * yaw about y) but not its scale, so one unit on the pivot's plane (z = 0) is one CSS px on screen.
 * The camera looks down the centre of the hero from `distance` in front of the pivot's plane.
 */
import { lerp, type Box } from './math';
import type { SceneTheme } from './theme';

// ------------------------------------------------------------------------------------------------
// Tuning
// ------------------------------------------------------------------------------------------------

/**
 * - count: specks seen on the hero at rest, per CSS px² of hero, never fewer than `min` (phones and
 *   small heroes) nor more than `max`: a 1440 × 900 hero shows about 1000, a phone about 400. The
 *   field itself holds several times more (dustPlan: about 4400 for that hero), as the view's
 *   turn brings specks in from past the edges; never more than `field`, the size of the buffers,
 *   which leaves room for wide screens (most of those specks lie off-screen at any moment and are
 *   clipped before they cost any fill).
 * - depth: the crisp specks run from `far` camera distances behind the pivot's plane to `near`
 *   camera distances in front of it. `bias` above 1 puts more of them towards the far end.
 * - turn: the largest view angle the field must cover (radians): the orbit plus the pointer's
 *   tilt, either way. Each depth's spread is widened so that, turned that far, the hero is still
 *   filled to every edge (fieldExtent).
 * - margin: the field reaches this share of the hero's size past every edge on top of that (room
 *   for the drift and the speck's own size).
 * - size: diameter of a crisp speck on the pivot's plane (CSS px); a share `large` of them are
 *   larger flecks up to `largeMax`.
 * - bokeh: a share of the specks seen float in front of the plates, from `from` to `to` camera
 *   distances in front of the pivot's plane, `min` to `max` CSS px across on that plane (larger
 *   on screen by their perspective), with an edge `blur` to 1 soft (shaders.ts dustFragment).
 * - drift: amplitude of each speck's slow wander (CSS px).
 * - inks: shares of cyan, magenta and yellow (cyan and magenta carry the field).
 * - minPoint: the smallest speck drawn (CSS px); smaller specks print fainter instead.
 * - maxPoint: the largest speck drawn (device px), below the GL's own limit where that is lower.
 * - absorb: specks within `reach` times the mark's half-diagonal of the pivot are drawn in at the
 *   click (never less than `minReach` CSS px).
 */
export const DUST = {
  count: { perArea: 1 / 1300, min: 400, max: 1200, field: 6400 },
  depth: { near: 0.1, far: 1.6, bias: 1.3 },
  turn: { yaw: 0.44, pitch: 0.31 },
  margin: 0.08,
  size: { min: 2, max: 3.6, large: 0.08, largeMax: 5.5 },
  bokeh: { share: 0.08, from: 0.12, to: 0.35, min: 6, max: 11, blur: 0.75 },
  drift: { min: 6, max: 18 },
  inks: { c: 0.42, m: 0.38, y: 0.2 },
  minPoint: 2.2,
  maxPoint: 40,
  absorb: { reach: 2.4, minReach: 180 },
} as const;

/**
 * Readability: inside the copy's box and the header band the dust keeps at most `floor` of its
 * strength, easing back over `feather` CSS px outside them.
 */
export const DUST_MASK = { floor: 0.15, feather: 40 } as const;

/** Seed of the hero's dust field. */
export const DUST_SEED = 0x5eed_d057;

/** Device-pixel rectangle far outside any canvas (a box that is not there). Fits half floats. */
const OFF_CANVAS = -10_000;

/** Ink index of a speck in the `look` attribute (shaders.ts dustVertex). */
export const DUST_INK = { c: 0, m: 1, y: 2 } as const;

/**
 * View angles sampled when widening the field (shares of DUST.turn, both ways), as the sine and
 * cosine of the yaw and of the pitch.
 */
const TURNS = [-1, -0.5, 0, 0.5, 1].map((step) => ({
  yaw: { s: Math.sin(step * DUST.turn.yaw), c: Math.cos(step * DUST.turn.yaw) },
  pitch: { s: Math.sin(-step * DUST.turn.pitch), c: Math.cos(-step * DUST.turn.pitch) },
}));

/** Depth samples of the tables that spread the specks over depth (dustPlan, layDust). */
const DEPTH_STEPS = 48;

// ------------------------------------------------------------------------------------------------
// Layout
// ------------------------------------------------------------------------------------------------

/**
 * A small, fast seeded random number generator (mulberry32): the same seed gives the same
 * sequence of numbers in [0, 1) on every browser.
 */
export const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

/** How many specks a hero of this size (CSS px) shows at rest. See DUST.count. */
export const dustOnScreen = (width: number, height: number): number => {
  const { perArea, min, max } = DUST.count;
  const area = Math.max(0, width) * Math.max(0, height);
  return Math.round(Math.min(max, Math.max(min, area * perArea)));
};

/** A rectangle around the pivot, CSS px, y up. */
export interface Footprint {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** What the dust's layout depends on. */
export interface DustFrame {
  /** Hero size, CSS px. */
  width: number;
  height: number;
  /** The pivot in hero px (from the hero's top left, y down). */
  pivotX: number;
  pivotY: number;
  /** Camera distance from the pivot's plane, CSS px. */
  distance: number;
  /** The mark's footprint around the pivot (CSS px, y up): where absorbed specks gather. */
  footprint: Footprint;
}

/** Per-speck vertex attributes (shaders.ts dustVertex), `count` specks from index 0. */
export interface DustBuffers {
  /** x, y, z per speck: CSS px relative to the pivot, y up, z towards the camera. */
  position: Float32Array;
  /** x, y per speck: where it gathers inside the mark's footprint when absorbed (z = 0). */
  home: Float32Array;
  /** Per speck: ink (DUST_INK), diameter (CSS px), drift phase (rad), drift amplitude (CSS px). */
  look: Float32Array;
  /** Per speck: edge softness, 0 for a crisp speck, DUST.bokeh.blur to 1 for a bokeh one. */
  blur: Float32Array;
}

/** Zeroed buffers for `capacity` specks (DUST.count.field by default). */
export const createDustBuffers = (capacity: number = DUST.count.field): DustBuffers => ({
  position: new Float32Array(capacity * 3),
  home: new Float32Array(capacity * 2),
  look: new Float32Array(capacity * 4),
  blur: new Float32Array(capacity),
});

/** The range of depths of the whole field, bokeh included (CSS px, z towards the camera). */
export const dustDepthRange = (distance: number): { min: number; max: number } => ({
  min: -DUST.depth.far * distance,
  max: DUST.bokeh.to * distance,
});

/**
 * Where an edge of the view crosses the dust's plane at depth `z`, measured across it in the
 * dust's own frame, with the view turned by an angle (sine `s`, cosine `c`) about the axis along
 * that edge. `slope` is the edge's screen offset per unit of distance from the camera (signed: the
 * left or bottom edge is negative) and `offset` the pivot's offset from the screen's centre along
 * the same axis. Yaw and x use this as it stands; pitch and y use it with the angle negated (the
 * same form).
 */
const edgeAt = (
  slope: number,
  offset: number,
  distance: number,
  z: number,
  turn: { s: number; c: number },
): number => {
  const { s, c } = turn;
  // The edge ray meets the turned plane at camera-space depth `depth` (guarded against grazing).
  const across = Math.max(0.05, c - slope * s);
  const depth = Math.min(distance * 0.95, (z - (slope * distance - offset) * s) / across);
  return (slope * (distance - depth) - offset) * c - depth * s;
};

/**
 * The spread of the field at depth `z` (CSS px about the pivot, y up): the hero seen from the
 * camera, past every edge by DUST.margin, for every view up to DUST.turn either way, so a turned
 * view still finds specks at every edge. Deep and near layers spread widest (they slide furthest
 * as the view turns); the pivot's plane barely moves.
 */
export const fieldExtent = (frame: DustFrame, z: number): Footprint => {
  const distance = Math.max(1, frame.distance);
  const spread = 1 + DUST.margin * 2;
  const pivotRight = frame.pivotX - frame.width / 2;
  const pivotUp = frame.height / 2 - frame.pivotY;
  const slopeX = ((frame.width / 2) * spread) / distance;
  const slopeY = ((frame.height / 2) * spread) / distance;
  const out = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const turn of TURNS) {
    for (const side of [-1, 1]) {
      const x = edgeAt(side * slopeX, pivotRight, distance, z, turn.yaw);
      const y = edgeAt(side * slopeY, pivotUp, distance, z, turn.pitch);
      out.minX = Math.min(out.minX, x);
      out.maxX = Math.max(out.maxX, x);
      out.minY = Math.min(out.minY, y);
      out.maxY = Math.max(out.maxY, y);
    }
  }
  return out;
};

/** A band of depths the specks of one kind lie in: z = lerp(from, to, u^bias), u in [0, 1]. */
interface Layer {
  from: number;
  to: number;
  bias: number;
}

const layersOf = (distance: number): { crisp: Layer; bokeh: Layer } => ({
  crisp: {
    from: -DUST.depth.far * distance,
    to: DUST.depth.near * distance,
    bias: DUST.depth.bias,
  },
  bokeh: { from: DUST.bokeh.from * distance, to: DUST.bokeh.to * distance, bias: 1 },
});

const depthOf = (layer: Layer, u: number): number =>
  lerp(layer.from, layer.to, Math.pow(u, layer.bias));

/**
 * How many times the hero's area the field spreads over at depth `z`, seen on screen: a speck
 * laid out there is on the hero at rest with a chance of 1 in this.
 */
const spreadAt = (frame: DustFrame, z: number): number => {
  const e = fieldExtent(frame, z);
  const distance = Math.max(1, frame.distance);
  const reach = (distance - z) / distance;
  const area = Math.max(1, frame.width * frame.height);
  return ((e.maxX - e.minX) * (e.maxY - e.minY)) / (reach * reach) / area;
};

/**
 * Cumulative spread over a layer's depths (DEPTH_STEPS + 1 samples of u, trapezoids): the last
 * value is the layer's mean spread. Specks are drawn over depth in proportion to it, so every
 * depth shows the same density on screen however wide it spreads.
 */
const spreadTable = (frame: DustFrame, layer: Layer): Float64Array => {
  const table = new Float64Array(DEPTH_STEPS + 1);
  let previous = spreadAt(frame, depthOf(layer, 0));
  let sum = 0;
  for (let i = 1; i <= DEPTH_STEPS; i++) {
    const current = spreadAt(frame, depthOf(layer, i / DEPTH_STEPS));
    sum += (previous + current) / 2 / DEPTH_STEPS;
    table[i] = sum;
    previous = current;
  }
  return table;
};

const valueAt = (table: Float64Array, i: number): number => table[i] ?? 0;

/** The u (0–1) at which the cumulative spread reaches the share `r` of its total. */
const sampleTable = (table: Float64Array, r: number): number => {
  const target = r * valueAt(table, DEPTH_STEPS);
  let i = 0;
  while (i < DEPTH_STEPS - 1 && valueAt(table, i + 1) <= target) i++;
  const low = valueAt(table, i);
  const span = valueAt(table, i + 1) - low;
  const within = span > 0 ? Math.min(1, Math.max(0, (target - low) / span)) : 0;
  return (i + within) / DEPTH_STEPS;
};

/** How many specks of each kind the field holds: crisp ones first, then bokeh. */
export interface DustPlan {
  crisp: number;
  bokeh: number;
  count: number;
}

/**
 * The field for a hero: enough specks that it shows dustOnScreen of them at rest (a share
 * DUST.bokeh.share of them bokeh) at every depth, with the extra the turned views need past the
 * edges; scaled down evenly if that would pass DUST.count.field.
 */
export const dustPlan = (frame: DustFrame): DustPlan => {
  const onScreen = dustOnScreen(frame.width, frame.height);
  const layers = layersOf(Math.max(1, frame.distance));
  const crispSpread = valueAt(spreadTable(frame, layers.crisp), DEPTH_STEPS);
  const bokehSpread = valueAt(spreadTable(frame, layers.bokeh), DEPTH_STEPS);
  const crispWanted = onScreen * (1 - DUST.bokeh.share) * crispSpread;
  const bokehWanted = onScreen * DUST.bokeh.share * bokehSpread;
  const fit = Math.min(1, DUST.count.field / Math.max(1, crispWanted + bokehWanted));
  const crisp = Math.floor(crispWanted * fit);
  const bokeh = Math.floor(bokehWanted * fit);
  return { crisp, bokeh, count: crisp + bokeh };
};

/**
 * Lays out the specks of `plan` for `frame` from `seed` into `out` (the plan must fit its
 * capacity) and returns it: the crisp specks first, then the bokeh ones. Each speck draws its
 * random numbers in the same order, so the same seed and frame always give the same field.
 *
 * Depth first (spread over the layer's depths so that each shows the same density on screen),
 * then a place across the field's spread at that depth (fieldExtent), uniform, so the specks seen
 * at rest are spread evenly over the hero.
 */
export const layDust = (
  frame: DustFrame,
  plan: DustPlan,
  seed: number,
  out: DustBuffers = createDustBuffers(plan.count),
): DustBuffers => {
  const capacity = Math.floor(out.position.length / 3);
  if (plan.count > capacity) {
    throw new Error(`Dust buffers hold ${capacity} specks, not ${plan.count}`);
  }
  const random = mulberry32(seed);
  const { footprint } = frame;
  const layers = layersOf(Math.max(1, frame.distance));
  const tables = {
    crisp: spreadTable(frame, layers.crisp),
    bokeh: spreadTable(frame, layers.bokeh),
  };
  const { size, bokeh, drift, inks } = DUST;

  for (let i = 0; i < plan.count; i++) {
    const rDepth = random();
    const rX = random();
    const rY = random();
    const rInk = random();
    const rSize = random();
    const rLarge = random();
    const rPhase = random();
    const rDrift = random();
    const rHomeX = random();
    const rHomeY = random();
    const rBlur = random();

    const soft = i >= plan.crisp;
    const layer = soft ? layers.bokeh : layers.crisp;
    const z = depthOf(layer, sampleTable(soft ? tables.bokeh : tables.crisp, rDepth));
    const extent = fieldExtent(frame, z);
    out.position[i * 3] = lerp(extent.minX, extent.maxX, rX);
    out.position[i * 3 + 1] = lerp(extent.minY, extent.maxY, rY);
    out.position[i * 3 + 2] = z;

    out.home[i * 2] = lerp(footprint.minX, footprint.maxX, rHomeX);
    out.home[i * 2 + 1] = lerp(footprint.minY, footprint.maxY, rHomeY);

    const ink = rInk < inks.c ? DUST_INK.c : rInk < inks.c + inks.m ? DUST_INK.m : DUST_INK.y;
    let diameter: number;
    if (soft) diameter = lerp(bokeh.min, bokeh.max, rSize);
    else if (rLarge < size.large) diameter = lerp(size.max, size.largeMax, rSize);
    else diameter = lerp(size.min, size.max, rSize * rSize);
    out.look[i * 4] = ink;
    out.look[i * 4 + 1] = diameter;
    out.look[i * 4 + 2] = rPhase * Math.PI * 2;
    out.look[i * 4 + 3] = lerp(drift.min, drift.max, rDrift);
    out.blur[i] = soft ? lerp(bokeh.blur, 1, rBlur) : 0;
  }
  return out;
};

/**
 * Distance from the pivot (CSS px) within which specks are drawn in at the click: a multiple of
 * the mark's half-diagonal. See DUST.absorb.
 */
export const absorbReach = (footprint: Footprint): number => {
  const halfDiagonal =
    Math.hypot(footprint.maxX - footprint.minX, footprint.maxY - footprint.minY) / 2;
  return Math.max(DUST.absorb.minReach, halfDiagonal * DUST.absorb.reach);
};

/**
 * A box in canvas CSS px (from the canvas's top left, y down) as the device-pixel rectangle the
 * fragment shader compares with gl_FragCoord (from the drawing buffer's bottom left, y up):
 * [min x, min y, max x, max y]. A missing or empty box lies far outside the canvas. Writes into
 * `out` (no allocation per frame) and returns it.
 */
export const deviceRect = (
  box: Box | null,
  canvasHeight: number,
  dpr: number,
  out: Float32Array = new Float32Array(4),
): Float32Array => {
  if (!box || box.width <= 0 || box.height <= 0) {
    out.fill(OFF_CANVAS);
    return out;
  }
  out[0] = box.left * dpr;
  out[1] = (canvasHeight - (box.top + box.height)) * dpr;
  out[2] = (box.left + box.width) * dpr;
  out[3] = (canvasHeight - box.top) * dpr;
  return out;
};

// ------------------------------------------------------------------------------------------------
// Looks
// ------------------------------------------------------------------------------------------------

/** Strengths (0–1) of the dust in one theme. */
export interface DustLook {
  /** Strongest ink of one crisp speck on the pivot's plane. */
  alpha: number;
  /** Share of that kept by the soft bokeh specks in front (about 0.25 of ink at their centre). */
  bokeh: number;
  /** Share of that kept by the farthest specks. */
  far: number;
}

const DUST_LOOKS: Record<SceneTheme, DustLook> = {
  light: { alpha: 0.75, bokeh: 0.36, far: 0.5 },
  dark: { alpha: 0.7, bokeh: 0.4, far: 0.55 },
};

export const dustLook = (theme: SceneTheme): DustLook => DUST_LOOKS[theme];
