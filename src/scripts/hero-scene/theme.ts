/**
 * Light and dark ink models for the hero scene: pure functions with no DOM or WebGL access, so
 * they can be unit tested (tests/hero-scene.test.ts).
 *
 * Theme contract (BaseLayout and the theme switch): `html[data-theme="light"|"dark"]` is set before
 * first paint, and `document` receives `dt:themechange` after every switch.
 *
 * - Light: ink on paper. The canvas is cleared to white and every colour pass multiplies onto it
 *   (gl.DST_COLOR × gl.ZERO), as overprinting does on press (C + M → blue). The canvas is
 *   composited with `mix-blend-mode: multiply`, so white leaves the page as it is.
 * - Dark: light on a dark sheet. The canvas is cleared to black and every colour pass screens onto
 *   it (gl.ONE × gl.ONE_MINUS_SRC_COLOR: src + dst − src·dst), so overlapping inks combine towards
 *   light, like registered light. The canvas is composited with `mix-blend-mode: screen`, so black
 *   leaves the page as it is. The key plate prints in the light key colour (`--color-key`).
 *
 * In both, the colour that leaves the page untouched (`paper`) is also the colour a plate fades
 * towards as its ink goes (shaders.ts uPaper).
 */
import { ARCH_PLATES } from '~/components/logo-paths';

export type SceneTheme = 'light' | 'dark';

/** Red, green and blue, 0–1. */
export type Rgb = readonly [number, number, number];

/** The light key colour of the theme contract, used if `--color-key` cannot be read in dark. */
export const DARK_KEY_HEX = '#F2EFE8';

/** Below this relative luminance a "light" key colour is not light, so the fallback is used. */
const LIGHT_KEY_MIN_LUMINANCE = 0.5;

export type BlendFactor = 'DST_COLOR' | 'ZERO' | 'ONE' | 'ONE_MINUS_SRC_COLOR';

export interface InkModel {
  /** Canvas clear colour: the colour that leaves the page untouched under the blend. */
  paper: Rgb;
  /** `mix-blend-mode` of the canvas over the page. */
  cssBlend: 'multiply' | 'screen';
  /** WebGL blend factors (gl.blendFunc) of every colour pass: plates, hairlines and shadow. */
  blend: { src: BlendFactor; dst: BlendFactor };
  /**
   * Strength of the soft patch under the plates: a contact shadow of key ink in light, a faint
   * glow of the light key in dark.
   */
  shadowAlpha: number;
}

const MODELS: Record<SceneTheme, InkModel> = {
  light: {
    paper: [1, 1, 1],
    cssBlend: 'multiply',
    blend: { src: 'DST_COLOR', dst: 'ZERO' },
    shadowAlpha: 0.07,
  },
  dark: {
    paper: [0, 0, 0],
    cssBlend: 'screen',
    blend: { src: 'ONE', dst: 'ONE_MINUS_SRC_COLOR' },
    shadowAlpha: 0.045,
  },
};

/** The scene's theme from `html[data-theme]`; anything but "dark" is light (the default). */
export const sceneThemeOf = (value: string | null | undefined): SceneTheme =>
  value === 'dark' ? 'dark' : 'light';

export const inkModel = (theme: SceneTheme): InkModel => MODELS[theme];

const channel = (value: string): number | null => {
  const text = value.trim();
  if (text === '') return null;
  const percent = text.endsWith('%');
  const n = Number(percent ? text.slice(0, -1) : text);
  if (!Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, percent ? n / 100 : n / 255));
};

/**
 * Parses a CSS colour as `getComputedStyle` reports a custom property: `#rgb`, `#rgba`,
 * `#rrggbb`, `#rrggbbaa`, or `rgb()` / `rgba()` with commas or spaces (alpha ignored). Returns
 * null for anything else (named colours, other colour spaces), so the caller can fall back.
 */
export const parseCssColor = (value: string): Rgb | null => {
  const text = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text)?.[1];
  if (hex !== undefined) {
    const full =
      hex.length <= 4 ? [...hex.slice(0, 3)].map((c) => c + c).join('') : hex.slice(0, 6);
    const n = Number.parseInt(full, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const fn = /^rgba?\(([^)]*)\)$/.exec(text)?.[1];
  if (fn === undefined) return null;
  // Colour channels only: the alpha after a slash (or a fourth value) is ignored.
  const [channels = ''] = fn.split('/');
  const parts = channels.split(/[\s,]+/).filter((part) => part !== '');
  if (parts.length < 3) return null;
  const [r, g, b] = parts.slice(0, 3).map(channel);
  return r == null || g == null || b == null ? null : [r, g, b];
};

/** Relative luminance (WCAG) of an sRGB colour. */
export const luminance = ([r, g, b]: Rgb): number => {
  const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

const LIGHT_KEY_HEX = ARCH_PLATES.find((plate) => plate.id === 'k')?.hex ?? '#221F20';

/**
 * The key plate's ink (also the crosshair hairlines and the shadow or glow). Light: the logo's
 * key black, exactly as before. Dark: `cssKey` (the computed `--color-key`) when it parses and
 * is actually light, otherwise the contract's light key colour.
 */
export const keyInkFor = (theme: SceneTheme, cssKey: string | null): Rgb => {
  if (theme === 'light') return parseCssColor(LIGHT_KEY_HEX) ?? [0, 0, 0];
  const parsed = cssKey === null ? null : parseCssColor(cssKey);
  if (parsed && luminance(parsed) >= LIGHT_KEY_MIN_LUMINANCE) return parsed;
  return parseCssColor(DARK_KEY_HEX) ?? [1, 1, 1];
};
