/**
 * Living background scene (plain WebGL), drawn on every page behind all content.
 *
 * Two layers on one canvas:
 *
 * 1. The sheet. A press sheet recedes in perspective, tilted away from the viewer and covered in
 *    arch glyphs (the logo's ARCH outline, flat) on a halftone screen. Slow travelling waves grow,
 *    lift and ink the glyphs like halftone dots breathing, and fog fades the far rows. Most glyphs
 *    are C/M/Y, a minority key. It travels with the scroll at DOLLY of its speed (the camera
 *    dollying along it), leans with a fine pointer (a slow drift on touch screens) and swells
 *    around it; sections with `data-bg-accent` (index.ts) blend its inks towards theirs.
 * 2. The floating plates (plates.ts), drawn after the sheet: the logo's arch extruded into solid
 *    plates, in the four inks, small to large, at their own depths through the whole page. Each
 *    drifts, bobs and turns slowly about its own axes. The scroll moves every plate at its own
 *    parallax rate (near plates rush past, larger, in front of the page; far ones linger), and the
 *    scroll speed adds a little lean and spin. Fine pointers make nearby plates lean towards or
 *    turn away from the pointer on damped springs, and the whole field leans with it. Now and then
 *    two or three plates drift into register, overprint, and part again. On the home page four of
 *    them start as the hero's mark (`[data-hero-art]`, hero-scene/handoff-signal.ts): they fade in
 *    as the hero's plates fade out, then scatter across the page as the scroll goes on (scrubbed,
 *    reversible).
 *
 * Ink and contrast. Overlaps combine per channel: MIN on light paper (cyan over yellow reads
 * green, the same ink over itself looks like one print), MAX in the dark theme (light inks on the
 * dark paper, the mirror image); multiply and screen where MIN/MAX are missing. Every ink has a
 * contrast-safe cap (math.ts inkCaps) that keeps the site's text colours at MIN_CONTRAST on one
 * print and where any two overlap, for the current theme's paper and text. The text on the page is
 * measured (text-rects.ts): inside its rectangles the ink falls to those caps over a short
 * feather; everywhere else it rises to the design ceilings below, so the background carries more
 * presence where it costs no legibility. Reduced motion, or a GPU with too few uniforms: the caps
 * everywhere. The theme switch is live (index.ts): new paper, inks, caps and blend; the canvas is
 * hidden at once (transitions are off during the switch), swapped, and fades back in.
 *
 * - One draw loop, at full rate while something follows the visitor and at AMBIENT_FPS otherwise;
 *   paused while the tab is hidden. Reduced motion: one static frame, redrawn on resize only.
 * - Context loss or any GPU error: the canvas is removed and the paper shows (onLost).
 * - Start-up never blocks the main thread for long: plain WebGL (no engine to evaluate), and
 *   each step (shader compile, caps, glyph, instance data in batches, plate extrusion, buffer
 *   upload, text measurement, sizing, first draw) runs in its own task. The shaders compile in
 *   the background (KHR_parallel_shader_compile, polled once per frame) while the other steps
 *   run.
 * - Low-end devices (math.ts densityFactor) draw a sparser grid, about 0.6× the glyphs, and fewer
 *   plates.
 */
import { ARCH, ARCH_PLATES } from '~/components/logo-paths';
import { boundsOf, extrude, sampleOutline, toLocal } from '~/scripts/hero-scene/geometry';
import { latestHeroHandoff } from '~/scripts/hero-scene/handoff-signal';
import {
  BALANCED,
  MAX_TINT,
  blendFor,
  bufferDpr,
  clamp,
  damp,
  densityFactor,
  dampMix,
  dollyShift,
  glyphShape,
  gridFor,
  hexToRgb,
  inkCaps,
  inkThresholds,
  isDarkBlend,
  lerp,
  mixFor,
  mixSettled,
  parseCssColor,
  perspectiveMatrix,
  relativeLuminance,
  sheetFrame,
  sheetMatrix,
  shouldDraw,
  smoothstep,
  tintColor,
  toNdc,
  type Accent,
  type DeviceHints,
  type GlyphBlend,
  type Grid,
  type GridOptions,
  type InkCaps,
  type InkMix,
  type Plate,
  type Rgb,
  type Theme,
  type VignetteOptions,
} from './math';
import {
  INK_INDEX,
  blendPose,
  depthFade,
  freePose,
  markFromArt,
  markSlots,
  pickRegisterGroup,
  plateCycle,
  plateRows,
  plateSpecs,
  pointerInfluence,
  poolSize,
  random,
  registerEnvelope,
  registerTarget,
  springStep,
  toWorld,
  travellerPose,
  viewUnit,
  visiblePlates,
  type ArchBox,
  type MarkPlacement,
  type PlateBudget,
  type PlatePose,
  type PlateSpec,
  type PlateTuning,
  type PlateView,
  type Travel,
} from './plates';
import { fieldFragment, fieldVertex, plateFragment, plateVertex, textDefine } from './shaders';
import { nextFrame, yieldToMain } from './tasks';
import {
  fitRects,
  measureHeroArt,
  measureTextLayout,
  textSlots,
  toBufferRects,
  visibleRects,
  type Rect,
  type TextLayout,
} from './text-rects';

// ================================================================================================
// Tuning: every visual constant of the background lives here.
// ================================================================================================

// --- The sheet ----------------------------------------------------------------------------------

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
 * under 1, so neighbouring glyphs never overlap on the sheet (only lifted crests overlap). At
 * 1440 px a glyph averages about 14 px at the centre and 22 px in the nearest rows.
 */
const SIZE = { base: 0.23, wave: 0.26, swell: 0.22 };
/** Lift off the sheet towards the viewer, in pitches: share of the wave, pointer swell. */
const LIFT = { wave: 0.85, swell: 1.3 };
/**
 * Ink as a fraction of each ink's alpha: floor, share of the wave, pointer swell. Floor plus wave
 * is 1: the wave crests print at the full alpha, so the travelling waves read as bands of ink.
 */
const INK = { base: 0.5, wave: 0.5, swell: 0.4 };
/** Pointer swell focus (larger is a tighter swell) and how fast it fades in and out, per second. */
const SWELL = { focus: 6, follow: 3, track: 8 };
/**
 * A glyph's reach on screen as a share of its width (half its diagonal plus a margin): its text
 * mask is taken on the text rectangles grown by this, so every pixel of it is covered.
 */
const GLYPH_REACH = 0.6;
/**
 * Vignette in NDC radii (1 = the middle of a screen edge, 1.41 = a corner): fades out from
 * `inner` to `outer`, and the centre keeps `calm` of the ink, full again by `calmRadius`.
 */
