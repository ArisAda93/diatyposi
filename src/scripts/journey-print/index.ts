/**
 * The photographs under the journey stage's line art (src/scripts/idea-journey.ts imports this on
 * demand, only once the desktop stage is live). `host` is the `[data-journey-print]` layer that
 * sits under the stage's SVG, the same square as its view box, so each photograph lines up with
 * its drawing.
 *
 * With a hardware WebGL context, each step's photo is printed over its sketch by ./gl.ts
 * (halftone plates in press order, out of register and snapping in, resolving into the photo).
 * Without one (or if the context is lost), the photos cross-fade in as plain images instead.
 * Photos load when `load()` is first called; `ready(i)` tells the stage whether step i can print
 * yet (until then it keeps its sketch), and `onReady(i)` asks it to redraw when one arrives.
 * Drawing happens only when the stage asks (no loop of its own).
 */
import { clamp01, ramp, smoothstep } from '../idea-journey';
import type { PrintGL } from './gl';
import { printState } from './state';

/** Halftone pitch on screen (CSS px). */
const CELL = 7;

/** Where the shown photograph is on its way to its slot (CSS px, degrees; see `flight`). */
export interface PrintMotion {
  x: number;
  y: number;
  scale: number;
  rotate: number;
  opacity: number;
}

const motionCss = (motion: PrintMotion | null): { transform: string; opacity: string } =>
  motion
    ? {
        transform:
          `translate(${motion.x.toFixed(2)}px, ${motion.y.toFixed(2)}px) ` +
          `rotate(${motion.rotate.toFixed(3)}deg) scale(${motion.scale.toFixed(4)})`,
        opacity: motion.opacity === 1 ? '' : motion.opacity.toFixed(4),
      }
    : { transform: '', opacity: '' };

export interface PrintLayer {
  /** Starts loading the photographs (once). */
  load(): void;
  /** True once step `index`'s photograph can be shown. */
  ready(index: number): boolean;
  /**
   * Shows step `index` printed to `real` (0…1), moved by `motion` (its flight to its slot, or
   * null in place); index -1 or real 0 shows nothing.
   */
  draw(index: number, real: number, motion?: PrintMotion | null): void;
  destroy(): void;
}

const isDark = (): boolean => document.documentElement.dataset['theme'] === 'dark';

/** Loads and decodes one image; resolves null on failure. */
const loadImage = async (url: string): Promise<HTMLImageElement | null> => {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  try {
    await image.decode();
    return image;
  } catch {
    return null;
  }
};

export const createPrintLayer = (
  host: HTMLElement,
  urls: readonly string[],
  onReady: (index: number) => void,
): PrintLayer => {
  const loaded: (HTMLImageElement | null)[] = urls.map(() => null);
  let started = false;
  let destroyed = false;
  let press: PrintGL | null = null;
  let canvas: HTMLCanvasElement | null = null;
  /** Fallback images, one per step, created when the press is unavailable. */
  let stills: HTMLImageElement[] | null = null;
  let shown: { index: number; real: number; motion: PrintMotion | null } = {
    index: -1,
    real: 0,
    motion: null,
  };
  let resizeObserver: ResizeObserver | null = null;

  /** Sizes the press to the host's layout box (not its rect: the stage may be tilted in 3D). */
  const size = (): void => {
    if (!press || !canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    press.resize(host.clientWidth, host.clientHeight, dpr);
  };

  const useStills = (): void => {
    if (stills || destroyed) return;
    press?.destroy();
    press = null;
    canvas?.remove();
    canvas = null;
    resizeObserver?.disconnect();
    resizeObserver = null;
    stills = urls.map((url) => {
      const image = document.createElement('img');
      image.alt = '';
      image.decoding = 'async';
      image.className = 'ij-print-still';
      image.src = url;
      host.append(image);
      return image;
    });
    redraw();
  };

  const redraw = (): void => {
    const { index, real, motion } = shown;
    shown = { index: -2, real: -1, motion: null };
    layer.draw(index, real, motion);
  };

  const startPress = async (): Promise<void> => {
    const element = document.createElement('canvas');
    element.className = 'ij-print-canvas';
    try {
      const { createPrintGL } = await import('./gl');
      if (destroyed) return;
      press = createPrintGL(element, urls.length, useStills);
    } catch {
      press = null;
    }
    if (!press) {
      useStills();
      return;
    }
    canvas = element;
    host.append(element);
    resizeObserver = new ResizeObserver(() => {
      size();
      redraw();
    });
    resizeObserver.observe(host);
    size();
    loaded.forEach((image, i) => {
      if (image) press?.setPhoto(i, image);
    });
  };

  const layer: PrintLayer = {
    load() {
      if (started || destroyed) return;
      started = true;
      void startPress().then(() => {
        // Load in story order, so the first steps are ready first.
        void urls.reduce<Promise<void>>(
          (previous, url, i) =>
            previous.then(async () => {
              const image = await loadImage(url);
              if (!image || destroyed) return;
              loaded[i] = image;
              press?.setPhoto(i, image);
              onReady(i);
            }),
          Promise.resolve(),
        );
      });
    },

    ready(index) {
      return Boolean(loaded[index]) && (press !== null || stills !== null);
    },

    draw(index, real, motion = null) {
      const r = clamp01(real);
      const css = motionCss(motion);
      const same =
        index === shown.index &&
        r === shown.real &&
        motionCss(shown.motion).transform === css.transform &&
        motionCss(shown.motion).opacity === css.opacity;
      if (same) return;
      const reprint = index !== shown.index || r !== shown.real;
      shown = { index, real: r, motion };
      const visible = index >= 0 && r > 0 && layer.ready(index);

      if (stills) {
        stills.forEach((image, i) => {
          const on = visible && i === index;
          const o = on ? smoothstep(ramp(r, 0.1, 0.85)) : 0;
          const settle = `scale(${(1.03 - 0.03 * o).toFixed(4)})`;
          image.style.opacity =
            on && css.opacity ? (o * Number(css.opacity)).toFixed(4) : o.toFixed(4);
          image.style.transform = on ? css.transform || settle : '';
        });
        return;
      }
      if (!press || !canvas) return;
      if (!visible) {
        press.clear();
        canvas.style.visibility = 'hidden';
        canvas.style.transform = '';
        canvas.style.opacity = '';
        return;
      }
      canvas.style.visibility = '';
      canvas.style.transform = css.transform;
      canvas.style.opacity = css.opacity;
      // Moving only: the drawn frame stays, the canvas is transformed by the compositor.
      if (reprint) press.draw(index, printState(r), { cell: CELL, softEdge: !isDark() });
    },

    destroy() {
      destroyed = true;
      document.removeEventListener('dt:themechange', redraw);
      resizeObserver?.disconnect();
      press?.destroy();
      canvas?.remove();
      stills?.forEach((image) => image.remove());
    },
  };

  // Theme switches change the sheet's edge; redraw the current frame.
  document.addEventListener('dt:themechange', redraw);
  return layer;
};
