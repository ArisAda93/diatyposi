/**
 * Home hero scene: a press run. The four arches of the logo are extruded ink plates (OGL / WebGL)
 * above a sheet of paper, running the seamless loop of choreography.ts.
 *
 * - The loop (t = 0 is contact): the plates press onto the sheet, a ring of cyan and magenta
 *   halftone dots runs out across it from the mark with a short soft bloom, the plates hold as
 *   the crisp logo while one sheen of light crosses their faces, then lift off in reverse press
 *   order, leaving the logo printed on the sheet in halftone dots that fades. They float apart in
 *   depth, glide back into register one by one in press order (Y, M, C, K) and press again.
 *   Overlaps multiply like overprinting (see shaders.ts).
 * - The sheet (sheet.ts) lies in the plates' frame just under a plate at rest, so the group's tilt
 *   (choreography.ts tiltAt: the sheet's frame plus a slow camera drift) puts it in soft
 *   perspective; it spans the hero and bleeds off its right side. It carries a hairline edge,
 *   crop marks outside its corners, a small colour strip and, in light, a soft drop shadow; it
 *   fades out towards the copy on its left, and its fine details stay faint under the copy and the
 *   header band so the text reads. Each plate casts a soft arch-shaped shadow on it,
 *   offset further and softer the higher the plate floats (choreography.ts plateShadow).
 * - The group follows the pointer with damped rotation on fine pointers (and a depth parallax per
 *   plate) and drifts on its own on touch screens.
 * - Every pose fits the art box the hero lays out for it (choreography.ts ART, Hero.astro
 *   `.hero-art`), so no plate is cropped or reaches the copy; only the sheet spans the hero.
 * - Hand-off to the header logo as the hero scrolls out (scrubbed, nothing pinned; choreography.ts
 *   handoff): the plates first blend to the hold pose in register on the sheet from whatever pose
 *   they are in (the loop slows to a stop and its effects fade), collapse and flatten while the
 *   sheet fades, then shrink a little and fade out in the art column. Meanwhile the header logo's
 *   arches (always shown) pulse out of register and snap back (`--dock` 0–1 and `--dock-reg` on
 *   [data-header], styled in Hero.astro); `data-docked` is set once the plates are gone. The
 *   plates scroll with the page, held below the header band and, when the copy sits below the
 *   art, above the copy (math.ts guardY); the hand-off is short enough that they are gone before
 *   those limits meet (handoffDistance). Scrolling back reverses it, and the loop resumes once
 *   the hero is back at the top.
 * - Hand-over from the static SVG mark: the first frame draws the plates flat and in register at
 *   the SVG's exact position and size, without the sheet; the canvas fades in over it, then the
 *   group tilts into the sheet's frame as the sheet fades in, and the loop starts at contact.
 *   With the intro, the plates arrive from depth instead (print order Y, M, C, K) and land on the
 *   sheet; the loop starts at contact as they land, so the ripple runs out from their landing.
 *
 * Start-up runs in short steps that yield to the main thread (startup.ts): createHeroScene is
 * async, and the canvas is only shown (and faded in) by start(), after the first real frame.
 *
 * - Themes (theme.ts, sheet.ts sheetLook): in light the plates multiply on a white canvas
 *   composited with `mix-blend-mode: multiply`; in dark they screen on a black canvas composited
 *   with `mix-blend-mode: screen`, and the key plate, the sheet's lines and the plates' shadows (a
 *   faint glow in dark) take the light key colour. `dt:themechange` switches the blend state, the
 *   uniforms and the canvas's blend mode together and redraws at once, in the same task, without
 *   rebuilding anything.
 * - Hand-over to the site-wide floating plates (handoff-signal.ts): every frame in which the
 *   hand-off progress, the art box or the plates' place changed, the scene publishes them
 *   (`dt:hero-handoff` on document, and latestHeroHandoff()).
 *
 * The canvas scrolls with the hero and sits under the header (z-index), composited so that only
 * ink shows and the paper, the living background, the grain and the text stay as they are. One
 * draw loop; it stops when the hero is off-screen, once docked, and while the tab is hidden.
 */
import { Camera, Geometry, Mesh, Program, Renderer, Transform } from 'ogl';
import { ARCH, ARCH_PLATES } from '~/components/logo-paths';
import {
  PLATES,
  archMetrics,
  blendPose,
  blendTilt,
  buildLayout,
  effectsAt,
  handoff,
  holdPose,
  platePoseAt,
  plateShadow,
  poseBounds,
  printAlpha,
  registerPose,
  registrationPulse,
  restTilt,
  tiltAt,
  type PlateId,
  type PlateLayout,
  type PlatePose,
} from './choreography';
import { extrude, sampleOutline, toLocal } from './geometry';
import {
  clamp,
  damp,
  dockProgress,
  drawingDpr,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  guardY,
  handoffDistance,
  placeInBox,
  type Box,
  type Placement,
  type ViewBox,
} from './math';
import {
  depthFragment,
  plateFragment,
  plateShadowFragment,
  plateVertex,
  sheetFragment,
  sheetVertex,
} from './shaders';
import { latestHeroHandoff, publishHeroHandoff } from './handoff-signal';
import {
  SHEET_MASK,
  SHEET_RIPPLE,
  deviceRect,
  sheetLayout,
  sheetLook,
  type SheetLayout,
  type SheetLook,
} from './sheet';
import { precompile, yieldToMain } from './startup';
import { inkModel, keyInkFor, sceneThemeOf, type SceneTheme } from './theme';

export interface SceneElements {
  hero: HTMLElement;
  /** Parent of the canvas (fills the hero). */
  stage: HTMLElement;
  /** Wrapper of the static SVG mark; faded out while the canvas fades in. */
  markBox: HTMLElement;
  /** The static SVG mark: its box is the rest position and size of the plates. */
  mark: SVGSVGElement;
  /** The art box (`[data-hero-art]`), published for the hand-over (handoff-signal.ts). */
  art: HTMLElement | null;
  /**
   * Hero copy (headline, lead and actions): the sheet stays faint over its box; when it sits below
   * the art, the plates never reach it while they fade.
   */
  copy: HTMLElement | null;
  /**
   * Receives `--dock`, `--dock-reg`, `data-scene` and `data-docked`. Fixed: the sheet stays faint
   * under its band.
   */
  header: HTMLElement | null;
}

