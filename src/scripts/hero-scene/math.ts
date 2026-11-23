/**
 * Small, pure helpers for the hero scene: easing (including CSS cubic-bezier curves),
 * interpolation and the mapping from the logo's raster space (the coordinates of ARCH in
 * logo-paths.ts) to CSS pixels inside an <svg> box, and the scroll hand-off to the header logo.
 * No DOM access, so it can be unit tested.
 */

export const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, value));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

export const easeInOutCubic = (t: number): number => {
  const x = clamp(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp(t), 3);

/** Ease out with a small overshoot past 1 before settling: the registration "snap". */
export const easeOutBack = (t: number, overshoot = 1.6): number => {
  const x = clamp(t) - 1;
  return 1 + (overshoot + 1) * x * x * x + overshoot * x * x;
};

/**
 * CSS `cubic-bezier(x1, y1, x2, y2)` as an easing function of t (0–1), so the scene moves on the
 * site's own curves (`--ease-snap` and friends). x1 and x2 must lie in 0–1, as in CSS; y may
 * leave 0–1 for overshoot. Solved with Newton steps and a bisection fallback.
 */
export const cubicBezier = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): ((t: number) => number) => {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (s: number): number => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number): number => ((ay * s + by) * s + cy) * s;
  const slopeX = (s: number): number => (3 * ax * s + 2 * bx) * s + cx;
  const epsilon = 1e-7;

  const solve = (x: number): number => {
    let s = x;
    for (let i = 0; i < 8; i++) {
      const error = sampleX(s) - x;
      if (Math.abs(error) < epsilon && s >= 0 && s <= 1) return s;
      const slope = slopeX(s);
      if (Math.abs(slope) < 1e-6) break;
      s -= error / slope;
    }
    // x(s) rises monotonically on 0–1 for valid control points: bisect.
    let lo = 0;
    let hi = 1;
    s = x;
    for (let i = 0; i < 60; i++) {
      const value = sampleX(s);
      if (Math.abs(value - x) < epsilon) break;
      if (value < x) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return s;
  };

  return (t: number): number => {
    const x = clamp(t);
    if (x === 0 || x === 1) return x;
    return sampleY(solve(x));
  };
};

/** Frame-rate independent damping factor for `current += (target - current) * factor`. */
export const damp = (lambda: number, dt: number): number => 1 - Math.exp(-lambda * dt);

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Placement {
  /** CSS px of the raster point, in the same space as the box. */
  x: number;
  y: number;
  /** CSS px per raster unit. */
  scale: number;
}

/**
 * Where a point of the viewBox lands inside an <svg> box rendered with the default
 * `preserveAspectRatio="xMidYMid meet"`: uniform scale, content centred on the shorter axis.
 */
export const placeInBox = (box: Box, viewBox: ViewBox, px: number, py: number): Placement => {
  const scale =
    viewBox.width > 0 && viewBox.height > 0
      ? Math.min(box.width / viewBox.width, box.height / viewBox.height)
      : 0;
  const offsetX = (box.width - viewBox.width * scale) / 2;
  const offsetY = (box.height - viewBox.height * scale) / 2;
  return {
    x: box.left + offsetX + (px - viewBox.x) * scale,
    y: box.top + offsetY + (py - viewBox.y) * scale,
    scale,
  };
};

/**
 * Drawing-buffer resolution caps: device pixels per CSS px on phones (narrower than `phoneWidth`,
 * or with a viewport whose shorter side is under `phoneShortSide`, which catches phones in
 * landscape) and elsewhere.
 */
export const DPR_CAP = { phone: 1.5, other: 2, phoneWidth: 768, phoneShortSide: 500 } as const;

/**
 * Device pixel ratio for a drawing buffer of `width` × `height` CSS px: the device's, capped per
 * DPR_CAP, and lowered further so the buffer never holds more than `maxPixels`.
 */
export const drawingDpr = (
  deviceDpr: number,
  width: number,
  height: number,
  viewportShortSide: number,
  maxPixels: number,
): number => {
  const phone = width < DPR_CAP.phoneWidth || viewportShortSide < DPR_CAP.phoneShortSide;
  let dpr = Math.min(deviceDpr > 0 ? deviceDpr : 1, phone ? DPR_CAP.phone : DPR_CAP.other);
  const area = Math.max(1, width * height);
  if (area * dpr * dpr > maxPixels) dpr = Math.sqrt(maxPixels / area);
  return dpr;
};

/** Scroll progress of the hand-off, 0 at the top of the hero, 1 once the plates are gone. */
export const dockProgress = (scrolled: number, distance: number): number =>
  distance > 0 ? clamp(scrolled / distance) : 1;

/** Shortest and longest hand-off (px; the longest as a share of the viewport height). */
export const HANDOFF_DISTANCE = { min: 120, maxShare: 0.5, squeeze: 0.9 } as const;

export interface HandoffInput {
  /** Top and bottom of the plates in the mark pose at rest (viewport px, hero at the top). */
  top: number;
  bottom: number;
  /** Lowest edge of the header band the plates must stay below (header bottom + margin), px. */
  bandBottom: number;
  /**
   * Top of the hero copy at rest, less the gap kept above it (viewport px), when the copy sits
   * below the art (phones and tablets); null when it sits beside it (desktop).
   */
  copyTop: number | null;
  viewportHeight: number;
}

/**
 * Scroll distance of the hand-off (the plates fade out in the art column while the header logo's
 * arches pulse in register). The plates scroll with the page, so the fade ends about when their
 * top would reach the header band (never shorter than HANDOFF_DISTANCE.min, never longer than a
 * share of the viewport). When the copy sits below the art, it also ends before the room between
 * the band and the rising copy gets smaller than the plates (`guardY` would have to choose).
 */
export const handoffDistance = (input: HandoffInput): number => {
  const { top, bottom, bandBottom, copyTop, viewportHeight } = input;
  let distance = clamp(
    top - bandBottom,
    HANDOFF_DISTANCE.min,
    Math.max(HANDOFF_DISTANCE.min, viewportHeight * HANDOFF_DISTANCE.maxShare),
  );
  if (copyTop !== null) {
    const squeeze = copyTop - bandBottom - (bottom - top);
    distance = Math.min(distance, squeeze * HANDOFF_DISTANCE.squeeze);
  }
  return Math.max(1, distance);
};

/**
 * Viewport y of the plates' pivot during the hand-off: where the page puts it (`natural`), held
 * below the header band (pivot − extentUp ≥ bandBottom) and above the copy (pivot + extentDown ≤
 * copyTop, when the copy is below). If both cannot hold, the copy wins; handoffDistance makes the
 * plates fade out before that can happen.
 */
export const guardY = (
  natural: number,
  extentUp: number,
  extentDown: number,
  bandBottom: number,
  copyTop: number | null,
): number => {
  const y = Math.max(natural, bandBottom + extentUp);
  return copyTop === null ? y : Math.min(y, copyTop - extentDown);
};
