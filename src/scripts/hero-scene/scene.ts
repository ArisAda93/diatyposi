/**
 * Home hero scene: registration in depth. The four arches of the logo are extruded ink plates
 * (OGL / WebGL) hanging at different depths in a field of fine ink dust, running the seamless loop
 * of choreography.ts.
 *
 * - The loop (t = 0 is the click): the plates hang one behind another, each moved along the
 *   camera's line of sight so that from the one viewpoint at the start of the loop they line up
 *   exactly into the logo (choreography.ts alignToView). The view (the group turning about the
 *   mark's centre, the pivot) holds there while a sheen of light crosses the plates' faces, then
 *   drifts away and orbits slowly, so the plates part in parallax and show their depth, and glides
 *   back, overshooting a touch, to click into register again. Overlaps multiply like overprinting
 *   (see shaders.ts).
 * - The ink dust (dust.ts): fine cyan, magenta and yellow specks at many depths fill the whole
 *   hero and turn with the same view, so their parallax shows the space (the field reaches past
 *   the edges far enough that a turned view is still filled); a few large, soft bokeh specks
 *   float in front of the plates, and those far behind are small and fainter. Around the click
 *   the specks near the mark are drawn into the plates, fading as they go, and released again.
 *   They stay faint under the copy and the header band so the text reads. Nothing else is drawn
 *   behind the plates: no sheet, no shadow, no panel.
 * - The view follows the pointer with damped rotation on fine pointers and drifts on its own on
 *   touch screens; both fade out completely while the plates are in register, so the click is
 *   exact, and come back as the view departs.
 * - Every pose fits the art box the hero lays out for it (choreography.ts ART, Hero.astro
 *   `.hero-art`), so no plate is cropped or reaches the copy; only the dust spans the hero.
 * - Hand-off to the header logo as the hero scrolls out (scrubbed, nothing pinned; choreography.ts
 *   handoff): the plates first blend to the hold pose and the view to the rest view from wherever
 *   they are (the loop slows to a stop and its effects fade), collapse and flatten while the dust
 *   fades, then shrink a little and fade out in the art column. Meanwhile the header logo's
 *   arches (always shown) pulse out of register and snap back (`--dock` 0–1 and `--dock-reg` on
 *   [data-header], styled in Hero.astro); `data-docked` is set once the plates are gone. The
 *   plates scroll with the page, held below the header band and, when the copy sits below the
 *   art, above the copy (math.ts guardY); the hand-off is short enough that they are gone before
 *   those limits meet (handoffDistance). Scrolling back reverses it, and the loop resumes once
 *   the hero is back at the top.
 * - Hand-over from the static SVG mark: the first frame draws the plates flat and in register at
 *   the SVG's exact position and size, without the dust; the canvas fades in over it, then the
 *   plates move back and forth along the lines of sight into their depths (still exactly the logo
 *   from this viewpoint) and gain their thickness while the dust fades in, and the loop starts at
 *   the click. With the intro, the plates arrive from depth instead (print order Y, M, C, K) and
 *   land in register; the loop starts at the click as they land.
 *
 * Start-up runs in short steps that yield to the main thread (startup.ts): createHeroScene is
 * async, and the canvas is only shown (and faded in) by start(), after the first real frame.
 *
 * - Themes (theme.ts, dust.ts dustLook): in light the inks multiply on a white canvas composited
 *   with `mix-blend-mode: multiply`; in dark they screen on a black canvas composited with
 *   `mix-blend-mode: screen`, and the key plate takes the light key colour. `dt:themechange`
 *   switches the blend state, the uniforms and the canvas's blend mode together and redraws at
 *   once, in the same task, without rebuilding anything.
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
  PERIOD,
  PLATES,
  alignToView,
  archMetrics,
  blendPose,
  buildLayout,
  effectsAt,
  handoff,
  holdPose,
  loopTime,
  platePoseAt,
  poseBounds,
  registerPose,
  registrationPulse,
  restView,
  viewAt,
  type Camera as ViewPoint,
  type PlateId,
  type PlateLayout,
  type PlatePose,
} from './choreography';
import {
  DUST,
  DUST_MASK,
  DUST_SEED,
  absorbReach,
  createDustBuffers,
  deviceRect,
  dustLook,
  dustPlan,
  layDust,
  type DustLook,
  type Footprint,
} from './dust';
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
  lerp,
  placeInBox,
  type Box,
  type Placement,
  type ViewBox,
} from './math';
import { depthFragment, dustFragment, dustVertex, plateFragment, plateVertex } from './shaders';
import { latestHeroHandoff, publishHeroHandoff } from './handoff-signal';
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
   * Hero copy (headline, lead and actions): the dust stays faint over its box; when it sits below
   * the art, the plates never reach it while they fade.
   */
  copy: HTMLElement | null;
  /**
   * Receives `--dock`, `--dock-reg`, `data-scene` and `data-docked`. Fixed: the dust stays faint
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
// Tuning (poses, view and loop are tuned in choreography.ts, the dust in dust.ts)
// ------------------------------------------------------------------------------------------------

/** Vertical field of view in degrees. Narrow, so the plates keep the logo's proportions. */
const FOV = 30;
/** Extrusion depth of each plate, in logo raster units. */
const THICKNESS = 34;
/** Extra group rotation at full pointer deflection (radians, about 4° and 6°). */
const POINTER_TILT = { x: 0.07, y: 0.1 };
/** Canvas fade-in over the SVG mark, seconds. */
const FADE_IN = 0.6;
/**
 * Without the intro: delay and duration of the step from flat register (the SVG) into depth: the
 * plates move along the lines of sight into their depths and gain their thickness, and the dust
 * fades in.
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
/** Depth scale of a plate flattened in register (hand-over and collapse): flat, yet invertible. */
const FLAT = 0.001;
/**
 * Sheen after the click: half-width of the band as a share of the mark's on-screen width, its
 * slant (horizontal shift per pixel of height; negative leans it like "/") and its strength (the
 * same in both themes).
 */
