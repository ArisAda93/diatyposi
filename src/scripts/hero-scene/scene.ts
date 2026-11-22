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
 * - As the hero scrolls out (scrubbed, nothing pinned), the plates first blend to the mark from
 *   whatever pose they are in (the loop slows to a stop), then collapse into register, flatten and
 *   travel to the exact place and size of the header logo's arches, which then take over
 *   (`--dock` 0–1 and `data-docked` on [data-header]). The path (math.ts dockPath) shrinks them
 *   early and keeps them below the header band until they are under the logo slot. Scrolling back
 *   reverses it, and the loop resumes once the hero is back at the top.
 * - Hand-over from the static SVG mark: the first frame draws the plates flat and in register at
 *   the SVG's exact position and size, the canvas fades in over it, then the plates come apart
 *   into the mark pose and the loop starts. With the intro, they arrive from depth instead (print
 *   order Y, M, C, K) and the loop starts once they have landed.
 *
 * The canvas scrolls with the hero and sits above the header (z-index), composited with
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
  dockBlend,
  markPose,
  markTilt,
  platePoseAt,
  poseBounds,
  registerPose,
  tiltAt,
  type PlateId,
  type PlateLayout,
  type PlatePose,
} from './choreography';
import { extrude, sampleOutline, toLocal } from './geometry';
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
import {
  depthFragment,
  lineFragment,
  plateFragment,
  plateVertex,
  quadVertex,
  shadowFragment,
} from './shaders';

export interface SceneElements {
  hero: HTMLElement;
  /** Parent of the canvas (fills the hero). */
  stage: HTMLElement;
  /** Wrapper of the static SVG mark; faded out while the canvas fades in. */
  markBox: HTMLElement;
  /** The static SVG mark: its box is the rest position and size of the plates. */
  mark: SVGSVGElement;
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
/** Crosshair hairlines: width in CSS px, ink strength. */
const HAIRLINE = { width: 1, alpha: 0.92 };
/**
 * Contact shadow: ink strength, size relative to the plates' bounds, offset towards the lower
 * right (share of the bounds; light from the upper left), and depth below the rearmost plate
 * (raster units). Set alpha to 0 to remove it.
 */
const SHADOW = { alpha: 0.07, spread: 1.3, offset: { x: 0.04, y: -0.1 }, depth: 40 };
/** Docking: gap kept below the header band, and the plates' half-height with slack (raster). */
const DOCK_MARGIN = 16;
const PLATE_EXTENT = 130;
/** Upper bound for drawing-buffer pixels (keeps 2560 px wide screens cheap). */
const MAX_PIXELS = 6_000_000;
const RESIZE_DEBOUNCE = 150;

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
}

