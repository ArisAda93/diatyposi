/**
 * Living background scene (plain WebGL), drawn on every page behind all content.
 *
 * Ink lines. A few braids of hairlines in the logo's inks (C, M, Y, K) flow across the viewport
 * (lines.ts): each braid follows a slow wave, its lines weave around it, cross one another and
 * meet at travelling nodes, where they print a little stronger. They move slowly with time; the
 * scroll carries each braid up at its own parallax rate (it lags the page, reading as depth) and
 * shifts the waves, so the lines flow with the page. A fine pointer parts nearby lines gently.
 * Sections with `data-bg-accent` (index.ts) let their ink lead and quieten the others.
 *
 * The lines stay out of the way of the page. The text and the other UI on it (text-rects.ts:
 * text, links, buttons, fields, images and icons, the hero's art, `[data-bg-avoid]`) are
 * measured; around them the lines fade out over a soft feather, and on them they keep only
 * TEXT_INSIDE of their ink, never above the contrast-safe caps (math.ts inkCaps), so text keeps
 * AA contrast. Where the text is not tracked (reduced motion, a GPU with too few uniforms), the
 * lines print at the caps everywhere.
 *
 * Ink and contrast. Crossings combine per channel: MIN on light paper (cyan over yellow reads
 * green, the same ink over itself looks like one print), MAX in the dark theme (light inks on the
 * dark paper); multiply and screen where MIN/MAX are missing. The theme switch is live (index.ts):
 * new paper, inks, caps and blend; the canvas is hidden at once (transitions are off during the
 * switch), swapped, and fades back in.
 *
 * - One draw loop, at full rate while something follows the visitor and at AMBIENT_FPS otherwise;
 *   paused while the tab is hidden. Reduced motion: one static frame, redrawn on resize only.
 * - Context loss or any GPU error: the canvas is removed and the paper shows (onLost).
 * - Start-up never blocks the main thread for long: plain WebGL, and each step (shader compile,
 *   caps, line data, buffer upload, text measurement, sizing, first draw) runs in its own task.
 *   The shader compiles in the background (KHR_parallel_shader_compile, polled once per frame).
 * - Phones and low-end devices (lines.ts braidCount) draw one braid.
 */
import {
  BALANCED,
  PLATES,
  blendFor,
  bufferDpr,
  damp,
  dampWeights,
  densityFactor,
  hexToRgb,
  inkCaps,
  isDarkBlend,
  parseCssColor,
  relativeLuminance,
  shouldDraw,
  weightsFor,
  weightsSettled,
  type Accent,
  type DeviceHints,
  type InkBlend,
  type InkCaps,
  type InkWeights,
  type Plate,
  type Rgb,
  type Theme,
} from './math';
import {
  LINE_STRIDE,
  braidCount,
  lineSpecs,
  loopMargin,
  stripVertices,
  writeLines,
  type BraidBudget,
  type LineTuning,
} from './lines';
import { lineFragment, lineVertex, textDefine } from './shaders';
import { nextFrame, yieldToMain } from './tasks';
import {
  fitRects,
  insideAlpha,
  measureTextLayout,
  textSlots,
  toBufferRects,
  visibleRects,
  type TextLayout,
} from './text-rects';

// ================================================================================================
// Tuning: every visual constant of the background lives here.
// ================================================================================================

// --- The lines ----------------------------------------------------------------------------------

/**
 * The braids (lines.ts LineTuning): river and weave amplitudes as shares of the viewport height,
 * cycles across its width, speeds in rad/s (one river cycle takes about 70–125 s); where the
 * lines meet (nodes) and how much spread is left there; the share of the scroll each braid
 * travels; how far the waves shift per viewport height scrolled; line widths (CSS px).
 */
