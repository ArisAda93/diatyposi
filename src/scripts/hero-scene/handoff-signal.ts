/**
 * The hero's hand-over into the site-wide floating plates of the living background.
 *
 * While the live hero scene (scene.ts) runs, it publishes where its plates are and how far the
 * scroll hand-off has gone (choreography.ts handoff, unchanged): on `document` as the event
 * `dt:hero-handoff` with a HeroHandoffDetail, and as the latest value through latestHeroHandoff()
 * for a layer that starts later (the living background waits for `dt:hero-ready`, which comes
 * after the scene's first frame). It is sent from the scene's frame loop, after drawing, only when
 * something changed: every frame while the page scrolls or resizes, never while it rests. The
 * loop stops once the plates are gone. From progress 1 on, every detail has progress 1, ink 0, and
 * `rect` and `mark` as they were at the moment the plates were gone (scroll = `endScroll`), so they
 * stay the same however far the page scrolls; a resize sends the new layout's values.
 *
 * Listeners run inside the hero's frame: keep them to storing the values (no layout reads, no
 * DOM writes) and use them in your own frame.
 *
 * Without the live scene (no WebGL, reduced motion, before the scene has loaded, or after it
 * stopped) the hero shows its static SVG mark in the art box `[data-hero-art]`, which scrolls with
 * the page: latestHeroHandoff() is null until the scene first draws, and the scene sends one last
 * detail with `live: false` when it stops for good.
 */

export const HERO_HANDOFF_EVENT = 'dt:hero-handoff';

export interface HeroHandoffRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface HeroHandoffDetail {
  /** True while the live hero scene draws its plates; false once it has stopped. */
  live: boolean;
  /**
   * Scroll progress of the hand-off, 0 with the hero at the top, 1 once the hero plates are
   * gone (math.ts dockProgress). Over it the plates blend to the mark (0–0.25), collapse into
   * register and flatten (0.15–0.65), shrink by 12 % (from 0.35) and fade out (0.5–1).
   */
  progress: number;
  /** Ink of the hero plates: 1 until progress 0.5, then fading to 0 at 1 (handoff().ink). */
  ink: number;
  /**
   * Document scrollY at which the hand-off completes (progress reaches 1): the hero's document
   * top plus the hand-off distance, from layout (recomputed on resize), not from when it was
   * observed. Null only before the scene has measured the page. Time-free scatter progress:
   * `since = max(0, scrollY − endScroll)`.
   */
  endScroll: number | null;
  /**
   * The art box `[data-hero-art]` in viewport CSS px: at the current scroll during the hand-off,
   * and at scroll `endScroll` once it is complete (progress 1).
   */
  rect: HeroHandoffRect;
  /**
   * Where the hero plates are drawn, in viewport CSS px: the centre of the logo mark's viewBox
   * (raster point 1110, 152.5; Logo.astro `mark` viewBox 690 50 840 205), and CSS px per raster
   * unit. In register each plate is the ARCH path of logo-paths.ts shifted right by its
   * ARCH_PLATES x, in raster units around that point, exactly as in the SVG mark. It includes the
   * hand-off's shrink and the guard that keeps the plates below the header band, so once the
   * plates are flat (progress ≥ 0.65) they lie exactly at this place and scale. Like `rect`, at
   * progress 1 it is the place at scroll `endScroll`.
   */
  mark: { x: number; y: number; scale: number };
}

declare global {
  interface DocumentEventMap {
    'dt:hero-handoff': CustomEvent<HeroHandoffDetail>;
  }
}

let latest: HeroHandoffDetail | null = null;

/** The last detail the hero scene published, or null if the live scene has not drawn yet. */
export const latestHeroHandoff = (): HeroHandoffDetail | null => latest;

/** Smallest changes worth sending: progress and ink, position (CSS px), scale (px per unit). */
const EPSILON = { amount: 1e-3, px: 0.25, scale: 1e-4 } as const;

const near = (a: number, b: number, epsilon: number): boolean => Math.abs(a - b) < epsilon;

const nearOrNull = (a: number | null, b: number | null, epsilon: number): boolean =>
  a === null || b === null ? a === b : near(a, b, epsilon);

/** Whether `next` differs from `previous` by more than rounding noise (always, if none yet). */
export const handoffChanged = (
  previous: HeroHandoffDetail | null,
  next: HeroHandoffDetail,
): boolean => {
  if (!previous) return true;
  return !(
    previous.live === next.live &&
    near(previous.progress, next.progress, EPSILON.amount) &&
    near(previous.ink, next.ink, EPSILON.amount) &&
    nearOrNull(previous.endScroll, next.endScroll, EPSILON.px) &&
    near(previous.rect.left, next.rect.left, EPSILON.px) &&
    near(previous.rect.top, next.rect.top, EPSILON.px) &&
    near(previous.rect.width, next.rect.width, EPSILON.px) &&
    near(previous.rect.height, next.rect.height, EPSILON.px) &&
    near(previous.mark.x, next.mark.x, EPSILON.px) &&
    near(previous.mark.y, next.mark.y, EPSILON.px) &&
    near(previous.mark.scale, next.mark.scale, EPSILON.scale)
  );
};

/**
 * Stores `detail` as the latest and dispatches it as `dt:hero-handoff` on `target` (the
 * document), unless it is the same as the last one sent. Returns whether it was sent.
 */
export const publishHeroHandoff = (
  detail: HeroHandoffDetail,
  target: EventTarget = document,
): boolean => {
  if (!handoffChanged(latest, detail)) return false;
  latest = detail;
  target.dispatchEvent(new CustomEvent(HERO_HANDOFF_EVENT, { detail }));
  return true;
};
