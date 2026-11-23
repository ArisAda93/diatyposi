/**
 * Home statement: an interactive halftone field on a 2D canvas. Dot sizes trace the four logo
 * arches (ARCH geometry and plate offsets from logo-paths.ts), one dot screen per ink: cyan,
 * magenta, yellow and the key plate printed in paper, as on the ink version of the logo. The inks
 * are screen-blended on the dark section.
 *
 * - The dots print in (grow from 0, sweeping left to right) as the section scrolls into view.
 * - Fine pointers: dots swell gently around the pointer. Touch: a tap sends a slow ripple (a touch
 *   that turns into a scroll does not), and one ripple runs on its own when the print-in finishes.
 * - Dots under the heading are kept small so the text stays readable.
 * - The rAF loop runs only while the section is on screen and something moves. The canvas is
 *   drawn at most at 2 device pixels per CSS px (1.5 on phones) and 4 megapixels.
 * - Reduced motion (live): the finished field is drawn once, nothing moves.
 *
 * The heavy set-up waits until the section is close to the viewport. Until then, and without JS,
 * the static SVG halftone arches in Statement.astro show instead (`.is-field` hides them).
 */
import { ARCH, ARCH_PLATES } from '~/components/logo-paths';

// ------------------------------------------------------------------------------------------------
// Pure helpers (covered by tests/motion.test.ts)
// ------------------------------------------------------------------------------------------------

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/**
 * Average alpha (0–1) of each `ss` × `ss` block of an RGBA buffer that is `cols * ss` pixels wide:
 * the ink coverage of every halftone cell, with anti-aliased edges.
 */
export const blockCoverage = (
  rgba: ArrayLike<number>,
  cols: number,
  rows: number,
  ss: number,
): Float32Array => {
  const out = new Float32Array(cols * rows);
  const stride = cols * ss;
  const norm = 1 / (ss * ss * 255);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      let sum = 0;
      for (let dy = 0; dy < ss; dy++) {
        const row = (j * ss + dy) * stride + i * ss;
        for (let dx = 0; dx < ss; dx++) sum += rgba[(row + dx) * 4 + 3] ?? 0;
      }
      out[j * cols + i] = sum * norm;
    }
  }
  return out;
};

/** How far one dot has printed (0–1) at an overall progress, given its delay (0–1). */
export const printAmount = (progress: number, delay: number): number =>
  smoothstep(0, 1, progress * 1.5 - delay * 0.5);

/** Pointer swell weight for a squared distance inside a squared radius (1 at the centre). */
export const swellFalloff = (distSq: number, radiusSq: number): number => {
  if (distSq >= radiusSq) return 0;
  const t = 1 - distSq / radiusSq;
  return t * t;
};

/** Weight of a ripple ring of radius `ring` and half-width `width` at a distance. */
export const rippleBand = (distance: number, ring: number, width: number): number => {
  const t = (distance - ring) / width;
  return Math.exp(-t * t);
};

/** Print-in target (0–1) from the section's top and height and the viewport height, in px. */
export const scrollPrint = (top: number, height: number, viewport: number): number =>
  top + height <= viewport ? 1 : clamp01((viewport - top) / (viewport * 0.6));

export interface ArchBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Logo-space box of the four arches (the `mark` logo view box). */
export const MARK = { x: 690, y: 50, w: 840, h: 205 } as const;

/** Where the arches sit in a section of this size: bottom right, bleeding off the edges. */
export const archBox = (width: number, height: number): ArchBox => {
  const wide = width >= 1024;
  const w = width * (wide ? 0.74 : 1.18);
  const h = (w * MARK.h) / MARK.w;
  return { x: width - w * (wide ? 0.97 : 0.93), y: height - h * 0.97, w, h };
};

// ------------------------------------------------------------------------------------------------
// Runtime
// ------------------------------------------------------------------------------------------------

type PlateId = (typeof ARCH_PLATES)[number]['id'];