const LINES: LineTuning = {
  river: { amp: [0.05, 0.09], cycles: [0.45, 0.8], speed: [0.05, 0.09] },
  weave: { amp: [0.03, 0.05], cycles: [0.9, 1.5], speed: [0.08, 0.14] },
  nodes: { cycles: [0.7, 1.1], speed: [0.03, 0.06], floor: 0.08 },
  parallax: [0.18, 0.32],
  scrollPhase: { river: 0.6, weave: 0.9 },
  width: [1.1, 1.5],
  keyWidth: 0.85,
  openInk: 0.7,
};
/** Braids by viewport width; low-end devices keep `lowEnd` of them (at least one). */
const BRAIDS: BraidBudget = {
  desktop: 2,
  tablet: 2,
  phone: 1,
  phoneWidth: 600,
  tabletWidth: 1024,
  lowEnd: 0.6,
};
/** Seed of the composition (the same on every visit). */
const LINE_SEED = 5;
/** Stations along each line (the strip has two vertices per station). */
const SEGMENTS = 220;
/** Lines are drawn this far past both edges (CSS px), so their ends never show. */
const OVERSCAN = 24;
/** How fast the lines catch up with the scroll, per second (lower lags more). */
const SCROLL_LAG = 5;
/**
 * Fine pointers part nearby lines: radius (CSS px) and strength (the largest push is about
 * 0.43 × strength px), and how fast the push fades in and out and follows, per second.
 */
const POINTER = { radius: 140, strength: 26, fade: 3, follow: 6 };
/** Section accent blend rate, per second. */
const ACCENT_RATE = 1.8;

// --- Ink, contrast and themes -------------------------------------------------------------------

/**
 * Ink alpha per plate (k, c, m, y), per theme:
 * - `caps`: the ceiling the contrast caps start from (math.ts inkCaps lowers them until every
 *   text colour keeps MIN_CONTRAST on one print, on any pair, and where all four inks overlap).
 *   On text the lines print at most these caps.
 * - `line`: the design ink of a line away from text. Light ink on the dark paper reads stronger,
 *   so the dark values are lower (yellow prints paler there: DARK_YELLOW).
 */
const INK_CEILINGS: Record<Theme, { caps: InkCaps; line: InkCaps }> = {
  light: {
    caps: { k: 0.12, c: 0.2, m: 0.15, y: 0.42 },
    line: { k: 0.22, c: 0.55, m: 0.42, y: 0.85 },
  },
  dark: {
    caps: { k: 0.08, c: 0.15, m: 0.14, y: 0.12 },
    line: { k: 0.24, c: 0.55, m: 0.55, y: 0.5 },
  },
};
/** Dark theme: yellow prints as a paler, brighter yellow (it reads as light ink, not olive). */
const DARK_YELLOW = '#FFF59A';
/** WCAG AA (4.5) plus a margin for the paper grain drawn above the canvas. */
const MIN_CONTRAST = 4.6;
/** Inks, as in global.css and logo-paths.ts (fallbacks: the tokens are read at start). */
const INKS = { c: '#00AEEF', m: '#ED008C', y: '#FFF100' };
/**
 * Fallback paper, key and text colours per theme (theme.ts PALETTE), used only where the tokens
 * (`--color-paper`, `--color-key`, `--color-red`, `--color-muted`) cannot be read.
 */
const THEME_FALLBACK: Record<Theme, { paper: string; key: string; red: string; muted: string }> = {
  light: { paper: '#FAFAF7', key: '#221F20', red: '#C03529', muted: '#5A5650' },
  dark: { paper: '#141311', key: '#F2EFE8', red: '#F26A5B', muted: '#ADA89F' },
};
/** Paper darker than this (relative luminance) is printed as the dark theme. */
const DARK_PAPER = 0.2;
/**
 * Theme switch: the canvas is hidden, swaps inks and blend after `out` ms, and fades back in
 * (LivingBackground.astro, 180 ms; the class that shortens it is removed after `back` ms). The
 * hiding is a cut, not a fade: theme.ts sets `html.theme-switching` for the switch, which turns
 * transitions off (global.css), so the canvas disappears at once while the new paper shows.
 */
const THEME_FADE = { out: 180, back: 260 };

// --- Keeping clear of the page ------------------------------------------------------------------