export interface HeroScene {
  /**
   * Inserts the canvas and starts drawing; `intro` plays the arrival from depth. Returns false
   * (and leaves the static composition) when the scene can no longer run, e.g. its WebGL
   * context was lost while it waited.
   */
  start(options: { intro: boolean }): boolean;
  /** Removes the canvas and restores the static composition. Safe to call twice. */
  destroy(): void;
}

// ------------------------------------------------------------------------------------------------
// Tuning (the poses and the loop itself are tuned in choreography.ts)
// ------------------------------------------------------------------------------------------------

/** Vertical field of view in degrees. Narrow, so the plates keep the logo's proportions. */
const FOV = 30;
/** Extrusion depth of each plate, in logo raster units. */
const THICKNESS = 34;
/** Extra group rotation at full pointer deflection (radians, about 4° and 6°). */
const POINTER_TILT = { x: 0.07, y: 0.1 };
/** Per-plate shift with the pointer, per raster unit of the plate's depth (depth parallax). */
const PARALLAX = { x: 0.12, y: 0.08 };
/** Canvas fade-in over the SVG mark, seconds. */
const FADE_IN = 0.6;
/**
 * Without the intro: delay and duration of the step from flat register (the SVG) into the press
 * run's frame: the group tilts into the sheet's perspective and the sheet fades in.
 */
const ALIVE = { delay: 0.2, duration: 1.8 };
/** Intro: stagger between plates, duration per plate, start depth (raster units). */
const INTRO = { stagger: 0.12, duration: 1.3, depth: 1900 };
const INTRO_TOTAL = INTRO.stagger * 3 + INTRO.duration;
/** Intro: where each plate starts out of register (raster units, radians). */
const INTRO_FROM: Record<PlateId, { x: number; y: number; rz: number }> = {
  c: { x: -170, y: 90, rz: -0.22 },
  m: { x: 150, y: 70, rz: 0.18 },
  y: { x: -120, y: -110, rz: 0.14 },
  k: { x: 160, y: -80, rz: -0.16 },
};
/** The sheet's plane: just under the back face of a plate whose pose z is 0 (raster units). */
const SHEET_Z = -(THICKNESS / 2) - 1;
/** Plate shadows and prints lie this far above the sheet (raster units), prints over shadows. */
const SHADOW_LIFT = 0.5;
const PRINT_LIFT = 1;
/** Depth scale of a plate flattened onto the sheet (a shadow or a print): flat, yet invertible. */
const FLAT = 0.001;
/**
 * Plate shadows are softened by drawing this many copies, each at 1/SOFT_TAPS of the strength,
 * spread evenly over a disc of radius choreography.ts plateShadow().softness: golden-angle steps
 * at radius √((i + ½) / n), so the copies blend into one soft edge instead of showing as rings.
 */
const SOFT_TAPS = 8;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const SOFT_DISC: readonly (readonly [number, number])[] = Array.from(
  { length: SOFT_TAPS },
  (_, i) => {
    const radius = Math.sqrt((i + 0.5) / SOFT_TAPS);
    const angle = i * GOLDEN_ANGLE;
    return [radius * Math.cos(angle), radius * Math.sin(angle)] as const;
  },
);
/**
 * Halftone print left on the sheet: dot pitch (CSS px; times the drawing DPR) and each plate's
 * screen angle (radians; the classic angles, so the four screens form rosettes, not moiré).
 */
const PRINT_PITCH = 5;
const SCREEN_ANGLE: Record<PlateId, number> = {
  c: (15 * Math.PI) / 180,
  m: (75 * Math.PI) / 180,
  y: 0,
  k: (45 * Math.PI) / 180,
};
/**
 * Sheen during the hold: half-width of the band as a share of the mark's on-screen width, and
 * its slant (horizontal shift per pixel of height; negative leans it like "/"). Its strength per
 * theme is sheet.ts `sheen`.
 */
const SHEEN = { width: 0.16, slant: -0.45 };
/** Below this, a layer is not drawn at all. */
const MIN_ALPHA = 0.002;
/**
 * Hand-off: gap kept below the header and above the copy (px), the mark's half-height with slack
 * for breathing, tilt and misregistration (raster units), and slack on the measured extent of the
 * plates for perspective and pointer tilt (share). The art box already keeps every pose clear of
 * both at rest; the guard only matters while the page moves.
 */
const HANDOFF_GAP = { band: 4, copy: 8 };
const MARK_EXTENT = 130;
const EXTENT_SLACK = 1.04;
/** Upper bound for drawing-buffer pixels (keeps 2560 px wide screens cheap). */
const MAX_PIXELS = 6_000_000;
const RESIZE_DEBOUNCE = 150;

