/**
 * Home hero scene: the four arches of the logo as extruded ink plates (OGL / WebGL).
 *
 * - The plates float in an exploded stack, separated in depth and slightly out of register, each
 *   breathing slowly. Overlaps multiply like overprinting (see shaders.ts). The group follows the
 *   pointer with damped rotation on fine pointers and drifts on its own on touch screens.
 * - Behind them, a field of small arches (key ink with a few C/M/Y accents) covers the whole
 *   sheet: a slow travelling wave grows and lifts them like halftone dots, rings pulse out from
 *   the plates, they swell around the pointer, and the sheet lags the scroll and leans with the
 *   pointer for depth. It is lighter behind the copy and in the header band (AA stays safe).
 * - As the hero scrolls out (scrubbed, nothing pinned), the plates collapse into register,
 *   flatten, and travel to the exact place and size of the header logo's arches, which then take
 *   over (`--dock` 0–1 and `data-docked` on [data-header]). The path (math.ts dockPath) shrinks
 *   them early and keeps them below the header band until they are under the logo slot, so they
 *   never cross the nav or the buttons. Scrolling back reverses it.
 * - Hand-over from the static SVG mark: the first frame draws the plates flat and in register at
 *   the SVG's exact position and size, the canvas fades in over it, then the plates come apart
 *   into the stack. With the intro, they arrive from depth instead (print order Y, M, C, K).
 *
 * The canvas scrolls with the hero and sits above the header (z-index), composited with
 * `mix-blend-mode: multiply`, so only ink shows and the paper, grain and text stay as they are.
 * One draw loop; it stops when the hero is off-screen, once docked, and while the tab is hidden.
 */
import { Camera, Geometry, Mesh, Program, Renderer, Transform } from 'ogl';
import { ARCH, ARCH_PLATES } from '~/components/logo-paths';
import { boundsOf, extrude, flatShape, sampleOutline, toLocal } from './geometry';
import {
  clamp,
  damp,
  dockDistance,
  dockPath,
  dockProgress,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  placeInBox,
  smoothstep,
  type Placement,
  type ViewBox,
} from './math';
import { depthFragment, fieldFragment, fieldVertex, plateFragment, plateVertex } from './shaders';