const TEXT = {
  /**
   * Elements whose box the lines keep clear of: text, controls, images and icons, the hero's art
   * box (its WebGL mark has no box of its own) and anything marked `data-bg-avoid`.
   */
  selector:
    'h1, h2, h3, h4, h5, h6, p, li, a, button, label, figcaption, .label, input, textarea, ' +
    'select, dt, dd, blockquote, summary, th, td, img, svg, video, iframe, [data-hero-art], ' +
    '[data-bg-avoid]',
  /** Never measured: the background itself. */
  skip: '[data-living-bg]',
  /** Room around every box (px), and boxes merged within this distance (px). */
  pad: 10,
  gap: 24,
  /** Room above and below text in a depth entry (motion.css: lowered 48 px and tilted). */
  depthPad: 64,
  /** Feather from the whisper on text to the full line outside (CSS px). */
  feather: 36,
  /** Rectangles per frame: at most `max`; none (caps everywhere) if the GPU leaves under `min`. */
  max: 32,
  min: 8,
  /** Uniform vectors the shaders use besides the rectangles (they sit in the fragment shader). */
  vertexReserve: 0,
  fragmentReserve: 16,
  /** Re-measure this long after the last layout change (ms). */
  debounce: 200,
  /** The canvas draws behind a fast scroll: rectangles grow by the scroll speed × lead (s). */
  lead: 0.05,
  leadMax: 160,
  /** How fast the measured scroll speed follows, per second. */
  speedFollow: 12,
};
/** Share of a line's ink it keeps on text (never above the caps: text-rects.ts insideAlpha). */
const TEXT_INSIDE = 0.2;

// --- Frame budget -------------------------------------------------------------------------------

/** Frame rate while only the slow waves move. */
const AMBIENT_FPS = 30;
/** Drawing buffer limits. */
const MAX_DPR = 2;
const MAX_PIXELS = 3_000_000;
/** Reduced motion: the wave phase of the single static frame, seconds. */
const STATIC_TIME = 24;
const RESIZE_DEBOUNCE = 150;

// ================================================================================================

/** Lines the instance buffer holds: four per braid at the largest budget. */
const LINE_CAPACITY = Math.max(BRAIDS.desktop, BRAIDS.tablet, BRAIDS.phone) * PLATES.length;

export interface LivingBackground {
  /** Inserts the canvas, draws the first frame and starts the loop. False if it cannot run. */
  start(): boolean;
  /** The accent of the section at the viewport centre (null: every ink at full strength). */
  setAccent(accent: Accent | null): void;
  /** Reduced motion on: one static frame, no loop. Off: the loop runs again. */
  setReducedMotion(reduce: boolean): void;
  /** The site theme: new paper, inks, caps and blend (hidden, swapped, faded back in). */
  setTheme(theme: Theme): void;
  /** Removes the canvas and frees the context. Safe to call twice. */
  destroy(): void;
}

export interface LivingBackgroundOptions {
  reducedMotion: boolean;
  theme: Theme;
  /** Called once if the scene dies on its own (context lost, GPU error). */
  onLost: () => void;
}

/** A canvas with its WebGL context (from the probe in index.ts). */
export interface GLContext {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext | WebGL2RenderingContext;
}

type GL = WebGLRenderingContext | WebGL2RenderingContext;

/** Instanced drawing on WebGL 2 or on WebGL 1 with ANGLE_instanced_arrays. */
interface Instancing {
  divisor(location: number, divisor: number): void;
  draw(vertices: number, instances: number): void;
}

const isWebGL2 = (gl: GL): gl is WebGL2RenderingContext =>
  typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;

const instancingFor = (gl: GL): Instancing => {
  if (isWebGL2(gl)) {
    return {
      divisor: (location, divisor) => gl.vertexAttribDivisor(location, divisor),
      draw: (count, instances) => gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, count, instances),
    };
  }
  const ext = gl.getExtension('ANGLE_instanced_arrays');
  if (!ext) throw new Error('Instanced drawing is not available');
  return {
    divisor: (location, divisor) => ext.vertexAttribDivisorANGLE(location, divisor),
    draw: (count, instances) =>
      ext.drawArraysInstancedANGLE(gl.TRIANGLE_STRIP, 0, count, instances),
  };
};

