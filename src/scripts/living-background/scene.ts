/**
 * Living background scene (OGL / WebGL), drawn on every page behind all content.
 *
 * A press sheet recedes in perspective, tilted away from the viewer and covered in arch glyphs
 * (the logo's ARCH outline, flat) on a halftone screen. Slow travelling waves grow, lift and ink
 * the glyphs like halftone dots breathing: bands of printed arches roll across the sheet, the
 * crests at full ink, and fog fades the far rows. Most glyphs are C/M/Y (the inks that can carry
 * presence within the contrast caps), a minority key; lifted crests overprint where they meet.
 *
 * - Scroll: the sheet travels with the page at DOLLY of its speed, damped (SCROLL_LAG), which is
 *   the camera dollying along the sheet. Near rows move faster than far ones: real depth parallax.
 * - Fine pointers lean the sheet slightly and swell the glyphs around the pointer. Touch screens
 *   get a slow drift of the lean instead.
 * - Sections with `data-bg-accent` (wired in index.ts) blend the accent share and the key tint
 *   towards their ink while they hold the viewport centre (math.ts ACCENT_MIX).
 * - Contrast: each ink's alpha is capped (math.ts inkCaps) so that text on the paper
 *   (TEXT_ON_PAPER) keeps MIN_CONTRAST on a pixel covered by one glyph, whatever the tuning
 *   below says.
 * - One draw loop, at full rate while something follows the visitor and at AMBIENT_FPS otherwise;
 *   paused while the tab is hidden. Reduced motion: one static frame, redrawn on resize only.
 * - Context loss or any GPU error: the canvas is removed and the paper shows (onLost).
 * - Start-up never blocks the main thread for long: plain WebGL (no engine to evaluate), and
 *   each step (shader compile, caps, glyph, instance data in batches, buffer upload, sizing,
 *   first draw) runs in its own task. The shaders compile in the background
 *   (KHR_parallel_shader_compile, polled once per frame) while the other steps run.
 * - Low-end devices (math.ts densityFactor) draw a sparser grid, about 0.6× the glyphs.
 */
import { ARCH } from '~/components/logo-paths';
import {
  BALANCED,
  MAX_TINT,
  bufferDpr,
  damp,
  densityFactor,
  dampMix,
  dollyShift,
  glyphShape,
  gridFor,
  hexToRgb,
  inkCaps,
  inkThresholds,
  mixFor,
  mixSettled,
  parseCssColor,
  perspectiveMatrix,
  sheetFrame,
  sheetMatrix,
  shouldDraw,
  tintColor,
  toNdc,
  type Accent,
  type Grid,
  type GridOptions,
  type InkCaps,
  type InkMix,
  type Rgb,
  type VignetteOptions,
} from './math';
import { fieldFragment, fieldVertex } from './shaders';
import { nextFrame, yieldToMain } from './tasks';

// ================================================================================================
// Tuning: every visual constant of the background lives here.
// ================================================================================================

/** Camera vertical field of view, degrees (wider: stronger perspective). */
const FOV = 46;
/**
 * Sheet tilt about the horizontal axis, radians (negative: the top recedes from the viewer). At
 * −0.9 with FOV 46 the rows at the top of the screen sit about 2.2× farther away than those at
 * the centre and 3.3× farther than those at the bottom: they visibly shrink towards the horizon.
 */