export interface SceneElements {
  hero: HTMLElement;
  /** Parent of the canvas (fills the hero). */
  stage: HTMLElement;
  /** Wrapper of the static SVG mark; faded out while the canvas fades in. */
  markBox: HTMLElement;
  /** The static SVG mark: its box is the rest position and size of the plates. */
  mark: SVGSVGElement;
  /** Hero text block: the ambient field keeps clear of it. */
  copy: HTMLElement | null;
  header: HTMLElement | null;
  /** Header logo <svg>: the docking target. */
  headerLogo: SVGSVGElement | null;
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

/** Vertical field of view in degrees. Narrow, so the plates keep the logo's proportions. */
const FOV = 30;
/** Depth between neighbouring plates in the exploded stack, in logo raster units. */
const SEPARATION = 85;
/** Extrusion depth of each plate, in logo raster units. */
const THICKNESS = 34;
/** Rest rotation of the stack (radians): the right end recedes, the top leans in. */
const REST_TILT = { x: 0.12, y: 0.36, z: -0.03 };
/** Extra rotation at full pointer deflection (radians, about 4° and 6°). */
const POINTER_TILT = { x: 0.07, y: 0.1 };
/** Canvas fade-in over the SVG mark, seconds. */
const FADE_IN = 0.6;
/** Without the intro: delay and duration of the plates coming apart into the stack. */
const ALIVE = { delay: 0.2, duration: 1.8 };
/** Intro: stagger between plates, duration per plate, start depth (raster units). */
const INTRO = { stagger: 0.12, duration: 1.3, depth: 1900 };
const INTRO_TOTAL = INTRO.stagger * 3 + INTRO.duration;
/**
 * Ambient field: instance grid, sheet tilt (radians), ink strength, share of C/M/Y accent arches
 * among the key ones, and how much the sheet lags the page scroll (depth parallax).
 */
const FIELD = { cols: 44, rows: 44, tilt: -0.42, alpha: 0.3, accents: 0.12, scrollLag: 0.4 };
/** Docking: gap kept below the header band, and the plates' half-height with slack (raster). */
const DOCK_MARGIN = 16;
const PLATE_EXTENT = 130;
/** Upper bound for drawing-buffer pixels (keeps 2560 px wide screens cheap). */
const MAX_PIXELS = 6_000_000;
const RESIZE_DEBOUNCE = 150;

/** Exploded-stack pose and intro start offset per plate (raster units, radians). */
const POSE = {
  c: { depth: 1.5, dx: -9, dy: 6, rz: 0.012, phase: 0, print: 2, ix: -170, iy: 90, irz: -0.22 },
  m: { depth: 0.5, dx: 7, dy: -5, rz: -0.009, phase: 1.3, print: 1, ix: 150, iy: 70, irz: 0.18 },
  y: {
    depth: -0.5,
    dx: -5,
    dy: -8,
    rz: 0.006,
    phase: 2.6,
    print: 0,
    ix: -120,
    iy: -110,
    irz: 0.14,
  },
  k: { depth: -1.5, dx: 8, dy: 4, rz: -0.012, phase: 3.9, print: 3, ix: 160, iy: -80, irz: -0.16 },
} as const;

const KEY_HEX = '#221F20';

const hexToRgb = (hex: string): Float32Array => {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return new Float32Array([((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]);
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
  /** Header logo arches, in viewport coordinates (the header is fixed). */
  dock: Placement | null;
  headerBottom: number;
  /** Scroll distance of the docking move. */
  distance: number;
  /** Rest position of the ambient sheet (world px). */
  fieldY: number;
  fieldZ: number;
}

export const createHeroScene = (
  els: SceneElements,
  canvas: HTMLCanvasElement,
  onLost: () => void,
): HeroScene => {
  const { hero, stage, markBox, mark, copy, header, headerLogo } = els;
  const markViewBox = viewBoxOf(mark);
  if (!markViewBox) throw new Error('Hero mark has no viewBox');
  // The plates pivot on the centre of the mark; the same raster point is mapped into the header.
  const centerX = markViewBox.x + markViewBox.width / 2;
  const centerY = markViewBox.y + markViewBox.height / 2;
  const headerViewBox = headerLogo ? viewBoxOf(headerLogo) : null;

  const renderer = new Renderer({
    canvas,
    dpr: 1,
    alpha: false,
    antialias: true,
    depth: true,
    powerPreference: 'low-power',
  });
  const gl = renderer.gl;
  gl.clearColor(1, 1, 1, 1);

  const camera = new Camera(gl, { fov: FOV, near: 1, far: 10_000 });

  // Plates: one extruded arch, shared by the four meshes.
  const plateSolid = extrude(toLocal(sampleOutline(ARCH, 9), centerX, centerY), THICKNESS);
  const plateGeometry = new Geometry(gl, {
    position: { size: 3, data: plateSolid.position },
    normal: { size: 3, data: plateSolid.normal },
    wall: { size: 1, data: plateSolid.wall },
    index: { data: plateSolid.index },
  });
  const plateUniforms = {
    uInk: { value: new Float32Array(3) },
    uAlpha: { value: 1 },
  };
  const colorProgram = new Program(gl, {
    vertex: plateVertex,
    fragment: plateFragment,
    uniforms: plateUniforms,
    depthTest: true,
    depthWrite: false,
    cullFace: gl.BACK,
  });
  colorProgram.setBlendFunc(gl.DST_COLOR, gl.ZERO);
  const depthProgram = new Program(gl, {
    vertex: plateVertex,
    fragment: depthFragment,
    depthTest: true,
    depthWrite: true,
    cullFace: gl.BACK,
  });

  const group = new Transform();
  const plates = ARCH_PLATES.map((p) => {
    const mesh = new Mesh(gl, {
      geometry: plateGeometry,
      program: colorProgram,
      frustumCulled: false,
    });
    mesh.setParent(group);
    return { offset: p.x, ink: hexToRgb(p.hex), pose: POSE[p.id], mesh, alpha: 1 };
  });

  // Ambient field: small flat arches (width 1), instanced over a grid of cells.
  const smallOutline = sampleOutline(ARCH, 4);
  const smallBounds = boundsOf(smallOutline);
  const smallShape = flatShape(
    toLocal(
      smallOutline,
      (smallBounds.minX + smallBounds.maxX) / 2,
      (smallBounds.minY + smallBounds.maxY) / 2,
      1 / (smallBounds.maxX - smallBounds.minX),
    ),
  );
  const cells = new Float32Array(FIELD.cols * FIELD.rows * 2);
  // Ink per cell: 0 key, 1 cyan, 2 magenta, 3 yellow (a fixed scatter of accents).
  const tones = new Float32Array(FIELD.cols * FIELD.rows);
  for (let j = 0; j < FIELD.rows; j++) {
    for (let i = 0; i < FIELD.cols; i++) {
      const n = j * FIELD.cols + i;
      cells[n * 2] = i - (FIELD.cols - 1) / 2;
      cells[n * 2 + 1] = j - (FIELD.rows - 1) / 2;
      const hash = Math.abs(Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1;
      tones[n] = hash < FIELD.accents ? 1 + Math.floor((hash / FIELD.accents) * 3) : 0;
    }
  }
  const fieldGeometry = new Geometry(gl, {
    position: { size: 2, data: smallShape.position },
    index: { data: smallShape.index },
    cell: { size: 2, instanced: 1, data: cells },
    tone: { size: 1, instanced: 1, data: tones },
  });
  const inkOf = (id: (typeof ARCH_PLATES)[number]['id']): Float32Array => {
    const plate = ARCH_PLATES.find((p) => p.id === id);
    return hexToRgb(plate ? plate.hex : KEY_HEX);
  };
  const sourceNdc = new Float32Array(2);
  const pointerNdc = new Float32Array(2);
  const fieldUniforms = {
    uTime: { value: 0 },
    uSpacing: { value: 1 },
    uPointer: { value: pointerNdc },
    uPointerAmt: { value: 0 },
    uAspect: { value: 1 },
    uInk: { value: inkOf('k') },
    uCyan: { value: inkOf('c') },
    uMagenta: { value: inkOf('m') },
    uYellow: { value: inkOf('y') },
    uSource: { value: sourceNdc },
    uSourceAmt: { value: 0 },
    uAlpha: { value: 0 },
    uSize: { value: new Float32Array(2) },
    uDpr: { value: 1 },
    uClear: { value: new Float32Array(4) },
    uTop: { value: 0 },
    uFar: { value: 1 },
  };
  const fieldProgram = new Program(gl, {
    vertex: fieldVertex,
    fragment: fieldFragment,
    uniforms: fieldUniforms,
    depthTest: true,
    depthWrite: false,
    cullFace: false,
  });
  fieldProgram.setBlendFunc(gl.DST_COLOR, gl.ZERO);
  const fieldRoot = new Transform();
  const fieldMesh = new Mesh(gl, {
    geometry: fieldGeometry,
    program: fieldProgram,
    frustumCulled: false,
  });
  fieldMesh.setParent(fieldRoot);

  // OGL only warns when a shader fails; refuse the scene so the static composition stays.
  for (const program of [colorProgram, depthProgram, fieldProgram]) {
    if (!gl.getProgramParameter(program.program, gl.LINK_STATUS)) {
      throw new Error('Hero scene shaders failed to link');
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Measurements (on start, on resize, when fonts settle). Reads only; no writes in between.
  // ---------------------------------------------------------------------------------------------

  let m: Metrics | null = null;

  const measure = (): Metrics => {
    const heroRect = hero.getBoundingClientRect();
    const markRect = mark.getBoundingClientRect();
    const headerRect = header?.getBoundingClientRect();
    const logoRect = headerLogo?.getBoundingClientRect();
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
    const dock =
      logoRect && headerViewBox && logoRect.width > 0
        ? placeInBox(logoRect, headerViewBox, centerX, centerY)
        : null;
    const headerBottom = headerRect ? Math.max(0, headerRect.bottom) : 0;

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

    // Generous coverage: the sheet also lags the scroll and leans with the pointer.
    fieldUniforms.uSpacing.value =
      (2.1 * Math.max(width, height / Math.cos(FIELD.tilt))) / FIELD.cols;
    fieldUniforms.uAspect.value = width / height;
    fieldUniforms.uSize.value[0] = width;
    fieldUniforms.uSize.value[1] = height;
    fieldUniforms.uDpr.value = dpr;
    fieldUniforms.uFar.value = distance * 3;
    const clear = fieldUniforms.uClear.value;
    if (copyRect && copyRect.width > 0) {
      clear[0] = 0;
      clear[1] = copyRect.top - heroRect.top - 24;
      clear[2] = copyRect.right - heroRect.left + 48;
      clear[3] = height;
    } else {
      clear.fill(-1e4);
    }

    return {
      width,
      height,
      heroTop: heroRect.top + scrollY,
      heroLeft: heroRect.left,
      rest,
      dock,
      headerBottom,
      distance: dockDistance(height, headerBottom),
      fieldY: -height * 0.05,
      fieldZ: -distance * 0.35,
    };
  };

  // ---------------------------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------------------------

  let fieldAlpha = 0;

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
    fieldRoot.updateMatrixWorld();

    gl.colorMask(true, true, true, true);
    renderer.setDepthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const inked = plates.filter((p) => p.alpha > 0.002);

    if (fieldAlpha > 0.002) {
      // Union depth of all plates first, so the field never shows through them.
      gl.colorMask(false, false, false, false);
      inked.forEach((p) => drawDepth(p.mesh));
      gl.colorMask(true, true, true, true);
      fieldUniforms.uAlpha.value = fieldAlpha;
      fieldMesh.draw({ camera });
    }

    // Each plate prints once: its nearest surface only (own depth pass), multiplied onto the rest.
    for (const p of inked) {
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
  let visible = true;
  let docked = false;
  let handedOver = false;
  let lastDock = -1;
  let resizeTimer = 0;
  const pointer = { x: 0, y: 0, amount: 0 };
  const cursor = { x: 0, y: 0, inside: false };

  const setHeaderDock = (value: number): void => {
    if (!header) return;
    const rounded = Math.round(value * 1000) / 1000;
    if (rounded === lastDock) return;
    lastDock = rounded;
    header.style.setProperty('--dock', String(rounded));
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
    const fadeIn = intro ? 1 : clamp(clock / FADE_IN);
    const alive = intro ? 1 : easeInOutCubic((clock - ALIVE.delay) / ALIVE.duration);
    const collapse = easeInOutCubic(progress / 0.78);
    const dock = smoothstep(0.93, 1, progress);
    const explode = alive * (1 - collapse);
    const introDone = !intro || clock >= INTRO_TOTAL;

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

    // Group: along the docking path, which works in viewport px (the plates stay clear of the
    // header band while the page scrolls under them), then back into hero coordinates.
    let x = m.rest.x;
    let y = m.rest.y;
    let scale = m.rest.scale;
    if (m.dock) {
      const place = dockPath(progress, {
        rest: m.rest,
        dock: { x: m.dock.x - m.heroLeft, y: m.dock.y, scale: m.dock.scale },
        bandBottom: m.headerBottom + DOCK_MARGIN,
        extent: PLATE_EXTENT,
      });
      x = place.x;
      y = place.y + scrolled;
      scale = place.scale;
    }
    group.position.set(x - m.width / 2, m.height / 2 - y, 0);
    group.scale.set(scale, scale, scale);
    group.rotation.set(
      explode * (REST_TILT.x - pointer.y * POINTER_TILT.x),
      explode * (REST_TILT.y + pointer.x * POINTER_TILT.y),
      explode * REST_TILT.z,
    );

    // Plates: depth separation, misregistration and breathing, all scaled by `explode`.
    for (const p of plates) {
      const pose = p.pose;
      // Intro: the plate comes forward from depth (no overshoot) while its register offset snaps
      // in with a small overshoot.
      let ahead = 1;
      let snap = 1;
      let ink = 1;
      if (intro) {
        const t = clamp((clock - pose.print * INTRO.stagger) / INTRO.duration);
        ahead = easeOutCubic(t);
        snap = easeOutBack(t, 1.4);
        ink = clamp(t * 2.5);
      }
      const away = 1 - snap;
      const zRest = pose.depth * SEPARATION;
      const z =
        explode * (zRest + Math.sin(clock * 0.62 + pose.phase) * 0.1 * SEPARATION) -
        (1 - ahead) * INTRO.depth;
      const px = p.offset + explode * (pose.dx + pointer.x * zRest * 0.12) + away * pose.ix;
      const py =
        explode * (pose.dy + Math.sin(clock * 0.47 + pose.phase) * 4 - pointer.y * zRest * 0.08) +
        away * pose.iy;
      const rz =
        explode * (pose.rz + Math.sin(clock * 0.33 + pose.phase * 1.7) * 0.006) + away * pose.irz;
      p.mesh.position.set(px, py, z);
      p.mesh.rotation.set(0, 0, rz);
      p.mesh.scale.set(1, 1, Math.max(0.001, explode));
      p.alpha = ink * (1 - dock);
    }

    // Ambient field.
    const fieldIn = intro ? smoothstep(0.5, INTRO_TOTAL, clock) : alive;
    fieldAlpha = FIELD.alpha * fadeIn * fieldIn * (1 - smoothstep(0, 0.6, progress));
    fieldRoot.position.set(
      -pointer.x * m.width * 0.015,
      m.fieldY - scrolled * FIELD.scrollLag,
      m.fieldZ,
    );
    fieldRoot.rotation.set(FIELD.tilt + pointer.y * 0.035, pointer.x * 0.05, 0);
    fieldUniforms.uTime.value = clock;
    // Rings pulse out from the plates' centre while they float in the stack.
    sourceNdc[0] = (x / m.width) * 2 - 1;
    sourceNdc[1] = 1 - (y / m.height) * 2;
    fieldUniforms.uSourceAmt.value = explode;
    pointerNdc[0] = pointer.x;
    pointerNdc[1] = pointer.y;
    fieldUniforms.uPointerAmt.value = pointer.amount;
    fieldUniforms.uTop.value = m.headerBottom + scrolled;

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
    setHeaderDock(Math.max(dock, 1 - fadeIn));

    if (progress >= 1 && introDone && handedOver) {
      // Docked: the header logo has taken over; nothing left to draw until the user scrolls back.
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
    if (!gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext();
  };

  // Measure once now so a layout problem fails here, before anything is shown.
  m = measure();

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

    // Header arches: hidden while the plates are in the hero, shown again as they dock.
    setHeaderDock(intro ? 0 : 1);
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