/** MIN and MAX blend equations, if this context has them (core in WebGL 2, EXT_blend_minmax). */
const minMaxEquations = (gl: GL): { min: number; max: number } | null => {
  if (isWebGL2(gl)) return { min: gl.MIN, max: gl.MAX };
  const ext = gl.getExtension('EXT_blend_minmax');
  return ext ? { min: ext.MIN_EXT, max: ext.MAX_EXT } : null;
};

/** Attribute locations, bound before linking: the strip, then the four per-line vec4s. */
const ATTRIBUTES = ['position', 'iLine', 'iRiver', 'iWeave', 'iNodes'] as const;

const UNIFORMS = [
  'uView',
  'uScale',
  'uTime',
  'uScroll',
  'uLine',
  'uPointer',
  'uOverscan',
  'uOpenInk',
  'uKey',
  'uCyan',
  'uMagenta',
  'uYellow',
  'uOpen',
  'uInside',
  'uBase',
  'uDark',
  'uText',
  'uTextCount',
  'uFeather',
  'uTextAll',
] as const;

type Uniform = (typeof UNIFORMS)[number];

interface Program {
  program: WebGLProgram;
  loc: Record<Uniform, WebGLUniformLocation | null>;
}

/**
 * Compiles and links the program without blocking: the calls only queue the work, and with
 * KHR_parallel_shader_compile the link is polled once per frame until it has finished. Without
 * the extension, the status read below waits for the driver, but in a task of its own.
 */
const linkProgram = async (
  gl: GL,
  sources: { vertex: string; fragment: string },
  check: () => void,
): Promise<WebGLProgram> => {
  const parallel = gl.getExtension('KHR_parallel_shader_compile');
  const vertex = gl.createShader(gl.VERTEX_SHADER);
  const fragment = gl.createShader(gl.FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) throw new Error('WebGL objects could not be created');
  gl.shaderSource(vertex, sources.vertex);
  gl.shaderSource(fragment, sources.fragment);
  gl.compileShader(vertex);
  gl.compileShader(fragment);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  ATTRIBUTES.forEach((name, location) => gl.bindAttribLocation(program, location, name));
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

const locate = (gl: GL, program: WebGLProgram): Program => {
  const loc = {} as Record<Uniform, WebGLUniformLocation | null>;
  UNIFORMS.forEach((name) => {
    loc[name] = gl.getUniformLocation(program, name);
  });
  return { program, loc };
};

/** Paper, inks, blend and the ink alphas of a theme. */
interface Palette {
  theme: Theme;
  blend: InkBlend;
  paper: Rgb;
  inks: Record<Plate, Rgb>;
  /** On text: contrast-safe for this paper, text and blend. */
  caps: InkCaps;
  /** Away from text. */
  line: InkCaps;
}

/**
 * Reads the theme's colours from the tokens on <html> (they switch with `data-theme`, without a
 * transition) and computes the caps. The paper decides how the inks print: dark paper takes the
 * light-on-dark blend whatever the theme says, so the caps always match what is on screen.
 */
const readPalette = (minMax: boolean): Palette => {
  const style = getComputedStyle(document.documentElement);
  const parsedPaper =
    parseCssColor(style.getPropertyValue('--color-paper')) ?? parseCssColor(style.backgroundColor);
  const paper = parsedPaper ?? hexToRgb(THEME_FALLBACK.light.paper);
  const theme: Theme = relativeLuminance(paper) < DARK_PAPER ? 'dark' : 'light';
  const fallback = THEME_FALLBACK[theme];
  const token = (name: string, hex: string): Rgb =>
    parseCssColor(style.getPropertyValue(name)) ?? hexToRgb(hex);
  const inks: Record<Plate, Rgb> = {
    k: token('--color-key', fallback.key),
    c: token('--color-cyan', INKS.c),
    m: token('--color-magenta', INKS.m),
    y: theme === 'dark' ? hexToRgb(DARK_YELLOW) : token('--color-yellow', INKS.y),
  };
  const texts = [
    token('--color-red', fallback.red),
    token('--color-muted', fallback.muted),
    inks.k,
  ];
  const blend = blendFor(theme, minMax);
  const ceilings = INK_CEILINGS[theme];
  return {
    theme,
    blend,
    paper,
    inks,
    caps: inkCaps(paper, inks, texts, ceilings.caps, MIN_CONTRAST, blend),
    line: ceilings.line,
  };
};

/** Device hints for the number of braids (math.ts densityFactor). */
const deviceHints = (width: number): DeviceHints => {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    cores: navigator.hardwareConcurrency || undefined,
    memory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined,
    coarse: matchMedia('(pointer: coarse)').matches,
    width,
  };
};

