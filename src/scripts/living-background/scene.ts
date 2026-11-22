/**
 * Living background scene (OGL / WebGL), drawn on every page behind all content.
 *
 * A press sheet recedes in perspective, tilted away from the viewer and covered in small arch
 * glyphs (the logo's ARCH outline, flat) on a halftone screen. Slow travelling waves grow and
 * lift the glyphs like halftone dots breathing. They are mostly key ink at low alpha, with a few
 * C/M/Y accents that overprint where they meet.
 *
 * - Scroll: the sheet travels with the page at DOLLY of its speed, damped (SCROLL_LAG), which is
 *   the camera dollying along the sheet. Near rows move faster than far ones: real depth parallax.
 * - Fine pointers lean the sheet slightly and swell the glyphs around the pointer. Touch screens
 *   get a slow drift of the lean instead.
 * - Sections with `data-bg-accent` (wired in index.ts) blend the accent share and the key tint
 *   towards their ink while they hold the viewport centre (math.ts ACCENT_MIX).
 * - Contrast: each ink's alpha is capped so that text on the paper (TEXT_ON_PAPER) keeps
 *   MIN_CONTRAST on a pixel covered by a whole glyph, whatever the tuning below says.
 * - One draw loop, at full rate while something follows the visitor and at AMBIENT_FPS otherwise;
 *   paused while the tab is hidden. Reduced motion: one static frame, redrawn on resize only.
 * - Context loss or any GPU error: the canvas is removed and the paper shows (onLost).
 */
import { Camera, Geometry, Mesh, Program, Renderer, Transform } from 'ogl';
import { ARCH } from '~/components/logo-paths';
import {
  BALANCED,
  MAX_TINT,
  bufferDpr,
  damp,
  dampMix,
  dollyShift,
  glyphShape,
  gridFor,
  hexToRgb,
  inkThresholds,
  maxInkAlpha,
  mixFor,
  mixRgb,
  mixSettled,
  parseCssColor,
  sheetFrame,
  shouldDraw,
  tintColor,
  toNdc,
  type Accent,
  type Grid,
  type GridOptions,
  type InkMix,
  type Rgb,
} from './math';
import { fieldFragment, fieldVertex } from './shaders';

// ================================================================================================
// Tuning: every visual constant of the background lives here.
// ================================================================================================

/** Camera vertical field of view, degrees. */
const FOV = 38;
/** Sheet tilt about the horizontal axis, radians (negative: the top recedes from the viewer). */
const TILT = -0.62;
/** Sheet travel per px of page scroll (the content moves 1 px): below 1 reads as depth. */
const DOLLY = 0.32;
/** How fast the sheet catches up with the scroll, per second (lower lags more). */
const SCROLL_LAG = 5;
/** Pointer lean at full deflection (radians about x and y) and how fast it follows, per second. */
const LEAN = { x: 0.035, y: 0.05, follow: 2.2 };
/** Touch screens: autonomous lean drift, as a fraction of LEAN, and its speed (rad/s). */
const DRIFT = { amount: 0.55, speed: 0.11 };
/** Halftone grid: pitch (px on the sheet) on small and large screens, instance cap, margins. */
const GRID: GridOptions = {
  pitchSmall: 40,
  pitchLarge: 34,
  smallWidth: 480,
  largeWidth: 1440,
  maxInstances: 6000,
  margin: 0.18,
  extraRows: 3,
};
/** Points per radian on the glyph's arcs (the glyphs are small: a few suffice). */
const GLYPH_ARC_STEPS = 3;
/** Glyph width as a fraction of the pitch: floor, share of the wave, pointer swell. */
const SIZE = { base: 0.16, wave: 0.34, swell: 0.28 };
/** Lift off the sheet towards the viewer, in pitches: share of the wave, pointer swell. */
const LIFT = { wave: 0.55, swell: 0.9 };
/** Ink as a fraction of each ink's alpha cap: floor, share of the wave, pointer swell. */
const INK = { base: 0.3, wave: 0.6, swell: 0.55 };
/** Pointer swell focus (larger is a tighter swell) and how fast it fades in and out, per second. */
const SWELL = { focus: 7, follow: 3, track: 8 };
/** Design ceiling of the ink alpha per plate (the contrast caps may lower these). */
const ALPHA_MAX = { k: 0.12, c: 0.2, m: 0.15, y: 0.32 };
/** Text colours set on the paper (red labels, muted text, key text) and the contrast they keep. */
const TEXT_ON_PAPER = ['#C03529', '#5A5650', '#221F20'];
/** WCAG AA (4.5) plus a margin for the paper grain drawn above the canvas. */
const MIN_CONTRAST = 4.6;
/** Inks, as in global.css and logo-paths.ts. */
const INKS = { k: '#221F20', c: '#00AEEF', m: '#ED008C', y: '#FFF100' };
/** Fallback paper colour (html's background is read at start). */
const PAPER_FALLBACK = '#FAFAF7';
/** Vignette radii in NDC (1 = the middle of a screen edge, 1.41 = a corner). */
const VIGNETTE = { inner: 0.5, outer: 1.5 };
/** Distance fog: starts and ends at these multiples of the camera distance; ink left at the end. */
const FOG = { near: 0.95, far: 1.6, floor: 0.35 };
/** Section accent blend rate, per second. */
const ACCENT_RATE = 1.8;
/** Frame rate while only the ambient waves move. */
const AMBIENT_FPS = 30;
/** Drawing buffer limits. */
const MAX_DPR = 1.5;
const MAX_PIXELS = 2_400_000;
/** Reduced motion: the wave phase of the single static frame, seconds. */
const STATIC_TIME = 14;
const RESIZE_DEBOUNCE = 150;

