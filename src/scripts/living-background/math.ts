/**
 * Pure maths for the living background (covered by tests/living-background.test.ts). No DOM and
 * no WebGL here: scene.ts uses these functions, and shaders.ts mirrors the per-glyph formulas
 * (cellHash, waveAt, wrapRow, vignette), so the tests describe what the GPU draws. The glyph is
 * built from the logo outline with the hero's path sampler and triangulator (hero-scene/geometry).
 *
 * Space: the sheet is a plane through the point at `distance` in front of the camera, where one
 * world unit is one CSS px, rotated about the horizontal axis by `tilt` (negative: its top
 * recedes). `v` runs up the sheet in px, `u` across it.
 */

import { boundsOf, sampleOutline, toLocal, triangulate } from '~/scripts/hero-scene/geometry';

export type Rgb = readonly [number, number, number];

export const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, value));

/** Linear interpolation, exact at both ends (t = 0 gives a, t = 1 gives b). */
export const lerp = (a: number, b: number, t: number): number => a * (1 - t) + b * t;

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** Frame-rate independent exponential smoothing towards `target` (`lambda` per second, `dt` s). */
export const damp = (current: number, target: number, lambda: number, dt: number): number =>
  target + (current - target) * Math.exp(-lambda * dt);

/** Positive remainder (GLSL `mod`). */
export const modulo = (value: number, divisor: number): number =>
  value - divisor * Math.floor(value / divisor);

const fract = (value: number): number => value - Math.floor(value);

// ------------------------------------------------------------------------------------------------
// Colour and contrast
// ------------------------------------------------------------------------------------------------

/** '#RRGGBB' → encoded sRGB channels 0–1. */
export const hexToRgb = (hex: string): Rgb => {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** A computed CSS colour ('rgb(250, 250, 247)', 'rgb(250 250 247)' or '#fafaf7'), or null. */
export const parseCssColor = (value: string): Rgb | null => {
  const text = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) return hexToRgb(text);
  const match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
  if (!match) return null;
  const channels = [match[1], match[2], match[3]].map((c) => Number(c) / 255);
  const [r, g, b] = channels;
  if (r === undefined || g === undefined || b === undefined) return null;
  if (!channels.every((c) => Number.isFinite(c) && c >= 0 && c <= 1)) return null;
  return [r, g, b];
};

export const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** WCAG relative luminance of an encoded sRGB colour. */
export const relativeLuminance = (rgb: Rgb): number =>
  0.2126 * toLinear(rgb[0]) + 0.7152 * toLinear(rgb[1]) + 0.0722 * toLinear(rgb[2]);

/** WCAG contrast ratio, 1–21. */
export const contrastRatio = (a: Rgb, b: Rgb): number => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/**
 * Paper after one glyph of `ink` at `alpha` is printed on it. The GPU multiplies encoded values
 * (the glyph is mix(white, ink, alpha), blended with DST_COLOR × ZERO), so this does the same.
 */
export const printOn = (paper: Rgb, ink: Rgb, alpha: number): Rgb => [
  paper[0] * (1 - alpha + alpha * ink[0]),
  paper[1] * (1 - alpha + alpha * ink[1]),
  paper[2] * (1 - alpha + alpha * ink[2]),
];

/**
 * Largest ink alpha (0–1) at which `text` on the printed paper still keeps `minContrast`. Printing
 * only ever darkens the paper, so the contrast of text darker than the paper falls monotonically
 * with alpha and a bisection finds the limit. 0 when the bare paper already fails.
 */