const VIGNETTE: VignetteOptions = { inner: 0.8, outer: 1.6, calm: 0.7, calmRadius: 0.6 };
/** Distance fog: starts and ends at these multiples of the camera distance; ink left at the end. */
const FOG = { near: 1, far: 2.1, floor: 0.22 };
/** Section accent blend rate, per second. */
const ACCENT_RATE = 1.8;

// --- Ink, contrast and themes -------------------------------------------------------------------

/**
 * Ink alpha per plate (k, c, m, y), per theme:
 * - `caps`: the ceiling the contrast caps start from (math.ts inkCaps lowers them until every
 *   text colour keeps MIN_CONTRAST on one print, on any pair, and where all four inks overlap;
 *   on light paper with MIN to roughly a quarter below the pair limits of k 0.049, c 0.095,
 *   m 0.058, y 0.405). Inside text rectangles every glyph and plate prints at most these caps.
 * - `glyph` / `plate`: the design ceilings away from text (no text there to protect).
 * Light ink on the dark paper reads stronger, so the dark ceilings are lower (except yellow,
 * which prints paler there: DARK_YELLOW).
 */
const INK_CEILINGS: Record<Theme, { caps: InkCaps; glyph: InkCaps; plate: InkCaps }> = {
  light: {
    caps: { k: 0.12, c: 0.2, m: 0.15, y: 0.42 },
    glyph: { k: 0.14, c: 0.26, m: 0.2, y: 0.46 },
    plate: { k: 0.35, c: 0.55, m: 0.55, y: 0.55 },
  },
  dark: {
    caps: { k: 0.08, c: 0.15, m: 0.14, y: 0.12 },
    glyph: { k: 0.1, c: 0.2, m: 0.18, y: 0.22 },
    plate: { k: 0.24, c: 0.42, m: 0.42, y: 0.45 },
  },
};
/**
 * Dark theme: yellow prints towards a paler, brighter yellow (glyphs and plates), and yellow
 * plates keep at least `yellowFloor` of their ink however they turn, so yellow reads as light ink
 * on the dark paper rather than olive. The caps are computed for this yellow.
 */
const DARK_YELLOW = { ink: '#FFF59A', yellowFloor: 0.65 };
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

// --- Text-aware ink -----------------------------------------------------------------------------

const TEXT = {
  /** Elements whose box counts as text. */
  selector:
    'h1, h2, h3, h4, h5, h6, p, li, a, button, label, figcaption, .label, input, textarea, ' +
    'select, dt, dd, blockquote, summary, th, td',
  /** Never measured: the background itself. */
  skip: '[data-living-bg]',
  /** Room around every box (px), and boxes merged within this distance (px). */
  pad: 6,
  gap: 24,
  /** Room above and below text in a depth entry (motion.css: lowered 48 px and tilted). */
  depthPad: 64,
  /** Feather from the cap inside text to the ceiling outside (CSS px). */
  feather: 12,
  /** Rectangles per frame: at most `max`; none (caps everywhere) if the GPU leaves under `min`. */
  max: 32,
  min: 8,
  /** Uniform vectors the shaders use besides the rectangles. */
  vertexReserve: 48,
  fragmentReserve: 16,
  /** Re-measure this long after the last layout change (ms). */
  debounce: 200,
  /** The canvas draws behind a fast scroll: rectangles grow by the scroll speed × lead (s). */
  lead: 0.05,
  leadMax: 160,
  /** How fast the measured scroll speed follows, per second. */
  speedFollow: 12,
};

// --- Floating plates ----------------------------------------------------------------------------

/**
 * Depth factors from near (in front of the page, larger, moving 1.8× the scroll) to far (2.6×
 * farther, 0.38× the scroll); apparent width at depth 1 as a share of the view unit
 * (min(width, 1.3 × height), at least 520 px); spread across the page; loop slack (px); drift and
 * bob (share of the unit, rad/s); turning about the plate's own axes (rad/s) and rest tilt (rad).
 */
const PLATES: PlateTuning = {
  depth: { near: 0.55, far: 2.6 },
  size: { min: 0.07, max: 0.2 },
  unit: { heightRatio: 1.3, min: 520 },
  bleed: 0.04,
  slack: 32,
  drift: { x: 0.03, y: 0.02, speedMin: 0.07, speedMax: 0.19 },
  spin: { min: 0.04, max: 0.15, tilt: 0.5 },
};
/** Plates in view at once by viewport, low-end share, and pool size per plate in view. */
const PLATE_BUDGET: PlateBudget = {
  desktop: 10,
  tablet: 7,
  phone: 5,
  phoneWidth: 600,
  tabletWidth: 1024,
  lowEnd: 0.6,
  spare: 1.2,
};
/** Seed of the composition (the same on every visit). */
const PLATE_SEED = 7;
/** Plate thickness per unit of width: the hero's (34 raster units on a 462-unit arch). */
const PLATE_THICKNESS = 34 / 462;
/** Points per radian on the plate's arcs. */
const PLATE_ARC_STEPS = 6;
/**
 * Plate shading (shaders.ts plateVertex): faces print full ink facing the viewer, `faceEdge`
 * edge-on, `faceTop` at the top; walls `wallMin`–`wallMax` by how they face the light. Keep
 * wallMax ≤ faceEdge × faceTop, so the faces always hold the strongest ink.
 */
const PLATE_SHADE = { faceEdge: 0.8, faceTop: 0.92, wallMin: 0.34, wallMax: 0.7 };
/** Light direction for the walls (upper left, in front). */
const PLATE_LIGHT: Rgb = [-0.45, 0.7, 0.55];
/** Far plates print lighter: full ink to depth `from`, `floor` of it from `to` on. */
const PLATE_FOG = { from: 1.3, to: 2.6, floor: 0.55 };
/**
 * Fine pointers: plates within `radius` (share of the smaller viewport side, plus the plate's
 * half width) lean towards or turn away from the pointer by up to `turn` rad, on springs.
 */
const PLATE_POINTER = { radius: 0.3, turn: 0.45, stiffness: 36, damping: 7.5 };
/** The field leans with the pointer: shift (px at depth 1, more for near plates) and turn (rad). */
const FIELD_LEAN = { shift: 26, turn: 0.18 };
/**
 * Scroll speed: how fast the measured speed follows (per second), lean per px/s (rad, capped),
 * and spin per px scrolled (rad).
 */