// ================================================================================================

export interface LivingBackground {
  /** Inserts the canvas, draws the first frame and starts the loop. False if it cannot run. */
  start(): boolean;
  /** The accent of the section at the viewport centre (null: the balanced mix). */
  setAccent(accent: Accent | null): void;
  /** Reduced motion on: one static frame, no loop. Off: the loop runs again. */
  setReducedMotion(reduce: boolean): void;
  /** Removes the canvas and frees the context. Safe to call twice. */
  destroy(): void;
}

export interface LivingBackgroundOptions {
  reducedMotion: boolean;
  /** Called once if the scene dies on its own (context lost, GPU error). */
  onLost: () => void;
}

interface Metrics {
  width: number;
  height: number;
  grid: Grid;
}

const toVec3 = (rgb: Rgb): Float32Array => new Float32Array(rgb);

/** The paper as painted on <html>, so the cleared canvas matches it exactly. */
const readPaper = (): Rgb =>
  parseCssColor(getComputedStyle(document.documentElement).backgroundColor) ??
  hexToRgb(PAPER_FALLBACK);

/** Alpha cap per plate: the design ceiling, lowered until every text colour keeps its contrast. */
const alphaCaps = (paper: Rgb): Record<keyof typeof INKS, number> => {
  const texts = TEXT_ON_PAPER.map(hexToRgb);
  const cap = (ink: Rgb, ceiling: number): number =>
    Math.min(ceiling, ...texts.map((text) => maxInkAlpha(paper, ink, text, MIN_CONTRAST)));
  const key = hexToRgb(INKS.k);
  const accents = [hexToRgb(INKS.c), hexToRgb(INKS.m), hexToRgb(INKS.y)];
  return {
    // Key glyphs may be tinted towards any accent: the cap must hold for every tinted key too.
    k: Math.min(
      cap(key, ALPHA_MAX.k),
      ...accents.map((ink) => cap(mixRgb(key, ink, MAX_TINT), ALPHA_MAX.k)),
    ),
    c: cap(hexToRgb(INKS.c), ALPHA_MAX.c),
    m: cap(hexToRgb(INKS.m), ALPHA_MAX.m),
    y: cap(hexToRgb(INKS.y), ALPHA_MAX.y),
  };
};