interface Buffers {
  strip: WebGLBuffer;
  lines: WebGLBuffer;
}

interface Prepared {
  instancing: Instancing;
  equations: { min: number; max: number } | null;
  line: Program;
  buffers: Buffers;
  stripCount: number;
  palette: Palette;
  slots: number;
  text: TextLayout | null;
}

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
    // 1. Queue the shader compile first: the GPU works on it while the steps below run. The text
    //    rectangle array is sized to what the GPU's uniform limits leave.
    if (gl.getParameter(gl.MAX_VERTEX_ATTRIBS) < ATTRIBUTES.length) {
      throw new Error('Too few vertex attributes for the lines');
    }
    const slots = textSlots(
      Number(gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS)) || 0,
      Number(gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)) || 0,
      {
        max: TEXT.max,
        min: TEXT.min,
        vertexReserve: TEXT.vertexReserve,
        fragmentReserve: TEXT.fragmentReserve,
      },
    );
    const define = textDefine(slots);
    const linking = linkProgram(
      gl,
      { vertex: define + lineVertex, fragment: define + lineFragment },
      check,
    );
    // A rejection is handled where it is awaited (step 5); keep it from being reported early.
    linking.catch(() => undefined);
    await step();

    // 2. Colours, blend and contrast caps for the current theme.
    const equations = minMaxEquations(gl);
    const palette = readPalette(equations !== null);
    await step();

    // 3. Buffers: the strip every line is drawn with, and room for the line data.
    const instancing = instancingFor(gl);
    const upload = (data: Float32Array, usage: number): WebGLBuffer => {
      const buffer = gl.createBuffer();
      if (!buffer) throw new Error('WebGL buffer could not be created');
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, usage);
      return buffer;
    };
    const strip = stripVertices(SEGMENTS);
    const buffers: Buffers = {
      strip: upload(strip, gl.STATIC_DRAW),
      lines: upload(new Float32Array(LINE_CAPACITY * LINE_STRIDE), gl.DYNAMIC_DRAW),
    };
    await step();

    // 4. Where the text is (a layout read, in a task of its own). If it fails, the lines stay at
    //    the caps everywhere until the next measurement.
    let text: TextLayout | null = null;
    try {
      text = measureTextLayout(TEXT);
    } catch {
      // Keep the caps everywhere.
    }
    await step();

    // 5. The program, once the GPU has linked it; uniform locations and fixed state.
    const line = locate(gl, await linking);
    check();
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.useProgram(line.program);
    gl.uniform1f(line.loc.uOverscan, OVERSCAN);
    gl.uniform1f(line.loc.uOpenInk, LINES.openInk);
    await step();

    canvas.removeEventListener('webglcontextlost', onLostEarly);
    return assemble(host, context, options, {
      instancing,
      equations,
      line,
      buffers,
      stripCount: strip.length / 2,
      palette,
      slots,
      text,
    });
  } catch (error) {
    canvas.removeEventListener('webglcontextlost', onLostEarly);
    throw error;
  }
};

