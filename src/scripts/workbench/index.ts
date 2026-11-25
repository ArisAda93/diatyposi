/**
 * The /etaireia/ work-table scene (markup and styles: src/components/about/Workbench.astro; the
 * four steps: src/pages/etaireia.astro).
 *
 * Always (JS on): pointing at a step, in the list or on its marker, or focusing its button, marks
 * it (`data-active` on the figure, `is-active` on the step and the marker); a tap or click pins it
 * until it is tapped again or the visitor taps elsewhere (`aria-pressed`).
 *
 * With motion allowed and a hardware WebGL context, the photo becomes a depth-parallax scene
 * (./gl.ts, the depth map src/assets/about/workbench-depth.png, the maths in ./math.ts): the camera
 * glides to the marked step on a spring and zooms in while a soft spotlight pools on it; the pointer
 * looks around the table (near objects swing past far ones) and tilts the frame a few degrees in
 * 3D under a faint glare; with no pointer over it the scene breathes in a slow drift. The markers
 * follow their objects. The scene starts once the section is near the viewport, runs only while it
 * is on screen and the tab is visible, and falls back to the plain photo if the context is lost or
 * reduced motion is switched on.
 */
import { damp, springStep, type Spring } from '../motion';
import { createWorkbenchGL, type WorkbenchGL } from './gl';
import {
  BASE_ZOOM,
  FOCUS_ZOOM,
  PARALLAX,
  breathe,
  clampCenter,
  pointerAxis,
  sampleDepth,
  toView,
  type Point,
} from './math';

/** Spring of the camera glide (stiffness, damping): a soft arrival with a hint of settle. */
const GLIDE = { stiffness: 70, damping: 15 };
/** Tilt of the frame at full pointer travel (degrees): around x, around y. */
const TILT = { x: 3, y: 4.5 };
/** Share of the pointer's reach the breathing uses. */
const BREATH = 0.55;

const reduceQuery = '(prefers-reduced-motion: reduce)';

const loadImage = async (src: string): Promise<HTMLImageElement | null> => {
  const image = new Image();
  image.decoding = 'async';
  image.src = src;
  try {
    await image.decode();
    return image;
  } catch {
    return null;
  }
};

/** The depth map's red channel (0–255) for marker placement, or null. */
const readDepth = (image: HTMLImageElement): { data: Uint8Array; w: number; h: number } | null => {
  try {
    const w = image.naturalWidth;
    const h = image.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || !w || !h) return null;
    ctx.drawImage(image, 0, 0);
    const rgba = ctx.getImageData(0, 0, w, h).data;
    const data = new Uint8Array(w * h);
    for (let i = 0; i < data.length; i++) data[i] = rgba[i * 4] ?? 0;
    return { data, w, h };
  } catch {
    return null;
  }
};

