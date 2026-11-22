/**
 * Where the text is, so the living background can print with more presence everywhere else while
 * text keeps its AA contrast (scene.ts, shaders.ts `textMask`).
 *
 * The page's text elements are measured as block boxes, merged into a modest number of rectangles
 * in document space (they scroll with the page) plus a few in viewport space (text in fixed
 * layers such as the header over the hero), and every frame the ones in view are uploaded as
 * uniforms. Inside a rectangle the ink falls to the contrast-safe caps (math.ts inkCaps); outside
 * it rises to the design ceiling, over a short feather. Every rectangle covers its text with room
 * to spare: merging only ever grows them, and where text can move after it was measured (parallax
 * layers, depth entries, sticky blocks) the rectangle covers its whole range.
 *
 * The pure helpers at the top are covered by tests/living-background.test.ts; the measurement at
 * the bottom reads the DOM and only runs in the browser.
 */

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// ------------------------------------------------------------------------------------------------
// Pure helpers
// ------------------------------------------------------------------------------------------------

export const rectArea = (r: Rect): number =>
  Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);

export const unionRect = (a: Rect, b: Rect): Rect => ({
  left: Math.min(a.left, b.left),
  top: Math.min(a.top, b.top),
  right: Math.max(a.right, b.right),
  bottom: Math.max(a.bottom, b.bottom),
});

/** Whether two rectangles overlap or lie within `gap` px of each other. */
export const rectsNear = (a: Rect, b: Rect, gap: number): boolean =>
  a.left - gap <= b.right &&
  b.left - gap <= a.right &&
  a.top - gap <= b.bottom &&
  b.top - gap <= a.bottom;

/** Whether `outer` contains `inner` entirely. */
export const containsRect = (outer: Rect, inner: Rect): boolean =>
  outer.left <= inner.left &&
  outer.top <= inner.top &&
  outer.right >= inner.right &&
  outer.bottom >= inner.bottom;

/**
 * Merges rectangles that overlap or lie within `gap` px of each other until none do: lines of a
 * paragraph, the items of a list and a heading over its text become one block. The result covers
 * every input, and is sorted by top.
 */
export const mergeRects = (rects: readonly Rect[], gap: number): Rect[] => {
  const out = rects.filter((r) => r.right > r.left && r.bottom > r.top).map((r) => ({ ...r }));
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        if (!a || !b || !rectsNear(a, b, gap)) continue;
        out[i] = unionRect(a, b);
        out.splice(j, 1);
        merged = true;
        j = i;
      }
    }
  }
  return out.sort((a, b) => a.top - b.top);
};

/**
 * At most `max` rectangles covering all of `rects`: while there are too many, the pair whose
 * union adds the least area is merged. Empty when `max` < 1.
 */
export const fitRects = (rects: readonly Rect[], max: number): Rect[] => {
  if (max < 1) return [];
  const out = rects.map((r) => ({ ...r }));
  while (out.length > max) {
    let best = 0;
    let bestJ = 1;
    let bestCost = Infinity;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        if (!a || !b) continue;
        const cost = rectArea(unionRect(a, b)) - rectArea(a) - rectArea(b);
        if (cost < bestCost) {
          bestCost = cost;
          best = i;
          bestJ = j;
        }
      }
    }
    const a = out[best];
    const b = out[bestJ];
    if (!a || !b) break;
    out[best] = unionRect(a, b);
    out.splice(bestJ, 1);
  }
  return out;
};

/**
 * The rectangles to upload for this frame, in viewport px: the document ones moved by the
 * scroll, plus the fixed ones, kept if they reach into the viewport (with `margin` px around it),
 * each grown by `pad` px above and below (the canvas draws a frame behind a fast scroll).
 */
export const visibleRects = (
  doc: readonly Rect[],
  fixed: readonly Rect[],
  scrollY: number,
  viewHeight: number,
  margin: number,
  pad: number,
): Rect[] => {
  const out: Rect[] = [];
  const add = (r: Rect, shift: number): void => {
    const top = r.top - shift - pad;
    const bottom = r.bottom - shift + pad;
    if (bottom < -margin || top > viewHeight + margin) return;
    out.push({ left: r.left, top, right: r.right, bottom });
  };
  doc.forEach((r) => add(r, scrollY));
  fixed.forEach((r) => add(r, 0));
  return out;
};

