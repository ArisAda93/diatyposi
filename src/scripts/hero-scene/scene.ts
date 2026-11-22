/**
 * Home hero scene: the four arches of the logo as extruded ink plates (OGL / WebGL), running the
 * "metamorphosis" loop of choreography.ts.
 *
 * - The plates move through a slow, seamless loop: the logo's mark (exploded in depth,
 *   breathing), the registration target (the arches close into a ring that turns slowly while
 *   two key hairlines draw through its centre), and a continuous wave of ink, then snap back
 *   into register. Overlaps multiply like overprinting (see shaders.ts). A soft contact shadow
 *   sits under them. The group follows the pointer with damped rotation on fine pointers (and a
 *   depth parallax per plate) and drifts on its own on touch screens.
 * - Every pose fits the art box the hero lays out for it (choreography.ts ART, Hero.astro
 *   `.hero-art`), so no pose is cropped or reaches the copy.
 * - Hand-off to the header logo as the hero scrolls out (scrubbed, nothing pinned; choreography.ts
 *   handoff): the plates first blend to the mark from whatever pose they are in (the loop slows to
 *   a stop), collapse into register and flatten, then shrink a little and fade out in the art
 *   column. Meanwhile the header logo's arches (always shown) pulse out of register and snap
 *   back (`--dock` 0–1 and `--dock-reg` on [data-header], styled in Hero.astro); `data-docked` is
 *   set once the plates are gone. The plates scroll with the page, held below the header band and,
 *   when the copy sits below the art, above the copy (math.ts guardY); the hand-off is short
 *   enough that they are gone before those limits meet (handoffDistance). Scrolling back reverses
 *   it, and the loop resumes once the hero is back at the top.
 * - Hand-over from the static SVG mark: the first frame draws the plates flat and in register at
 *   the SVG's exact position and size, the canvas fades in over it, then the plates come apart
 *   into the mark pose and the loop starts. With the intro, they arrive from depth instead (print
 *   order Y, M, C, K) and the loop starts once they have landed.
 *
 * Start-up runs in short steps that yield to the main thread (startup.ts): createHeroScene is
 * async, and the canvas is only shown (and faded in) by start(), after the first real frame.
 *
 * The canvas scrolls with the hero and sits under the header (z-index), composited with
 * `mix-blend-mode: multiply`, so only ink shows and the paper, the living background, the grain
 * and the text stay as they are. One draw loop; it stops when the hero is off-screen, once docked,
 * and while the tab is hidden.
 */
import { Camera, Geometry, Mesh, Program, Renderer, Transform } from 'ogl';
import { ARCH, ARCH_PLATES } from '~/components/logo-paths';
import {
  PLATES,
  archMetrics,
  blendPose,
  blendTilt,
  buildLayout,
  crosshairAt,
  handoff,
  markPose,
  markTilt,
  platePoseAt,
  poseBounds,
  registerPose,
  registrationPulse,
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
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  guardY,
  handoffDistance,
  placeInBox,
  type Placement,
  type ViewBox,
} from './math';
import {
  depthFragment,
  lineFragment,
  plateFragment,
  plateVertex,
  quadVertex,
  shadowFragment,
} from './shaders';
import { precompile, yieldToMain } from './startup';

export interface SceneElements {
  hero: HTMLElement;
  /** Parent of the canvas (fills the hero). */
  stage: HTMLElement;
  /** Wrapper of the static SVG mark; faded out while the canvas fades in. */
  markBox: HTMLElement;
  /** The static SVG mark: its box is the rest position and size of the plates. */
  mark: SVGSVGElement;
  /** Hero copy: when it sits below the art, the plates never reach it while they fade. */
  copy: HTMLElement | null;
  /** Receives `--dock`, `--dock-reg`, `data-scene` and `data-docked`. */
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
/** Without the intro: delay and duration of the plates coming apart into the mark pose. */
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
/**
 * Crosshair hairlines: width in CSS px, ink strength, and the scroll (px) over which they fade as
 * the hero starts to move (they reach almost to the art box's edge, so they go first).
 */
const HAIRLINE = { width: 1.5, alpha: 1, scrollFade: 8 };
/**
 * Contact shadow: ink strength, size relative to the plates' bounds, offset towards the lower
 * right (share of the bounds; light from the upper left), and depth below the rearmost plate
 * (raster units). Set alpha to 0 to remove it.
 */
const SHADOW = { alpha: 0.07, spread: 1.3, offset: { x: 0.04, y: -0.1 }, depth: 40 };
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
  const { hero, stage, markBox, mark, copy, header } = els;
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
  gl.clearColor(1, 1, 1, 1);
  const camera = new Camera(gl, { fov: FOV, near: 1, far: 10_000 });