const SCROLL_KICK = { follow: 5, lean: 0.00018, leanMax: 0.42, spin: 0.0005 };
/** A plate that reappears out of turn prints back in at this rate, per second. */
const PRESENCE_RATE = 2.5;
/**
 * Registration: every `every` + up to `jitter` s (the first after `first` s), two or three plates
 * in the middle of the view (`inner` margin), of different inks and similar depth (`depthGap`),
 * within `reach` (share of the smaller side), and not the nearest ones (`minDepth`), drift into
 * register (`in` s), hold (`hold`) and part (`out`). Only while the scroll rests (`calm` px/s);
 * a fast scroll (`abort` px/s) parts them at `release` per second.
 */
const REGISTER = {
  every: 15,
  jitter: 7,
  first: 6,
  in: 2.8,
  hold: 2.4,
  out: 2.8,
  inner: 0.14,
  depthGap: 0.7,
  reach: 0.42,
  minDepth: 0.85,
  calm: 60,
  abort: 500,
  release: 3,
};
/**
 * Hero hand-over (home): the art box, the scroll (share of the viewport height) over which the
 * four plates scatter once the hero's plates are gone, and, without the live hero scene, the
 * share of that scatter over which they print in beside its static mark.
 */
const HANDOFF = { selector: '[data-hero-art]', scatter: 0.9, staticFade: 0.3, done: 0.999 };
/** Where each of the mark's plates goes: offset (share of the viewport), depth, growth. */
const TRAVEL: Record<Plate, Travel> = {
  c: { x: -0.3, y: -0.12, depth: 0.72, grow: 1.35 },
  m: { x: -0.06, y: 0.3, depth: 1.6, grow: 0.95 },
  y: { x: 0.16, y: -0.28, depth: 1.15, grow: 1.1 },
  k: { x: 0.34, y: 0.18, depth: 2.2, grow: 1 },
};

// --- Frame budget -------------------------------------------------------------------------------

/** Frame rate while only the ambient waves and plates move. */
const AMBIENT_FPS = 30;
/** Drawing buffer limits. */
const MAX_DPR = 1.5;
const MAX_PIXELS = 2_400_000;
/** Reduced motion: the wave and plate phase of the single static frame, seconds. */
const STATIC_TIME = 14;
const RESIZE_DEBOUNCE = 150;
/** Start-up: instance slots written per task. */
const SLOT_BATCH = 2048;

// ================================================================================================

/** Instances the plate buffer holds: the largest pool plus the hero's four. */
const PLATE_CAPACITY = poolSize(PLATE_BUDGET.desktop, PLATE_BUDGET) + ARCH_PLATES.length;
/** Floats per plate instance: three model rows and the style (ink, alpha, 0, 0). */
const PLATE_STRIDE = 16;