export const createHeroScene = (
  els: SceneElements,
  canvas: HTMLCanvasElement,
  onLost: () => void,
): HeroScene => {
  const { hero, stage, markBox, mark, header, headerLogo } = els;
  const markViewBox = viewBoxOf(mark);
  if (!markViewBox) throw new Error('Hero mark has no viewBox');
  // The group pivots on the centre of the mark; the same raster point is mapped into the header.
  const centerX = markViewBox.x + markViewBox.width / 2;
  const centerY = markViewBox.y + markViewBox.height / 2;
  const headerViewBox = headerLogo ? viewBoxOf(headerLogo) : null;

  // The arch, measured and centred on its own anchor, so every plate turns about its middle.
  const archOutline = sampleOutline(ARCH, 9);
  const metrics = archMetrics(archOutline);
  const layout = buildLayout(metrics, ARCH_PLATES, { x: centerX, y: centerY });
  const plateOutline = toLocal(archOutline, metrics.anchor.x, metrics.anchor.y);

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
  const plateSolid = extrude(plateOutline, THICKNESS);
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
  const hexOf = (id: PlateId): string => {
    const plate = ARCH_PLATES.find((p) => p.id === id);
    if (!plate) throw new Error(`No logo plate ${id}`);
    return plate.hex;
  };
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
  const keyInk = hexToRgb(hexOf('k'));
  const lineUniforms = { uInk: { value: keyInk }, uAlpha: { value: 0 } };
  const lineProgram = new Program(gl, {
    vertex: quadVertex,
    fragment: lineFragment,
    uniforms: lineUniforms,
    depthTest: false,
    depthWrite: false,
    cullFace: false,
  });
  lineProgram.setBlendFunc(gl.DST_COLOR, gl.ZERO);
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

  const shadowUniforms = { uInk: { value: keyInk }, uAlpha: { value: 0 } };
  const shadowProgram = new Program(gl, {
    vertex: quadVertex,
    fragment: shadowFragment,
    uniforms: shadowUniforms,
    depthTest: false,
    depthWrite: false,
    cullFace: false,
  });
  shadowProgram.setBlendFunc(gl.DST_COLOR, gl.ZERO);
  const shadow = new Mesh(gl, {
    geometry: quadGeometry,
    program: shadowProgram,
    frustumCulled: false,
  });
  shadow.setParent(group);

  // OGL only warns when a shader fails; refuse the scene so the static composition stays.
  for (const program of [colorProgram, depthProgram, lineProgram, shadowProgram]) {
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

    return {
      width,
      height,
      heroTop: heroRect.top + scrollY,
      heroLeft: heroRect.left,
      rest,
      dock,
      headerBottom,
      distance: dockDistance(height, headerBottom),
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
    const { toMark, collapse } = dockBlend(progress);
    const fadeIn = intro ? 1 : clamp(clock / FADE_IN);
    const alive = intro ? 1 : easeInOutCubic((clock - ALIVE.delay) / ALIVE.duration);
    const dock = smoothstep(0.93, 1, progress);
    const explode = alive * (1 - collapse);
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
    const tilt = blendTilt(tiltAt(loopClock), markTilt(), toMark);
    group.position.set(x - m.width / 2, m.height / 2 - y, 0);
    group.scale.set(scale, scale, scale);
    group.rotation.set(
      explode * (tilt.x - pointer.y * POINTER_TILT.x),
      explode * (tilt.y + pointer.x * POINTER_TILT.y),
      explode * tilt.z,
    );

    // Plates: the loop pose, blended to the mark on scroll-out, then towards flat register by
    // `explode` (the hand-over at the start, the collapse before docking).
    poses.length = 0;
    let inkSum = 0;
    for (const p of plates) {
      const live = blendPose(
        platePoseAt(loopClock, p.layout, layout),
        markPose(p.layout, loopClock),
        toMark,
      );
      const pose = blendPose(registerPose(p.layout), live, explode);
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
        pose.x + pointer.x * pose.z * PARALLAX.x + away * from.x,
        pose.y - pointer.y * pose.z * PARALLAX.y + away * from.y,
        pose.z - (1 - ahead) * INTRO.depth,
      );
      p.mesh.rotation.set(pose.rx, 0, pose.rz + away * from.rz);
      p.mesh.scale.set(pose.scale, pose.scale, pose.scale * Math.max(0.001, explode));
      p.alpha = ink * (1 - dock);
      inkSum += ink;
    }

    // Contact shadow: under the plates' current footprint, offset away from the light.
    const ink = inkSum / plates.length;
    shadowUniforms.uAlpha.value = SHADOW.alpha * explode * fadeIn * ink * (1 - dock);
    if (shadowUniforms.uAlpha.value > 0.002) {
      const b = poseBounds(poses, plateOutline);
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

    // Registration crosshair through the ring's centre (empty outside the target hold).
    const cross = crosshairAt(loopClock);
    lineUniforms.uAlpha.value = HAIRLINE.alpha * explode * fadeIn * (1 - toMark);
    placeLine(lineH, cross.horizontal, false, scale);
    placeLine(lineV, cross.vertical, true, scale);

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