const TILT = -0.9;
/** Sheet travel per px of page scroll (the content moves 1 px): below 1 reads as depth. */
const DOLLY = 0.4;
/** How fast the sheet catches up with the scroll, per second (lower lags more). */
const SCROLL_LAG = 4;
/** Pointer lean at full deflection (radians about x and y) and how fast it follows, per second. */
const LEAN = { x: 0.05, y: 0.07, follow: 2 };
/** Touch screens: autonomous lean drift, as a fraction of LEAN, and its speed (rad/s). */
const DRIFT = { amount: 0.6, speed: 0.11 };
/** Halftone grid: pitch (px on the sheet) on small and large screens, instance cap, margins. */
const GRID: GridOptions = {
  pitchSmall: 46,
  pitchLarge: 42,
  smallWidth: 480,
  largeWidth: 1440,
  maxInstances: 9000,
  margin: 0.18,
  extraRows: 3,
};
/** Points per radian on the glyph's arcs. */
const GLYPH_ARC_STEPS = 3;
/**
 * Glyph width as a fraction of the pitch: floor, share of the wave, pointer swell. The sum stays
 * under 1, so neighbouring glyphs never overlap on the sheet (only lifted crests overprint). At
 * 1440 px a glyph averages about 13 px at the centre and 20 px in the nearest rows.
 */
const SIZE = { base: 0.2, wave: 0.26, swell: 0.22 };
/** Lift off the sheet towards the viewer, in pitches: share of the wave, pointer swell. */
const LIFT = { wave: 0.85, swell: 1.3 };
/**
 * Ink as a fraction of each ink's alpha cap: floor, share of the wave, pointer swell. Floor plus
 * wave is 1: the wave crests print at the cap, so the travelling waves read as bands of ink.
 */
const INK = { base: 0.35, wave: 0.65, swell: 0.4 };
/** Pointer swell focus (larger is a tighter swell) and how fast it fades in and out, per second. */
const SWELL = { focus: 6, follow: 3, track: 8 };
/**
 * Design ceiling of the ink alpha per plate. The contrast caps (math.ts inkCaps) lower key, cyan
 * and magenta to about 0.074, 0.148 and 0.086; yellow barely darkens the paper, so its ceiling
 * here is what limits it.
 */
const ALPHA_MAX = { k: 0.12, c: 0.2, m: 0.15, y: 0.42 };
/** Text colours set on the paper (red labels, muted text, key text) and the contrast they keep. */
const TEXT_ON_PAPER = ['#C03529', '#5A5650', '#221F20'];
/** WCAG AA (4.5) plus a margin for the paper grain drawn above the canvas. */
const MIN_CONTRAST = 4.6;
/** Inks, as in global.css and logo-paths.ts. */
const INKS = { k: '#221F20', c: '#00AEEF', m: '#ED008C', y: '#FFF100' };
/** Fallback paper colour (html's background is read at start). */
const PAPER_FALLBACK = '#FAFAF7';
/**
 * Vignette in NDC radii (1 = the middle of a screen edge, 1.41 = a corner): fades out from
 * `inner` to `outer`, and the centre keeps `calm` of the ink, full again by `calmRadius`.
 */
const VIGNETTE: VignetteOptions = { inner: 0.8, outer: 1.6, calm: 0.7, calmRadius: 0.6 };
/** Distance fog: starts and ends at these multiples of the camera distance; ink left at the end. */
const FOG = { near: 1, far: 2.1, floor: 0.22 };
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
/** Start-up: instance slots written per task. */
const SLOT_BATCH = 2048;

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

/** A canvas with its WebGL context (from the probe in index.ts). */
export interface GLContext {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext | WebGL2RenderingContext;
}

/** Instanced drawing on WebGL 2 or on WebGL 1 with ANGLE_instanced_arrays. */
interface Instancing {
  divisor(location: number, divisor: number): void;
  draw(indexCount: number, instances: number): void;
}

const instancingFor = (gl: WebGLRenderingContext | WebGL2RenderingContext): Instancing => {
  if (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) {
    const gl2: WebGL2RenderingContext = gl;
    return {
      divisor: (location, divisor) => gl2.vertexAttribDivisor(location, divisor),
      draw: (count, instances) =>
        gl2.drawElementsInstanced(gl2.TRIANGLES, count, gl2.UNSIGNED_SHORT, 0, instances),
    };
  }
  const ext = gl.getExtension('ANGLE_instanced_arrays');
  if (!ext) throw new Error('Instanced drawing is not available');
  return {
    divisor: (location, divisor) => ext.vertexAttribDivisorANGLE(location, divisor),
    draw: (count, instances) =>
      ext.drawElementsInstancedANGLE(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0, instances),
  };
};

