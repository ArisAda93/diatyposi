/**
 * Small, pure helpers for the hero scene: easing, interpolation and the mapping from the logo's
 * raster space (the coordinates of ARCH in logo-paths.ts) to CSS pixels inside an <svg> box.
 * No DOM access, so the docking maths can be unit tested.
 */

export const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, value));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Geometric interpolation, for scales: halfway between 1 and 4 is 2, not 2.5. */
export const lerpLog = (a: number, b: number, t: number): number =>
  a > 0 && b > 0 ? a * Math.pow(b / a, t) : lerp(a, b, t);

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
 * Scroll distance over which the plates travel into the header logo. It ends before the hero's
 * bottom edge reaches the header, so the canvas (which scrolls with the hero) still covers the
 * header logo when the arches dock.
 */
export const dockDistance = (heroHeight: number, headerBottom: number): number =>
  Math.max(1, Math.min(heroHeight * 0.7, heroHeight - headerBottom - 24));

/** Scroll progress of the docking move, 0 at the top of the hero, 1 once docked. */
export const dockProgress = (scrolled: number, distance: number): number =>
  distance > 0 ? clamp(scrolled / distance) : 1;

/** Progress points of the docking path (see dockPath). */
export const DOCK_PHASES = {
  /** Travel left, shrink and settle below the header band by here. */
  approach: 0.6,
  /** Wait under the logo slot until here, then rise into it. */
  rise: 0.85,
} as const;

/** Scale at the waypoint under the logo, relative to the docked (header logo) scale. */
const WAYPOINT_SCALE = 1.6;

export interface DockPathInput {
  /** Plates at rest, in viewport px with the hero at the top of the viewport. */
  rest: Placement;
  /** Header logo arches, in viewport px. */
  dock: Placement;
  /** Lowest edge of the header band the plates must stay below (header bottom + margin), px. */
  bandBottom: number;
  /** Half-height of the plates in raster units, including slack for tilt and misregistration. */
  extent: number;
}

/**
 * Where the plates are (viewport px and scale) at docking progress p, 0–1. The path never crosses
 * the header band before it reaches the logo slot:
 *  1. 0 → approach: they travel left to the x of the logo arches and shrink early (ease-out) to
 *     WAYPOINT_SCALE × the logo scale, while their top edge is held below `bandBottom`;
 *  2. approach → rise: they wait directly under the logo slot (the page keeps scrolling under them);
 *  3. rise → 1: they rise into the slot and shrink to the exact logo size.
 */
export const dockPath = (p: number, input: DockPathInput): Placement => {
  const { rest, dock, bandBottom, extent } = input;
  const waypointScale = Math.min(rest.scale, dock.scale * WAYPOINT_SCALE);
  const waypointY = bandBottom + extent * waypointScale;
  const t = clamp(p);

  if (t >= DOCK_PHASES.rise) {
    const r = easeInOutCubic((t - DOCK_PHASES.rise) / (1 - DOCK_PHASES.rise));
    return {
      x: dock.x,
      y: lerp(waypointY, dock.y, r),
      scale: lerpLog(waypointScale, dock.scale, r),
    };
  }

  const a = clamp(t / DOCK_PHASES.approach);
  const move = easeInOutCubic(a);
  const scale = lerpLog(rest.scale, waypointScale, easeOutCubic(a));
  // Keep the top edge below the band. If the rest pose were already inside the band, ease the
  // guard in instead of jumping at p = 0.
  const floor = bandBottom + extent * scale;
  const guard = Math.min(floor, lerp(rest.y, floor, clamp(a * 4)));
  return {
    x: lerp(rest.x, dock.x, move),
    y: Math.max(lerp(rest.y, waypointY, move), guard),
    scale,
  };
};