  // Shaders: linked in the background where the browser can, then one OGL program per task.
  await precompile(
    gl,
    [
      { vertex: plateVertex, fragment: plateFragment },
      { vertex: plateVertex, fragment: depthFragment },
      { vertex: quadVertex, fragment: lineFragment },
      { vertex: quadVertex, fragment: shadowFragment },
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
  const plateUniforms = {
    uInk: { value: new Float32Array(3) },
    uAlpha: { value: 1 },
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
  colorProgram.setBlendFunc(gl.DST_COLOR, gl.ZERO);

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
  const keyInk = hexToRgb(hexOf('k'));
  const lineUniforms = { uInk: { value: keyInk }, uAlpha: { value: 0 } };
  const lineProgram = linked(
    new Program(gl, {
      vertex: quadVertex,
      fragment: lineFragment,
      uniforms: lineUniforms,
      depthTest: false,
      depthWrite: false,
      cullFace: false,
    }),
  );
  lineProgram.setBlendFunc(gl.DST_COLOR, gl.ZERO);

  await yieldToMain();
  const shadowUniforms = { uInk: { value: keyInk }, uAlpha: { value: 0 } };
  const shadowProgram = linked(
    new Program(gl, {
      vertex: quadVertex,
      fragment: shadowFragment,
      uniforms: shadowUniforms,
      depthTest: false,
      depthWrite: false,
      cullFace: false,
    }),
  );
  shadowProgram.setBlendFunc(gl.DST_COLOR, gl.ZERO);

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
    return { layout: plateLayout, ink: hexToRgb(hexOf(plateLayout.id)), mesh, alpha: 1 };
  });

  // Flat quads (−0.5 to 0.5) for the crosshair hairlines and the contact shadow.
  const quadGeometry = new Geometry(gl, {
    position: { size: 2, data: new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]) },
    index: { data: new Uint16Array([0, 1, 2, 0, 2, 3]) },
  });
  const makeLine = (): Mesh => {
    const mesh = new Mesh(gl, {
      geometry: quadGeometry,
      program: lineProgram,
      frustumCulled: false,
    });
    mesh.setParent(group);
    return mesh;
  };
  const lineH = makeLine();
  const lineV = makeLine();
  const lines = [lineH, lineV];
  const shadow = new Mesh(gl, {
    geometry: quadGeometry,
    program: shadowProgram,
    frustumCulled: false,
  });
  shadow.setParent(group);

  // ---------------------------------------------------------------------------------------------
  // Measurements (on start, on resize, when fonts settle). Reads only; no writes in between.
  // ---------------------------------------------------------------------------------------------

  let m: Metrics | null = null;

  const measure = (): Metrics => {
    const heroRect = hero.getBoundingClientRect();
    const markRect = mark.getBoundingClientRect();
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

    // Drawing buffer: DPR capped at 2 (1.5 on small screens) and at MAX_PIXELS overall.
    let dpr = Math.min(window.devicePixelRatio || 1, width < 768 ? 1.5 : 2);
    if (width * height * dpr * dpr > MAX_PIXELS) dpr = Math.sqrt(MAX_PIXELS / (width * height));
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

    return {
      width,
      height,
      heroTop: heroRect.top + scrollY,
      heroLeft: heroRect.left,
      rest,
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

  const render = (): void => {
    renderer.bindFramebuffer();
    renderer.setViewport(renderer.width * renderer.dpr, renderer.height * renderer.dpr);
    camera.updateMatrixWorld();
    group.updateMatrixWorld();

    gl.colorMask(true, true, true, true);
    renderer.setDepthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // The shadow lies on the sheet, under everything.
    if (shadowUniforms.uAlpha.value > 0.002) shadow.draw({ camera });

    // Each plate prints once: its nearest surface only (own depth pass), multiplied onto the rest.
    for (const p of plates) {
      if (p.alpha <= 0.002) continue;
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

    // The crosshair prints over the ring, like a key line on top.
    if (lineUniforms.uAlpha.value > 0.002) {
      for (const line of lines) if (line.visible) line.draw({ camera });
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

  /** Draws a crosshair line from `span` (−1 to 1 along it) at group scale `scale` (px/unit). */
  const placeLine = (
    mesh: Mesh,
    span: { from: number; to: number },
    vertical: boolean,
    scale: number,
  ): void => {
    const length = (span.to - span.from) * layout.crossReach;
    mesh.visible = length > 1e-3;
    if (!mesh.visible) return;
    const mid = ((span.from + span.to) / 2) * layout.crossReach;
    const thickness = HAIRLINE.width / Math.max(1e-4, scale);
    // The horizontal line draws left to right, the vertical one top to bottom.
    if (vertical) {
      mesh.position.set(0, -mid, 0);
      mesh.scale.set(thickness, length, 1);
    } else {
      mesh.position.set(mid, 0, 0);
      mesh.scale.set(length, thickness, 1);
    }
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

    // The loop starts once the plates have landed, and slows to a stop as they blend to the mark.
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
    const tilt = blendTilt(tiltAt(loopClock), markTilt(), toMark);
    group.scale.set(scale, scale, scale);
    group.rotation.set(
      explode * (tilt.x - pointer.y * POINTER_TILT.x),
      explode * (tilt.y + pointer.x * POINTER_TILT.y),
      explode * tilt.z,
    );

    // Plates: the loop pose, blended to the mark on scroll-out, then towards flat register by
    // `explode` (the hand-over at the start, the collapse during the hand-off).
    poses.length = 0;
    let inkSum = 0;
    for (const p of plates) {
      const live = blendPose(
        platePoseAt(loopClock, p.layout, layout),
        markPose(p.layout, loopClock),
        toMark,
      );
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
      inkSum += ink;
    }

    // Registration crosshair through the ring's centre (empty outside the target hold).
    const cross = crosshairAt(loopClock);
    const lineFade = 1 - clamp(scrolled / HAIRLINE.scrollFade);
    lineUniforms.uAlpha.value = HAIRLINE.alpha * explode * fadeIn * (1 - toMark) * lineFade;
    placeLine(lineH, cross.horizontal, false, scale);
    placeLine(lineV, cross.vertical, true, scale);

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

    // Contact shadow: under the plates' current footprint, offset away from the light.
    const ink = inkSum / plates.length;
    shadowUniforms.uAlpha.value = SHADOW.alpha * explode * fadeIn * ink * out.ink;
    if (shadowUniforms.uAlpha.value > 0.002) {
      const w = b.maxX - b.minX;
      const h = b.maxY - b.minY;
      const back = Math.min(...poses.map((pose) => pose.z));
      shadow.position.set(
        (b.minX + b.maxX) / 2 + w * SHADOW.offset.x,
        (b.minY + b.maxY) / 2 + h * SHADOW.offset.y,
        back - SHADOW.depth,
      );
      shadow.scale.set(w * SHADOW.spread, h * SHADOW.spread, 1);
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

    canvas.remove();
    hero.removeAttribute('data-scene');
    hero.removeAttribute('data-docked');
    markBox.style.removeProperty('opacity');
    header?.removeAttribute('data-scene');
    header?.removeAttribute('data-docked');
    header?.style.removeProperty('--dock');
    header?.style.removeProperty('--dock-reg');
    if (!gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext();
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
    for (const p of plates) {
      drawDepth(p.mesh);
      p.mesh.program = colorProgram;
      p.mesh.draw({ camera });
    }
    lineH.draw({ camera });
    shadow.draw({ camera });
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

  const start = ({ intro: withIntro }: { intro: boolean }): boolean => {
    if (started || destroyed) return false;
    if (gl.isContextLost()) {
      onContextLost();
      return false;
    }
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