export interface LivingBackground {
  /** Inserts the canvas, draws the first frame and starts the loop. False if it cannot run. */
  start(): boolean;
  /** The accent of the section at the viewport centre (null: the balanced mix). */
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

interface Metrics {
  width: number;
  height: number;
  grid: Grid;
  /** Camera distance of the screen plane (one world unit = one CSS px there). */
  distance: number;
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
  draw(indexCount: number, instances: number): void;
}

const isWebGL2 = (gl: GL): gl is WebGL2RenderingContext =>
  typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;

const instancingFor = (gl: GL): Instancing => {
  if (isWebGL2(gl)) {
    return {
      divisor: (location, divisor) => gl.vertexAttribDivisor(location, divisor),
      draw: (count, instances) =>
        gl.drawElementsInstanced(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0, instances),
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

/** MIN and MAX blend equations, if this context has them (core in WebGL 2, EXT_blend_minmax). */
const minMaxEquations = (gl: GL): { min: number; max: number } | null => {
  if (isWebGL2(gl)) return { min: gl.MIN, max: gl.MAX };
  const ext = gl.getExtension('EXT_blend_minmax');
  return ext ? { min: ext.MIN_EXT, max: ext.MAX_EXT } : null;
};

/** Attribute locations, bound before linking. 0 is never instanced in either program. */
const FIELD_ATTRIBUTES = ['position', 'slot'] as const;
const PLATE_ATTRIBUTES = [
  'position',
  'normal',
  'wall',
  'iRow0',
  'iRow1',
  'iRow2',
  'iStyle',
] as const;
const ATTRIBUTE_COUNT = PLATE_ATTRIBUTES.length;

const TEXT_UNIFORMS = ['uText', 'uTextCount', 'uFeather', 'uTextAll'] as const;

const FIELD_UNIFORMS = [
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
  'uCeil',
  'uViewport',
  'uReach',
  'uResolution',
  'uVignette',
  'uFog',
  'uBase',
  'uDark',
  ...TEXT_UNIFORMS,
] as const;

const PLATE_UNIFORMS = [
  'projectionMatrix',
  'uKey',
  'uCyan',
  'uMagenta',
  'uYellow',
  'uCap',
  'uCeil',
  'uLight',
  'uShade',
  'uYellowFloor',
  'uHalfHeight',
  'uBase',
  'uDark',
  ...TEXT_UNIFORMS,
] as const;

type FieldUniform = (typeof FIELD_UNIFORMS)[number];
type PlateUniform = (typeof PLATE_UNIFORMS)[number];
/** The palette's uniforms, the same in both programs. */
type InkUniform = 'uKey' | 'uCyan' | 'uMagenta' | 'uYellow' | 'uCap' | 'uCeil' | 'uBase' | 'uDark';

interface Program<U extends string> {
  program: WebGLProgram;
  loc: Record<U, WebGLUniformLocation | null>;
}

/**
 * Compiles and links a program without blocking: the calls only queue the work, and with
 * KHR_parallel_shader_compile the link is polled once per frame until it has finished. Without
 * the extension, the status read below waits for the driver, but in a task of its own.
 */
const linkProgram = async (
  gl: GL,
  sources: { vertex: string; fragment: string },
  attributes: readonly string[],
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
  attributes.forEach((name, location) => gl.bindAttribLocation(program, location, name));
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

const locate = <U extends string>(
  gl: GL,
  program: WebGLProgram,
  names: readonly U[],
): Program<U> => {
  const loc = {} as Record<U, WebGLUniformLocation | null>;
  names.forEach((name) => {
    loc[name] = gl.getUniformLocation(program, name);
  });
  return { program, loc };
};

/** Paper, inks, blend and the ink alphas of a theme. */
interface Palette {
  theme: Theme;
  blend: GlyphBlend;
  paper: Rgb;
  inks: Record<Plate, Rgb>;
  /** Inside text: contrast-safe for this paper, text and blend. */
  caps: InkCaps;
  /** Away from text. */
  glyph: InkCaps;
  plate: InkCaps;
  /** Least shade of yellow plates (shaders.ts uYellowFloor). */
  yellowFloor: number;
}

/**
 * Reads the theme's colours from the tokens on <html> (they switch with `data-theme`, without a
 * transition) and computes the caps. The paper decides how the inks print: dark paper takes the
 * light-on-dark blend whatever the theme says, so the caps always match what is on screen.
 */
const readPalette = (requested: Theme, minMax: boolean): Palette => {
  const style = getComputedStyle(document.documentElement);
  const fallback = THEME_FALLBACK[requested];
  const token = (name: string, hex: string): Rgb =>
    parseCssColor(style.getPropertyValue(name)) ?? hexToRgb(hex);
  const paper =
    parseCssColor(style.getPropertyValue('--color-paper')) ??
    parseCssColor(style.backgroundColor) ??
    hexToRgb(fallback.paper);
  const theme: Theme = relativeLuminance(paper) < DARK_PAPER ? 'dark' : 'light';
  const inks: Record<Plate, Rgb> = {
    k: token('--color-key', fallback.key),
    c: token('--color-cyan', INKS.c),
    m: token('--color-magenta', INKS.m),
    y: theme === 'dark' ? hexToRgb(DARK_YELLOW.ink) : token('--color-yellow', INKS.y),
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
    caps: inkCaps(paper, inks, texts, ceilings.caps, MIN_CONTRAST, MAX_TINT, blend),
    glyph: ceilings.glyph,
    plate: ceilings.plate,
    yellowFloor: theme === 'dark' ? DARK_YELLOW.yellowFloor : 0,
  };
};

/** Device hints for the glyph density and the plate count (math.ts densityFactor). */
const deviceHints = (width: number): DeviceHints => {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    cores: navigator.hardwareConcurrency || undefined,
    memory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined,
    coarse: matchMedia('(pointer: coarse)').matches,
    width,
  };
};

/** The arch plate: extruded, one unit wide, centred, interleaved (position, normal, wall). */
interface PlateGeometry {
  vertices: Float32Array;
  index: Uint16Array;
  halfHeight: number;
  /** The arch's bounding box in raster units (for the hero's mark). */
  arch: ArchBox;
}

const plateGeometry = (): PlateGeometry => {
  const outline = sampleOutline(ARCH, PLATE_ARC_STEPS);
  const b = boundsOf(outline);
  const width = b.maxX - b.minX;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const solid = extrude(toLocal(outline, cx, cy, 1 / width), PLATE_THICKNESS);
  const count = solid.wall.length;
  const vertices = new Float32Array(count * 7);
  for (let i = 0; i < count; i++) {
    vertices[i * 7] = solid.position[i * 3] ?? 0;
    vertices[i * 7 + 1] = solid.position[i * 3 + 1] ?? 0;
    vertices[i * 7 + 2] = solid.position[i * 3 + 2] ?? 0;
    vertices[i * 7 + 3] = solid.normal[i * 3] ?? 0;
    vertices[i * 7 + 4] = solid.normal[i * 3 + 1] ?? 0;
    vertices[i * 7 + 5] = solid.normal[i * 3 + 2] ?? 1;
    vertices[i * 7 + 6] = solid.wall[i] ?? 0;
  }
  return {
    vertices,
    index: solid.index,
    halfHeight: (b.maxY - b.minY) / 2 / width,
    arch: { cx, cy, width },
  };
};

interface Buffers {
  glyph: WebGLBuffer;
  slots: WebGLBuffer;
  glyphIndex: WebGLBuffer;
  plate: WebGLBuffer;
  plateIndex: WebGLBuffer;
  instances: WebGLBuffer;
}

interface Prepared {
  instancing: Instancing;
  equations: { min: number; max: number } | null;
  field: Program<FieldUniform>;
  plates: Program<PlateUniform>;
  buffers: Buffers;
  glyphIndexCount: number;
  plateIndexCount: number;
  geometry: PlateGeometry;
  palette: Palette;
  slots: number;
  text: TextLayout | null;
  heroArt: Rect | null;
}

const measureLayout = (): { text: TextLayout; heroArt: Rect | null } => ({
  text: measureTextLayout(TEXT),
  heroArt: measureHeroArt(HANDOFF.selector),
});

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
    // 1. Queue both shader compiles first: the GPU works on them while the steps below run. The
    //    text rectangle arrays are sized to what the GPU's uniform limits leave.
    if (gl.getParameter(gl.MAX_VERTEX_ATTRIBS) < ATTRIBUTE_COUNT) {
      throw new Error('Too few vertex attributes for the plates');
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
    const linkingField = linkProgram(
      gl,
      { vertex: define + fieldVertex, fragment: define + fieldFragment },
      FIELD_ATTRIBUTES,
      check,
    );
    const linkingPlates = linkProgram(
      gl,
      { vertex: define + plateVertex, fragment: define + plateFragment },
      PLATE_ATTRIBUTES,
      check,
    );
    // A rejection is handled where it is awaited (step 9); keep it from being reported early.
    linkingField.catch(() => undefined);
    linkingPlates.catch(() => undefined);
    await step();

    // 2. Colours, blend and contrast caps for the current theme.
    const equations = minMaxEquations(gl);
    const palette = readPalette(options.theme, equations !== null);
    await step();

    // 3. The glyph: one arch, one unit wide, centred.
    const glyph = glyphShape(ARCH, GLYPH_ARC_STEPS);
    await step();

    // 4. Instance slots, in batches.
    const slotData = new Float32Array(GRID.maxInstances);
    for (let from = 0; from < slotData.length; from += SLOT_BATCH) {
      const to = Math.min(slotData.length, from + SLOT_BATCH);
      for (let i = from; i < to; i++) slotData[i] = i;
      await step();
    }

    // 5. The plate: the arch extruded once.
    const geometry = plateGeometry();
    await step();

    // 6. Buffers (attribute pointers are set per draw: two programs share the attributes).
    const instancing = instancingFor(gl);
    const upload = (
      target: number,
      data: Float32Array | Uint16Array,
      usage: number = gl.STATIC_DRAW,
    ): WebGLBuffer => {
      const buffer = gl.createBuffer();
      if (!buffer) throw new Error('WebGL buffer could not be created');
      gl.bindBuffer(target, buffer);
      gl.bufferData(target, data, usage);
      return buffer;
    };
    const buffers: Buffers = {
      glyph: upload(gl.ARRAY_BUFFER, glyph.position),
      slots: upload(gl.ARRAY_BUFFER, slotData),
      glyphIndex: upload(gl.ELEMENT_ARRAY_BUFFER, glyph.index),
      plate: upload(gl.ARRAY_BUFFER, geometry.vertices),
      plateIndex: upload(gl.ELEMENT_ARRAY_BUFFER, geometry.index),
      instances: upload(
        gl.ARRAY_BUFFER,
        new Float32Array(PLATE_CAPACITY * PLATE_STRIDE),
        gl.DYNAMIC_DRAW,
      ),
    };
    await step();

    // 7. Where the text and the hero's art box are (a layout read, in a task of its own). If it
    //    fails, the ink stays at the caps everywhere until the next measurement.
    let layout: { text: TextLayout | null; heroArt: Rect | null } = { text: null, heroArt: null };
    try {
      layout = measureLayout();
    } catch {
      // Keep the caps everywhere.
    }
    await step();

    // 8. The programs, once the GPU has linked them; uniform locations and fixed uniforms.
    const field = locate(gl, await linkingField, FIELD_UNIFORMS);
    check();
    const plates = locate(gl, await linkingPlates, PLATE_UNIFORMS);
    check();
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.enable(gl.BLEND);

    gl.useProgram(field.program);
    gl.uniform1f(field.loc.uFocus, SWELL.focus);
    gl.uniform3f(field.loc.uSize, SIZE.base, SIZE.wave, SIZE.swell);
    gl.uniform2f(field.loc.uLift, LIFT.wave, LIFT.swell);
    gl.uniform3f(field.loc.uInkAmt, INK.base, INK.wave, INK.swell);
    gl.uniform1f(field.loc.uReach, GLYPH_REACH);
    gl.uniform4f(
      field.loc.uVignette,
      VIGNETTE.inner,
      VIGNETTE.outer,
      VIGNETTE.calm,
      VIGNETTE.calmRadius,
    );

    gl.useProgram(plates.program);
    const light = Math.hypot(...PLATE_LIGHT) || 1;
    gl.uniform3f(
      plates.loc.uLight,
      PLATE_LIGHT[0] / light,
      PLATE_LIGHT[1] / light,
      PLATE_LIGHT[2] / light,
    );
    gl.uniform4f(
      plates.loc.uShade,
      PLATE_SHADE.faceEdge,
      PLATE_SHADE.faceTop,
      PLATE_SHADE.wallMin,
      PLATE_SHADE.wallMax,
    );
    gl.uniform1f(plates.loc.uHalfHeight, geometry.halfHeight);
    await step();

    canvas.removeEventListener('webglcontextlost', onLostEarly);
    return assemble(host, context, options, {
      instancing,
      equations,
      field,
      plates,
      buffers,
      glyphIndexCount: glyph.index.length,
      plateIndexCount: geometry.index.length,
      geometry,
      palette,
      slots,
      text: layout.text,
      heroArt: layout.heroArt,
    });
  } catch (error) {
    canvas.removeEventListener('webglcontextlost', onLostEarly);
    throw error;
  }
};

/** Per-plate state that is not a function of scroll and time. */
interface PlateState {
  specs: PlateSpec[];
  /** The hero's four, in ARCH_PLATES order (home only). */
  travellers: PlateSpec[];
  /** Pointer springs: rx position, rx velocity, ry position, ry velocity per plate. */
  springs: Float32Array;
  /** Spin gathered from the scroll (rad). */
  spin: Float32Array;
  /** 0–1: prints back in after reappearing out of turn. */
  presence: Float32Array;
}

interface RegisterEvent {
  members: number[];
  /** The pass each member is held on while it registers (plates.ts freePose). */
  cycles: number[];
  start: number;
  weight: number;
  release: boolean;
}

/** Where the hero's four plates are this frame. */
interface Handoff {
  mark: MarkPlacement;
  /** Scroll (px) since they started to scatter, and how far they have (0–1). */
  since: number;
  t: number;
  alpha: number;
}

/** The running scene: sizing, the draw loop and the events, on prepared GPU state. */
const assemble = (
  host: HTMLElement,
  { canvas, gl }: GLContext,
  options: LivingBackgroundOptions,
  prepared: Prepared,
): LivingBackground => {
  const { instancing, equations, field, plates, buffers, geometry, slots } = prepared;
  let palette = prepared.palette;
  /** The theme last asked for (the palette follows the paper it finds). */
  let themeNow = options.theme;
  let text = prepared.text;
  let heroArt = prepared.heroArt;
  const projection = new Float32Array(16);
  const modelView = new Float32Array(16);
  const instanceData = new Float32Array(PLATE_CAPACITY * PLATE_STRIDE);
  const textData = new Float32Array(Math.max(1, slots) * 4);
  let instances = 0;
  let plateCount = 0;
  let textCount = 0;
  let textAll = 1;

  // ----------------------------------------------------------------------------------------------
  // GL state per program (WebGL 1 has no vertex array objects: the pointers are set per draw)
  // ----------------------------------------------------------------------------------------------

  const bindField = (): void => {
    gl.useProgram(field.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.glyph);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    instancing.divisor(0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.slots);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
    instancing.divisor(1, 1);
    for (let a = 2; a < ATTRIBUTE_COUNT; a++) {
      gl.disableVertexAttribArray(a);
      instancing.divisor(a, 0);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.glyphIndex);
  };

  const bindPlates = (): void => {
    gl.useProgram(plates.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.plate);
    [3, 3, 1].forEach((size, a) => {
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, size, gl.FLOAT, false, 28, a * 12);
      instancing.divisor(a, 0);
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.instances);
    for (let r = 0; r < 4; r++) {
      gl.enableVertexAttribArray(3 + r);
      gl.vertexAttribPointer(3 + r, 4, gl.FLOAT, false, PLATE_STRIDE * 4, r * 16);
      instancing.divisor(3 + r, 1);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.plateIndex);
  };

  /** Paper, inks, ceilings, caps and blend of the palette, on both programs. */
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
    const dark = isDarkBlend(p.blend) ? 1 : 0;
    const set = (loc: Record<InkUniform, WebGLUniformLocation | null>, ceiling: InkCaps): void => {
      gl.uniform3f(loc.uKey, p.inks.k[0], p.inks.k[1], p.inks.k[2]);
      gl.uniform3f(loc.uCyan, p.inks.c[0], p.inks.c[1], p.inks.c[2]);
      gl.uniform3f(loc.uMagenta, p.inks.m[0], p.inks.m[1], p.inks.m[2]);
      gl.uniform3f(loc.uYellow, p.inks.y[0], p.inks.y[1], p.inks.y[2]);
      gl.uniform4f(loc.uCap, p.caps.k, p.caps.c, p.caps.m, p.caps.y);
      gl.uniform4f(loc.uCeil, ceiling.k, ceiling.c, ceiling.m, ceiling.y);
      gl.uniform3f(loc.uBase, base[0], base[1], base[2]);
      gl.uniform1f(loc.uDark, dark);
    };
    gl.useProgram(field.program);
    set(field.loc, p.glyph);
    gl.useProgram(plates.program);
    set(plates.loc, p.plate);
    gl.uniform1f(plates.loc.uYellowFloor, p.yellowFloor);
  };
  applyPalette(palette);

  // ----------------------------------------------------------------------------------------------
  // Measurements (start and resize). The host is fixed and 100lvh tall, so mobile toolbars
  // showing or hiding do not resize it (a resize clears the drawing buffer).
  // ----------------------------------------------------------------------------------------------

  let m: Metrics | null = null;
  let bufferWidth = 0;
  let bufferHeight = 0;
  let view: PlateView = { width: 1, height: 1, unit: 1 };
  const state: PlateState = {
    specs: [],
    travellers: [],
    springs: new Float32Array(PLATE_CAPACITY * 4),
    spin: new Float32Array(PLATE_CAPACITY),
    presence: new Float32Array(PLATE_CAPACITY).fill(1),
  };
  let registering: RegisterEvent | null = null;
  let nextRegister = REGISTER.first;
  // The hero's four: their own turning and drift, inks in the logo's order.
  state.travellers = plateSpecs(ARCH_PLATES.length, PLATES, PLATE_SEED + 1).map((spec, j) => ({
    ...spec,
    ink: ARCH_PLATES[j]?.id ?? spec.ink,
  }));

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
    const hints = deviceHints(width);
    const grid = gridFor(frame, width, GRID, densityFactor(hints));
    perspectiveMatrix(projection, FOV, width / height, frame.distance * 0.05, frame.distance * 8);
    // gridFor keeps the count under the cap; never draw past the instance buffer regardless.
    instances = Math.min(grid.count, GRID.maxInstances);

    // The plate pool for this viewport (the same composition for the same size).
    const pool = Math.min(
      PLATE_CAPACITY - ARCH_PLATES.length,
      poolSize(visiblePlates(hints, PLATE_BUDGET), PLATE_BUDGET),
    );
    if (pool !== state.specs.length) {
      state.specs = plateSpecs(pool, PLATES, PLATE_SEED);
      state.springs.fill(0);
      state.spin.fill(0);
      state.presence.fill(1);
      registering = null;
    }
    view = { width, height, unit: viewUnit(width, height, PLATES) };

    gl.useProgram(field.program);
    gl.uniformMatrix4fv(field.loc.projectionMatrix, false, projection);
    gl.uniform2f(field.loc.uGrid, grid.cols, grid.rows);
    gl.uniform1f(field.loc.uRowStart, grid.rowStart);
    gl.uniform1f(field.loc.uPitch, grid.pitch);
    gl.uniform1f(field.loc.uAspect, width / height);
    gl.uniform2f(field.loc.uViewport, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform2f(field.loc.uResolution, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform3f(field.loc.uFog, frame.distance * FOG.near, frame.distance * FOG.far, FOG.floor);
    gl.useProgram(plates.program);
    gl.uniformMatrix4fv(plates.loc.projectionMatrix, false, projection);
    return { width, height, grid, distance: frame.distance };
  };

  // ----------------------------------------------------------------------------------------------
  // State
  // ----------------------------------------------------------------------------------------------

  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const rng = random(PLATE_SEED + 2);
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
  /** Scroll speed (px/s): damped for the plates' lean and spin, quicker for the text lead. */
  let speed = 0;
  let quickSpeed = 0;
  const pointer = { x: 0, y: 0, sx: 0, sy: 0, px: 0, py: 0, inside: false, amount: 0 };
  const lean = { x: 0, y: 0 };
  let mix: InkMix = BALANCED;
  let targetMix: InkMix = BALANCED;
  const applyMix = (current: InkMix): void => {
    const [c, cm] = inkThresholds(current);
    const [r, g, b] = tintColor(current, palette.inks.c, palette.inks.m, palette.inks.y);
    gl.uniform3f(field.loc.uMix, c, cm, current.share);
    gl.uniform3f(field.loc.uTint, r, g, b);
    gl.uniform1f(field.loc.uTintAmt, current.tint);
  };

  // ----------------------------------------------------------------------------------------------
  // Text-aware ink
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

  const uploadText = (
    loc: Record<(typeof TEXT_UNIFORMS)[number], WebGLUniformLocation | null>,
  ): void => {
    gl.uniform1f(loc.uTextCount, textCount);
    gl.uniform1f(loc.uTextAll, textAll);
    gl.uniform1f(loc.uFeather, TEXT.feather * (m ? gl.drawingBufferHeight / m.height : 1));
    if (textCount > 0 && loc.uText) gl.uniform4fv(loc.uText, textData.subarray(0, textCount * 4));
  };

  // ----------------------------------------------------------------------------------------------
  // Plates
  // ----------------------------------------------------------------------------------------------

  /** Where the hero's four plates are this frame, or null (no hero, or reduced motion). */
  const handoff = (scrollY: number): Handoff | null => {
    if (!heroArt || !m || reduce) return null;
    const artTop = heroArt.top - scrollY;
    const detail = latestHeroHandoff();
    if (detail?.live) {
      // The hero's mark relative to its art box when it was sent, then the art box now.
      const mark = {
        x: detail.mark.x - detail.rect.left + heroArt.left,
        y: detail.mark.y - detail.rect.top + artTop,
        scale: detail.mark.scale,
      };
      // The scroll at which the hero's plates are gone: from the hero's layout when it says
      // (stable across reloads and resizes), else from the art box when the last detail was sent.
      const end =
        detail.endScroll !== null && Number.isFinite(detail.endScroll) ? detail.endScroll : null;
      const done = detail.progress >= HANDOFF.done || (end !== null && scrollY >= end);
      if (!done) return { mark, since: 0, t: 0, alpha: clamp(1 - detail.ink) };
      // Scatter by the scroll since then, a function of the scroll position only.
      const since = Math.max(0, scrollY - (end ?? heroArt.top - detail.rect.top));
      return { mark, since, t: clamp(since / (HANDOFF.scatter * m.height)), alpha: 1 };
    }
    // No live hero scene: its static mark stays in the art box; print in beside it as they leave.
    const mark = markFromArt({
      left: heroArt.left,
      top: artTop,
      width: heroArt.right - heroArt.left,
      height: heroArt.bottom - heroArt.top,
    });
    const since = Math.max(0, scrollY);
    const t = clamp(since / (HANDOFF.scatter * m.height));
    return { mark, since, t, alpha: smoothstep(0, HANDOFF.staticFade, t) };
  };

  /** Starts, runs and ends the registration events (live only). */
  const updateRegister = (scrollY: number, dt: number): PlatePose | null => {
    if (!registering && clock >= nextRegister) {
      nextRegister = clock + REGISTER.every + REGISTER.jitter * rng();
      if (Math.abs(speed) < REGISTER.calm) {
        const inner = REGISTER.inner;
        const candidates = state.specs
          .map((spec, index) => ({
            spec,
            index,
            pose: freePose(spec, scrollY, clock, view, PLATES),
          }))
          .filter(
            ({ spec, index, pose }) =>
              spec.depth >= REGISTER.minDepth &&
              (state.presence[index] ?? 0) > 0.99 &&
              pose.x > view.width * inner &&
              pose.x < view.width * (1 - inner) &&
              pose.y > view.height * inner &&
              pose.y < view.height * (1 - inner),
          )
          .map(({ spec, index, pose }) => ({
            index,
            ink: spec.ink,
            x: pose.x,
            y: pose.y,
            depth: spec.depth,
          }));
        const members = pickRegisterGroup(
          candidates,
          { x: view.width / 2, y: view.height / 2 },
          rng() < 0.5 ? 2 : 3,
          REGISTER.depthGap,
          REGISTER.reach * Math.min(view.width, view.height),
        );
        if (members) {
          registering = {
            members,
            cycles: members.map((i) => {
              const spec = state.specs[i];
              return spec ? plateCycle(spec, scrollY, view, PLATES) : 0;
            }),
            start: clock,
            weight: 0,
            release: false,
          };
        }
      }
    }
    const event = registering;
    if (!event) return null;
    const elapsed = clock - event.start;
    if (!event.release && Math.abs(speed) > REGISTER.abort) event.release = true;
    event.weight = event.release
      ? damp(event.weight, 0, REGISTER.release, dt)
      : registerEnvelope(elapsed, REGISTER);
    const over = event.release
      ? event.weight < 0.004
      : elapsed >= REGISTER.in + REGISTER.hold + REGISTER.out;
    if (over) {
      // Back on their loops: a plate whose own pass moved on meanwhile prints back in there.
      event.members.forEach((i, j) => {
        const spec = state.specs[i];
        if (spec && plateCycle(spec, scrollY, view, PLATES) !== event.cycles[j]) {
          state.presence[i] = 0;
        }
      });
      registering = null;
      return null;
    }
    return registerTarget(
      event.members.map((i, j) => {
        const spec = state.specs[i];
        return spec
          ? freePose(spec, scrollY, clock, view, PLATES, event.cycles[j])
          : { x: 0, y: 0, width: 0, depth: 1, rx: 0, ry: 0, rz: 0 };
      }),
    );
  };

  /**
   * Every plate's pose this frame, written as instance data (plates out of view are skipped).
   * `live` adds what follows the visitor (scroll speed, pointer, registration, the hero's four);
   * the static frame has none of it.
   */
  const updatePlates = (scrollY: number, dt: number, live: boolean): void => {
    if (!m) return;
    const metrics = m;
    plateCount = 0;
    const fine = live && finePointer.matches && pointer.inside;
    const kick = live
      ? clamp(-speed * SCROLL_KICK.lean, -SCROLL_KICK.leanMax, SCROLL_KICK.leanMax)
      : 0;
    const reach = PLATE_POINTER.radius * Math.min(view.width, view.height);

    const write = (
      i: number,
      spec: PlateSpec,
      input: PlatePose,
      motion: number,
      alpha: number,
    ): void => {
      const pose = { ...input };
      // The field leans with the pointer (near plates shift more).
      pose.x += (motion * lean.x * FIELD_LEAN.shift) / pose.depth;
      pose.y -= (motion * lean.y * FIELD_LEAN.shift) / pose.depth;
      pose.ry += motion * lean.x * FIELD_LEAN.turn;
      pose.rx -= motion * lean.y * FIELD_LEAN.turn;
      // The scroll speed: a lean, and the spin it gathered.
      if (live) state.spin[i] = (state.spin[i] ?? 0) + speed * dt * SCROLL_KICK.spin * spec.turn;
      pose.rx += motion * kick;
      pose.ry += motion * (state.spin[i] ?? 0);
      // Pointer springs: lean towards (or turn away from) a pointer nearby.
      const s = i * 4;
      let tx = 0;
      let ty = 0;
      if (fine) {
        const radius = reach + pose.width / 2;
        const dx = pointer.px - pose.x;
        const dy = pointer.py - pose.y;
        const f = pointerInfluence(dx, dy, radius) * PLATE_POINTER.turn * spec.turn;
        tx = clamp(dy / radius, -1, 1) * f;
        ty = clamp(dx / radius, -1, 1) * f;
      }
      if (live) {
        const { stiffness, damping } = PLATE_POINTER;
        const [ax, av] = springStep(
          state.springs[s] ?? 0,
          state.springs[s + 1] ?? 0,
          tx,
          stiffness,
          damping,
          dt,
        );
        const [bx, bv] = springStep(
          state.springs[s + 2] ?? 0,
          state.springs[s + 3] ?? 0,
          ty,
          stiffness,
          damping,
          dt,
        );
        state.springs[s] = ax;
        state.springs[s + 1] = av;
        state.springs[s + 2] = bx;
        state.springs[s + 3] = bv;
        state.presence[i] = damp(state.presence[i] ?? 1, 1, PRESENCE_RATE, dt);
      }
      pose.rx += motion * (state.springs[s] ?? 0);
      pose.ry += motion * (state.springs[s + 2] ?? 0);

      const a = alpha * (state.presence[i] ?? 1);
      const extent = pose.width * 0.6;
      if (
        a <= 0.002 ||
        plateCount >= PLATE_CAPACITY ||
        pose.x < -extent ||
        pose.x > metrics.width + extent ||
        pose.y < -extent ||
        pose.y > metrics.height + extent
      ) {
        return;
      }
      const [x, y, z] = toWorld(
        pose.x,
        pose.y,
        pose.depth,
        metrics.width,
        metrics.height,
        metrics.distance,
      );
      const o = plateCount * PLATE_STRIDE;
      plateRows(instanceData, o, pose.rx, pose.ry, pose.rz, pose.width * pose.depth, x, y, z);
      instanceData[o + 12] = INK_INDEX[spec.ink];
      instanceData[o + 13] = clamp(a);
      instanceData[o + 14] = 0;
      instanceData[o + 15] = 0;
      plateCount++;
    };

    const target = live ? updateRegister(scrollY, dt) : null;
    const event = registering;
    state.specs.forEach((spec, i) => {
      const member = target && event ? event.members.indexOf(i) : -1;
      const free = freePose(
        spec,
        scrollY,
        clock,
        view,
        PLATES,
        member >= 0 ? event?.cycles[member] : undefined,
      );
      const pose = target && member >= 0 && event ? blendPose(free, target, event.weight) : free;
      write(i, spec, pose, 1, depthFade(pose.depth, PLATE_FOG));
    });

    const hand = live ? handoff(scrollY) : null;
    if (hand) {
      const pool = state.specs.length;
      markSlots(geometry.arch, ARCH_PLATES, hand.mark).forEach((slot, j) => {
        const spec = state.travellers[j];
        if (!spec) return;
        const pose = travellerPose(slot, spec, TRAVEL[spec.ink], hand.t, hand.since, clock, view);
        const e = smoothstep(0, 1, hand.t);
        write(pool + j, spec, pose, e, hand.alpha * lerp(1, depthFade(pose.depth, PLATE_FOG), e));
      });
    }
  };

  // ----------------------------------------------------------------------------------------------
  // Drawing
  // ----------------------------------------------------------------------------------------------

  const draw = (shift: number, scrollY: number): void => {
    if (!m) return;
    prepareText(scrollY);

    bindField();
    gl.uniform1f(field.loc.uShift, shift);
    gl.uniform1f(field.loc.uTime, clock);
    gl.uniform2f(field.loc.uPointer, pointer.sx, pointer.sy);
    gl.uniform1f(field.loc.uPointerAmt, pointer.amount);
    sheetMatrix(modelView, TILT - lean.y * LEAN.x, lean.x * LEAN.y, -m.distance);
    gl.uniformMatrix4fv(field.loc.modelViewMatrix, false, modelView);
    applyMix(mix);
    uploadText(field.loc);

    gl.clear(gl.COLOR_BUFFER_BIT);
    instancing.draw(prepared.glyphIndexCount, instances);

    if (plateCount > 0) {
      bindPlates();
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceData.subarray(0, plateCount * PLATE_STRIDE));
      uploadText(plates.loc);
      // Each plate's own back faces are hidden (no depth buffer; the faces print the strongest).
      gl.enable(gl.CULL_FACE);
      instancing.draw(prepared.plateIndexCount, plateCount);
      gl.disable(gl.CULL_FACE);
    }
  };

  /**
   * Reduced motion: a fixed sheet, the plates placed (no drift, scroll or pointer), the balanced
   * mix, a pleasing phase, the caps everywhere.
   */
  const drawStatic = (): void => {
    clock = STATIC_TIME;
    pointer.amount = 0;
    lean.x = 0;
    lean.y = 0;
    speed = 0;
    quickSpeed = 0;
    mix = BALANCED;
    registering = null;
    state.springs.fill(0);
    state.spin.fill(0);
    state.presence.fill(1);
    updatePlates(0, 0, false);
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

    // Scroll, damped: the sheet lags a fast scroll a little and settles. The plates follow the
    // scroll exactly (their parallax is a function of it) and feel its speed.
    const scrollY = window.scrollY;
    follow = damp(follow, scrollY, SCROLL_LAG, dt);
    if (Math.abs(follow - scrollY) < 0.2) follow = scrollY;
    const raw = dt > 0 ? (scrollY - lastScroll) / dt : 0;
    lastScroll = scrollY;
    speed = damp(speed, raw, SCROLL_KICK.follow, dt);
    quickSpeed = damp(quickSpeed, raw, TEXT.speedFollow, dt);
    if (Math.abs(speed) < 0.5 && raw === 0) speed = 0;
    if (Math.abs(quickSpeed) < 0.5 && raw === 0) quickSpeed = 0;
    const scrolling = follow !== scrollY || raw !== 0 || speed !== 0;

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

    updatePlates(scrollY, dt, true);

    if (shouldDraw(now, lastDraw, scrolling || pointing || blending, AMBIENT_FPS)) {
      draw(dollyShift(follow, DOLLY, m.grid.pitch), scrollY);
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
    const scrollY = window.scrollY;
    updatePlates(scrollY, 0, true);
    draw(dollyShift(follow, DOLLY, m.grid.pitch), scrollY);
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
      const next = measureLayout();
      text = next.text;
      heroArt = next.heroArt;
    } catch {
      // Measurement failed: the caps everywhere until the next one.
      text = null;
    }
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
    [pointer.x, pointer.y] = toNdc(event.clientX, event.clientY, m.width, m.height);
    pointer.px = event.clientX;
    pointer.py = event.clientY;
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
    contentObserver.observe(document.querySelector('main') ?? document.body);
    if (document.readyState !== 'complete') {
      window.addEventListener('load', scheduleLayout, { once: true });
    }
    void document.fonts?.ready.then(scheduleLayout, () => undefined);

    // First frame now, so the canvas has content before it fades in over the paper.
    try {
      if (reduce) drawStatic();
      else {
        const scrollY = window.scrollY;
        updatePlates(scrollY, 0, true);
        draw(dollyShift(follow, DOLLY, metrics.grid.pitch), scrollY);
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
        lastScroll = follow;
        request();
      }
    } catch {
      lose();
    }
  };

  /** Swaps the palette (caps computed for the new paper and text) and draws it. */
  const applyTheme = (theme: Theme): void => {
    if (destroyed) return;
    try {
      palette = readPalette(theme, equations !== null);
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
      applyTheme(theme);
      return;
    }
    // Hide the canvas (a cut: transitions are off while html.theme-switching is set, and the
    // page's new paper shows), swap, and fade it back in.
    canvas.classList.add('is-theme-fade', 'is-switching');
    themeTimer = window.setTimeout(() => {
      applyTheme(theme);
      canvas.classList.remove('is-switching');
      themeTimer = window.setTimeout(
        () => canvas.classList.remove('is-theme-fade'),
        THEME_FADE.back,
      );
    }, THEME_FADE.out);
  };

  return { start, setAccent, setReducedMotion, setTheme, destroy };
};
