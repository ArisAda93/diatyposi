/**
 * The sheet of paper under the hero's plates (scene.ts, drawn by shaders.ts sheetFragment): where
 * it lies, how strongly each of its parts prints in each theme, and the conversion of page boxes
 * into the device-pixel rectangles inside which the sheet is kept faint (the copy and the header
 * band, so the text stays readable). Pure functions with no DOM or WebGL access, so they can be
 * unit tested (tests/hero-sheet.test.ts).
 *
 * Units: hero px are CSS px from the hero's top left corner, y down (a getBoundingClientRect less
 * the hero's). Group units are the plates' logo raster units, y up, with the origin at the plates'
 * pivot (the centre of the mark at rest); at rest one group unit is `rest.scale` hero px. The sheet
 * lies in the plates' frame, so the group's tilt (choreography.ts SHEET.tilt and the camera drift)
 * puts it in perspective.
 */
import type { Box, Placement } from './math';
import type { SceneTheme } from './theme';

// ------------------------------------------------------------------------------------------------
// Tuning
// ------------------------------------------------------------------------------------------------

/**
 * Size and place of the sheet, from the art box and the hero (hero px). Width: the larger of a
 * multiple of the art's width and a share of the hero's, so on desktop it runs from under the copy
 * column to past the hero's right edge. Height: a multiple of the art's height, never taller than
 * a share of the hero, never shorter than `minArtHeight` art heights (so it always covers the
 * art). Centre: left of the art's centre by a share of the art's width, below it by a share of
 * its height, then raised where needed so the bottom edge stays above `maxBottom` of the hero
 * (the colour strip sits there), but never so far that the art is no longer covered with
 * `bottomMargin` art heights to spare.
 */
export const SHEET_SIZE = {
  artWidth: 2.3,
  heroWidth: 0.9,
  artHeight: 1.55,
  maxHeroHeight: 0.86,
  minArtHeight: 1.2,
  shiftLeft: 0.3,
  shiftDown: 0.06,
  maxBottom: 0.95,
  bottomMargin: 0.04,
} as const;

/**
 * What is drawn on and around the sheet, in CSS px at rest (converted to group units by the rest
 * scale): the hairline width and its anti-aliasing; the crop marks (length and gap from the trim,
 * as `.crop-frame` in global.css, a little larger); the drop shadow (light theme: offset to the
 * lower right, away from the light at the upper left, and blur); and the colour strip (patch
 * size, gap, inset from the sheet's bottom and right edges).
 */
export const SHEET_MARKS = {
  line: 1,
  aa: 0.75,
  cropLength: 18,
  cropGap: 8,
  shadowX: 10,
  shadowY: 14,
  shadowBlur: 28,
  patch: 11,
  patchGap: 3,
  stripInset: 16,
} as const;

/**
 * Pitch of the ripple's halftone dots on screen at rest (CSS px): a share of the hero's width,
 * kept between `min` and `max`, so the dots stay fine on a phone and never grow coarse on a wide
 * screen. Laid out in group units on the sheet, so they follow its perspective.
 */
export const SHEET_DOTS = { perHeroWidth: 1 / 160, min: 7, max: 12 } as const;

/** The sheet bleeds off the hero's right edge: the strip ends this share of the hero's width in. */
export const STRIP_FROM_RIGHT = 0.08;

/**
 * The impression: width of the ripple's ring as a share of its reach, and radius of the bloom at
 * the mark (raster units, so it keeps its size relative to the mark).
 */
export const SHEET_RIPPLE = { ringWidth: 0.09, bloomRadius: 300 } as const;

/**
 * Readability: inside the copy's box and the header band the sheet's fine details (hairline edge,
 * crop marks, colour strip, ripple dots and bloom) keep at most `floor` of their strength, easing
 * back over `feather` CSS px outside them. The face and the drop shadow are smooth, faint fields
 * that do not hurt legibility, so they are left whole there (masking them would cut a visible
 * box out of the sheet). The sheet's left edge fades in over its first `leftFade` of its width
 * (towards the copy), everything included.
 */
export const SHEET_MASK = { floor: 0.15, feather: 40, leftFade: 0.3 } as const;

/** Device-pixel rectangle far outside any canvas (a box that is not there). Fits half floats. */
const OFF_CANVAS = -10_000;

// ------------------------------------------------------------------------------------------------
// Layout
// ------------------------------------------------------------------------------------------------

/** Sizes of SHEET_MARKS in group units, and the dot pitch. */
export type SheetMarks = { readonly [K in keyof typeof SHEET_MARKS | 'pitch']: number };

/** On-screen pitch of the ripple's dots for a hero of this width (CSS px). See SHEET_DOTS. */
export const dotPitch = (heroWidth: number): number =>
  Math.min(SHEET_DOTS.max, Math.max(SHEET_DOTS.min, heroWidth * SHEET_DOTS.perHeroWidth));

const marksIn = (scale: number, heroWidth: number): SheetMarks => {
  const out = { pitch: dotPitch(heroWidth) / scale } as Record<keyof SheetMarks, number>;
  for (const key of Object.keys(SHEET_MARKS) as (keyof typeof SHEET_MARKS)[]) {
    out[key] = SHEET_MARKS[key] / scale;
  }
  return out;
};