/** Attribute locations, bound before linking (position must be 0: it is not instanced). */
const POSITION = 0;
const SLOT = 1;

const UNIFORM_NAMES = [
  'modelViewMatrix',
  'projectionMatrix',
  'uGrid',
  'uRowStart',
  'uShift',
  'uPitch',
  'uTime',
  'uPointer',
  'uPointerAmt',
  'uFocus',
  'uAspect',
  'uSize',
  'uLift',
  'uInkAmt',
  'uMix',
  'uKey',
  'uCyan',
  'uMagenta',
  'uYellow',
  'uTint',
  'uTintAmt',
  'uCap',
  'uResolution',
  'uVignette',
  'uFog',
] as const;

type UniformName = (typeof UNIFORM_NAMES)[number];

/**
 * Compiles and links the program without blocking: the calls only queue the work, and with
 * KHR_parallel_shader_compile the link is polled once per frame until it has finished. Without
 * the extension, the status read below waits for the driver, but in a task of its own.
 */
const linkProgram = async (
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  check: () => void,
): Promise<WebGLProgram> => {
  const parallel = gl.getExtension('KHR_parallel_shader_compile');
  const vertex = gl.createShader(gl.VERTEX_SHADER);
  const fragment = gl.createShader(gl.FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) throw new Error('WebGL objects could not be created');
  gl.shaderSource(vertex, fieldVertex);
  gl.shaderSource(fragment, fieldFragment);
  gl.compileShader(vertex);
  gl.compileShader(fragment);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, POSITION, 'position');
  gl.bindAttribLocation(program, SLOT, 'slot');
  gl.linkProgram(program);

  if (parallel) {
    while (!gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR)) {
      await nextFrame();
      check();
    }
  } else {
    await yieldToMain();
    check();
  }
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    // Refuse the scene so the paper stays.
    throw new Error('Living background shaders failed to link');
  }
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  return program;
};

/** The paper as painted on <html>, so the cleared canvas matches it exactly. */
const readPaper = (): Rgb =>
  parseCssColor(getComputedStyle(document.documentElement).backgroundColor) ??
  hexToRgb(PAPER_FALLBACK);

/** Alpha cap per plate: the design ceiling, lowered until every text colour keeps its contrast. */
const alphaCaps = (paper: Rgb): InkCaps =>
  inkCaps(
    paper,
    { k: hexToRgb(INKS.k), c: hexToRgb(INKS.c), m: hexToRgb(INKS.m), y: hexToRgb(INKS.y) },
    TEXT_ON_PAPER.map(hexToRgb),
    ALPHA_MAX,
    MIN_CONTRAST,
    MAX_TINT,
  );

/** Glyph density for this device (math.ts densityFactor). */
const deviceDensity = (width: number): number => {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return densityFactor({
    cores: navigator.hardwareConcurrency || undefined,
    memory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined,
    coarse: matchMedia('(pointer: coarse)').matches,
    width,
  });
};

/**
 * Builds the scene step by step, yielding to the main thread between steps (see the file
 * comment). Rejects, with nothing inserted into the page, if the context is lost meanwhile or the
 * GPU refuses the shaders; the caller then frees the context and the paper stays.
 */