export const maxInkAlpha = (paper: Rgb, ink: Rgb, text: Rgb, minContrast: number): number => {
  const passes = (alpha: number): boolean =>
    contrastRatio(text, printOn(paper, ink, alpha)) >= minContrast;
  if (!passes(0)) return 0;
  if (passes(1)) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (passes(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
};

export interface InkCaps {
  k: number;
  c: number;
  m: number;
  y: number;
}

/**
 * Alpha cap per plate: the design ceiling, lowered until every text colour still keeps
 * `minContrast` on a pixel covered by one glyph of that ink. Key glyphs may be tinted up to
 * `maxTint` towards any accent ink, so the key cap must also hold for every tinted key.
 */
export const inkCaps = (
  paper: Rgb,
  inks: Readonly<Record<keyof InkCaps, Rgb>>,
  texts: readonly Rgb[],
  ceilings: Readonly<InkCaps>,
  minContrast: number,
  maxTint: number,
): InkCaps => {
  const cap = (ink: Rgb, ceiling: number): number =>
    Math.min(ceiling, ...texts.map((text) => maxInkAlpha(paper, ink, text, minContrast)));
  const tinted = [inks.c, inks.m, inks.y].map((ink) => mixRgb(inks.k, ink, maxTint));
  return {
    k: Math.min(cap(inks.k, ceilings.k), ...tinted.map((ink) => cap(ink, ceilings.k))),
    c: cap(inks.c, ceilings.c),
    m: cap(inks.m, ceilings.m),
    y: cap(inks.y, ceilings.y),
  };
};

// ------------------------------------------------------------------------------------------------
// Section accents (data-bg-accent)
// ------------------------------------------------------------------------------------------------

export type Accent = 'cyan' | 'magenta' | 'yellow' | 'key';

export const ACCENTS: readonly Accent[] = ['cyan', 'magenta', 'yellow', 'key'];

/**
 * How the glyphs are inked: `share` of them carry a C/M/Y accent, split by the c/m/y weights;
 * the rest are key, tinted `tint` of the way towards the accent inks.
 */
export interface InkMix {
  c: number;
  m: number;
  y: number;
  share: number;
  tint: number;
}

/**
 * The default: a balanced CMYK mix. The C/M/Y accents carry most of the presence (their contrast
 * caps are the highest: yellow, then cyan); key glyphs are a minority. Magenta's cap is low, so
 * it takes a smaller share.
 */
export const BALANCED: InkMix = { c: 0.38, m: 0.22, y: 0.4, share: 0.72, tint: 0 };

/**
 * Each accent leans the accent share towards its ink and tints the key glyphs with it. The key
 * accent turns the sheet mostly key (a quieter, monochrome field).
 */
export const ACCENT_MIX: Readonly<Record<Accent, InkMix>> = {
  cyan: { c: 0.75, m: 0.1, y: 0.15, share: 0.8, tint: 0.2 },
  magenta: { c: 0.1, m: 0.7, y: 0.2, share: 0.78, tint: 0.16 },
  yellow: { c: 0.12, m: 0.08, y: 0.8, share: 0.82, tint: 0.22 },
  key: { c: 0.38, m: 0.22, y: 0.4, share: 0.3, tint: 0 },
};

/** The strongest tint any accent uses (the key alpha cap is checked against it). */
export const MAX_TINT = Math.max(
  BALANCED.tint,
  ...Object.values(ACCENT_MIX).map((mix) => mix.tint),
);

/** A `data-bg-accent` value, or null when missing or unknown. */
export const parseAccent = (value: string | null | undefined): Accent | null => {
  const v = value?.trim().toLowerCase();
  return ACCENTS.find((accent) => accent === v) ?? null;
};

/**
 * The accent of the sections that hold the viewport centre, given in document order: the last
 * valid one wins (a nested section comes after its parent). Null means the balanced mix.
 */
export const pickAccent = (values: readonly (string | null | undefined)[]): Accent | null => {
  for (let i = values.length - 1; i >= 0; i--) {
    const accent = parseAccent(values[i]);
    if (accent) return accent;
  }
  return null;
};

export const mixFor = (accent: Accent | null): InkMix => (accent ? ACCENT_MIX[accent] : BALANCED);

export const blendMix = (a: InkMix, b: InkMix, t: number): InkMix => ({
  c: lerp(a.c, b.c, t),
  m: lerp(a.m, b.m, t),
  y: lerp(a.y, b.y, t),
  share: lerp(a.share, b.share, t),
  tint: lerp(a.tint, b.tint, t),
});

/** Moves every weight of `current` towards `target` (frame-rate independent). */
export const dampMix = (current: InkMix, target: InkMix, lambda: number, dt: number): InkMix =>
  blendMix(current, target, 1 - Math.exp(-lambda * dt));

export const mixSettled = (a: InkMix, b: InkMix, epsilon = 0.002): boolean =>
  Math.abs(a.c - b.c) < epsilon &&
  Math.abs(a.m - b.m) < epsilon &&
  Math.abs(a.y - b.y) < epsilon &&
  Math.abs(a.share - b.share) < epsilon &&
  Math.abs(a.tint - b.tint) < epsilon;

/** Cumulative thresholds the shader compares a cell's second hash with: [cyan, cyan + magenta]. */
export const inkThresholds = (mix: InkMix): [number, number] => {
  const total = mix.c + mix.m + mix.y;
  if (total <= 0) return [1 / 3, 2 / 3];
  return [mix.c / total, (mix.c + mix.m) / total];
};

/** The colour key glyphs are tinted towards: the accent inks, weighted. */
export const tintColor = (mix: InkMix, cyan: Rgb, magenta: Rgb, yellow: Rgb): Rgb => {
  const total = mix.c + mix.m + mix.y || 1;
  const w = [mix.c / total, mix.m / total, mix.y / total] as const;
  return [
    cyan[0] * w[0] + magenta[0] * w[1] + yellow[0] * w[2],
    cyan[1] * w[0] + magenta[1] * w[1] + yellow[1] * w[2],
    cyan[2] * w[0] + magenta[2] * w[1] + yellow[2] * w[2],
  ];
};

// ------------------------------------------------------------------------------------------------
// The sheet in perspective, and the halftone grid on it
// ------------------------------------------------------------------------------------------------

export interface SheetFrame {
  /** Camera distance at which one world unit is one CSS px. */
  distance: number;
  /** Sheet `v` (px) seen at the top and the bottom edge of the viewport. */
  vTop: number;
  vBottom: number;
  /** Half the visible sheet width (px) at the top and the bottom edge. */
  halfWidthTop: number;
  halfWidthBottom: number;
}

/**
 * What part of the tilted sheet the viewport sees. A point at `v` sits at depth
 * distance + v·s (s = sin of the tilt away from the viewer) and projects to
 * y = v·cos·distance / depth, so the screen edges (y = ±height/2) meet the sheet at
 * v = ±distance / (cos/tan(fov/2) ∓ s). The top edge must stay below the horizon.
 */
export const sheetFrame = (
  width: number,
  height: number,
  fovDeg: number,
  tilt: number,
): SheetFrame => {
  const t = Math.tan((fovDeg * Math.PI) / 360);
  const distance = height / 2 / t;
  const s = Math.sin(-tilt);
  const c = Math.cos(tilt);
  // Keep a margin below the horizon even for extreme settings.
  const vTop = distance / Math.max(c / t - s, 0.25);
  const vBottom = -distance / (c / t + s);
  const half = width / 2;
  return {
    distance,
    vTop,
    vBottom,
    halfWidthTop: (half * (distance + vTop * s)) / distance,
    halfWidthBottom: (half * Math.max(distance + vBottom * s, 0)) / distance,
  };
};

export interface GridOptions {
  /** Pitch (px between glyphs on the sheet) up to `smallWidth` and from `largeWidth` on. */
  pitchSmall: number;
  pitchLarge: number;
  smallWidth: number;
  largeWidth: number;
  /** Instance cap: very large screens get a wider pitch instead of more glyphs. */
  maxInstances: number;
  /** Extra coverage across the sheet (fraction), for the pointer lean and the stagger. */
  margin: number;
  /** Extra rows above and below, for the lift and the lean. */
  extraRows: number;
}

export interface Grid {
  pitch: number;
  cols: number;
  rows: number;
  /** First row (in pitches, sheet-local) of the window the rows wrap around in. */
  rowStart: number;
  count: number;
}

/** Pitch for a viewport width: coarser (fewer, sparser glyphs) on small screens. */
export const pitchFor = (width: number, o: GridOptions): number =>
  lerp(o.pitchSmall, o.pitchLarge, clamp((width - o.smallWidth) / (o.largeWidth - o.smallWidth)));

/**
 * The instanced grid that covers the visible sheet (plus margins) for a viewport. `density`
 * (0–1, see densityFactor) scales the glyph count: the pitch widens by 1/√density and the cap
 * shrinks by `density`, so a low-end device draws fewer, proportionally larger-spaced glyphs.
 */
export const gridFor = (frame: SheetFrame, width: number, o: GridOptions, density = 1): Grid => {
  const d = clamp(density, 0.1, 1);
  const cap = Math.max(1, Math.floor(o.maxInstances * d));
  const layout = (pitch: number): Grid => {
    const halfWidth = Math.max(frame.halfWidthTop, frame.halfWidthBottom) * (1 + o.margin);
    const cols = Math.ceil((2 * halfWidth) / pitch) + 1;
    const rowStart = Math.floor(frame.vBottom / pitch) - o.extraRows;
    const rows = Math.ceil(frame.vTop / pitch) + o.extraRows - rowStart;
    return { pitch, cols, rows, rowStart, count: cols * rows };
  };
  let grid = layout(Math.max(1, pitchFor(width, o) / Math.sqrt(d)));
  for (let i = 0; i < 12 && grid.count > cap; i++) {
    grid = layout(grid.pitch * Math.sqrt(grid.count / cap) * 1.02);
  }
  return grid;
};

/** What the browser tells about the device (undefined where it does not say). */
export interface DeviceHints {
  /** navigator.hardwareConcurrency */
  cores: number | undefined;
  /** navigator.deviceMemory, GB */
  memory: number | undefined;
  /** A coarse primary pointer (touch). */
  coarse: boolean;
  /** Viewport width, CSS px. */
  width: number;
}

/** Glyph density on low-end devices, as a fraction of the full grid. */
export const LOW_END_DENSITY = 0.6;

/**
 * 1 on capable devices; LOW_END_DENSITY on low-end hints: four cores or fewer, 4 GB of memory or
 * less, or a touch screen narrower than a tablet.
 */
export const densityFactor = (h: DeviceHints): number => {
  const fewCores = h.cores !== undefined && h.cores > 0 && h.cores <= 4;
  const littleMemory = h.memory !== undefined && h.memory > 0 && h.memory <= 4;
  const smallTouch = h.coarse && h.width < 768;
  return fewCores || littleMemory || smallTouch ? LOW_END_DENSITY : 1;
};

/**
 * Rows wrap around a window of `count` rows: the absolute row an instance with row index `index`
 * draws is the smallest value congruent to it (mod count) that is ≥ `start`. As the sheet travels,
 * rows that leave the window at one end come back at the other, outside the view.
 */
export const wrapRow = (index: number, count: number, start: number): number =>
  index + count * Math.ceil((start - index) / count);

/** Sheet travel in rows for a (smoothed) scroll position: `factor` px of sheet per px scrolled. */
export const dollyShift = (scrollY: number, factor: number, pitch: number): number =>
  pitch > 0 ? (scrollY * factor) / pitch : 0;

// ------------------------------------------------------------------------------------------------
// The glyph
// ------------------------------------------------------------------------------------------------

export interface GlyphShape {
  /** xy per vertex, y up, centred on the outline's bounding box, one unit wide. */
  position: Float32Array;
  /** Triangles (counter-clockwise). */
  index: Uint16Array;
}

/** A flat glyph from an SVG outline path (the logo's ARCH), one unit wide and centred. */
export const glyphShape = (path: string, arcStepsPerRadian: number): GlyphShape => {
  const outline = sampleOutline(path, arcStepsPerRadian);
  const b = boundsOf(outline);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const local = toLocal(outline, cx, cy, 1 / (b.maxX - b.minX));
  return {
    position: new Float32Array(local.flatMap((p) => [p.x, p.y])),
    index: new Uint16Array(triangulate(local)),
  };
};

// ------------------------------------------------------------------------------------------------
// Per-glyph modulation (mirrored in shaders.ts)
// ------------------------------------------------------------------------------------------------

/** Stable pseudo-random value in [0, 1) per cell (GLSL: `hash` in shaders.ts). */
export const cellHash = (u: number, v: number, seed = 0): number =>
  fract(Math.sin(modulo(u * 12.9898 + v * 78.233 + seed, Math.PI * 2)) * 43758.5453);

/**
 * Slow travelling waves across the sheet, 0–1 (GLSL: `wave`). Three crossing sine waves with
 * periods of 15–35 s, so the glyphs grow and lift like halftone dots breathing, never in step.
 */
export const waveAt = (u: number, v: number, time: number): number => {
  const w1 = Math.sin(0.23 * u + 0.17 * v - 0.42 * time);
  const w2 = Math.sin(-0.11 * u + 0.29 * v - 0.27 * time + 1.7);
  const w3 = Math.sin(0.07 * (u - v) + 0.19 * time + 0.6);
  const x = clamp(0.45 + 0.28 * w1 + 0.17 * w2 + 0.1 * w3);
  return x * x * (3 - 2 * x);
};

export interface VignetteOptions {
  /** The fade towards the corners runs from `inner` to `outer` (NDC radius; 1.41 = a corner). */
  inner: number;
  outer: number;
  /** Ink left at the very centre (where the text sits), rising to full by `calmRadius`. */
  calm: number;
  calmRadius: number;
}

/**
 * Edge fade (x, y in NDC): a calmer centre (`calm`, never empty), full strength in a ring around
 * it, and 0 towards the corners. GLSL: the `edge` term in shaders.ts.
 */
export const vignette = (x: number, y: number, o: VignetteOptions): number => {
  const r = Math.hypot(x, y);
  return (1 - smoothstep(o.inner, o.outer, r)) * lerp(o.calm, 1, smoothstep(0, o.calmRadius, r));
};

/** Pointer position in NDC (-1…1, y up) for a viewport of `width` × `height`. */
export const toNdc = (x: number, y: number, width: number, height: number): [number, number] => [
  width > 0 ? clamp((x / width) * 2 - 1, -1, 1) : 0,
  height > 0 ? clamp(1 - (y / height) * 2, -1, 1) : 0,
];

// ------------------------------------------------------------------------------------------------
// Matrices (column-major, as WebGL takes them)
// ------------------------------------------------------------------------------------------------

/** Perspective projection: vertical field of view in degrees. Writes into and returns `out`. */
export const perspectiveMatrix = (
  out: Float32Array,
  fovDeg: number,
  aspect: number,
  near: number,
  far: number,
): Float32Array => {
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
  const nf = 1 / (near - far);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
};

/**
 * Model-view of the sheet seen from a camera at the origin looking down −z: rotate by `rx` about
 * x, then by `ry` about y (R = Ry · Rx), then move `z` along the view axis. Writes into `out`.
 */
export const sheetMatrix = (out: Float32Array, rx: number, ry: number, z: number): Float32Array => {
  const ca = Math.cos(rx);
  const sa = Math.sin(rx);
  const cb = Math.cos(ry);
  const sb = Math.sin(ry);
  out[0] = cb;
  out[1] = 0;
  out[2] = -sb;
  out[3] = 0;
  out[4] = sb * sa;
  out[5] = ca;
  out[6] = cb * sa;
  out[7] = 0;
  out[8] = sb * ca;
  out[9] = -sa;
  out[10] = cb * ca;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = z;
  out[15] = 1;
  return out;
};

// ------------------------------------------------------------------------------------------------
// Drawing budget
// ------------------------------------------------------------------------------------------------

/** Device pixel ratio for the drawing buffer: at most `maxDpr` and `maxPixels` buffer pixels. */
export const bufferDpr = (
  width: number,
  height: number,
  deviceDpr: number,
  maxDpr: number,
  maxPixels: number,
): number => {
  let dpr = Math.min(deviceDpr > 0 ? deviceDpr : 1, maxDpr);
  const area = Math.max(1, width * height);
  if (area * dpr * dpr > maxPixels) dpr = Math.sqrt(maxPixels / area);
  return dpr;
};

/**
 * Whether to draw this frame: always while something follows the visitor (scroll, pointer, an
 * accent change), otherwise at `ambientFps` for the slow waves (saves power and battery).
 */
export const shouldDraw = (
  now: number,
  lastDraw: number,
  active: boolean,
  ambientFps: number,
): boolean => active || now - lastDraw >= 1000 / ambientFps - 2;
