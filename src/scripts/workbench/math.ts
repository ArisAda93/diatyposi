/**
 * Pure helpers for the /etaireia/ work-table scene (./index.ts, ./gl.ts), covered by
 * tests/workbench.test.ts. Coordinates are shares of the photo, x right and y down (0–1).
 *
 * The scene shows the photo through a camera: a view centred on `center` at `zoom` (1 = the whole
 * photo), and each pixel moved by the depth parallax `shift × (depth − focusDepth)`, so whatever
 * sits at the focus depth stays put while nearer things swing past it and farther ones lag behind.
 */

export interface Point {
  x: number;
  y: number;
}

/** The camera at rest: a hair past the whole photo, so the parallax never shows an edge. */
export const BASE_ZOOM = 1.06;
/** The camera on a marked step. */
export const FOCUS_ZOOM = 1.42;
/** Strongest parallax shift (share of the photo) at full pointer travel. */
export const PARALLAX = 0.014;
/** Room kept between the view and the photo's edge for the parallax shift. */
export const EDGE_ROOM = 0.02;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * The view centre nearest to `target` that keeps a view at `zoom` (plus the parallax room) inside
 * the photo on both axes. At a zoom too low for any room, the centre of the photo.
 */
export const clampCenter = (target: Point, zoom: number): Point => {
  const half = 0.5 / Math.max(zoom, 1e-6) + EDGE_ROOM;
  const axis = (value: number): number =>
    half >= 0.5 ? 0.5 : clamp(Number.isFinite(value) ? value : 0.5, half, 1 - half);
  return { x: axis(target.x), y: axis(target.y) };
};

/**
 * Where photo point `p` (at depth `depth`) appears in the view, as shares of the view (0–1 is on
 * screen): the inverse of the shader's lookup, `view = (p − shift × (depth − focusDepth) −
 * center) × zoom + 0.5`.
 */
export const toView = (
  p: Point,
  depth: number,
  camera: { center: Point; zoom: number; shift: Point; focusDepth: number },
): Point => {
  const lift = depth - camera.focusDepth;
  return {
    x: (p.x - camera.shift.x * lift - camera.center.x) * camera.zoom + 0.5,
    y: (p.y - camera.shift.y * lift - camera.center.y) * camera.zoom + 0.5,
  };
};

/** Bilinear sample (0–1) of a one-channel `width × height` map at photo point `p`. */
export const sampleDepth = (
  data: ArrayLike<number>,
  width: number,
  height: number,
  p: Point,
): number => {
  if (width < 1 || height < 1 || data.length < width * height) return 0.5;
  const fx = clamp(p.x, 0, 1) * (width - 1);
  const fy = clamp(p.y, 0, 1) * (height - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (x: number, y: number): number => (data[y * width + x] ?? 0) / 255;
  const top = at(x0, y0) * (1 - tx) + at(x1, y0) * tx;
  const bottom = at(x0, y1) * (1 - tx) + at(x1, y1) * tx;
  return top * (1 - ty) + bottom * ty;
};

/**
 * The scene's slow breathing while nobody points at it: a drift in both axes (each within ±1)
 * that never quite repeats, `t` in seconds.
 */
export const breathe = (t: number): Point => ({
  x: Math.sin(t * 0.37) * 0.65 + Math.sin(t * 0.13 + 1.3) * 0.35,
  y: Math.cos(t * 0.29) * 0.6 + Math.sin(t * 0.11 + 0.4) * 0.4,
});

/** Pointer position over an element (client px) as −1…1 on each axis, clamped. */
export const pointerAxis = (
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): Point => {
  if (!(rect.width > 0) || !(rect.height > 0)) return { x: 0, y: 0 };
  return {
    x: clamp(((clientX - rect.left) / rect.width) * 2 - 1, -1, 1),
    y: clamp(((clientY - rect.top) / rect.height) * 2 - 1, -1, 1),
  };
};