/** The running scene: sizing, the draw loop and the events, on prepared GPU state. */
const assemble = (
  host: HTMLElement,
  { canvas, gl }: GLContext,
  options: LivingBackgroundOptions,
  prepared: Prepared,
): LivingBackground => {
  const { instancing, equations, line, buffers, stripCount, slots } = prepared;
  const { loc } = line;
  let palette = prepared.palette;
  /** The theme last asked for (the palette follows the paper it finds). */
  let themeNow = options.theme;
  let text = prepared.text;
  const lineData = new Float32Array(LINE_CAPACITY * LINE_STRIDE);
  const textData = new Float32Array(Math.max(1, slots) * 4);
  let lineCount = 0;
  let braids = 0;
  let textCount = 0;
  let textAll = 1;

  // ----------------------------------------------------------------------------------------------
  // GL state (one program: bound once, again only after nothing else could have changed it)
  // ----------------------------------------------------------------------------------------------

  const bind = (): void => {
    gl.useProgram(line.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.strip);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    instancing.divisor(0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.lines);
    for (let r = 0; r < 4; r++) {
      gl.enableVertexAttribArray(1 + r);
      gl.vertexAttribPointer(1 + r, 4, gl.FLOAT, false, LINE_STRIDE * 4, r * 16);
      instancing.divisor(1 + r, 1);
    }
  };
  bind();

  /** Paper, inks, blend; the ink alphas are set per frame (they follow the accent and text). */
  const applyPalette = (p: Palette): void => {
    if ((p.blend === 'min' || p.blend === 'max') && equations) {
      gl.blendEquation(p.blend === 'min' ? equations.min : equations.max);
      gl.blendFunc(gl.ONE, gl.ONE);
    } else if (p.blend === 'screen') {
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE_MINUS_DST_COLOR, gl.ONE);
    } else {
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.DST_COLOR, gl.ZERO);
    }
    gl.clearColor(p.paper[0], p.paper[1], p.paper[2], 1);
    // What each print starts from: the paper for MIN/MAX, white to multiply, black to screen.
    const base: Rgb =
      p.blend === 'multiply' ? [1, 1, 1] : p.blend === 'screen' ? [0, 0, 0] : p.paper;
    gl.uniform3f(loc.uKey, p.inks.k[0], p.inks.k[1], p.inks.k[2]);
    gl.uniform3f(loc.uCyan, p.inks.c[0], p.inks.c[1], p.inks.c[2]);
    gl.uniform3f(loc.uMagenta, p.inks.m[0], p.inks.m[1], p.inks.m[2]);
    gl.uniform3f(loc.uYellow, p.inks.y[0], p.inks.y[1], p.inks.y[2]);
    gl.uniform3f(loc.uBase, base[0], base[1], base[2]);
    gl.uniform1f(loc.uDark, isDarkBlend(p.blend) ? 1 : 0);
  };
  applyPalette(palette);

  // ----------------------------------------------------------------------------------------------
  // Measurements (start and resize). The host is fixed and 100lvh tall, so mobile toolbars
  // showing or hiding do not resize it (a resize clears the drawing buffer).
  // ----------------------------------------------------------------------------------------------

  interface Metrics {
    width: number;
    height: number;
  }
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

    // The braids for this viewport (the same composition for the same size).
    const hints = deviceHints(width);
    const next = Math.min(
      LINE_CAPACITY / PLATES.length,
      braidCount(hints, BRAIDS, densityFactor(hints)),
    );
    if (next !== braids) {
      braids = next;
      lineCount = writeLines(lineSpecs(braids, LINES, LINE_SEED), lineData);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.lines);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, lineData.subarray(0, lineCount * LINE_STRIDE));
    }

    const sx = gl.drawingBufferWidth / width;
    const sy = gl.drawingBufferHeight / height;
    gl.uniform2f(loc.uView, width, height);
    gl.uniform2f(loc.uScale, sx, sy);
    gl.uniform4f(
      loc.uLine,
      loopMargin(LINES, height),
      LINES.scrollPhase.river,
      LINES.scrollPhase.weave,
      LINES.nodes.floor,
    );
    gl.uniform1f(loc.uFeather, TEXT.feather * sy);
    return { width, height };
  };

  // ----------------------------------------------------------------------------------------------
  // State
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
  let layoutTimer = 0;
  let themeTimer = 0;
  let follow = window.scrollY;
  let lastScroll = window.scrollY;
  /** Scroll speed (px/s), for the lead the text rectangles get behind a fast scroll. */
  let quickSpeed = 0;
  const pointer = { x: 0, y: 0, sx: 0, sy: 0, inside: false, amount: 0 };
  let weights: InkWeights = { ...BALANCED };
  let targetWeights: InkWeights = { ...BALANCED };

  // ----------------------------------------------------------------------------------------------
  // Ink and text
  // ----------------------------------------------------------------------------------------------

  /** The text rectangles in view this frame, in drawing-buffer px; or the caps everywhere. */
  const prepareText = (scrollY: number): void => {
    if (!m || reduce || slots === 0 || !text) {
      // Reduced motion draws one still frame under moving text: the caps everywhere.
      textCount = 0;
      textAll = 1;
      return;
    }
    const lead = Math.min(TEXT.leadMax, Math.abs(quickSpeed) * TEXT.lead);
    const rects = fitRects(
      visibleRects(text.doc, text.fixed, scrollY, m.height, TEXT.feather, lead),
      slots,
    );
    textCount = toBufferRects(
      rects,
      textData,
      m.width,
      m.height,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
    );
    textAll = 0;
  };

  /** The inks' alphas away from text and on it, weighted by the accent (weights ≤ 1). */
  const uploadInk = (): void => {
    const all = textAll === 1;
    const open = (p: Plate): number => palette.line[p] * weights[p];
    const inside = (p: Plate): number =>
      insideAlpha(palette.line[p], palette.caps[p], TEXT_INSIDE, all) * weights[p];
    gl.uniform4f(loc.uOpen, open('k'), open('c'), open('m'), open('y'));
    gl.uniform4f(loc.uInside, inside('k'), inside('c'), inside('m'), inside('y'));
    gl.uniform1f(loc.uTextCount, textCount);
    gl.uniform1f(loc.uTextAll, textAll);
    if (textCount > 0 && loc.uText) gl.uniform4fv(loc.uText, textData.subarray(0, textCount * 4));
  };

  // ----------------------------------------------------------------------------------------------
  // Drawing
  // ----------------------------------------------------------------------------------------------

  const draw = (scroll: number, scrollY: number): void => {
    if (!m) return;
    prepareText(scrollY);
    gl.uniform1f(loc.uTime, clock);
    gl.uniform1f(loc.uScroll, scroll);
    gl.uniform4f(
      loc.uPointer,
      pointer.sx,
      pointer.sy,
      POINTER.radius,
      POINTER.strength * pointer.amount,
    );
    uploadInk();
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (lineCount > 0) instancing.draw(stripCount, lineCount);
  };

  /** Reduced motion: fixed lines, no scroll or pointer, every ink at full weight, caps. */
  const drawStatic = (): void => {
    clock = STATIC_TIME;
    pointer.amount = 0;
    quickSpeed = 0;
    weights = { ...BALANCED };
    draw(0, 0);
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

    // Scroll, damped: the lines lag a fast scroll a little and settle.
    const scrollY = window.scrollY;
    follow = damp(follow, scrollY, SCROLL_LAG, dt);
    if (Math.abs(follow - scrollY) < 0.2) follow = scrollY;
    const raw = dt > 0 ? (scrollY - lastScroll) / dt : 0;
    lastScroll = scrollY;
    quickSpeed = damp(quickSpeed, raw, TEXT.speedFollow, dt);
    if (Math.abs(quickSpeed) < 0.5 && raw === 0) quickSpeed = 0;
    const scrolling = follow !== scrollY || raw !== 0 || quickSpeed !== 0;

    // A fine pointer parts the lines near it (faded in and out, following smoothly).
    const before = [pointer.amount, pointer.sx, pointer.sy];
    const pointing = finePointer.matches && pointer.inside;
    pointer.amount = damp(pointer.amount, pointing ? 1 : 0, POINTER.fade, dt);
    if (pointer.amount < 0.001 && !pointing) pointer.amount = 0;
    pointer.sx = damp(pointer.sx, pointer.x, POINTER.follow, dt);
    pointer.sy = damp(pointer.sy, pointer.y, POINTER.follow, dt);
    const moving = [pointer.amount, pointer.sx, pointer.sy].some(
      (value, i) => Math.abs(value - (before[i] ?? value)) > 0.05,
    );

    // Section accent, blended.
    const blending = !weightsSettled(weights, targetWeights);
    weights = blending ? dampWeights(weights, targetWeights, ACCENT_RATE, dt) : targetWeights;

    if (shouldDraw(now, lastDraw, scrolling || moving || blending, AMBIENT_FPS)) {
      draw(follow, scrollY);
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

  /** Draws the current state now (after a resize, a theme switch or a new measurement). */
  const redraw = (): void => {
    if (!m || !started || destroyed) return;
    if (reduce) {
      drawStatic();
      return;
    }
    draw(follow, window.scrollY);
    lastDraw = performance.now();
    request();
  };

  // ----------------------------------------------------------------------------------------------
  // Events
  // ----------------------------------------------------------------------------------------------

  const remeasure = (): void => {
    if (destroyed) return;
    try {
      m = measure();
      // Redraw now: the resize cleared the drawing buffer.
      redraw();
    } catch {
      lose();
    }
  };

  const relayout = (): void => {
    if (destroyed) return;
    try {
      text = measureTextLayout(TEXT);
    } catch {
      // Measurement failed: the caps everywhere until the next one.
      text = null;
    }
    if (reduce) return;
    // Draw the new rectangles now, even while nothing else moves.
    lastDraw = -Infinity;
    request();
  };

  const scheduleLayout = (): void => {
    if (destroyed) return;
    window.clearTimeout(layoutTimer);
    layoutTimer = window.setTimeout(relayout, TEXT.debounce);
  };

  const onResize = (): void => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(remeasure, RESIZE_DEBOUNCE);
    scheduleLayout();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' || !m) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (!pointer.inside) {
      // Start where the pointer is instead of sweeping in from the last position.
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
  // Text moves when the content changes size (fonts, images, opened panels).
  const contentObserver = new ResizeObserver(scheduleLayout);

  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    pause();
    window.clearTimeout(resizeTimer);
    window.clearTimeout(layoutTimer);
    window.clearTimeout(themeTimer);
    resizeObserver.disconnect();
    contentObserver.disconnect();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('load', scheduleLayout);
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
    try {
      m = measure();
    } catch {
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
    contentObserver.observe(document.querySelector('main') ?? document.body);
    if (document.readyState !== 'complete') {
      window.addEventListener('load', scheduleLayout, { once: true });
    }
    void document.fonts?.ready.then(scheduleLayout, () => undefined);

    // First frame now, so the canvas has content before it fades in over the paper.
    try {
      if (reduce) drawStatic();
      else {
        draw(follow, window.scrollY);
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
    targetWeights = weightsFor(accent);
    if (!started) weights = { ...targetWeights };
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
        lastScroll = follow;
        request();
      }
    } catch {
      lose();
    }
  };

  /** Swaps the palette (caps computed for the new paper and text) and draws it. */
  const applyTheme = (): void => {
    if (destroyed) return;
    try {
      palette = readPalette(equations !== null);
      applyPalette(palette);
      redraw();
    } catch {
      lose();
    }
  };

  const setTheme = (theme: Theme): void => {
    if (destroyed || theme === themeNow) return;
    themeNow = theme;
    window.clearTimeout(themeTimer);
    if (!started || reduce || document.hidden) {
      canvas.classList.remove('is-switching', 'is-theme-fade');
      applyTheme();
      return;
    }
    // Hide the canvas (a cut: transitions are off while html.theme-switching is set, and the
    // page's new paper shows), swap, and fade it back in.
    canvas.classList.add('is-theme-fade', 'is-switching');
    themeTimer = window.setTimeout(() => {
      applyTheme();
      canvas.classList.remove('is-switching');
      themeTimer = window.setTimeout(
        () => canvas.classList.remove('is-theme-fade'),
        THEME_FADE.back,
      );
    }, THEME_FADE.out);
  };

  return { start, setAccent, setReducedMotion, setTheme, destroy };
};