/** Inks on the dark section (key prints in paper) and each screen's offset in cells. */
const INKS: Record<PlateId, { color: string; alpha: number; shift: [number, number] }> = {
  c: { color: '#00AEEF', alpha: 0.55, shift: [0, 0] },
  m: { color: '#ED008C', alpha: 0.55, shift: [0.5, 0] },
  y: { color: '#FFF100', alpha: 0.45, shift: [0, 0.5] },
  k: { color: '#FAFAF7', alpha: 0.18, shift: [0.5, 0.5] },
};
const BARE = { color: '#FAFAF7', alpha: 0.16, radius: 0.8 };
const SUPERSAMPLE = 3;
const TAU = Math.PI * 2;
const SWELL_RADIUS = 150;
const SWELL_GAIN = 0.65;
const RIPPLE_MS = 2600;
const RIPPLE_WIDTH = 60;
const RIPPLE_GAIN = 0.7;
const MAX_CANVAS_PIXELS = 4_000_000;
/** Device-pixel caps: phones (sections narrower than PHONE_WIDTH) and everything else. */
const DPR_CAP = { phone: 1.5, other: 2 } as const;
const PHONE_WIDTH = 768;

interface Dot {
  x: number;
  y: number;
  /** Full-size radius (coverage × fade × max radius). */
  r: number;
  /** Print-in delay, 0–1. */
  d: number;
}

interface Screen {
  color: string;
  alpha: number;
  dots: Dot[];
}

interface Ripple {
  x: number;
  y: number;
  t: number;
}

const hash = (i: number, j: number, k: number): number => {
  const h = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
  return h - Math.floor(h);
};