export const createLivingBackground = async (
  host: HTMLElement,
  context: GLContext,
  options: LivingBackgroundOptions,
): Promise<LivingBackground> => {
  const { canvas, gl } = context;
  let lostEarly = false;
  const onLostEarly = (): void => {
    lostEarly = true;
  };
  canvas.addEventListener('webglcontextlost', onLostEarly);
  const check = (): void => {
    if (lostEarly || gl.isContextLost()) throw new Error('WebGL context lost during start-up');
  };
  const step = async (): Promise<void> => {
    await yieldToMain();
    check();
  };

  try {
    // 1. Queue the shader compile first: the GPU works on it while the steps below run.
    const linking = linkProgram(gl, check);
    // A rejection is handled where it is awaited (step 6); keep it from being reported early.
    linking.catch(() => undefined);
    await step();

    // 2. Colours and contrast caps.
    const paper = readPaper();
    const caps = alphaCaps(paper);
    await step();

    // 3. The glyph: one arch, one unit wide, centred.
    const glyph = glyphShape(ARCH, GLYPH_ARC_STEPS);
    await step();

    // 4. Instance slots, in batches.
    const slots = new Float32Array(GRID.maxInstances);
    for (let from = 0; from < slots.length; from += SLOT_BATCH) {
      const to = Math.min(slots.length, from + SLOT_BATCH);
      for (let i = from; i < to; i++) slots[i] = i;
      await step();
    }

    // 5. Buffers and attributes (state stays bound: nothing else draws in this context).
    const instancing = instancingFor(gl);
    const upload = (target: number, data: Float32Array | Uint16Array): void => {
      const buffer = gl.createBuffer();
      if (!buffer) throw new Error('WebGL buffer could not be created');
      gl.bindBuffer(target, buffer);
      gl.bufferData(target, data, gl.STATIC_DRAW);
    };
    upload(gl.ARRAY_BUFFER, glyph.position);
    gl.enableVertexAttribArray(POSITION);
    gl.vertexAttribPointer(POSITION, 2, gl.FLOAT, false, 0, 0);
    instancing.divisor(POSITION, 0);
    upload(gl.ARRAY_BUFFER, slots);
    gl.enableVertexAttribArray(SLOT);
    gl.vertexAttribPointer(SLOT, 1, gl.FLOAT, false, 0, 0);
    instancing.divisor(SLOT, 1);
    upload(gl.ELEMENT_ARRAY_BUFFER, glyph.index);
    await step();

    // 6. The program, once the GPU has linked it; uniform locations and fixed state.
    const program = await linking;
    check();
    gl.useProgram(program);
    const loc = {} as Record<UniformName, WebGLUniformLocation | null>;
    UNIFORM_NAMES.forEach((name) => {
      loc[name] = gl.getUniformLocation(program, name);
    });
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.DST_COLOR, gl.ZERO);
    gl.clearColor(paper[0], paper[1], paper[2], 1);
    gl.uniform1f(loc.uFocus, SWELL.focus);
    gl.uniform3f(loc.uSize, SIZE.base, SIZE.wave, SIZE.swell);
    gl.uniform2f(loc.uLift, LIFT.wave, LIFT.swell);
    gl.uniform3f(loc.uInkAmt, INK.base, INK.wave, INK.swell);
    const setRgb = (location: WebGLUniformLocation | null, hex: string): void => {
      const [r, g, b] = hexToRgb(hex);
      gl.uniform3f(location, r, g, b);
    };
    setRgb(loc.uKey, INKS.k);
    setRgb(loc.uCyan, INKS.c);
    setRgb(loc.uMagenta, INKS.m);
    setRgb(loc.uYellow, INKS.y);
    gl.uniform4f(loc.uCap, caps.k, caps.c, caps.m, caps.y);
    gl.uniform4f(loc.uVignette, VIGNETTE.inner, VIGNETTE.outer, VIGNETTE.calm, VIGNETTE.calmRadius);
    await step();

    canvas.removeEventListener('webglcontextlost', onLostEarly);
    return assemble(host, context, options, {
      instancing,
      loc,
      indexCount: glyph.index.length,
    });
  } catch (error) {
    canvas.removeEventListener('webglcontextlost', onLostEarly);
    throw error;
  }
};

interface Prepared {
  instancing: Instancing;
  loc: Record<UniformName, WebGLUniformLocation | null>;
  indexCount: number;
}