/**
 * Writes rectangles (viewport CSS px, y down) into `out` as vec4(x0, y0, x1, y1) in drawing-buffer
 * px with y up, as gl_FragCoord has them. Returns how many were written.
 */
export const toBufferRects = (
  rects: readonly Rect[],
  out: Float32Array,
  cssWidth: number,
  cssHeight: number,
  bufferWidth: number,
  bufferHeight: number,
): number => {
  const sx = cssWidth > 0 ? bufferWidth / cssWidth : 1;
  const sy = cssHeight > 0 ? bufferHeight / cssHeight : 1;
  const count = Math.min(rects.length, Math.floor(out.length / 4));
  for (let i = 0; i < count; i++) {
    const r = rects[i];
    if (!r) break;
    out[i * 4] = r.left * sx;
    out[i * 4 + 1] = (cssHeight - r.bottom) * sy;
    out[i * 4 + 2] = r.right * sx;
    out[i * 4 + 3] = (cssHeight - r.top) * sy;
  }
  return count;
};

const smooth = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * Text mask at (x, y), mirrored in shaders.ts `textMask`: 1 anywhere inside a rectangle grown by
 * `grow` px, falling to 0 over `feather` px outside it; `all` forces 1 (caps everywhere).
 */
export const textMaskAt = (
  x: number,
  y: number,
  rects: readonly Rect[],
  feather: number,
  grow = 0,
  all = false,
): number => {
  let m = all ? 1 : 0;
  rects.forEach((r) => {
    const outside = Math.max(r.left - x, x - r.right, r.top - y, y - r.bottom) - grow;
    m = Math.max(m, 1 - smooth(0, feather, outside));
  });
  return m;
};

/**
 * The ink alpha a glyph or plate prints with for a text mask: its design ceiling (`open`) away
 * from text, exactly its contrast-safe cap where the mask is 1 (shaders.ts: mix(open, cap, mask)).
 */
export const inkAlpha = (open: number, cap: number, mask: number): number =>
  mask >= 1 ? cap : open + (cap - open) * mask;

export interface TextSlotOptions {
  /** Most rectangles the shaders take. */
  max: number;
  /** Fewer than this left by the uniform limits: no rectangles, caps everywhere. */
  min: number;
  /** Uniform vectors the shaders need besides the rectangles. */
  vertexReserve: number;
  fragmentReserve: number;
}

/**
 * How many rectangles the shaders can take on this GPU (one vec4 uniform each, in the glyph
 * vertex shader and the plate fragment shader): `max`, or what the uniform limits leave, or 0
 * when that is below `min` (then the ink stays at the caps everywhere).
 */
export const textSlots = (
  maxVertexVectors: number,
  maxFragmentVectors: number,
  o: TextSlotOptions,
): number => {
  const room = Math.min(
    o.max,
    Math.floor(maxVertexVectors) - o.vertexReserve,
    Math.floor(maxFragmentVectors) - o.fragmentReserve,
  );
  return room >= o.min ? room : 0;
};

/**
 * Parallax amplitude of motion.ts (PARALLAX_GAIN, PARALLAX_MAX), mirrored here so the measurement
 * knows how far a parallax layer can move its text (tests/living-background.test.ts checks both
 * stay equal).
 */
export const PARALLAX_MIRROR = { gain: 1.6, max: 0.26 } as const;

/**
 * Largest distance (px) a parallax layer of `speed` can carry text of `height` px from its layout
 * position while any of it is in view (motion.ts parallaxOffset: (centre − viewport centre) ×
 * −speed × gain, clamped to max × viewport).
 */
export const parallaxReach = (speed: number, height: number, viewHeight: number): number =>
  Math.min(
    PARALLAX_MIRROR.max * viewHeight,
    Math.abs(speed) * PARALLAX_MIRROR.gain * (viewHeight / 2 + height / 2),
  );

// ------------------------------------------------------------------------------------------------
// Measuring the page (browser only)
// ------------------------------------------------------------------------------------------------

export interface TextLayout {
  /** Document px (they scroll with the page). */
  doc: Rect[];
  /** Viewport px (fixed layers). */
  fixed: Rect[];
}

export interface MeasureOptions {
  /** Elements whose box counts as text. */
  selector: string;
  /** Inside these, nothing is measured (the background itself). */
  skip: string;
  /** Room added around every box (px). */
  pad: number;
  /** Merge boxes within this distance (px). */
  gap: number;
  /** Extra room above and below text inside a depth entry (motion.ts start state, px). */
  depthPad: number;
}

