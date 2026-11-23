/**
 * Pure maths for the living background (covered by tests/living-background.test.ts): colour,
 * contrast caps, blends, section accents and the drawing budget. No DOM and no WebGL here; the
 * line composition is in lines.ts.
 */

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

// ------------------------------------------------------------------------------------------------
// Colour and contrast
// ------------------------------------------------------------------------------------------------

/** '#RRGGBB' → encoded sRGB channels 0–1. */
export const hexToRgb = (hex: string): Rgb => {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/**
 * A computed CSS colour or colour token ('rgb(250, 250, 247)', 'rgb(250 250 247)', '#fafaf7' or
 * '#fff'), or null.
 */
export const parseCssColor = (value: string): Rgb | null => {
  const text = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) return hexToRgb(text);
  if (/^#[0-9a-f]{3}$/i.test(text)) {
    const [, r = '', g = '', b = ''] = text;
    return hexToRgb(`#${r}${r}${g}${g}${b}${b}`);
  }
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
 * Paper after one line of `ink` at `alpha` is printed on it: mix(white, ink, alpha) times the
 * paper, in encoded values as the GPU computes it. This is what each line writes on light paper.
 */
export const printOn = (paper: Rgb, ink: Rgb, alpha: number): Rgb => [
  paper[0] * (1 - alpha + alpha * ink[0]),
  paper[1] * (1 - alpha + alpha * ink[1]),
  paper[2] * (1 - alpha + alpha * ink[2]),
];

/** Per-channel minimum (the GPU's MIN blend equation). */
export const minRgb = (a: Rgb, b: Rgb): Rgb => [
  Math.min(a[0], b[0]),
  Math.min(a[1], b[1]),
  Math.min(a[2], b[2]),
];

/** Per-channel maximum (the GPU's MAX blend equation: the dark-mode mirror of MIN). */
export const maxRgb = (a: Rgb, b: Rgb): Rgb => [
  Math.max(a[0], b[0]),
  Math.max(a[1], b[1]),
  Math.max(a[2], b[2]),
];

/**
 * Paper where two lines overlap under the MIN blend: each writes printOn(paper, ink, alpha) and
 * the darker value per channel stays. Same-ink overlaps look exactly like one line; different
 * inks still combine per channel (cyan with yellow reads green), and never darker than that.
 */
export const printMin = (paper: Rgb, a: Rgb, alphaA: number, b: Rgb, alphaB: number): Rgb =>
  minRgb(printOn(paper, a, alphaA), printOn(paper, b, alphaB));

/**
 * Light ink on dark paper, as each line writes it in dark mode: mix(paper, ink, alpha). Combined
 * with the MAX blend, the lighter value per channel stays (the mirror of MIN on light paper).
 */
export const printLight = (paper: Rgb, ink: Rgb, alpha: number): Rgb => mixRgb(paper, ink, alpha);

/**
 * Dark-mode fallback without MAX: each line writes alpha × ink and screens the paper under it
 * (gl.ONE_MINUS_DST_COLOR × gl.ONE): paper + alpha·ink·(1 − paper), which is
 * 1 − (1 − paper)(1 − alpha·ink). Written this way it is exact at alpha 0 and never below the
 * paper: it only ever lightens.
 */
export const printScreen = (paper: Rgb, ink: Rgb, alpha: number): Rgb => [
  paper[0] + alpha * ink[0] * (1 - paper[0]),
  paper[1] + alpha * ink[1] * (1 - paper[1]),
  paper[2] + alpha * ink[2] * (1 - paper[2]),
];

/**
 * How overlapping lines combine. Light paper: 'min' (WebGL 2, or WebGL 1 with EXT_blend_minmax)
 * or 'multiply' (the fallback: the second line darkens the first). Dark paper: 'max' (the same
 * extension) or 'screen' (the fallback: the second line lightens the first).
 */
export type InkBlend = 'min' | 'multiply' | 'max' | 'screen';

/** Whether a blend prints light ink on dark paper. */
export const isDarkBlend = (blend: InkBlend): boolean => blend === 'max' || blend === 'screen';

/** The blend for a theme, given whether the context has MIN/MAX blending. */
export const blendFor = (theme: Theme, minMax: boolean): InkBlend =>
  theme === 'dark' ? (minMax ? 'max' : 'screen') : minMax ? 'min' : 'multiply';

/** Paper after one line of `ink` at `alpha`, for a blend. */
export const printWith = (paper: Rgb, ink: Rgb, alpha: number, blend: InkBlend): Rgb => {
  if (blend === 'max') return printLight(paper, ink, alpha);
  if (blend === 'screen') return printScreen(paper, ink, alpha);
  return printOn(paper, ink, alpha);
};

/** Paper where line `a` and line `b` overlap, for a blend. */
export const printPair = (
  paper: Rgb,
  a: Rgb,
  alphaA: number,
  b: Rgb,
  alphaB: number,
  blend: InkBlend,
): Rgb => {
  switch (blend) {
    case 'min':
      return printMin(paper, a, alphaA, b, alphaB);
    case 'max':
      return maxRgb(printLight(paper, a, alphaA), printLight(paper, b, alphaB));
    case 'screen':
      return printScreen(printScreen(paper, a, alphaA), b, alphaB);
    default:
      return printOn(printOn(paper, a, alphaA), b, alphaB);
  }
};

/** One print: an ink and its alpha. */
export interface Print {
  ink: Rgb;
  alpha: number;
}

/**
 * Paper where all of `prints` overlap, for a blend: MIN keeps the darkest value per channel, MAX
 * the lightest; the fallbacks print one over the other. With no prints, the paper. Every blend
 * only moves one way as prints are added (MIN and multiply darken, MAX and screen lighten), so
 * the result for a set of prints is at least as far from the paper as for any subset of it.
 */
export const printAll = (paper: Rgb, prints: readonly Print[], blend: InkBlend): Rgb => {
  if (blend === 'min' || blend === 'max') {
    const combine = blend === 'min' ? minRgb : maxRgb;
    return (
      prints.reduce<Rgb | null>((out, p) => {
        const printed = printWith(paper, p.ink, p.alpha, blend);
        return out ? combine(out, printed) : printed;
      }, null) ?? paper
    );
  }
  return prints.reduce<Rgb>((out, p) => printWith(out, p.ink, p.alpha, blend), paper);
};

/**
 * Largest ink alpha (0–1) at which `text` on the printed paper still keeps `minContrast`. Printing
 * moves the paper away from where it was, towards the text (darker text on light paper, light
 * text on dark paper), so the contrast falls monotonically with alpha and a bisection finds the
 * limit. 0 when the bare paper already fails.
 */
export const maxInkAlpha = (
  paper: Rgb,
  ink: Rgb,
  text: Rgb,
  minContrast: number,
  blend: InkBlend = 'min',
): number => {
  const passes = (alpha: number): boolean =>
    contrastRatio(text, printWith(paper, ink, alpha, blend)) >= minContrast;
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

export const PLATES = ['k', 'c', 'm', 'y'] as const;
export type Plate = (typeof PLATES)[number];
export type InkCaps = Record<Plate, number>;

/** The site theme (theme.ts contract: `html[data-theme]`, `dt:themechange`). */
export type Theme = 'light' | 'dark';

/** `html[data-theme]` (or the event's `detail.theme`) as a theme: light unless it says dark. */
export const parseTheme = (value: unknown): Theme => (value === 'dark' ? 'dark' : 'light');

/**
 * Alpha cap per ink, so that every text colour keeps `minContrast` wherever lines print: on one
 * print, where any two overlap (any two inks, the same ink included), and where three or four
 * different inks overlap (where a braid's lines meet), combined by `blend`.
 *
 * 1. Each ink starts at its design ceiling, lowered until one print of it passes.
 * 2. Every pair of inks in turn: if the pair fails, both caps scale down by the largest common
 *    factor (bisection) that makes it pass. Caps only ever fall, so a pair that passed stays
 *    passing and one pass over the pairs is enough.
 * 3. All four inks together (every text colour): if they fail, all four caps
 *    scale down by the largest common factor that makes them pass. The blends only move one way
 *    as prints are added (printAll), so this also covers every set of three. (Under MIN and MAX
 *    a second print of the same ink changes nothing, so any stack of prints is covered; the
 *    multiply and screen fallbacks are covered for up to four different inks and any pair.)
 *
 * Texts sit on one side of the paper: darker on light paper ('min', 'multiply'), lighter on dark
 * paper ('max', 'screen'). Printing moves the paper towards them, so the text with the least
 * contrast against the bare paper binds: the lightest text on light paper (e.g. the red label),
 * the darkest on dark paper.
 */
export const inkCaps = (
  paper: Rgb,
  inks: Readonly<Record<Plate, Rgb>>,
  texts: readonly Rgb[],
  ceilings: Readonly<InkCaps>,
  minContrast: number,
  blend: InkBlend = 'min',
): InkCaps => {
  // The text with the least contrast against the paper binds (see above).
  const binding = texts.reduce<Rgb | null>(
    (weakest, text) =>
      !weakest || contrastRatio(text, paper) < contrastRatio(weakest, paper) ? text : weakest,
    null,
  );
  const caps: InkCaps = { ...ceilings };
  if (!binding) return caps;
  const readable = (colour: Rgb): boolean => contrastRatio(binding, colour) >= minContrast;

  PLATES.forEach((plate) => {
    caps[plate] = Math.min(
      ceilings[plate],
      maxInkAlpha(paper, inks[plate], binding, minContrast, blend),
    );
  });

  const pairPasses = (p: Plate, q: Plate, alphaP: number, alphaQ: number): boolean =>
    readable(printPair(paper, inks[p], alphaP, inks[q], alphaQ, blend));
  PLATES.forEach((p, i) => {
    PLATES.slice(i).forEach((q) => {
      if (pairPasses(p, q, caps[p], caps[q])) return;
      let lo = 0;
      let hi = 1;
      for (let step = 0; step < 24; step++) {
        const mid = (lo + hi) / 2;
        if (pairPasses(p, q, caps[p] * mid, caps[q] * mid)) lo = mid;
        else hi = mid;
      }
      caps[p] *= lo;
      if (q !== p) caps[q] *= lo;
    });
  });

  const allPass = (factor: number): boolean => {
    const printed = printAll(
      paper,
      PLATES.map((plate) => ({ ink: inks[plate], alpha: caps[plate] * factor })),
      blend,
    );
    return texts.every((text) => contrastRatio(text, printed) >= minContrast);
  };
  if (!allPass(1)) {
    let lo = 0;
    let hi = 1;
    for (let step = 0; step < 24; step++) {
      const mid = (lo + hi) / 2;
      if (allPass(mid)) lo = mid;
      else hi = mid;
    }
    PLATES.forEach((plate) => {
      caps[plate] *= lo;
    });
  }
  return caps;
};

// ------------------------------------------------------------------------------------------------
// Section accents (data-bg-accent)
// ------------------------------------------------------------------------------------------------

export type Accent = 'cyan' | 'magenta' | 'yellow' | 'key';

export const ACCENTS: readonly Accent[] = ['cyan', 'magenta', 'yellow', 'key'];

/** How strongly each ink's lines print, 0–1 (a share of the ink's own alpha, never above it). */
export type InkWeights = Record<Plate, number>;

/** The default: every ink at full strength. */
export const BALANCED: Readonly<InkWeights> = { k: 1, c: 1, m: 1, y: 1 };

/**
 * Each accent keeps its own ink at full strength and quietens the others, so the section's ink
 * leads the lines while it holds the viewport centre. The key accent quietens the C/M/Y lines.
 */
export const ACCENT_WEIGHTS: Readonly<Record<Accent, Readonly<InkWeights>>> = {
  cyan: { k: 0.6, c: 1, m: 0.45, y: 0.45 },
  magenta: { k: 0.6, c: 0.45, m: 1, y: 0.45 },
  yellow: { k: 0.6, c: 0.45, m: 0.45, y: 1 },
  key: { k: 1, c: 0.55, m: 0.55, y: 0.55 },
};

/** A `data-bg-accent` value, or null when missing or unknown. */
export const parseAccent = (value: string | null | undefined): Accent | null => {
  const v = value?.trim().toLowerCase();
  return ACCENTS.find((accent) => accent === v) ?? null;
};

/**
 * The accent of the sections that hold the viewport centre, given in document order: the last
 * valid one wins (a nested section comes after its parent). Null means the balanced weights.
 */
export const pickAccent = (values: readonly (string | null | undefined)[]): Accent | null => {
  for (let i = values.length - 1; i >= 0; i--) {
    const accent = parseAccent(values[i]);
    if (accent) return accent;
  }
  return null;
};

export const weightsFor = (accent: Accent | null): InkWeights => ({
  ...(accent ? ACCENT_WEIGHTS[accent] : BALANCED),
});

/** Moves every weight of `current` towards `target` (frame-rate independent). */
export const dampWeights = (
  current: Readonly<InkWeights>,
  target: Readonly<InkWeights>,
  lambda: number,
  dt: number,
): InkWeights => ({
  k: damp(current.k, target.k, lambda, dt),
  c: damp(current.c, target.c, lambda, dt),
  m: damp(current.m, target.m, lambda, dt),
  y: damp(current.y, target.y, lambda, dt),
});

export const weightsSettled = (
  a: Readonly<InkWeights>,
  b: Readonly<InkWeights>,
  epsilon = 0.002,
): boolean => PLATES.every((plate) => Math.abs(a[plate] - b[plate]) < epsilon);

// ------------------------------------------------------------------------------------------------
// Device and drawing budget
// ------------------------------------------------------------------------------------------------

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

/** Share of the braids low-end devices draw (lines.ts braidCount). */
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