export interface SheetLayout {
  /** Centre of the sheet (group units, y up, origin at the pivot). */
  x: number;
  y: number;
  /** Size of the sheet (group units). */
  width: number;
  height: number;
  /** Extra room on every side of the drawn quad for the drop shadow and the crop marks. */
  margin: number;
  /** Ripple radius at which it has crossed the visible sheet (to its farthest visible corner). */
  reach: number;
  /** Width of the ripple's ring. */
  ringWidth: number;
  /**
   * Half the sheet's longer side: the sheet shader receives its lengths divided by this, so its
   * distances (and their squares) stay near 1 on GPUs without high float precision.
   */
  unit: number;
  /** Colour strip, relative to the sheet's centre: x of its right end, y of its centre line. */
  stripX: number;
  stripY: number;
  /** The drawn details, in group units. */
  marks: SheetMarks;
}

/** A point in hero px as group units: relative to the pivot, y flipped up, divided by the scale. */
export const toGroup = (x: number, y: number, rest: Placement): { x: number; y: number } => {
  const scale = rest.scale > 0 ? rest.scale : 1;
  return { x: (x - rest.x) / scale, y: (rest.y - y) / scale };
};

/**
 * Where the sheet lies, from the art box (hero px), the hero's size (CSS px) and the plates' rest
 * placement (pivot in hero px, CSS px per group unit). See SHEET_SIZE.
 */
export const sheetLayout = (
  art: Box,
  hero: { width: number; height: number },
  rest: Placement,
): SheetLayout => {
  const s = SHEET_SIZE;
  const scale = rest.scale > 0 ? rest.scale : 1;

  const width = Math.max(art.width * s.artWidth, hero.width * s.heroWidth);
  const height = Math.max(
    art.height * s.minArtHeight,
    Math.min(art.height * s.artHeight, hero.height * s.maxHeroHeight),
  );
  const cx = art.left + art.width / 2 - art.width * s.shiftLeft;
  let cy = art.top + art.height / 2 + art.height * s.shiftDown;
  const maxBottom = Math.max(
    hero.height * s.maxBottom,
    art.top + art.height * (1 + s.bottomMargin),
  );
  cy -= Math.max(0, cy + height / 2 - maxBottom);

  const left = cx - width / 2;
  const right = cx + width / 2;
  const top = cy - height / 2;
  const bottom = cy + height / 2;

  // Ripple reach: from the mark (the pivot) to the farthest corner of the sheet's visible part.
  const visLeft = Math.max(left, 0);
  const visRight = Math.min(right, hero.width);
  const visTop = Math.max(top, 0);
  const visBottom = Math.min(bottom, hero.height);
  const visible = visRight > visLeft && visBottom > visTop;
  const xs = visible ? [visLeft, visRight] : [left, right];
  const ys = visible ? [visTop, visBottom] : [top, bottom];
  let reachPx = 0;
  for (const x of xs) {
    for (const y of ys) reachPx = Math.max(reachPx, Math.hypot(x - rest.x, y - rest.y));
  }

  const m = SHEET_MARKS;
  // The strip ends inside both the sheet and the hero; it sits just above the bottom edge.
  const stripRight = Math.min(right - m.stripInset, hero.width * (1 - STRIP_FROM_RIGHT));
  const stripCentre = bottom - m.stripInset - m.patch / 2;

  const centre = toGroup(cx, cy, rest);
  const reach = reachPx / scale;
  return {
    x: centre.x,
    y: centre.y,
    width: width / scale,
    height: height / scale,
    margin:
      (Math.max(m.cropGap + m.cropLength, Math.max(m.shadowX, m.shadowY) + m.shadowBlur) +
        m.line +
        m.aa * 2) /
      scale,
    reach,
    ringWidth: reach * SHEET_RIPPLE.ringWidth,
    unit: Math.max(width, height) / 2 / scale,
    stripX: (stripRight - cx) / scale,
    stripY: (cy - stripCentre) / scale,
    marks: marksIn(scale, hero.width),
  };
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

/** Strengths (0–1) of the press run's parts in one theme. */
export interface SheetLook {
  /** Sheet face: a faint lift of the light key in dark; nothing in light (paper on paper). */
  face: number;
  /** Soft drop shadow outside the sheet's edges: light only (screen cannot darken). */
  shadow: number;
  /** Hairline edge and crop marks (key ink). */
  lines: number;
  /** The CMYK colour strip. */
  strip: number;
  /** Cyan and magenta dots of the impression ripple. */
  dots: number;
  /** Bloom at the mark at contact. */
  bloom: number;
  /** Ink of the bloom: a faint cyan tint in light, a lift of the light key in dark. */
  bloomInk: 'cyan' | 'key';
  /**
   * The plates' own shadows on the sheet (key ink). In dark the key is light, so they are a very
   * faint glow under each plate, as the contact shadow was: it keeps the plates' height readable
   * without looking like a second set of plates.
   */
  plateShadow: number;
  /** Sheen across the plates' front faces during the hold (towards white). */
  sheen: number;
}

const SHEET_LOOKS: Record<SceneTheme, SheetLook> = {
  light: {
    face: 0,
    shadow: 0.12,
    lines: 0.3,
    strip: 0.6,
    dots: 0.37,
    bloom: 0.14,
    bloomInk: 'cyan',
    plateShadow: 0.15,
    sheen: 0.35,
  },
  dark: {
    face: 0.045,
    shadow: 0,
    lines: 0.22,
    strip: 0.45,
    dots: 0.3,
    bloom: 0.1,
    bloomInk: 'key',
    plateShadow: 0.05,
    sheen: 0.35,
  },
};

export const sheetLook = (theme: SceneTheme): SheetLook => SHEET_LOOKS[theme];