export const createLivingBackground = (
  host: HTMLElement,
  canvas: HTMLCanvasElement,
  options: LivingBackgroundOptions,
): LivingBackground => {
  const paper = readPaper();
  const caps = alphaCaps(paper);
  const cyan = hexToRgb(INKS.c);
  const magenta = hexToRgb(INKS.m);
  const yellow = hexToRgb(INKS.y);

  const renderer = new Renderer({
    canvas,
    dpr: 1,
    alpha: false,
    depth: false,
    antialias: true,
    powerPreference: 'low-power',
  });
  const gl = renderer.gl;
  gl.clearColor(paper[0], paper[1], paper[2], 1);

  const camera = new Camera(gl, { fov: FOV, near: 1, far: 10_000 });

  // One arch glyph, one unit wide, centred: the shape every instance draws.
  const glyph = glyphShape(ARCH, GLYPH_ARC_STEPS);
  const slots = new Float32Array(GRID.maxInstances);
  for (let i = 0; i < slots.length; i++) slots[i] = i;
  const geometry = new Geometry(gl, {
    position: { size: 2, data: glyph.position },
    index: { data: glyph.index },
    slot: { size: 1, instanced: 1, data: slots },
  });

  const thresholds = new Float32Array(3);
  const tint = new Float32Array(3);
  const pointerNdc = new Float32Array(2);
  const uniforms = {
    uGrid: { value: new Float32Array(2) },
    uRowStart: { value: 0 },
    uShift: { value: 0 },
    uPitch: { value: 1 },
    uTime: { value: 0 },
    uPointer: { value: pointerNdc },
    uPointerAmt: { value: 0 },
    uFocus: { value: SWELL.focus },
    uAspect: { value: 1 },
    uSize: { value: new Float32Array([SIZE.base, SIZE.wave, SIZE.swell]) },
    uLift: { value: new Float32Array([LIFT.wave, LIFT.swell]) },
    uInkAmt: { value: new Float32Array([INK.base, INK.wave, INK.swell]) },
    uMix: { value: thresholds },
    uKey: { value: toVec3(hexToRgb(INKS.k)) },
    uCyan: { value: toVec3(cyan) },
    uMagenta: { value: toVec3(magenta) },
    uYellow: { value: toVec3(yellow) },
    uTint: { value: tint },
    uTintAmt: { value: 0 },
    uCap: { value: new Float32Array([caps.k, caps.c, caps.m, caps.y]) },
    uResolution: { value: new Float32Array(2) },
    uVignette: { value: new Float32Array([VIGNETTE.inner, VIGNETTE.outer]) },
    uFog: { value: new Float32Array(3) },
  };
  const program = new Program(gl, {
    vertex: fieldVertex,
    fragment: fieldFragment,
    uniforms,
    depthTest: false,
    depthWrite: false,
    cullFace: false,
  });
  program.setBlendFunc(gl.DST_COLOR, gl.ZERO);
  // OGL only warns when a shader fails; refuse the scene so the paper stays.
  if (!gl.getProgramParameter(program.program, gl.LINK_STATUS)) {
    throw new Error('Living background shaders failed to link');
  }

  const sheet = new Transform();
  const mesh = new Mesh(gl, { geometry, program, frustumCulled: false });
  mesh.setParent(sheet);

  // ----------------------------------------------------------------------------------------------
  // Measurements (start and resize). The host is fixed and 100lvh tall, so mobile toolbars
  // showing or hiding do not resize it (a resize clears the drawing buffer).
  // ----------------------------------------------------------------------------------------------

  let m: Metrics | null = null;

  const measure = (): Metrics => {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    const dpr = bufferDpr(width, height, window.devicePixelRatio, MAX_DPR, MAX_PIXELS);
    if (renderer.dpr !== dpr || renderer.width !== width || renderer.height !== height) {
      renderer.dpr = dpr;
      renderer.setSize(width, height);
      // Let CSS own the box so a pending resize never shows a gap.
      canvas.style.width = '100%';
      canvas.style.height = '100%';
    }

    const frame = sheetFrame(width, height, FOV, TILT);
    const grid = gridFor(frame, width, GRID);
    camera.perspective({
      aspect: width / height,
      near: frame.distance * 0.05,
      far: frame.distance * 8,
    });
    camera.position.set(0, 0, 0);
    sheet.position.set(0, 0, -frame.distance);
    // gridFor keeps the count under the cap; never draw past the instance buffer regardless.
    geometry.setInstancedCount(Math.min(grid.count, GRID.maxInstances));

    uniforms.uGrid.value[0] = grid.cols;
    uniforms.uGrid.value[1] = grid.rows;
    uniforms.uRowStart.value = grid.rowStart;
    uniforms.uPitch.value = grid.pitch;
    uniforms.uAspect.value = width / height;
    uniforms.uResolution.value[0] = gl.drawingBufferWidth;
    uniforms.uResolution.value[1] = gl.drawingBufferHeight;
    uniforms.uFog.value[0] = frame.distance * FOG.near;
    uniforms.uFog.value[1] = frame.distance * FOG.far;
    uniforms.uFog.value[2] = FOG.floor;
    return { width, height, grid };
  };

  // ----------------------------------------------------------------------------------------------
  // State and drawing
  // ----------------------------------------------------------------------------------------------

  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  let reduce = options.reducedMotion;
  let started = false;
  let destroyed = false;
  let raf = 0;
  let last = 0;
  let lastDraw = -Infinity;
  let clock = 0;
  let resizeTimer = 0;
  let follow = window.scrollY;
  const pointer = { x: 0, y: 0, sx: 0, sy: 0, inside: false, amount: 0 };
  const lean = { x: 0, y: 0 };
  let mix: InkMix = BALANCED;
  let targetMix: InkMix = BALANCED;

  const applyMix = (current: InkMix): void => {
    const [c, cm] = inkThresholds(current);
    thresholds[0] = c;
    thresholds[1] = cm;
    thresholds[2] = current.share;
    tint.set(tintColor(current, cyan, magenta, yellow));
    uniforms.uTintAmt.value = current.tint;
  };

  const draw = (shift: number): void => {
    if (!m) return;
    uniforms.uShift.value = shift;
    uniforms.uTime.value = clock;
    pointerNdc[0] = pointer.sx;
    pointerNdc[1] = pointer.sy;
    uniforms.uPointerAmt.value = pointer.amount;
    sheet.rotation.set(TILT - lean.y * LEAN.x, lean.x * LEAN.y, 0);
    applyMix(mix);

    renderer.bindFramebuffer();
    renderer.setViewport(renderer.width * renderer.dpr, renderer.height * renderer.dpr);
    gl.clear(gl.COLOR_BUFFER_BIT);
    camera.updateMatrixWorld();
    sheet.updateMatrixWorld();
    mesh.draw({ camera });
  };

  /** Reduced motion: a fixed sheet, no pointer swell, the balanced mix, a pleasing wave phase. */
  const drawStatic = (): void => {
    clock = STATIC_TIME;
    pointer.amount = 0;
    lean.x = 0;
    lean.y = 0;
    mix = BALANCED;
    draw(0);
  };

  const shouldRun = (): boolean => started && !destroyed && !reduce && !document.hidden;

  const request = (): void => {
    if (!raf && shouldRun()) raf = requestAnimationFrame(frame);
  };

  const pause = (): void => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
  };

  const tick = (now: number): void => {
    raf = 0;
    if (!m || !shouldRun()) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.1, Math.max(0, (now - last) / 1000)) : 1 / 60;
    last = now;
    clock += dt;

    // Scroll, damped: the sheet lags a fast scroll a little and settles.
    const scrollY = window.scrollY;
    follow = damp(follow, scrollY, SCROLL_LAG, dt);
    if (Math.abs(follow - scrollY) < 0.2) follow = scrollY;
    const scrolling = follow !== scrollY;

    // Pointer (fine pointers) or a slow drift (touch), damped.
    const fine = finePointer.matches;
    const leanTarget =
      fine && pointer.inside
        ? { x: pointer.x, y: pointer.y }
        : fine
          ? { x: 0, y: 0 }
          : {
              x: Math.sin(clock * DRIFT.speed) * DRIFT.amount,
              y: Math.sin(clock * DRIFT.speed * 0.73 + 1.1) * DRIFT.amount,
            };
    const before = [lean.x, lean.y, pointer.amount, pointer.sx, pointer.sy];
    lean.x = damp(lean.x, leanTarget.x, LEAN.follow, dt);
    lean.y = damp(lean.y, leanTarget.y, LEAN.follow, dt);
    pointer.amount = damp(pointer.amount, fine && pointer.inside ? 1 : 0, SWELL.follow, dt);
    pointer.sx = damp(pointer.sx, pointer.x, SWELL.track, dt);
    pointer.sy = damp(pointer.sy, pointer.y, SWELL.track, dt);
    const after = [lean.x, lean.y, pointer.amount, pointer.sx, pointer.sy];
    // Following a fine pointer runs at full rate; the touch drift is ambient.
    const pointing =
      fine && after.some((value, i) => Math.abs(value - (before[i] ?? value)) > 1e-4);

    // Section accent, blended.
    const blending = !mixSettled(mix, targetMix);
    mix = blending ? dampMix(mix, targetMix, ACCENT_RATE, dt) : targetMix;

    if (shouldDraw(now, lastDraw, scrolling || pointing || blending, AMBIENT_FPS)) {
      draw(dollyShift(follow, DOLLY, m.grid.pitch));
      lastDraw = now;
    }
    request();
  };

  const frame = (now: number): void => {
    try {
      tick(now);
    } catch {
      // A GPU or driver error mid-frame: show the paper.
      lose();
    }
  };

  // ----------------------------------------------------------------------------------------------
  // Events
  // ----------------------------------------------------------------------------------------------

  const remeasure = (): void => {
    if (destroyed) return;
    try {
      m = measure();
      if (reduce) drawStatic();
      else {
        // Redraw now: the resize cleared the drawing buffer.
        draw(dollyShift(follow, DOLLY, m.grid.pitch));
        lastDraw = performance.now();
        request();
      }
    } catch {
      lose();
    }
  };

  const onResize = (): void => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(remeasure, RESIZE_DEBOUNCE);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' || !m) return;
    [pointer.x, pointer.y] = toNdc(event.clientX, event.clientY, m.width, m.height);
    if (!pointer.inside) {
      // Start the swell where the pointer is instead of sweeping in from the last position.
      if (pointer.amount < 0.01) {
        pointer.sx = pointer.x;
        pointer.sy = pointer.y;
      }
      pointer.inside = true;
    }
    request();
  };

  const onPointerOut = (event: PointerEvent): void => {
    if (!event.relatedTarget) pointer.inside = false;
  };

  const onVisibility = (): void => {
    if (document.hidden) pause();
    else request();
  };

  const onContextLost = (): void => {
    lose();
  };

  const resizeObserver = new ResizeObserver(onResize);

  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    pause();
    window.clearTimeout(resizeTimer);
    resizeObserver.disconnect();
    window.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerout', onPointerOut);
    document.removeEventListener('visibilitychange', onVisibility);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.remove();
    if (!gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext();
  };

  /** The scene died on its own: free everything, show the paper, tell the owner once. */
  const lose = (): void => {
    if (destroyed) return;
    destroy();
    options.onLost();
  };

  // Measure once now so a layout or GPU problem fails here, before anything is shown.
  m = measure();
  canvas.addEventListener('webglcontextlost', onContextLost);

  const start = (): boolean => {
    if (started || destroyed) return false;
    if (gl.isContextLost()) {
      lose();
      return false;
    }
    started = true;
    canvas.classList.add('living-bg-canvas');
    canvas.setAttribute('aria-hidden', 'true');
    host.append(canvas);

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerout', onPointerOut, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    resizeObserver.observe(host);

    // First frame now, so the canvas has content before it fades in over the paper.
    try {
      if (reduce) drawStatic();
      else {
        draw(dollyShift(follow, DOLLY, m.grid.pitch));
        lastDraw = performance.now();
      }
    } catch {
      lose();
      return false;
    }
    requestAnimationFrame(() => canvas.classList.add('is-live'));
    request();
    return !destroyed;
  };

  const setAccent = (accent: Accent | null): void => {
    targetMix = mixFor(accent);
    request();
  };

  const setReducedMotion = (value: boolean): void => {
    if (destroyed || value === reduce) return;
    reduce = value;
    if (!started) return;
    try {
      if (reduce) {
        pause();
        drawStatic();
      } else {
        follow = window.scrollY;
        request();
      }
    } catch {
      lose();
    }
  };

  return { start, setAccent, setReducedMotion, destroy };
};
