/**
 * The ink lines of the living background: pure maths, no DOM and no WebGL (covered by
 * tests/living-background.test.ts). shaders.ts mirrors `lineAt` and `pointerPush` on the GPU, so
 * the tests describe what is drawn: keep both in step.
 *
 * The composition. A few braids flow across the viewport, each one a hairline in every ink of the
 * logo (C, M, Y, K). A braid follows a slow wave across the screen (the river); its lines weave
 * around it and cross one another, and the weave narrows at travelling nodes where all of the
 * braid's lines meet (the lines connect there and print a little stronger) and opens between them.
 * Everything moves slowly with time; the scroll carries every braid up at its own parallax rate
 * and shifts the waves a little, so the lines flow with the page. Braids loop through a band one
 * margin taller than the viewport at each end, so they always leave and enter out of sight.
 *
 * Space: CSS px of the viewport, x to the right, y down (as the page).
 */
import { modulo, type DeviceHints, type Plate } from './math';

const TAU = Math.PI * 2;

/** Shader order of the inks (uniform vec4s are (k, c, m, y)). */
export const INK_INDEX: Readonly<Record<Plate, number>> = { k: 0, c: 1, m: 2, y: 3 };

/** The inks of every braid, in print order of the logo's plates. */
export const BRAID_INKS: readonly Plate[] = ['c', 'm', 'y', 'k'];

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

const between = (range: readonly [number, number], t: number): number =>
  range[0] + (range[1] - range[0]) * t;

/** A wave: amplitude, cycles across the viewport width, phase (rad), speed (rad/s). */
export interface Wave {
  amp: number;
  cycles: number;
  phase: number;
  speed: number;
}

export interface LineTuning {
  /** The braid's wave: amplitude (share of the viewport height), cycles across, speed (rad/s). */
  river: {
    amp: readonly [number, number];
    cycles: readonly [number, number];
    speed: readonly [number, number];
  };
  /** The lines around the river: amplitude (share of the height), cycles across, speed (rad/s). */
  weave: {
    amp: readonly [number, number];
    cycles: readonly [number, number];
    speed: readonly [number, number];
  };
  /** Where the lines meet: nodes across the width, their speed (rad/s), the spread left there. */
  nodes: { cycles: readonly [number, number]; speed: readonly [number, number]; floor: number };
  /** Share of the scroll each braid travels up (below 1: it lags the page, reading as depth). */
  parallax: readonly [number, number];
  /** Wave phase shift per viewport height scrolled (rad), river and weave. */
  scrollPhase: { river: number; weave: number };
  /** Line width (CSS px); the key line takes `keyWidth` of it. */
  width: readonly [number, number];
  keyWidth: number;
  /** Ink at the widest spread, as a share of the ink at a node (where the lines meet). */
  openInk: number;
}

export interface LineSpec {
  ink: Plate;
  /** Which braid; the lines of one braid share its place, river, nodes and parallax. */
  braid: number;
  /** Place of the braid in its looping band at scroll 0, 0–1 (0 at the band's top). */
  base: number;
  parallax: number;
  river: Wave;
  /** Amplitude, cycles and speed are the braid's; the phase is this line's own. */
  weave: Wave;
  /** The braid's nodes: cycles, phase and speed (amp is 0: the floor is LineTuning.nodes.floor). */
  nodes: Wave;
  width: number;
}

/**
 * `braids` braids of the four inks (4 × braids lines). Braids sit at even places through the
 * band (so they are spread over the page height), each with its own river, weave, nodes and
 * parallax; within a braid the lines take evenly spaced weave phases (so they cross one another),
 * jittered a little. The same seed gives the same composition on every visit.
 */
export const lineSpecs = (braids: number, tuning: LineTuning, seed = 5): LineSpec[] => {
  const rand = random(seed);
  const n = Math.max(0, Math.floor(braids));
  const out: LineSpec[] = [];
  for (let b = 0; b < n; b++) {
    const base = (b + 0.3 + 0.4 * rand()) / n;
    const parallax = between(tuning.parallax, rand());
    const direction = rand() < 0.5 ? -1 : 1;
    const river: Wave = {
      amp: between(tuning.river.amp, rand()),
      cycles: between(tuning.river.cycles, rand()),
      phase: rand() * TAU,
      speed: between(tuning.river.speed, rand()) * direction,
    };
    const weaveAmp = between(tuning.weave.amp, rand());
    const weaveCycles = between(tuning.weave.cycles, rand());
    const weaveSpeed = between(tuning.weave.speed, rand()) * -direction;
    const nodes: Wave = {
      amp: 0,
      cycles: between(tuning.nodes.cycles, rand()),
      phase: rand() * TAU,
      speed: between(tuning.nodes.speed, rand()) * direction,
    };
    const offset = rand() * TAU;
    BRAID_INKS.forEach((ink, j) => {
      const width = between(tuning.width, rand()) * (ink === 'k' ? tuning.keyWidth : 1);
      out.push({
        ink,
        braid: b,
        base,
        parallax,
        river,
        weave: {
          amp: weaveAmp,
          cycles: weaveCycles,
          phase: offset + (TAU * (j + 0.15 * (rand() - 0.5))) / BRAID_INKS.length,
          speed: weaveSpeed,
        },
        nodes,
        width,
      });
    });
  }
  return out;
};

/** The view the lines are laid out in (CSS px). */
export interface LineView {
  width: number;
  height: number;
}