/** The running scene: sizing, the draw loop and the events, on prepared GPU state. */
const assemble = (
  host: HTMLElement,
  { canvas, gl }: GLContext,
  options: LivingBackgroundOptions,
  { instancing, loc, indexCount }: Prepared,
): LivingBackground => {
  const cyan = hexToRgb(INKS.c);
  const magenta = hexToRgb(INKS.m);
  const yellow = hexToRgb(INKS.y);
  const projection = new Float32Array(16);
  const modelView = new Float32Array(16);
  let instances = 0;
  let sheetZ = 0;

  // ----------------------------------------------------------------------------------------------
  // Measurements (start and resize). The host is fixed and 100lvh tall, so mobile toolbars
  // showing or hiding do not resize it (a resize clears the drawing buffer).
  // ----------------------------------------------------------------------------------------------

  let m: Metrics | null = null;
  let bufferWidth = 0;
  let bufferHeight = 0;

  const measure = (): Metrics => {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    const dpr = bufferDpr(width, height, window.devicePixelRatio, MAX_DPR, MAX_PIXELS);
    const w = Math.max(1, Math.floor(width * dpr));
    const h = Math.max(1, Math.floor(height * dpr));
    if (w !== bufferWidth || h !== bufferHeight) {
      bufferWidth = w;
      bufferHeight = h;
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

    const frame = sheetFrame(width, height, FOV, TILT);
    const grid = gridFor(frame, width, GRID, deviceDensity(width));
    perspectiveMatrix(projection, FOV, width / height, frame.distance * 0.05, frame.distance * 8);
    sheetZ = -frame.distance;
    // gridFor keeps the count under the cap; never draw past the instance buffer regardless.
    instances = Math.min(grid.count, GRID.maxInstances);

    gl.uniformMatrix4fv(loc.projectionMatrix, false, projection);
    gl.uniform2f(loc.uGrid, grid.cols, grid.rows);
    gl.uniform1f(loc.uRowStart, grid.rowStart);
    gl.uniform1f(loc.uPitch, grid.pitch);
    gl.uniform1f(loc.uAspect, width / height);
    gl.uniform2f(loc.uResolution, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform3f(loc.uFog, frame.distance * FOG.near, frame.distance * FOG.far, FOG.floor);
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
    const [r, g, b] = tintColor(current, cyan, magenta, yellow);
    gl.uniform3f(loc.uMix, c, cm, current.share);
    gl.uniform3f(loc.uTint, r, g, b);
    gl.uniform1f(loc.uTintAmt, current.tint);
  };

  const draw = (shift: number): void => {
    if (!m) return;
    gl.uniform1f(loc.uShift, shift);
    gl.uniform1f(loc.uTime, clock);
    gl.uniform2f(loc.uPointer, pointer.sx, pointer.sy);
    gl.uniform1f(loc.uPointerAmt, pointer.amount);
    sheetMatrix(modelView, TILT - lean.y * LEAN.x, lean.x * LEAN.y, sheetZ);
    gl.uniformMatrix4fv(loc.modelViewMatrix, false, modelView);
    applyMix(mix);

    gl.clear(gl.COLOR_BUFFER_BIT);
    instancing.draw(indexCount, instances);
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

  // Listen from here on: the scene may wait before start().
  canvas.addEventListener('webglcontextlost', onContextLost);

  const start = (): boolean => {
    if (started || destroyed) return false;
    if (gl.isContextLost()) {
      lose();
      return false;
    }
    let metrics: Metrics;
    try {
      metrics = measure();
    } catch {
      lose();
      return false;
    }
    m = metrics;
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
        draw(dollyShift(follow, DOLLY, metrics.grid.pitch));
        lastDraw = performance.now();
      }
    } catch {
      lose();
      return false;
    }
    // Commit the canvas's start style (opacity 0) before going live, so the fade-in transition
    // runs instead of the canvas appearing at full opacity in its first styled frame.
    void getComputedStyle(canvas).opacity;
    canvas.classList.add('is-live');
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