const SHEEN = { width: 0.16, slant: -0.45, strength: 0.35 };
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
/** The loop's base angular frequency: the dust's drift uses whole multiples of it. */
const BEAT = (Math.PI * 2) / PERIOD;

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
  /** The header in viewport coordinates (it is fixed; the dust stays faint under it). */
  headerBox: Box | null;
  /** Lowest edge the plates keep below (header bottom + gap), viewport px (the header is fixed). */
  bandBottom: number;
  /** Highest edge the plates keep above (copy top − gap) in hero coordinates; null beside it. */
  copyTop: number | null;
  /** Scroll distance of the hand-off. */
  distance: number;
  /** Camera distance from the pivot's plane, CSS px (1 world unit on that plane is 1 CSS px). */
  cameraDistance: number;
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
  /** Footprint of the plates flat and in register (group units): the logo, as the SVG shows it. */
  const settledBounds = poseBounds(layout.plates.map(registerPose), plateOutline);

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
  // Every program's sources are here.
  await precompile(
    gl,
    [
      { vertex: plateVertex, fragment: plateFragment },
      { vertex: plateVertex, fragment: depthFragment },
      { vertex: dustVertex, fragment: dustFragment },
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
  // device px; w: strength) is set per frame after the click.
  const sheen = new Float32Array([0, SHEEN.slant, 1, 0]);
  const plateUniforms = {
    uInk: { value: new Float32Array(3) },
    uPaper: paper,
    uAlpha: { value: 1 },
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
  // The dust: layout uniforms from measure(), motion from tick(), strengths from the theme
  // (applyTheme) and the frame (render). See shaders.ts dustVertex and dustFragment.
  const pointRange = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array | null;
  const dustUniforms = {
    uCyan: { value: hexToRgb(hexOf('c')) },
    uMagenta: { value: hexToRgb(hexOf('m')) },
    uYellow: { value: hexToRgb(hexOf('y')) },
    uMotion: { value: new Float32Array([0, BEAT, 0, 1]) },
    uLens: { value: new Float32Array([1, 1, 1]) },
    uPoint: {
      value: new Float32Array([Math.min(DUST.maxPoint, pointRange?.[1] ?? 1), DUST.minPoint, 1, 1]),
    },
    uAlpha: { value: 0 },
    uPaper: paper,
    uCopyRect: { value: deviceRect(null, 0, 1) },
    uBandRect: { value: deviceRect(null, 0, 1) },
    uFeather: { value: DUST_MASK.feather as number },
  };
  const dustProgram = linked(
    new Program(gl, {
      vertex: dustVertex,
      fragment: dustFragment,
      uniforms: dustUniforms,
      depthTest: false,
      depthWrite: false,
      cullFace: false,
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
      /** Ink of the plate (intro and hand-off). */
      alpha: 1,
    };
  });

  // The dust: buffers sized for the most specks a hero gets, filled by measure() (layDust) and
  // uploaded on the next draw; the draw range is the hero's count. Its own frame sits at the
  // pivot and turns with the group, without the group's scale (CSS px).
  const dustBuffers = createDustBuffers(DUST.count.field);
  const dustGeometry = new Geometry(gl, {
    position: { size: 3, data: dustBuffers.position },
    home: { size: 2, data: dustBuffers.home },
    look: { size: 4, data: dustBuffers.look },
    blur: { size: 1, data: dustBuffers.blur },
  });
  dustGeometry.setDrawRange(0, 0);
  const dustRoot = new Transform();
  const dust = new Mesh(gl, {
    geometry: dustGeometry,
    program: dustProgram,
    mode: gl.POINTS,
    frustumCulled: false,
  });
  dust.setParent(dustRoot);

  // ---------------------------------------------------------------------------------------------
  // Theme (theme.ts): blend state, neutral colour, key ink and the canvas's CSS blend mode.
  // ---------------------------------------------------------------------------------------------

  const keyPlate = plates.find((p) => p.layout.id === 'k');
  const colorPasses = [colorProgram, dustProgram];
  let theme: SceneTheme = sceneThemeOf(root.dataset['theme']);
  /** Strengths of the dust in the current theme. */
  let look: DustLook = dustLook(theme);

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
    keyPlate?.ink.set(key);
    // The dust's theme strengths. Its overall strength multiplies the frame's fade in render(), so
    // a redraw right after a switch is right.
    look = dustLook(next);
    dustUniforms.uPoint.value[2] = look.bokeh;
    dustUniforms.uPoint.value[3] = look.far;
    canvas.style.mixBlendMode = model.cssBlend;
  };
  applyTheme(theme);

  // ---------------------------------------------------------------------------------------------
  // Measurements (on start, on resize, when fonts settle). Reads only; no writes in between.
  // ---------------------------------------------------------------------------------------------

  let m: Metrics | null = null;

  /** What the dust was last laid out for: it is laid out again only when one of these changes. */
  const dustKey = { width: 0, height: 0, pivotX: 0, pivotY: 0, distance: 0, scale: 0 };
  const footprint: Footprint = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

  /**
   * Lays out the dust for the hero (dust.ts dustPlan, layDust) when its size, the pivot or the
   * camera changed, and marks its buffers for upload (same seed: the same field for the same hero).
   */
  const placeDust = (width: number, height: number, rest: Placement, distance: number): void => {
    const k = dustKey;
    if (
      k.width === width &&
      k.height === height &&
      k.pivotX === rest.x &&
      k.pivotY === rest.y &&
      k.distance === distance &&
      k.scale === rest.scale
    ) {
      return;
    }
    Object.assign(k, {
      width,
      height,
      pivotX: rest.x,
      pivotY: rest.y,
      distance,
      scale: rest.scale,
    });
    // The logo's footprint around the pivot in CSS px (y up): where absorbed specks gather.
    footprint.minX = settledBounds.minX * rest.scale;
    footprint.maxX = settledBounds.maxX * rest.scale;
    footprint.minY = settledBounds.minY * rest.scale;
    footprint.maxY = settledBounds.maxY * rest.scale;
    const frame = { width, height, pivotX: rest.x, pivotY: rest.y, distance, footprint };
    const plan = dustPlan(frame);
    layDust(frame, plan, DUST_SEED, dustBuffers);
    const attributes = dustGeometry.attributes;
    for (const name of ['position', 'home', 'look', 'blur'] as const) {
      const attribute = attributes[name];
      if (attribute) attribute.needsUpdate = true;
    }
    dustGeometry.setDrawRange(0, plan.count);
    dustUniforms.uMotion.value[3] = absorbReach(footprint);
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
    const cameraDistance = height / 2 / Math.tan((FOV * Math.PI) / 360);
    camera.perspective({
      aspect: width / height,
      near: cameraDistance * 0.05,
      far: cameraDistance * 6,
    });
    camera.position.set(0, 0, cameraDistance);

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

    // The dust: its field, its lens (focus and depth of field) and its readability mask. The copy
    // scrolls with the canvas, so its rectangle only changes here; the header band follows the
    // scroll (tick).
    placeDust(width, height, rest, cameraDistance);
    const lens = dustUniforms.uLens.value;
    lens[0] = cameraDistance;
    lens[1] = DUST.depth.far * cameraDistance;
    lens[2] = dpr;
    dustUniforms.uPoint.value[1] = DUST.minPoint * dpr;
    deviceRect(copyBox, height, dpr, dustUniforms.uCopyRect.value);
    dustUniforms.uFeather.value = DUST_MASK.feather * dpr;

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
      cameraDistance,
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
   * redraw after a theme switch is right without a new tick): the dust's overall fade and the
   * sheen of the loop (already faded by the hand-off).
   */
  const frameState = { dust: 0, sheen: 0 };

  const render = (): void => {
    renderer.bindFramebuffer();
    renderer.setViewport(renderer.width * renderer.dpr, renderer.height * renderer.dpr);
    camera.updateMatrixWorld();
    group.updateMatrixWorld();
    dustRoot.updateMatrixWorld();

    gl.colorMask(true, true, true, true);
    renderer.setDepthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 1. The ink dust, in one draw of points.
    const dustAlpha = frameState.dust * look.alpha;
    if (dustAlpha > MIN_ALPHA && dustGeometry.drawRange.count > 0) {
      dustUniforms.uAlpha.value = dustAlpha;
      dust.draw({ camera });
    }

    // 2. The plates. Each prints once: its nearest surface only (own depth pass), multiplied onto
    //    the rest. The sheen crosses their front faces after the click.
    sheen[3] = frameState.sheen * SHEEN.strength;
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
  /** The view of the scroll hand-off: the one viewpoint where the plates are in register. */
  const settledView = restView();
  /** The plates' poses before alignment this frame: their footprint on screen in register. */
  const poses: PlatePose[] = [];
  /** The camera in the group's unrotated frame (group units), for alignToView (reused). */
  const eye: ViewPoint = { x: 0, y: 0, distance: 1 };
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

    // The loop starts at the click once the plates have landed, and slows to a stop as they blend
    // to the hold pose on scroll-out.
    if (introDone && alive >= 1) loopClock += dt * (1 - toMark);
    const effects = effectsAt(loopClock);

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

    // The view: the loop's orbit, settling to the rest view on scroll-out, plus the pointer's
    // tilt (or the touch drift), none while the plates are in register. The dust turns with the
    // plates.
    const scale = m.rest.scale * out.scale;
    const view = viewAt(loopClock);
    // How close the drawn view is to register: the loop's, carried to 1 as the view settles to the
    // rest view on scroll-out. The tilt and the drift fade out fully in register (the click is
    // exact, identical to the SVG) and come back as the view departs.
    const sway = 1 - lerp(effects.align, 1, toMark);
    const pitch =
      explode * (lerp(view.pitch, settledView.pitch, toMark) - pointer.y * POINTER_TILT.x * sway);
    const yaw =
      explode * (lerp(view.yaw, settledView.yaw, toMark) + pointer.x * POINTER_TILT.y * sway);
    group.scale.set(scale, scale, scale);
    group.rotation.set(pitch, yaw, 0);
    dustRoot.rotation.set(pitch, yaw, 0);

    // Plates: the loop pose, blended to the hold pose on scroll-out, then towards flat register by
    // `explode` (the hand-over at the start, the collapse during the hand-off). Unaligned, each
    // pose is where the plate shows on screen with the group unrotated.
    poses.length = 0;
    let inkSum = 0;
    for (const p of plates) {
      const live = blendPose(
        platePoseAt(loopClock, p.layout),
        holdPose(p.layout, loopClock),
        toMark,
      );
      poses.push(blendPose(registerPose(p.layout), live, explode));
    }

    // Footprint of the plates on screen in register (group units, y up).
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
    dustRoot.position.copy(group.position);

    // Each plate moves along the camera's line of sight to its depth, so that with the group
    // unrotated it projects exactly where its unaligned pose shows (choreography.ts alignToView).
    eye.x = -group.position.x / scale;
    eye.y = -group.position.y / scale;
    eye.distance = m.cameraDistance / scale;
    for (let i = 0; i < plates.length; i++) {
      const p = plates[i];
      const pose = poses[i];
      if (!p || !pose) continue;
      const aligned = alignToView(pose, eye);

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
        aligned.x + away * from.x,
        aligned.y + away * from.y,
        aligned.z - (1 - ahead) * INTRO.depth,
      );
      p.mesh.rotation.set(aligned.rx, 0, aligned.rz + away * from.rz);
      p.mesh.scale.set(aligned.scale, aligned.scale, aligned.scale * Math.max(FLAT, explode));
      p.alpha = ink * out.ink;
      inkSum += ink;
    }

    // The dust: in with the plates' depth and ink, out with the hand-off. It drifts on the loop's
    // clock (seamless where it wraps) and is drawn into the plates around the click; the loop's
    // effects fade as it slows to a stop on scroll-out, so none freezes mid-way.
    const ink = inkSum / plates.length;
    frameState.dust = explode * fadeIn * ink * out.ink;
    frameState.sheen = effects.sheenAlpha * running;
    const motion = dustUniforms.uMotion.value;
    motion[0] = loopTime(loopClock);
    motion[2] = effects.absorb * running;

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
    deviceRect(band ? headerInHero : null, m.height, dpr, dustUniforms.uBandRect.value);

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
   * here, in its own task, so the first visible frame is cheap. The dust's first upload of its
   * laid-out buffers happens here too.
   */
  const warmUp = (): void => {
    renderer.bindFramebuffer();
    renderer.setViewport(renderer.width * renderer.dpr, renderer.height * renderer.dpr);
    camera.updateMatrixWorld();
    group.updateMatrixWorld();
    dustRoot.updateMatrixWorld();
    gl.colorMask(false, false, false, false);
    dust.draw({ camera });
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