export const initWorkbench = (): void => {
  const root = document.querySelector<HTMLElement>('[data-workbench]');
  if (!root || root.dataset.wbReady) return;
  root.dataset.wbReady = '1';
  const media = root.querySelector<HTMLElement>('[data-wb-media]');
  const frame = root.querySelector<HTMLElement>('[data-wb-frame]');
  const host = root.querySelector<HTMLElement>('[data-wb-scene]');
  const photoEl = root.querySelector<HTMLImageElement>('picture img');
  const markers = [...root.querySelectorAll<HTMLElement>('[data-wb-marker]')];
  const steps = [...document.querySelectorAll<HTMLButtonElement>('[data-wb-step]')];
  if (!media || !frame || !host || !photoEl || markers.length === 0) return;

  const points: Point[] = markers.map((m) => ({
    x: Number(m.dataset.x) / 100,
    y: Number(m.dataset.y) / 100,
  }));

  // ---------------------------------------------------------------------------------------------
  // Marking a step (always)
  // ---------------------------------------------------------------------------------------------

  let hovered: number | null = null;
  let pinned: number | null = null;
  const active = (): number | null => hovered ?? pinned;

  const render = (): void => {
    const a = active();
    if (a === null) delete root.dataset.active;
    else root.dataset.active = String(a);
    markers.forEach((m, i) => m.classList.toggle('is-active', i === a));
    steps.forEach((s, i) => {
      s.classList.toggle('is-active', i === a);
      s.setAttribute('aria-pressed', String(i === pinned));
    });
    wake();
  };
  const hover = (i: number | null): void => {
    hovered = i;
    render();
  };
  const pin = (i: number): void => {
    pinned = pinned === i ? null : i;
    render();
  };

  const bind = (el: HTMLElement, i: number): void => {
    el.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'touch') hover(i);
    });
    el.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'touch' && hovered === i) hover(null);
    });
    el.addEventListener('click', () => pin(i));
  };
  steps.forEach((s, i) => {
    bind(s, i);
    s.addEventListener('focus', () => {
      if (s.matches(':focus-visible')) hover(i);
    });
    s.addEventListener('blur', () => {
      if (hovered === i) hover(null);
    });
  });
  markers.forEach((m, i) => bind(m, i));
  // A tap anywhere else lets go of a pinned step.
  document.addEventListener('pointerdown', (e) => {
    if (pinned === null) return;
    const target = e.target as Node | null;
    if (target && (root.contains(target) || steps.some((s) => s.contains(target)))) return;
    pinned = null;
    render();
  });

  // ---------------------------------------------------------------------------------------------
  // The live scene (motion allowed, WebGL)
  // ---------------------------------------------------------------------------------------------

  const reduce = matchMedia(reduceQuery);
  let scene: WorkbenchGL | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let depthMap: { data: Uint8Array; w: number; h: number } | null = null;
  let starting = false;
  let failed = false;
  let visible = false;
  let raf = 0;
  let last = 0;
  let clock = 0;

  const pointer = { x: 0, y: 0, inside: false, tx: 0, ty: 0 };
  const look = { x: 0, y: 0 };
  const cx: Spring = { x: 0.5, v: 0 };
  const cy: Spring = { x: 0.5, v: 0 };
  const zoom: Spring = { x: BASE_ZOOM, v: 0 };
  let focusDepth = 0.5;
  let spotOn = 0;
  const spot = { x: 0.5, y: 0.5 };
  let glare = 0;

  const depthAt = (p: Point): number =>
    depthMap ? sampleDepth(depthMap.data, depthMap.w, depthMap.h, p) : 0.5;

  const resize = (): void => {
    if (!scene) return;
    const rect = media.getBoundingClientRect();
    scene.resize(rect.width, rect.height, Math.min(window.devicePixelRatio || 1, 2));
  };

  const frameStep = (now: number): void => {
    raf = 0;
    if (!scene || !visible || document.hidden) return;
    const dt = last ? Math.min(64, now - last) : 16;
    last = now;
    clock += dt / 1000;

    // Where the camera looks: the pointer over the photo, else the slow breathing.
    const b = breathe(clock);
    const lookTarget = pointer.inside
      ? { x: pointer.tx, y: pointer.ty }
      : { x: b.x * BREATH, y: b.y * BREATH };
    look.x = damp(look.x, lookTarget.x, pointer.inside ? 6 : 2, dt);
    look.y = damp(look.y, lookTarget.y, pointer.inside ? 6 : 2, dt);

    // Where the camera goes: the marked step, else the whole table.
    const a = active();
    const goal =
      a === null ? { x: 0.5, y: 0.5 } : clampCenter(points[a] ?? { x: 0.5, y: 0.5 }, FOCUS_ZOOM);
    Object.assign(cx, springStep(cx, goal.x, dt, GLIDE.stiffness, GLIDE.damping));
    Object.assign(cy, springStep(cy, goal.y, dt, GLIDE.stiffness, GLIDE.damping));
    Object.assign(
      zoom,
      springStep(zoom, a === null ? BASE_ZOOM : FOCUS_ZOOM, dt, GLIDE.stiffness, GLIDE.damping),
    );
    const z = Math.max(1, zoom.x);
    const center = { x: cx.x, y: cy.x };
    focusDepth = damp(focusDepth, depthAt(a === null ? center : (points[a] ?? center)), 4, dt);
    spotOn = damp(spotOn, a === null ? 0 : 1, 5, dt);
    glare = damp(glare, pointer.inside ? 1 : 0, 4, dt);

    const camera = {
      center,
      zoom: z,
      shift: { x: look.x * PARALLAX, y: look.y * PARALLAX },
      focusDepth,
    };
    if (a !== null) {
      const p = points[a] ?? center;
      const v = toView(p, depthAt(p), camera);
      spot.x = v.x;
      spot.y = v.y;
    }
    scene.draw({ ...camera, spot, spotOn });

    // The markers ride on their objects; one pushed out of the view fades away.
    markers.forEach((m, i) => {
      const p = points[i];
      if (!p) return;
      const v = toView(p, depthAt(p), camera);
      m.style.setProperty('--wb-x', `${(v.x * 100).toFixed(3)}%`);
      m.style.setProperty('--wb-y', `${(v.y * 100).toFixed(3)}%`);
      m.classList.toggle('is-out', v.x < 0.03 || v.x > 0.97 || v.y < 0.04 || v.y > 0.96);
    });

    // The frame tilts towards the pointer (a whisper of it while breathing) under a faint glare.
    frame.style.setProperty('--wb-rx', `${(-look.y * TILT.x).toFixed(3)}deg`);
    frame.style.setProperty('--wb-ry', `${(look.x * TILT.y).toFixed(3)}deg`);
    frame.style.setProperty('--wb-gx', `${((look.x * 0.5 + 0.5) * 100).toFixed(2)}%`);
    frame.style.setProperty('--wb-gy', `${((look.y * 0.5 + 0.5) * 100).toFixed(2)}%`);
    frame.style.setProperty('--wb-glare', glare.toFixed(3));

    raf = requestAnimationFrame(frameStep);
  };

  function wake(): void {
    if (!scene || raf || !visible || document.hidden) return;
    last = 0;
    raf = requestAnimationFrame(frameStep);
  }

  const stop = (): void => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  const teardown = (): void => {
    stop();
    scene?.destroy();
    scene = null;
    canvas?.remove();
    canvas = null;
    root.classList.remove('is-live');
    markers.forEach((m) => {
      m.style.removeProperty('--wb-x');
      m.style.removeProperty('--wb-y');
      m.classList.remove('is-out');
    });
    for (const name of ['--wb-rx', '--wb-ry', '--wb-gx', '--wb-gy', '--wb-glare']) {
      frame.style.removeProperty(name);
    }
  };

  const start = async (): Promise<void> => {
    if (scene || starting || failed || reduce.matches) return;
    starting = true;
    try {
      if (!photoEl.complete) {
        await new Promise<void>((done) =>
          photoEl.addEventListener('load', () => done(), { once: true }),
        );
      }
      const [photo, depth] = await Promise.all([
        loadImage(photoEl.currentSrc || photoEl.src),
        loadImage(root.dataset.depth ?? ''),
      ]);
      if (!photo || !depth || reduce.matches) {
        failed = !photo || !depth;
        return;
      }
      depthMap = readDepth(depth);
      canvas = document.createElement('canvas');
      canvas.className = 'wb-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      host.append(canvas);
      scene = createWorkbenchGL(canvas, photo, depth, () => {
        failed = true;
        teardown();
      });
      if (!scene) {
        failed = true;
        canvas.remove();
        canvas = null;
        return;
      }
      resize();
      root.classList.add('is-live');
      wake();
    } finally {
      starting = false;
    }
  };

  media.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const p = pointerAxis(e.clientX, e.clientY, media.getBoundingClientRect());
    pointer.inside = true;
    pointer.tx = p.x;
    pointer.ty = p.y;
    wake();
  });
  media.addEventListener('pointerleave', () => {
    pointer.inside = false;
    wake();
  });

  new ResizeObserver(resize).observe(media);
  new IntersectionObserver(
    ([entry]) => {
      visible = entry?.isIntersecting ?? false;
      if (visible) {
        void start();
        wake();
      } else stop();
    },
    { rootMargin: '200px 0px' },
  ).observe(root);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : wake()));
  reduce.addEventListener('change', () => {
    if (reduce.matches) teardown();
    else void start();
  });
};