type Anchor = { kind: 'doc' } | { kind: 'fixed' } | { kind: 'sticky'; range: Rect };

/**
 * Measures the text on the page (a layout read: run it from a timer, never inside a frame).
 *
 * - Text scrolls with the page: its box plus the scroll position.
 * - Text in a fixed layer (the header over the hero, the call bar) stays in viewport px; so does
 *   text in a page-level sticky layer (the header), which sits at its stuck place.
 * - Text in any other sticky block can be anywhere in that block's parent while it scrolls: its
 *   rectangle spans the parent's height.
 * - Text in a parallax layer (motion.ts) can be carried up to parallaxReach from its layout
 *   position (the offset it carries now is taken out first); text in a depth entry, up to
 *   `depthPad`.
 */
export const measureTextLayout = (o: MeasureOptions): TextLayout => {
  const scrollY = window.scrollY;
  const viewHeight = window.innerHeight;
  const positions = new Map<Element, string>();
  const positionOf = (el: Element): string => {
    let value = positions.get(el);
    if (value === undefined) {
      value = getComputedStyle(el).position;
      positions.set(el, value);
    }
    return value;
  };
  const anchors = new Map<Element, Anchor>();
  const anchorOf = (el: HTMLElement): Anchor => {
    // The positioned ancestors (offsetParent chain) decide how the box moves with the scroll.
    let sticky: HTMLElement | null = null;
    for (let node: HTMLElement | null = el; node;) {
      const cached = anchors.get(node);
      if (cached) return cached;
      const position = positionOf(node);
      if (position === 'fixed') return { kind: 'fixed' };
      if (position === 'sticky' && !sticky) sticky = node;
      const parent: Element | null = node.offsetParent;
      node = parent instanceof HTMLElement ? parent : null;
    }
    if (!sticky) return { kind: 'doc' };
    const holder = sticky.parentElement;
    if (!holder || holder === document.body || holder === document.documentElement) {
      return { kind: 'fixed' };
    }
    const box = holder.getBoundingClientRect();
    const anchor: Anchor = {
      kind: 'sticky',
      range: {
        left: box.left,
        top: box.top + scrollY,
        right: box.right,
        bottom: box.bottom + scrollY,
      },
    };
    anchors.set(sticky, anchor);
    return anchor;
  };

  const doc: Rect[] = [];
  const fixed: Rect[] = [];
  document.querySelectorAll<HTMLElement>(o.selector).forEach((el) => {
    if (el.closest(o.skip)) return;
    const box = el.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return;
    let top = box.top - o.pad;
    let bottom = box.bottom + o.pad;
    const left = box.left - o.pad;
    const right = box.right + o.pad;

    const layer = el.closest<HTMLElement>('[data-parallax]');
    if (layer) {
      const carried = Number.parseFloat(layer.style.getPropertyValue('--px-y')) || 0;
      const reach = parallaxReach(
        Number.parseFloat(layer.getAttribute('data-parallax') ?? '') || 0,
        box.height,
        viewHeight,
      );
      top -= carried + reach;
      bottom += reach - carried;
    }
    if (el.closest('[data-reveal="depth"]')) {
      top -= o.depthPad;
      bottom += o.depthPad;
    }

    const anchor = anchorOf(el);
    if (anchor.kind === 'fixed') {
      fixed.push({ left, top, right, bottom });
    } else if (anchor.kind === 'sticky') {
      doc.push({
        left,
        top: Math.min(top + scrollY, anchor.range.top),
        right,
        bottom: Math.max(bottom + scrollY, anchor.range.bottom),
      });
    } else {
      doc.push({ left, top: top + scrollY, right, bottom: bottom + scrollY });
    }
  });
  return { doc: mergeRects(doc, o.gap), fixed: mergeRects(fixed, o.gap) };
};

/** The hero art box `[data-hero-art]` in document px, or null on pages without it. */
export const measureHeroArt = (selector: string): Rect | null => {
  const art = document.querySelector(selector);
  if (!art) return null;
  const box = art.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return null;
  const scrollY = window.scrollY;
  return { left: box.left, top: box.top + scrollY, right: box.right, bottom: box.bottom + scrollY };
};