export const initHalftoneField = (section: HTMLElement): void => {
  const canvas = section.querySelector<HTMLCanvasElement>('[data-statement-field]');
  const ctx = canvas?.getContext('2d');
  const scratch = document.createElement('canvas');
  const off = scratch.getContext('2d', { willReadFrequently: true });
  if (!canvas || !ctx || !off || typeof Path2D !== 'function') return;
  const text = section.querySelector<HTMLElement>('.statement-text');
  const arch = new Path2D(ARCH);

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');

  let width = 0;
  let height = 0;
  let dpr = 1;
  let pitch = 10;
  let cols = 0;
  let rows = 0;
  let ox = 0;
  let oy = 0;
  let screens: Screen[] = [];

  let still = reduce.matches;
  let visible = false;
  let raf = 0;
  let last = 0;
  let progress = 0;
  let target = 0;
  let autoRipple = false;

  // Pointer, in section coordinates.
  let hostLeft = 0;
  let hostTop = 0;
  let hostScroll = 0;
  let hovering = false;
  let swell = 0;
  let px = 0;
  let py = 0;
  let ptx = 0;
  let pty = 0;
  let ripples: Ripple[] = [];
  /** A touch (or coarse press) that may become a tap, in section coordinates. */
  let press: { id: number; x: number; y: number } | null = null;

  const layout = (): void => {
    const rect = section.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    // The heading's line boxes (tight to the glyphs), in section coordinates, with a margin.
    const pad = 12;
    const lines: { left: number; right: number; top: number; bottom: number }[] = [];
    if (text) {
      const range = document.createRange();
      range.selectNodeContents(text);
      Array.from(range.getClientRects()).forEach((line) => {
        lines.push({
          left: line.left - rect.left - pad,
          right: line.right - rect.left + pad,
          top: line.top - rect.top - pad,
          bottom: line.bottom - rect.top + pad,
        });
      });
    }
    const underText = (x: number, y: number): boolean =>
      lines.some((l) => x > l.left && x < l.right && y > l.top && y < l.bottom);

    const fit = Math.sqrt(MAX_CANVAS_PIXELS / Math.max(width * height, 1));
    const cap = width < PHONE_WIDTH ? DPR_CAP.phone : DPR_CAP.other;
    dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, cap, fit));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    pitch = width < 640 ? 7 : width < 1280 ? 9 : 10;
    cols = Math.ceil(width / pitch) + 1;
    rows = Math.ceil(height / pitch) + 1;
    ox = (width - (cols - 1) * pitch) / 2;
    oy = (height - (rows - 1) * pitch) / 2;

    const box = archBox(width, height);
    const k = box.w / MARK.w;
    const a = (k * SUPERSAMPLE) / pitch;
    const maxR = pitch * 0.5;
    scratch.width = cols * SUPERSAMPLE;
    scratch.height = rows * SUPERSAMPLE;

    screens = ARCH_PLATES.map((plate, plateIndex) => {
      const ink = INKS[plate.id];
      const sx = ox + ink.shift[0] * pitch;
      const sy = oy + ink.shift[1] * pitch;
      // Logo space → supersampled cell space, with this plate's x offset and screen shift.
      off.setTransform(1, 0, 0, 1, 0, 0);
      off.clearRect(0, 0, scratch.width, scratch.height);
      off.setTransform(
        a,
        0,
        0,
        a,
        ((box.x + (plate.x - MARK.x) * k - sx) / pitch + 0.5) * SUPERSAMPLE,
        ((box.y - MARK.y * k - sy) / pitch + 0.5) * SUPERSAMPLE,
      );
      off.fill(arch);
      const cover = blockCoverage(
        off.getImageData(0, 0, scratch.width, scratch.height).data,
        cols,
        rows,
        SUPERSAMPLE,
      );

      const dots: Dot[] = [];
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          let c = cover[j * cols + i] ?? 0;
          if (c < 0.03) continue;
          const x = sx + i * pitch;
          const y = sy + j * pitch;
          // Lighter towards the left, where the text starts, and small under the heading.
          c *= 0.35 + 0.65 * smoothstep(0.02, 0.7, x / width);
          if (underText(x, y)) c *= 0.35;
          const delay = clamp01(0.7 * (x / width) + 0.3 * hash(i, j, plateIndex));
          dots.push({ x, y, r: c * maxR, d: delay });
        }
      }
      return { color: ink.color, alpha: ink.alpha, dots };
    });
  };

  /** Extra size (0…) a dot gets from the pointer swell and the ripples. */
  const influence = (x: number, y: number): number => {
    let f = 0;
    if (swell > 0.01) {
      const dx = x - px;
      const dy = y - py;
      f += SWELL_GAIN * swell * swellFalloff(dx * dx + dy * dy, SWELL_RADIUS * SWELL_RADIUS);
    }
    for (const ripple of ripples) {
      const life = ripple.t / RIPPLE_MS;
      // The ring slows down as it spreads and fades out.
      const ring = (1 - (1 - life) * (1 - life)) * Math.hypot(width, height);
      const distance = Math.hypot(x - ripple.x, y - ripple.y);
      f += RIPPLE_GAIN * (1 - life) * rippleBand(distance, ring, RIPPLE_WIDTH);
    }
    return f;
  };

  const draw = (): void => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'screen';
    const live = swell > 0.01 || ripples.length > 0;

    screens.forEach((screen) => {
      ctx.globalAlpha = screen.alpha;
      ctx.fillStyle = screen.color;
      ctx.beginPath();
      for (const dot of screen.dots) {
        const amount = progress >= 1 ? 1 : printAmount(progress, dot.d);
        if (amount <= 0) continue;
        const r = dot.r * amount * (live ? 1 + influence(dot.x, dot.y) : 1);
        if (r < 0.35) continue;
        ctx.moveTo(dot.x + r, dot.y);
        ctx.arc(dot.x, dot.y, r, 0, TAU);
      }
      ctx.fill();
    });

    // The bare screen between the arches only shows where the pointer or a ripple raises it.
    if (live) {
      let i0 = 0;
      let i1 = cols - 1;
      let j0 = 0;
      let j1 = rows - 1;
      if (!ripples.length) {
        i0 = Math.max(0, Math.floor((px - SWELL_RADIUS - ox) / pitch));
        i1 = Math.min(cols - 1, Math.ceil((px + SWELL_RADIUS - ox) / pitch));
        j0 = Math.max(0, Math.floor((py - SWELL_RADIUS - oy) / pitch));
        j1 = Math.min(rows - 1, Math.ceil((py + SWELL_RADIUS - oy) / pitch));
      }
      ctx.globalAlpha = BARE.alpha;
      ctx.fillStyle = BARE.color;
      ctx.beginPath();
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const x = ox + i * pitch;
          const y = oy + j * pitch;
          const f = influence(x, y);
          if (f < 0.05) continue;
          const r = BARE.radius * (1 + 2.4 * f);
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, TAU);
        }
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  const damp = (current: number, goal: number, lambda: number, dt: number): number =>
    goal + (current - goal) * Math.exp((-lambda * dt) / 1000);

  const frame = (now: number): void => {
    raf = 0;
    const dt = last ? Math.min(now - last, 64) : 1000 / 60;
    last = now;

    if (target < 1) {
      // A read only (the canvas is the only thing written), so no forced layout.
      const rect = section.getBoundingClientRect();
      target = Math.max(target, scrollPrint(rect.top, rect.height, window.innerHeight));
    }
    if (progress < target) {
      progress = target - progress < 0.002 ? target : damp(progress, target, 2.6, dt);
      if (progress >= 1 && !fine.matches && !autoRipple) {
        autoRipple = true;
        const box = archBox(width, height);
        ripples.push({ x: box.x + box.w * 0.55, y: box.y + box.h * 0.6, t: 0 });
      }
    }

    const swellTo = hovering ? 1 : 0;
    swell = Math.abs(swell - swellTo) < 0.004 ? swellTo : damp(swell, swellTo, 6, dt);
    px = damp(px, ptx, 14, dt);
    py = damp(py, pty, 14, dt);
    ripples.forEach((ripple) => {
      ripple.t += dt;
    });
    ripples = ripples.filter((ripple) => ripple.t < RIPPLE_MS);

    draw();

    const busy =
      progress < target ||
      swell !== swellTo ||
      (swell > 0 && (Math.abs(px - ptx) > 0.3 || Math.abs(py - pty) > 0.3)) ||
      ripples.length > 0;
    if (busy) wake();
    else last = 0;
  };

  function wake(): void {
    if (still || raf || !visible || document.hidden) return;
    raf = requestAnimationFrame(frame);
  }

  const settle = (): void => {
    cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
    hovering = false;
    swell = 0;
    ripples = [];
    progress = 1;
    target = 1;
    draw();
  };

  const toLocal = (event: PointerEvent): [number, number] => [
    event.clientX - hostLeft,
    event.clientY - (hostTop - (window.scrollY - hostScroll)),
  ];

  const start = (): void => {
    layout();
    if (still) {
      progress = 1;
      target = 1;
    }
    draw();
    section.classList.add('is-field');

    new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) wake();
    }).observe(section);

    // Scrolling only drives the print-in; once the field is fully printed it stops listening.
    const onScroll = (): void => {
      if (progress < 1) wake();
      else window.removeEventListener('scroll', onScroll);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', wake);
    new ResizeObserver(() => {
      const rect = section.getBoundingClientRect();
      // The first report repeats the size just laid out.
      if (rect.width === width && rect.height === height) return;
      layout();
      draw();
      wake();
    }).observe(section);

    section.addEventListener(
      'pointerenter',
      (event) => {
        if (still || event.pointerType === 'touch' || !fine.matches) return;
        const rect = section.getBoundingClientRect();
        hostLeft = rect.left;
        hostTop = rect.top;
        hostScroll = window.scrollY;
        [ptx, pty] = toLocal(event);
        if (swell < 0.02) {
          px = ptx;
          py = pty;
        }
        hovering = true;
        wake();
      },
      { passive: true },
    );
    section.addEventListener(
      'pointermove',
      (event) => {
        if (!hovering || event.pointerType === 'touch') return;
        [ptx, pty] = toLocal(event);
        wake();
      },
      { passive: true },
    );
    section.addEventListener(
      'pointerleave',
      () => {
        hovering = false;
        wake();
      },
      { passive: true },
    );
    // Touch: the ripple starts when the finger lifts from a tap. A touch that becomes a scroll
    // is cancelled by the browser (pointercancel), so scrolling past sends no ripples.
    section.addEventListener(
      'pointerdown',
      (event) => {
        if (still || (event.pointerType !== 'touch' && fine.matches)) return;
        const rect = section.getBoundingClientRect();
        press = { id: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top };
      },
      { passive: true },
    );
    section.addEventListener(
      'pointerup',
      (event) => {
        if (!press || event.pointerId !== press.id) return;
        const { x, y } = press;
        press = null;
        if (still) return;
        ripples = [...ripples.slice(-2), { x, y, t: 0 }];
        wake();
      },
      { passive: true },
    );
    section.addEventListener(
      'pointercancel',
      () => {
        press = null;
      },
      { passive: true },
    );

    reduce.addEventListener('change', () => {
      still = reduce.matches;
      if (still) settle();
      else wake();
    });
  };

  // Set up only when the section comes near the viewport (keeps the work off the page load).
  const near = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      near.disconnect();
      start();
    },
    { rootMargin: '0px 0px 50% 0px' },
  );
  near.observe(section);
};