/**
 * Room beyond the top and bottom of the viewport where braids loop (px): the farthest any line
 * reaches from its braid's centre (river plus weave at the widest tuning), plus the widest line
 * and `slack` px.
 */
export const loopMargin = (tuning: LineTuning, height: number, slack = 8): number =>
  (tuning.river.amp[1] + tuning.weave.amp[1]) * height + tuning.width[1] + slack;

/** The braid's centre line height at scroll `scroll` (px, y down), before the river. */
export const braidY = (spec: LineSpec, scroll: number, view: LineView, margin: number): number => {
  const band = Math.max(1, view.height + 2 * margin);
  return modulo(spec.base * band - scroll * spec.parallax, band) - margin;
};

export interface LinePoint {
  /** Viewport y (px, y down). */
  y: number;
  /** How open the braid is here: 0 at a node (all lines meet), 1 at the widest spread. */
  spread: number;
}

/**
 * Where line `spec` crosses viewport column `x` (px) at `time` (s) and scroll `scroll` (px).
 * Mirrored by shaders.ts lineAt.
 */
export const lineAt = (
  spec: LineSpec,
  x: number,
  time: number,
  scroll: number,
  view: LineView,
  tuning: LineTuning,
  margin: number,
): LinePoint => {
  const across = view.width > 0 ? x / view.width : 0;
  const scrolled = view.height > 0 ? scroll / view.height : 0;
  const { river, weave, nodes } = spec;
  const centre =
    braidY(spec, scroll, view, margin) +
    river.amp *
      view.height *
      Math.sin(
        TAU * river.cycles * across +
          river.phase +
          river.speed * time +
          tuning.scrollPhase.river * scrolled,
      );
  const spread =
    0.5 - 0.5 * Math.cos(TAU * nodes.cycles * across + nodes.phase + nodes.speed * time);
  const open = tuning.nodes.floor + (1 - tuning.nodes.floor) * spread;
  const y =
    centre +
    weave.amp *
      view.height *
      open *
      Math.sin(
        TAU * weave.cycles * across +
          weave.phase +
          weave.speed * time +
          tuning.scrollPhase.weave * scrolled,
      );
  return { y, spread };
};

/** Ink along a line: full where the braid's lines meet, `openInk` of it at the widest spread. */
export const lineInk = (spread: number, openInk: number): number =>
  1 - (1 - openInk) * Math.min(1, Math.max(0, spread));

/**
 * How far a fine pointer pushes a line point (px, positive is down), with (dx, dy) = point −
 * pointer. Lines part around the pointer: points below it move down, points above it move up,
 * most at about 0.7 × radius from it, fading out smoothly beyond the radius; the largest push is
 * about 0.43 × `strength`. Mirrored by shaders.ts.
 */
export const pointerPush = (dx: number, dy: number, radius: number, strength: number): number => {
  if (radius <= 0) return 0;
  const r2 = radius * radius;
  return strength * (dy / radius) * Math.exp(-(dx * dx + dy * dy) / r2);
};

export interface BraidBudget {
  desktop: number;
  tablet: number;
  phone: number;
  phoneWidth: number;
  tabletWidth: number;
  /** Share kept on low-end devices (math.ts densityFactor), at least one braid. */
  lowEnd: number;
}

/** How many braids to draw for this viewport and device (low-end devices draw fewer). */
export const braidCount = (hints: DeviceHints, budget: BraidBudget, density = 1): number => {
  const base =
    hints.width < budget.phoneWidth
      ? budget.phone
      : hints.width < budget.tabletWidth
        ? budget.tablet
        : budget.desktop;
  const scaled = density < 1 ? Math.round(base * budget.lowEnd) : base;
  return Math.max(1, scaled);
};

/** Floats per line instance: (base, parallax, width, ink), river, weave, nodes. */
export const LINE_STRIDE = 16;

/**
 * Writes the lines as instance data (LINE_STRIDE floats each): vec4(base, parallax, width, ink
 * index), vec4 river (amp, cycles, phase, speed), vec4 weave, vec4 nodes (cycles, phase, speed,
 * 0). Returns the number of lines written.
 */
export const writeLines = (specs: readonly LineSpec[], out: Float32Array): number => {
  const count = Math.min(specs.length, Math.floor(out.length / LINE_STRIDE));
  for (let i = 0; i < count; i++) {
    const s = specs[i];
    if (!s) break;
    const o = i * LINE_STRIDE;
    out.set(
      [
        s.base,
        s.parallax,
        s.width,
        INK_INDEX[s.ink],
        s.river.amp,
        s.river.cycles,
        s.river.phase,
        s.river.speed,
        s.weave.amp,
        s.weave.cycles,
        s.weave.phase,
        s.weave.speed,
        s.nodes.cycles,
        s.nodes.phase,
        s.nodes.speed,
        0,
      ],
      o,
    );
  }
  return count;
};

/**
 * Vertices of one line as a triangle strip: `segments` + 1 stations along it, two each (one per
 * side), as (t, side) with t 0–1 along the line and side −1 or +1.
 */
export const stripVertices = (segments: number): Float32Array => {
  const n = Math.max(1, Math.floor(segments));
  const out = new Float32Array((n + 1) * 4);
  for (let i = 0; i <= n; i++) {
    out[i * 4] = i / n;
    out[i * 4 + 1] = -1;
    out[i * 4 + 2] = i / n;
    out[i * 4 + 3] = 1;
  }
  return out;
};