const hexToRgb = (hex: string): Float32Array => {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return new Float32Array([((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]);
};

const hexOf = (id: PlateId): string => {
  const plate = ARCH_PLATES.find((p) => p.id === id);
  if (!plate) throw new Error(`No logo plate ${id}`);
  return plate.hex;
};

const viewBoxOf = (svg: SVGSVGElement): ViewBox | null => {
  const vb = svg.viewBox.baseVal;
  return vb && vb.width > 0 && vb.height > 0
    ? { x: vb.x, y: vb.y, width: vb.width, height: vb.height }
    : null;
};

interface Metrics {
  width: number;
  height: number;
  /** Hero top in document coordinates and left in the viewport. */
  heroTop: number;
  heroLeft: number;
  /** Plates at rest, in hero coordinates. */
  rest: Placement;
  /** The art box in hero coordinates (the mark's box if there is none). */
  art: Box;
  /** The header in viewport coordinates (it is fixed; the sheet stays faint under it). */
  headerBox: Box | null;
  /** Where the sheet lies (sheet.ts). */
  sheet: SheetLayout;
  /** Lowest edge the plates keep below (header bottom + gap), viewport px (the header is fixed). */
  bandBottom: number;
  /** Highest edge the plates keep above (copy top − gap) in hero coordinates; null beside it. */
  copyTop: number | null;
  /** Scroll distance of the hand-off. */
  distance: number;
}

/** Longest wait for the background shader links before building the programs anyway (ms). */
const PRECOMPILE_TIMEOUT = 3000;

/**
 * Builds the scene in short steps that yield to the main thread in between (startup.ts): outline
 * and layout, extrusion, background shader compile, one program per task, buffer upload, and a
 * warm-up draw, so no single task stays long on a slow phone and the first visible frame is cheap.
 * Rejects (the caller keeps the static composition) if the context is lost or a shader fails.
 */
export const createHeroScene = async (
  els: SceneElements,
  canvas: HTMLCanvasElement,
  onLost: () => void,
): Promise<HeroScene> => {
  const { hero, stage, markBox, mark, art, copy, header } = els;
  const root = document.documentElement;
  const markViewBox = viewBoxOf(mark);
  if (!markViewBox) throw new Error('Hero mark has no viewBox');
  // The group pivots on the centre of the mark.
  const centerX = markViewBox.x + markViewBox.width / 2;
  const centerY = markViewBox.y + markViewBox.height / 2;

  // The arch, measured and centred on its own anchor, so every plate turns about its middle.
  const archOutline = sampleOutline(ARCH, 9);
  const metrics = archMetrics(archOutline);
  const layout = buildLayout(metrics, ARCH_PLATES, { x: centerX, y: centerY });
  const plateOutline = toLocal(archOutline, metrics.anchor.x, metrics.anchor.y);

  await yieldToMain();
  // Plates: one extruded arch (triangulated), shared by the four meshes.
  const plateSolid = extrude(plateOutline, THICKNESS);

  await yieldToMain();
  const renderer = new Renderer({
    canvas,
    dpr: 1,
    alpha: false,
    antialias: true,
    depth: true,
    powerPreference: 'low-power',
  });
  const gl = renderer.gl;
  const ensureContext = (): void => {
    if (gl.isContextLost()) throw new Error('Hero scene lost its WebGL context while building');
  };
  const camera = new Camera(gl, { fov: FOV, near: 1, far: 10_000 });

  // Shaders: linked in the background where the browser can, then one OGL program per task.
  // Every program's sources are here (the plates and the prints share theirs).
  await precompile(
    gl,
    [
      { vertex: plateVertex, fragment: plateFragment },
      { vertex: plateVertex, fragment: depthFragment },
      { vertex: plateVertex, fragment: plateShadowFragment },
      { vertex: sheetVertex, fragment: sheetFragment },
    ],
    PRECOMPILE_TIMEOUT,
  );
  ensureContext();
  const linked = (program: Program): Program => {
    // OGL only warns when a shader fails; refuse the scene so the static composition stays.
    if (!gl.getProgramParameter(program.program, gl.LINK_STATUS)) {
      throw new Error('Hero scene shaders failed to link');
    }
    return program;
  };

  await yieldToMain();
  // The colour that leaves the page untouched (white in light, black in dark), shared by every
  // colour pass; set with the blend state by applyTheme.
  const paper = { value: new Float32Array(3) };
  // The plates print solid; the sheen (x: centre along the slant, y: slant, z: half-width, all
  // device px; w: strength) is set per frame during the hold.
  const sheen = new Float32Array([0, SHEEN.slant, 1, 0]);
  const plateUniforms = {
    uInk: { value: new Float32Array(3) },
    uPaper: paper,
    uAlpha: { value: 1 },
    uHalftone: { value: new Float32Array(2) },
    uSheen: { value: sheen },
  };
  const colorProgram = linked(
    new Program(gl, {
      vertex: plateVertex,
      fragment: plateFragment,
      uniforms: plateUniforms,
      depthTest: true,
      depthWrite: false,
      cullFace: gl.BACK,
    }),
  );

  await yieldToMain();
  const depthProgram = linked(
    new Program(gl, {
      vertex: plateVertex,
      fragment: depthFragment,
      depthTest: true,
      depthWrite: true,
      cullFace: gl.BACK,
    }),
  );

  await yieldToMain();
  // Key ink of the sheet's lines, the plates' shadows and the key plate: set by applyTheme.
  const keyInk = new Float32Array(3);
  const cyanInk = hexToRgb(hexOf('c'));
  // The sheet: geometry from sheet.ts (measure), strengths from the theme (applyTheme) and the
  // frame (tick, render). See shaders.ts sheetFragment for each uniform.
  const sheetUniforms = {
    uQuad: { value: new Float32Array(2) },
    uPaper: paper,
    uCyan: { value: cyanInk },
    uMagenta: { value: hexToRgb(hexOf('m')) },
    uYellow: { value: hexToRgb(hexOf('y')) },
    uKey: { value: keyInk },
    uBloomInk: { value: new Float32Array(3) },
    uGeom: { value: new Float32Array(4) },
    uLines: { value: new Float32Array(4) },
    uShadow: { value: new Float32Array(4) },
    uStrip: { value: new Float32Array(4) },
    uWave: { value: new Float32Array(4) },
    uLook: { value: new Float32Array(4) },
    uMix: { value: new Float32Array(4) },
    uCopyRect: { value: deviceRect(null, 0, 1) },
    uBandRect: { value: deviceRect(null, 0, 1) },
  };
  const sheetProgram = linked(
    new Program(gl, {
      vertex: sheetVertex,
      fragment: sheetFragment,
      uniforms: sheetUniforms,
      depthTest: false,
      depthWrite: false,
      cullFace: false,
    }),
  );

  await yieldToMain();
  // The plates' shadows: each plate flattened onto the sheet in key ink.
  const shadowUniforms = { uInk: { value: keyInk }, uPaper: paper, uAlpha: { value: 0 } };
  const shadowProgram = linked(
    new Program(gl, {
      vertex: plateVertex,
      fragment: plateShadowFragment,
      uniforms: shadowUniforms,
      depthTest: false,
      depthWrite: false,
      cullFace: gl.BACK,
    }),
  );

  await yieldToMain();
  // The halftone prints: each plate flattened in register on the sheet, in dots of its ink.
  const printUniforms = {
    uInk: { value: new Float32Array(3) },
    uPaper: paper,
    uAlpha: { value: 0 },
    uHalftone: { value: new Float32Array(2) },
    uSheen: { value: new Float32Array(4) },
  };
  const printProgram = linked(
    new Program(gl, {
      vertex: plateVertex,
      fragment: plateFragment,
      uniforms: printUniforms,
      depthTest: false,
      depthWrite: false,
      cullFace: gl.BACK,
    }),
  );

  // Buffers and meshes.
  await yieldToMain();
  ensureContext();
  const plateGeometry = new Geometry(gl, {
    position: { size: 3, data: plateSolid.position },
    normal: { size: 3, data: plateSolid.normal },
    wall: { size: 1, data: plateSolid.wall },
    index: { data: plateSolid.index },
  });
  const group = new Transform();
  const plates = layout.plates.map((plateLayout: PlateLayout) => {
    const mesh = new Mesh(gl, {
      geometry: plateGeometry,
      program: colorProgram,
      frustumCulled: false,
    });
    mesh.setParent(group);
    return {
      layout: plateLayout,
      ink: hexToRgb(hexOf(plateLayout.id)),
      mesh,
      /** In register on the sheet: where its print lies. */
      home: registerPose(plateLayout),
      /** Ink of the plate (intro and hand-off). */
      alpha: 1,
      /** Strength of the halftone print it leaves on the sheet (choreography.ts printAlpha). */
      print: 0,
    };
  });

  // One more plate mesh, drawn flattened onto the sheet for every shadow and print.
  const flat = new Mesh(gl, {
    geometry: plateGeometry,
    program: shadowProgram,
    frustumCulled: false,
  });
  flat.setParent(group);

  // The sheet: one quad (−0.5 to 0.5), placed and scaled by measure().
  const quadGeometry = new Geometry(gl, {
    position: { size: 2, data: new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]) },
    index: { data: new Uint16Array([0, 1, 2, 0, 2, 3]) },
  });
  const sheet = new Mesh(gl, {
    geometry: quadGeometry,
    program: sheetProgram,
    frustumCulled: false,
  });
  sheet.setParent(group);

  // ---------------------------------------------------------------------------------------------
  // Theme (theme.ts): blend state, neutral colour, key ink and the canvas's CSS blend mode.
  // ---------------------------------------------------------------------------------------------

  const keyPlate = plates.find((p) => p.layout.id === 'k');
  const colorPasses = [colorProgram, sheetProgram, shadowProgram, printProgram];
  let theme: SceneTheme = sceneThemeOf(root.dataset['theme']);
  /** Strengths of the sheet, the plates' shadows and the sheen in the current theme. */
  let look: SheetLook = sheetLook(theme);

  const applyTheme = (next: SceneTheme): void => {
    theme = next;
    const model = inkModel(next);
    paper.value.set(model.paper);
    gl.clearColor(model.paper[0], model.paper[1], model.paper[2], 1);
    for (const program of colorPasses) {
      program.setBlendFunc(gl[model.blend.src], gl[model.blend.dst]);
    }
    // Dark: the light key colour of the page (a style read, no layout); light: the logo's key.
    const key = keyInkFor(
      next,
      next === 'dark' ? getComputedStyle(root).getPropertyValue('--color-key') : null,
    );
    keyInk.set(key);
    keyPlate?.ink.set(key);
    // The sheet's theme strengths. Those that multiply a per-frame value (the bloom, the plates'
    // shadows, the sheen) are combined in render(), so a redraw right after a switch is right.
    look = sheetLook(next);
    const strengths = sheetUniforms.uLook.value;
    strengths[0] = look.face;
    strengths[1] = look.shadow;
    strengths[2] = look.lines;
    strengths[3] = look.strip;
    sheetUniforms.uMix.value[3] = look.dots;
    sheetUniforms.uBloomInk.value.set(look.bloomInk === 'cyan' ? cyanInk : keyInk);
    canvas.style.mixBlendMode = model.cssBlend;
  };
  applyTheme(theme);

  // ---------------------------------------------------------------------------------------------
  // Measurements (on start, on resize, when fonts settle). Reads only; no writes in between.
  // ---------------------------------------------------------------------------------------------

  let m: Metrics | null = null;

  /**
   * Places the sheet's quad (group units) and sets the sheet's geometry uniforms (on every
   * measure). The shader's lengths are in sheet units, group units divided by `place.unit`, so
   * they stay near 1 (shaders.ts sheetVertex).
   */
  const placeSheet = (place: SheetLayout): void => {
    const { marks } = place;
    const quadWidth = place.width + place.margin * 2;
    const quadHeight = place.height + place.margin * 2;
    sheet.position.set(place.x, place.y, SHEET_Z);
    sheet.scale.set(quadWidth, quadHeight, 1);
    const k = 1 / place.unit;
    const u = sheetUniforms;
    u.uQuad.value[0] = quadWidth * k;
    u.uQuad.value[1] = quadHeight * k;
    // The mark (the group's origin) relative to the sheet's centre.
    u.uGeom.value.set([(place.width / 2) * k, (place.height / 2) * k, -place.x * k, -place.y * k]);
    u.uLines.value.set([marks.line * k, marks.aa * k, marks.cropLength * k, marks.cropGap * k]);
    // Shadow offset down and to the right (y up in group space).
    u.uShadow.value.set([
      marks.shadowX * k,
      -marks.shadowY * k,
      marks.shadowBlur * k,
      marks.pitch * k,
    ]);
    u.uStrip.value.set([place.stripX * k, place.stripY * k, marks.patch * k, marks.patchGap * k]);
    u.uWave.value[1] = place.ringWidth * k;
    u.uWave.value[3] = SHEET_RIPPLE.bloomRadius * k;
  };

  const measure = (): Metrics => {
    const heroRect = hero.getBoundingClientRect();
    const markRect = mark.getBoundingClientRect();
    const artRect = art?.getBoundingClientRect();
    const headerRect = header?.getBoundingClientRect();
    const copyRect = copy?.getBoundingClientRect();
    const scrollY = window.scrollY;
    const width = Math.max(1, heroRect.width);
    const height = Math.max(1, heroRect.height);
    if (markRect.width === 0) throw new Error('Hero mark is not laid out');

    const rest = placeInBox(
      {
        left: markRect.left - heroRect.left,
        top: markRect.top - heroRect.top,
        width: markRect.width,
        height: markRect.height,
      },
      markViewBox,
      centerX,
      centerY,
    );
    const bandBottom = (headerRect ? Math.max(0, headerRect.bottom) : 0) + HANDOFF_GAP.band;
    // The copy counts only where it sits below the art (it shares the art's columns).
    const copyTop =
      copyRect &&
      copyRect.width > 0 &&
      copyRect.left < markRect.right &&
      copyRect.right > markRect.left &&
      copyRect.top >= markRect.bottom
        ? copyRect.top - heroRect.top - HANDOFF_GAP.copy
        : null;

    // Drawing buffer: DPR capped at 2 (1.5 on phones, landscape included) and at MAX_PIXELS.
    const dpr = drawingDpr(
      window.devicePixelRatio,
      width,
      height,
      Math.min(window.innerWidth, window.innerHeight),
      MAX_PIXELS,
    );
    // Resizing the drawing buffer clears it, so only do it when something actually changed.
    if (renderer.dpr !== dpr || renderer.width !== width || renderer.height !== height) {
      renderer.dpr = dpr;
      renderer.setSize(width, height);
      // Let CSS own the box so a pending resize never shows a gap.
      canvas.style.width = '100%';
      canvas.style.height = '100%';
    }

    // Camera distance at which 1 world unit on z = 0 is exactly 1 CSS px.
    const distance = height / 2 / Math.tan((FOV * Math.PI) / 360);
    camera.perspective({ aspect: width / height, near: distance * 0.05, far: distance * 6 });
    camera.position.set(0, 0, distance);

    const artBox = artRect && artRect.width > 0 ? artRect : markRect;
    const artInHero: Box = {
      left: artBox.left - heroRect.left,
      top: artBox.top - heroRect.top,
      width: artBox.width,
      height: artBox.height,
    };
    const copyBox: Box | null =
      copyRect && copyRect.width > 0
        ? {
            left: copyRect.left - heroRect.left,
            top: copyRect.top - heroRect.top,
            width: copyRect.width,
            height: copyRect.height,
          }
        : null;
    const sheetPlace = sheetLayout(artInHero, { width, height }, rest);
    placeSheet(sheetPlace);
    // Readability mask: the copy scrolls with the canvas, so its rectangle only changes here; the
    // header band follows the scroll (tick).
    deviceRect(copyBox, height, dpr, sheetUniforms.uCopyRect.value);
    sheetUniforms.uMix.value[2] = SHEET_MASK.feather * dpr;
    return {
      width,
      height,
      heroTop: heroRect.top + scrollY,
      heroLeft: heroRect.left,
      rest,
      art: artInHero,
      headerBox:
        headerRect && headerRect.width > 0
          ? {
              left: headerRect.left,
              top: headerRect.top,
              width: headerRect.width,
              height: headerRect.height,
            }
          : null,
      sheet: sheetPlace,
      bandBottom,
      copyTop,
      // Hero coordinates are viewport coordinates with the hero at the top.
      distance: handoffDistance({
        top: rest.y - MARK_EXTENT * rest.scale,
        bottom: rest.y + MARK_EXTENT * rest.scale,
        bandBottom,
        copyTop,
        viewportHeight: window.innerHeight,
      }),
    };
  };

  // ---------------------------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------------------------

  const drawDepth = (mesh: Mesh): void => {
    mesh.program = depthProgram;
    // Push the depth-only pass back a hair so the colour pass of the same surface passes LEQUAL.
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1, 1);
    mesh.draw({ camera });
    gl.disable(gl.POLYGON_OFFSET_FILL);
  };

  /**
   * What tick() worked out for the frame and render() combines with the theme's strengths (so a
   * redraw after a theme switch is right without a new tick): the overall alpha of the sheet and
   * everything on it, and the bloom and sheen of the loop (already faded by the hand-off).
   */
  const frameState = { alpha: 0, bloom: 0, sheen: 0 };

  /** Draws the flat mesh as it is placed: a plate flattened onto the sheet. */
  const drawFlat = (x: number, y: number, z: number, rz: number, scale: number): void => {
    flat.position.set(x, y, z);
    flat.rotation.set(0, 0, rz);
    flat.scale.set(scale, scale, FLAT);
    flat.updateMatrixWorld();
    flat.draw({ camera });
  };

  const render = (): void => {
    renderer.bindFramebuffer();
    renderer.setViewport(renderer.width * renderer.dpr, renderer.height * renderer.dpr);
    camera.updateMatrixWorld();
    group.updateMatrixWorld();

    gl.colorMask(true, true, true, true);
    renderer.setDepthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const alpha = frameState.alpha;
    if (alpha > MIN_ALPHA) {
      // 1. The sheet, under everything.
      sheetUniforms.uMix.value[0] = alpha;
      sheetUniforms.uMix.value[1] = frameState.bloom * look.bloom;
      sheet.draw({ camera });

      // 2. Each plate's shadow: the plate flattened onto the sheet, offset away from the light
      //    and softened by jittered copies, further and softer the higher it floats.
      if (look.plateShadow > 0) {
        flat.program = shadowProgram;
        for (const p of plates) {
          if (p.alpha <= MIN_ALPHA) continue;
          const { position, rotation, scale } = p.mesh;
          const cast = plateShadow(position.z);
          const strength = look.plateShadow * cast.alpha * alpha;
          if (strength <= MIN_ALPHA) continue;
          shadowUniforms.uAlpha.value = strength / SOFT_TAPS;
          for (const [jx, jy] of SOFT_DISC) {
            drawFlat(
              position.x + cast.x + jx * cast.softness,
              position.y + cast.y + jy * cast.softness,
              SHEET_Z + SHADOW_LIFT,
              rotation.z,
              scale.x,
            );
          }
        }
      }

      // 3. The halftone prints the plates leave as they lift, in register on the sheet.
      flat.program = printProgram;
      printUniforms.uHalftone.value[0] = PRINT_PITCH * renderer.dpr;
      for (const p of plates) {
        const strength = p.print * alpha;
        if (strength <= MIN_ALPHA) continue;
        printUniforms.uInk.value.set(p.ink);
        printUniforms.uAlpha.value = strength;
        printUniforms.uHalftone.value[1] = SCREEN_ANGLE[p.layout.id];
        drawFlat(p.home.x, p.home.y, SHEET_Z + PRINT_LIFT, p.home.rz, p.home.scale);
      }
    }

    // 4. The plates. Each prints once: its nearest surface only (own depth pass), multiplied onto
    //    the rest. The sheen crosses their front faces during the hold.
    sheen[3] = frameState.sheen * look.sheen;
    for (const p of plates) {
      if (p.alpha <= MIN_ALPHA) continue;
      renderer.setDepthMask(true);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.colorMask(false, false, false, false);
      drawDepth(p.mesh);
      gl.colorMask(true, true, true, true);
      plateUniforms.uInk.value.set(p.ink);
      plateUniforms.uAlpha.value = p.alpha;
      p.mesh.program = colorProgram;
      p.mesh.draw({ camera });
    }
  };

  // ---------------------------------------------------------------------------------------------
  // Loop state
  // ---------------------------------------------------------------------------------------------

  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  let intro = false;
  let started = false;
  let destroyed = false;
  let raf = 0;
  let last = 0;
  let clock = 0;
  /** Choreography time: runs once the plates are alive, stops while the hero is scrolled away. */
  let loopClock = 0;
  let visible = true;
  let docked = false;
  let handedOver = false;
  let lastDock = -1;
  let resizeTimer = 0;
  const pointer = { x: 0, y: 0, amount: 0 };
  const cursor = { x: 0, y: 0, inside: false };
  const poses: PlatePose[] = [];
  /** The header's box in canvas coordinates this frame (reused). */
  const headerInHero: Box = { left: 0, top: 0, width: 0, height: 0 };

  /**
   * `--dock` (0–1): how far the hand-off to the header logo has gone. `--dock-reg`: how far out of
   * register the header logo's arches are (choreography.ts registrationPulse: 0 at the top, out
   * mid hand-off, snapping back to 0 as the hero plates finish fading), styled in Hero.astro.
   */
  const setHeaderDock = (value: number): void => {
    if (!header) return;
    const rounded = Math.round(value * 1000) / 1000;
    if (rounded === lastDock) return;
    lastDock = rounded;
    header.style.setProperty('--dock', String(rounded));
    header.style.setProperty('--dock-reg', registrationPulse(rounded).toFixed(3));
  };

  const setDocked = (state: boolean): void => {
    if (state === docked) return;
    docked = state;
    hero.toggleAttribute('data-docked', state);
    header?.toggleAttribute('data-docked', state);
  };

  const shouldRun = (): boolean => started && !destroyed && visible && !document.hidden;

  const request = (): void => {
    if (!raf && shouldRun()) raf = requestAnimationFrame(frame);
  };

  const pause = (): void => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
  };

  // ---------------------------------------------------------------------------------------------
  // Hand-over to the floating plates (handoff-signal.ts)
  // ---------------------------------------------------------------------------------------------

  /** Footprint of the plates once the hand-off is complete: flat and in register (group units). */
  const settledBounds = poseBounds(layout.plates.map(registerPose), plateOutline);
  const settledShrink = handoff(1).scale;

  /**
   * Publishes the hand-off at `scrolled` (px the page has moved past the hero's top) with the
   * plates' pivot at viewport y `pivotY`. Sent only when something changed (handoff-signal.ts).
   */
  const publishHandoff = (
    metrics: Metrics,
    progress: number,
    ink: number,
    scrolled: number,
    pivotY: number,
    scale: number,
  ): void => {
    publishHeroHandoff({
      live: true,
      progress,
      ink,
      // Document scrollY at which the hand-off completes: fixed by layout, not by observation.
      endScroll: metrics.heroTop + metrics.distance,
      // Viewport coordinates: the hero's top is at −scrolled.
      rect: {
        left: metrics.heroLeft + metrics.art.left,
        top: metrics.art.top - scrolled,
        width: metrics.art.width,
        height: metrics.art.height,
      },
      mark: { x: metrics.heroLeft + metrics.rest.x, y: pivotY, scale },
    });
  };

  /**
   * The hand-off once complete (progress ≥ 1): the art box and the plates where they were at the
   * moment the plates were gone (scrolled = metrics.distance), whatever the current scroll, so a
   * reload or resize while scrolled down still gives the same anchor. The plates are then flat
   * and in register (settledBounds), as tick() draws them at that scroll.
   */
  const publishSettled = (metrics: Metrics): void => {
    const at = metrics.distance;
    const scale = metrics.rest.scale * settledShrink;
    const pivotY = guardY(
      metrics.rest.y - at,
      settledBounds.maxY * scale * EXTENT_SLACK,
      -settledBounds.minY * scale * EXTENT_SLACK,
      metrics.bandBottom,
      metrics.copyTop === null ? null : metrics.copyTop - at,
    );
    publishHandoff(metrics, 1, 0, at, pivotY, scale);
  };

  const tick = (now: number): void => {
    raf = 0;
    if (!m || !shouldRun()) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, Math.max(0, (now - last) / 1000)) : 0;
    last = now;
    clock += dt;

    const scrolled = window.scrollY - m.heroTop;
    const progress = dockProgress(scrolled, m.distance);
    const out = handoff(progress);
    const { toMark } = out;
    const fadeIn = intro ? 1 : clamp(clock / FADE_IN);
    const alive = intro ? 1 : easeInOutCubic((clock - ALIVE.delay) / ALIVE.duration);
    const explode = alive * (1 - out.collapse);
    const introDone = !intro || clock >= INTRO_TOTAL;
    /** 1 while the loop runs; falls to 0 as it slows to a stop on scroll-out. */
    const running = 1 - toMark;

    // The loop starts at contact once the plates have landed, and slows to a stop as they blend to
    // the hold pose on scroll-out.
    if (introDone && alive >= 1) loopClock += dt * (1 - toMark);

    // Pointer (fine pointers) or a slow autonomous drift (touch), damped.
    const fine = finePointer.matches;
    const target = fine
      ? cursor.inside
        ? cursor
        : { x: 0, y: 0 }
      : { x: Math.sin(clock * 0.21) * 0.55, y: Math.sin(clock * 0.15 + 1.1) * 0.4 };
    const follow = damp(3, dt);
    pointer.x += (target.x - pointer.x) * follow;
    pointer.y += (target.y - pointer.y) * follow;
    pointer.amount += ((fine && cursor.inside ? 1 : 0) - pointer.amount) * damp(2.5, dt);

    const scale = m.rest.scale * out.scale;
    // The sheet's frame with the slow camera drift, settling to the frame at rest on scroll-out.
    const tilt = blendTilt(tiltAt(loopClock), restTilt(), toMark);
    group.scale.set(scale, scale, scale);
    group.rotation.set(
      explode * (tilt.x - pointer.y * POINTER_TILT.x),
      explode * (tilt.y + pointer.x * POINTER_TILT.y),
      explode * tilt.z,
    );

    // Plates: the loop pose, blended to the hold pose (in register on the sheet) on scroll-out,
    // then towards flat register by `explode` (the hand-over at the start, the collapse during
    // the hand-off).
    poses.length = 0;
    let inkSum = 0;
    for (const p of plates) {
      const live = blendPose(platePoseAt(loopClock, p.layout), holdPose(p.layout), toMark);
      const pose = blendPose(registerPose(p.layout), live, explode);
      // Depth parallax with the pointer.
      pose.x += pointer.x * pose.z * PARALLAX.x;
      pose.y -= pointer.y * pose.z * PARALLAX.y;
      poses.push(pose);

      // Intro: the plate comes forward from depth (no overshoot) while its register offset snaps
      // in with a small overshoot.
      let ahead = 1;
      let snap = 1;
      let ink = 1;
      if (intro) {
        const t = clamp((clock - PLATES[p.layout.id].print * INTRO.stagger) / INTRO.duration);
        ahead = easeOutCubic(t);
        snap = easeOutBack(t, 1.4);
        ink = clamp(t * 2.5);
      }
      const away = 1 - snap;
      const from = INTRO_FROM[p.layout.id];
      p.mesh.position.set(
        pose.x + away * from.x,
        pose.y + away * from.y,
        pose.z - (1 - ahead) * INTRO.depth,
      );
      p.mesh.rotation.set(pose.rx, 0, pose.rz + away * from.rz);
      p.mesh.scale.set(pose.scale, pose.scale, pose.scale * Math.max(0.001, explode));
      p.alpha = ink * out.ink;
      // Faded with the loop on scroll-out: the plates settle back over their print otherwise.
      p.print = printAlpha(loopClock, p.layout) * running;
      inkSum += ink;
    }

    // Footprint of the plates (group units, y up).
    const b = poseBounds(poses, plateOutline);

    // The plates scroll with the page, held below the header band and above the copy below them.
    const y = guardY(
      m.rest.y - scrolled,
      b.maxY * scale * EXTENT_SLACK,
      -b.minY * scale * EXTENT_SLACK,
      m.bandBottom,
      m.copyTop === null ? null : m.copyTop - scrolled,
    );
    group.position.set(m.rest.x - m.width / 2, m.height / 2 - (y + scrolled), 0);

    // The sheet and everything on it: in with the plates' frame and ink, out with the hand-off.
    // The loop's effects fade as it slows to a stop on scroll-out, so none freezes mid-way.
    const ink = inkSum / plates.length;
    frameState.alpha = explode * fadeIn * ink * out.ink;
    const effects = effectsAt(loopClock);
    const wave = sheetUniforms.uWave.value;
    wave[0] = (effects.ripple * m.sheet.reach) / m.sheet.unit;
    wave[2] = effects.rippleAlpha * running;
    frameState.bloom = effects.bloom * running;
    frameState.sheen = effects.sheenAlpha * running;

    // The header is fixed: its band, in canvas coordinates, moves down the canvas as the page
    // scrolls (the canvas scrolls with the hero).
    const dpr = renderer.dpr;
    const band = m.headerBox;
    if (band) {
      headerInHero.left = band.left - m.heroLeft;
      headerInHero.top = band.top + scrolled;
      headerInHero.width = band.width;
      headerInHero.height = band.height;
    }
    deviceRect(band ? headerInHero : null, m.height, dpr, sheetUniforms.uBandRect.value);

    // Sheen: a slanted band crossing the mark's on-screen extent from left to right (device px,
    // gl_FragCoord space: y up from the canvas's bottom).
    if (frameState.sheen > MIN_ALPHA) {
      const left = m.rest.x + b.minX * scale;
      const right = m.rest.x + b.maxX * scale;
      const halfHeight = ((b.maxY - b.minY) / 2) * scale;
      const halfWidth = Math.max(1, (right - left) * SHEEN.width);
      const travel = halfWidth + Math.abs(SHEEN.slant) * halfHeight;
      const centreX = left - travel + (right - left + travel * 2) * effects.sheen;
      const pivotY = (m.height - (y + scrolled)) * dpr;
      sheen[0] = centreX * dpr + SHEEN.slant * pivotY;
      sheen[2] = halfWidth * dpr;
    }

    render();

    // DOM writes, after drawing.
    if (!handedOver) {
      canvas.style.opacity = String(fadeIn);
      markBox.style.opacity = String(1 - fadeIn);
      if (fadeIn >= 1) {
        handedOver = true;
        hero.dataset['scene'] = 'live';
        markBox.style.removeProperty('opacity');
      }
    }
    setHeaderDock(out.dock);
    // Hand-over to the floating plates: live during the hand-off, then fixed where it completed.
    if (progress >= 1) publishSettled(m);
    else publishHandoff(m, progress, out.ink, scrolled, y, scale);

    if (progress >= 1 && introDone && handedOver) {
      // Handed off: the header logo has taken over; nothing to draw until the user scrolls back.
      setDocked(true);
      last = 0;
      return;
    }
    setDocked(false);
    request();
  };

  const frame = (now: number): void => {
    try {
      tick(now);
    } catch {
      // A GPU or driver error mid-frame: fall back to the static composition.
      destroy();
      onLost();
    }
  };

  // ---------------------------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------------------------

  const remeasure = (): void => {
    if (destroyed) return;
    try {
      m = measure();
    } catch {
      // The mark lost its layout box (unexpected): keep the static composition instead.
      destroy();
      onLost();
      return;
    }
    // Past the hand-off the loop may not run (docked or off-screen): send the new layout's end
    // state now (endScroll, rect, mark). Nothing is sent if it did not change.
    if (started && dockProgress(window.scrollY - m.heroTop, m.distance) >= 1) publishSettled(m);
    request();
  };

  const onResize = (): void => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(remeasure, RESIZE_DEBOUNCE);
  };

  const onScroll = (): void => {
    // The loop stops once docked; scrolling back up starts it again.
    if (docked && m && dockProgress(window.scrollY - m.heroTop, m.distance) < 1) request();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!m || event.pointerType !== 'mouse') return;
    const top = m.heroTop - window.scrollY;
    const nx = ((event.clientX - m.heroLeft) / m.width) * 2 - 1;
    const ny = 1 - ((event.clientY - top) / m.height) * 2;
    cursor.inside = ny >= -1 && ny <= 1;
    cursor.x = clamp(nx, -1, 1);
    cursor.y = clamp(ny, -1, 1);
  };

  const onPointerOut = (event: PointerEvent): void => {
    if (!event.relatedTarget) cursor.inside = false;
  };

  const onVisibility = (): void => {
    if (document.hidden) pause();
    else request();
  };

  const onContextLost = (): void => {
    destroy();
    onLost();
  };

  const onThemeChange = (): void => {
    if (destroyed) return;
    const next = sceneThemeOf(root.dataset['theme']);
    if (next === theme) return;
    applyTheme(next);
    // Redraw now, in the same task as the switch, so the new blend mode never shows a frame drawn
    // for the old one (a white or black box). The pose is the last frame's; the loop goes on.
    if (!started || !m) return;
    try {
      render();
    } catch {
      destroy();
      onLost();
    }
  };

  const resizeObserver = new ResizeObserver(onResize);
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    if (visible) request();
    else pause();
  });

  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    pause();
    window.clearTimeout(resizeTimer);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerout', onPointerOut);
    document.removeEventListener('visibilitychange', onVisibility);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    document.removeEventListener('dt:themechange', onThemeChange);

    canvas.remove();
    hero.removeAttribute('data-scene');
    hero.removeAttribute('data-docked');
    markBox.style.removeProperty('opacity');
    header?.removeAttribute('data-scene');
    header?.removeAttribute('data-docked');
    header?.style.removeProperty('--dock');
    header?.style.removeProperty('--dock-reg');
    if (!gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext();
    // The floating plates stop following a scene that is gone (the static mark shows).
    const lastSent = latestHeroHandoff();
    if (started && lastSent?.live) publishHeroHandoff({ ...lastSent, live: false });
  };

  /**
   * One draw of every mesh with every program it uses, colour writes off and the canvas not yet
   * shown: the driver's lazy first-draw work (vertex arrays, uploads, shader variants) happens
   * here, in its own task, so the first visible frame is cheap.
   */
  const warmUp = (): void => {
    renderer.bindFramebuffer();
    renderer.setViewport(renderer.width * renderer.dpr, renderer.height * renderer.dpr);
    camera.updateMatrixWorld();
    group.updateMatrixWorld();
    gl.colorMask(false, false, false, false);
    sheet.draw({ camera });
    flat.program = shadowProgram;
    flat.draw({ camera });
    flat.program = printProgram;
    flat.draw({ camera });
    for (const p of plates) {
      drawDepth(p.mesh);
      p.mesh.program = colorProgram;
      p.mesh.draw({ camera });
    }
    gl.colorMask(true, true, true, true);
  };

  // Measure once now so a layout problem fails here, before anything is shown.
  await yieldToMain();
  ensureContext();
  m = measure();
  await yieldToMain();
  ensureContext();
  warmUp();

  // Listen from creation on: a prepared scene may wait (SVG intro, reduced motion) before start().
  canvas.addEventListener('webglcontextlost', onContextLost);
  document.addEventListener('dt:themechange', onThemeChange);

  const start = ({ intro: withIntro }: { intro: boolean }): boolean => {
    if (started || destroyed) return false;
    if (gl.isContextLost()) {
      onContextLost();
      return false;
    }
    // A switch the event did not report (none expected): draw the first frame in the right theme.
    onThemeChange();
    started = true;
    intro = withIntro;

    canvas.classList.add('hero-canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.opacity = intro ? '1' : '0';
    stage.append(canvas);

    // Header arches stay in register at the top; the hand-off pulses them (--dock-reg).
    setHeaderDock(0);
    header?.setAttribute('data-scene', '');
    hero.dataset['scene'] = intro ? 'live' : 'fading';
    handedOver = intro;

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerout', onPointerOut, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    resizeObserver.observe(hero);
    intersectionObserver.observe(hero);
    void document.fonts?.ready.then(onResize);

    // First frame now (replacing any frame the observers just queued), so the canvas has content
    // before the caller reveals it.
    pause();
    frame(performance.now());
    return !destroyed;
  };

  return { start, destroy };
};
