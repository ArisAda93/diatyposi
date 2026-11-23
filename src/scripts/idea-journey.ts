/**
 * Home “Μία ιδέα. Παντού.” (markup and styles: src/components/home/IdeaJourney.astro and
 * src/components/home/journey/JourneyArt.astro).
 *
 * Stage. From 64rem, with JS and motion allowed, a sticky stage (CSS `position: sticky`; nothing
 * is pinned and scrolling is never taken over) tells one continuous story: a pencil sketch is
 * printed plate by plate into a mark, and the same mark travels along an arc onto a card, a
 * T-shirt, a shop front, a mug and a phone. Scrolling only picks the step (the one whose node is
 * nearest the middle of the viewport); the stage then plays the change itself, at its own calm pace
 * (`playToward`), so the visitor never has to scroll through an effect or stop on a half-finished
 * frame. Every frame is still a pure function of a timeline position `t` (`stageFrame`: -1 before
 * the first step, step i at t = i), so going back plays the same story in reverse, and scrolling
 * quickly or jumping several steps fast-forwards through them. Each object arrives as a line
 * sketch; its photograph then prints over the sketch (src/scripts/journey-print/, loaded on
 * demand: halftone plates in press order, resolving into the photo) and holds as the real
 * product. A Sketch / Product switch un-prints the shown step and prints it again. On the way out
 * the photograph never turns back into a sketch: it flies down into its slot on the contact sheet
 * under the stage, the mark lifts off it, turns and scales on its way to the next object, and that
 * object's sketch draws in where it lands. By the last step the contact sheet holds every product;
 * a slot click (pointer) scrolls to its step. The steps' left rule is one spine that fills in
 * the steps' plate inks up to the middle of the viewport, with a node per step. Fine pointers: the stage leans towards the pointer, and hovering the mark separates its
 * C, M, Y and K plates, which snap back into register. Step titles link to their step; following
 * one, or moving keyboard focus into a step, scrolls that step to the middle, so the stage goes
 * there too. Writes are transforms, opacity and a few custom properties, batched in one rAF loop
 * that idles when the stage is settled or off screen.
 *
 * Below 64rem, under reduced motion or without JS, each step shows its own still illustration
 * (src/scripts/journey-stills.ts prints its photo over its sketch on scroll where motion is
 * allowed), and the stage part does nothing: no scroll listener, no frames, and the print layer
 * is never loaded.
 *
 * Chooser. Toggle chips (aria-pressed) pick what to make; the button's href is the quote form
 * with every picked service pre-selected, and its label counts them. A polite live region
 * announces the count. Without JS the chips stay disabled and hidden, and the button links to the
 * plain quote form.
 *
 * Relative imports, so the pure helpers can be unit-tested (tests/idea-journey.test.ts).
 */
import { routes } from '../data/site';
import { homeText } from '../i18n/pages/home';
import { PRESELECT_PARAM } from '../lib/quote';
import type { PrintLayer } from './journey-print';
import { plateInk, type PlateInk } from './services-page';

// ------------------------------------------------------------------------------------------------
// Story data and pure helpers
// ------------------------------------------------------------------------------------------------

/** The story, in order: each step's id (also its `data-stage` value) and its service chapter. */
export const JOURNEY_STEPS = [
  { id: 'idea', service: 'grafistikos-sxediasmos' },
  { id: 'mark', service: 'grafistikos-sxediasmos' },
  { id: 'card', service: 'kartes-fylladia-entypa' },
  { id: 'shirt', service: 'mplouzakia-rouxismos' },
  { id: 'sign', service: 'epigrafes-aftokollita-vitrines' },
  { id: 'gift', service: 'diafimistika-dora' },
  { id: 'social', service: 'social-media' },
] as const;

export type JourneyStepId = (typeof JOURNEY_STEPS)[number]['id'];

/** A service that appears in the story (each one is offered as a chip). */
export type JourneyService = (typeof JOURNEY_STEPS)[number]['service'];

const STORY_SERVICES: ReadonlySet<string> = new Set(JOURNEY_STEPS.map((step) => step.service));

const isStoryService = (slug: string): slug is JourneyService => STORY_SERVICES.has(slug);

/**
 * The chips: the story's services, each once, in the order of `serviceSlugs` (pass the slugs of
 * `services` from src/data/site.ts, so the chips follow the owner's order of services).
 */
export const journeyChoices = (serviceSlugs: readonly string[]): JourneyService[] => {
  const picked: JourneyService[] = [];
  for (const slug of serviceSlugs) {
    if (isStoryService(slug) && !picked.includes(slug)) picked.push(slug);
  }
  return picked;
};

/** Text for none, one or many; `{count}` in `many` is replaced by the number. */
export interface CountForms {
  none: string;
  one: string;
  many: string;
}

export const countText = (count: number, forms: CountForms): string => {
  if (count <= 0) return forms.none;
  if (count === 1) return forms.one;
  return forms.many.replace('{count}', String(count));
};

/**
 * The quote form with the given services pre-selected (`?ypiresia=a,b#prosfora`). Slugs are
 * trimmed, blanks dropped, duplicates dropped (first appearance wins, order kept) and each slug
 * URL-encoded. With nothing left, the plain quote form.
 */
export const journeyQuoteHref = (slugs: readonly string[]): string => {
  const picked: string[] = [];
  for (const raw of slugs) {
    const slug = raw.trim();
    if (slug && !picked.includes(slug)) picked.push(slug);
  }
  if (picked.length === 0) return routes.quote;
  const hashAt = routes.quote.indexOf('#');
  const path = hashAt === -1 ? routes.quote : routes.quote.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : routes.quote.slice(hashAt);
  return `${path}?${PRESELECT_PARAM}=${picked.map(encodeURIComponent).join(',')}${hash}`;
};

/** Plate ink of each step (C, M, Y, K, then round again, as the chapters on /ypiresies/). */
export const journeyInk = (index: number): PlateInk => plateInk(index);

// ------------------------------------------------------------------------------------------------
// Stage timeline (pure)
// ------------------------------------------------------------------------------------------------

/** Where the mark sits on each object in the 600 × 600 view box (its centre and scale). */
export interface MarkPlace {
  x: number;
  y: number;
  s: number;
}

export const MARK_AT: Record<JourneyStepId, MarkPlace> = {
  idea: { x: 300, y: 292, s: 1.7 },
  mark: { x: 300, y: 292, s: 1.7 },
  card: { x: 228, y: 306, s: 0.6 },
  shirt: { x: 300, y: 258, s: 0.62 },
  sign: { x: 300, y: 214, s: 0.42 },
  gift: { x: 290, y: 312, s: 0.55 },
  social: { x: 300, y: 270, s: 0.82 },
};

/** The mark's plates in print order, each with its out-of-register offset (mark units). */
export const MARK_PLATES = [
  { id: 'y', ox: -10, oy: 8 },
  { id: 'm', ox: 9, oy: -7 },
  { id: 'c', ox: -7, oy: -9 },
  { id: 'k', ox: 6, oy: 9 },
] as const;

export const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/** 0 at `from`, 1 at `to`, linear between and clamped outside. */
export const ramp = (value: number, from: number, to: number): number =>
  to === from ? (value >= to ? 1 : 0) : clamp01((value - from) / (to - from));

export const smoothstep = (value: number): number => {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
};

export const easeInOutCubic = (value: number): number => {
  const x = clamp01(value);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};

/** Ease out with a small overshoot past 1 before settling: a plate snapping into register. */
export const easeOutBack = (value: number): number => {
  const x = clamp01(value) - 1;
  const c = 1.5;
  return 1 + (c + 1) * x * x * x + c * x * x;
};

/** Frame-rate independent smoothing towards `target` (`lambda` per second, `dt` in ms). */
export const damp = (current: number, target: number, lambda: number, dt: number): number =>
  target + (current - target) * Math.exp((-lambda * dt) / 1000);

/**
 * Timeline position for the scroll: `anchors` are the steps' anchor lines (viewport px, in
 * document order) and `line` the reading line (the middle of the viewport). Step i's anchor on
 * the line gives exactly i; between two anchors it interpolates. Before the first anchor reaches
 * the line it runs down to -1, one step spacing earlier; after the last it stays at the last step.
 * -1 without steps.
 */
export const journeyPosition = (anchors: readonly number[], line: number): number => {
  const count = anchors.length;
  const first = anchors[0];
  if (first === undefined) return -1;
  if (line < first) {
    const span = (anchors[1] ?? first) - first;
    return span > 0 ? Math.max(-1, (line - first) / span) : -1;
  }
  for (let i = 0; i < count - 1; i += 1) {
    const a = anchors[i] ?? 0;
    const b = anchors[i + 1] ?? a;
    if (line < b) return b > a ? i + (line - a) / (b - a) : i + 1;
  }
  return count - 1;
};

/** Index of the step the readout and the list mark at position `t`; -1 before the first. */
export const activeStepAt = (t: number, count: number): number => {
  if (count <= 0 || t < -0.5) return -1;
  return Math.min(count - 1, Math.max(0, Math.round(t)));
};

/** A stretch of the timeline: [from, to]. */
type Span = readonly [number, number];

/**
 * Each step's part of the timeline, relative to its own position (u = t − step index). Its lines
 * draw in and it rests as a sketch; its photograph prints over the sketch, done just before the
 * step reaches the reading line; then it holds as the real product. On the way to the next step the
 * photograph never turns back into a sketch: it flies down into its slot on the contact sheet under
 * the stage (`exit`), the mark lifts off it and travels, and the next object's sketch draws in
 * where the mark lands. The last step keeps its photograph (and fills the last slot).
 */
const LINES_IN: Span = [-0.62, -0.4];
const PRINT_IN: Span = [-0.36, -0.04];
const EXIT: Span = [0.2, 0.44];
/** The mark moves from one object to the next (eased; it rests on the objects outside this). */
const TRAVEL: Span = [0.3, 0.6];
/** The sketchbook draws in early (absolute t), leaving room for the pencil sketch on it. */
const FIRST_LINES_IN: Span = [-0.97, -0.72];
const SKETCH_DRAW: Span = [-0.72, -0.42];
/**
 * Between the idea and the mark (absolute t) the press sheet's photograph prints the mark in colour
 * over the pencil sketch; the vector plates take over from the sketch just before the step, so the
 * printed mark is there to lift off and travel (and to show if photographs are unavailable).
 */
const SKETCH_OUT: Span = [0.9, 1];
const PLATES_FROM = 0.78;
const PLATE_STAGGER = 0.04;
const PLATE_SPAN = 0.1;
/** A step's slot on the contact sheet fills as its photograph lands there (u), or, for the last
    step, once its photograph is printed. */
const SLOT_FILL = 0.4;
const LAST_SLOT_FILL = -0.04;

/** Ramp over a span. */
const over = (value: number, [from, to]: Span): number => ramp(value, from, to);

/**
 * How visible a step's sketch lines still are (1 … 0) at print run `real`: they stay over the
 * first inks, so the drawing shows under the halftone, and go as the photo resolves.
 */
export const lineFade = (real: number): number => 1 - smoothstep(ramp(real, 0.5, 0.9));

/** How visible the sketch's paper fills still are (1 … 0): they clear for the photo's sheet. */
export const fillFade = (real: number): number => 1 - smoothstep(ramp(real, 0, 0.2));

/**
 * How visible the vector mark still is (1 … 0) at print run `real`: it hands over to the mark in
 * the photograph while the photo's own inks print.
 */
export const markFade = (real: number): number => 1 - smoothstep(ramp(real, 0.45, 0.8));

export interface StageFrame {
  /** Draw amount of each object (0 hidden … 1 fully drawn), in step order. */
  draw: number[];
  /** How far each step's photograph is printed over its sketch (0 sketch … 1 photo). */
  real: number[];
  /** How far each step's photograph has flown into its contact-sheet slot (0 on stage … 1 gone). */
  exit: number[];
  /** How far the pencil sketch is drawn (0…1). */
  sketch: number;
  sketchOpacity: number;
  /** The mark's plates in print order (Y, M, C, K): `shift` scales each plate's offset. */
  plates: { opacity: number; shift: number }[];
  /** The mark's place (view-box units), rotation (degrees) and scale. */
  mark: { x: number; y: number; r: number; s: number };
}

/** The mark between two places: an arc that lifts off the sheet, turning and growing slightly. */
const markBetween = (a: MarkPlace, b: MarkPlace, m: number, segment: number) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  const moving = distance > 0.5 || Math.abs(b.s - a.s) > 0.01;
  const bump = moving ? Math.sin(Math.PI * m) : 0;
  const lift = moving ? 36 + distance * 0.25 : 0;
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2 - lift;
  const n = 1 - m;
  const turn = Math.abs(dx) > 0.5 ? Math.sign(dx) : segment % 2 === 0 ? 1 : -1;
  return {
    x: n * n * a.x + 2 * n * m * cx + m * m * b.x,
    y: n * n * a.y + 2 * n * m * cy + m * m * b.y,
    r: turn * 7 * bump,
    s: (a.s + (b.s - a.s) * m) * (1 + 0.08 * bump),
  };
};

/**
 * Everything on the stage at timeline position `t` (see `journeyPosition`), for the steps in
 * JOURNEY_STEPS order (the spans are above). The sketchbook draws in from -1 and the pencil sketch
 * on it after; each step's photograph prints over its sketch on the way to the step and holds; on
 * the way out it flies into its slot while the mark travels to the next object, whose sketch draws
 * in under it. Each step's photograph is on the stage from its print to its exit, one at a time.
 */
export const stageFrame = (t: number): StageFrame => {
  const count = JOURNEY_STEPS.length;
  const last = count - 1;
  const exit = JOURNEY_STEPS.map((_, i) => (i === last ? 0 : smoothstep(over(t - i, EXIT))));
  const draw = JOURNEY_STEPS.map((_, i) => {
    const u = t - i;
    const drawIn = smoothstep(i === 0 ? over(t, FIRST_LINES_IN) : over(u, LINES_IN));
    // Gone with the photograph (or, without one, drawn out while it would fly).
    const drawOut = 1 - (exit[i] ?? 0);
    return Math.min(drawIn, drawOut);
  });
  const real = JOURNEY_STEPS.map((_, i) => {
    const u = t - i;
    if (i !== last && u >= EXIT[1]) return 0;
    return over(u, PRINT_IN);
  });

  const sketch = over(t, SKETCH_DRAW);
  const sketchOpacity = sketch > 0 ? 1 - smoothstep(over(t, SKETCH_OUT)) : 0;

  const plates = MARK_PLATES.map((_, j) => {
    const from = PLATES_FROM + PLATE_STAGGER * j;
    const p = ramp(t, from, from + PLATE_SPAN);
    return { opacity: smoothstep(ramp(p, 0, 0.6)), shift: 1 - easeOutBack(p) };
  });

  const places = JOURNEY_STEPS.map((step) => MARK_AT[step.id]);
  const firstPlace = places[0] ?? MARK_AT.idea;
  const lastPlace = places[last] ?? firstPlace;
  let mark = { ...firstPlace, r: 0 };
  if (t >= last) {
    mark = { ...lastPlace, r: 0 };
  } else if (t > 0) {
    const segment = Math.floor(t);
    const m = easeInOutCubic(over(t - segment, TRAVEL));
    const a = places[segment] ?? firstPlace;
    const b = places[segment + 1] ?? a;
    mark = markBetween(a, b, m, segment);
  }

  return { draw, real, exit, sketch, sketchOpacity, plates, mark };
};

/**
 * Whether step `index`'s slot on the contact sheet is filled at position `t`: from when its
 * photograph lands there, or for the last step from when its photograph is printed. Once filled it
 * stays filled further down; scrolling back empties it again.
 */
export const slotFilled = (t: number, index: number, count: number): boolean =>
  index === count - 1 ? t - index >= LAST_SLOT_FILL : t - index >= SLOT_FILL;

/**
 * The photograph's flight into its slot at exit progress `exit` (0…1): `to` is the slot's centre
 * relative to the stage's centre (CSS px) and `scale` the slot's size over the stage's. Eased,
 * with a slight turn on the way and a fade only as it lands.
 */
export const flight = (
  exit: number,
  to: { x: number; y: number; scale: number },
): { x: number; y: number; scale: number; rotate: number; opacity: number } => {
  const e = clamp01(exit);
  const p = easeInOutCubic(e);
  return {
    x: to.x * p,
    y: to.y * p,
    scale: 1 + (to.scale - 1) * p,
    rotate: -4 * Math.sin(Math.PI * p),
    opacity: 1 - smoothstep(ramp(e, 0.82, 1)),
  };
};

/** Pace of the stage's own playback: timeline units per second (one change of step ≈ 2.5 s). */
export const PLAY_RATE = 0.32;
/** Around each step the frame does not change (its photograph is held): playback skips it. */
const HELD: Span = [-0.04, EXIT[0]];
/** Step 1 changes until its vector plates are in register and the pencil sketch has gone. */
const MARK_SETTLED = Math.max(SKETCH_OUT[1], PLATES_FROM + PLATE_STAGGER * 3 + PLATE_SPAN);

/** The stretch around step `index` where nothing on the stage changes (none before step 0). */
export const heldSpan = (index: number): Span | null => {
  if (index < 0) return null;
  const from = index === 1 ? Math.max(index + HELD[0], MARK_SETTLED) : index + HELD[0];
  return [from, index + HELD[1]];
};
/** Further than one step behind, playback speeds up so it catches up instead of queueing. */
const CATCH_UP = 4;

/**
 * The stage plays on its own: scrolling only picks the step (`target`, -1 … last), and the
 * timeline position `current` moves towards it at PLAY_RATE (faster when further than one step
 * away), skipping the held stretches where nothing changes. `dt` in ms. Pure, so every frame is
 * still `stageFrame` of a position, and going back plays the same story in reverse.
 */
export const playToward = (current: number, target: number, dt: number): number => {
  if (current === target || !Number.isFinite(current)) return target;
  const forward = target > current;
  let c = current;
  const near = Math.round(c);
  const held = heldSpan(near);
  if (held && forward && target > near && c >= held[0] && c < held[1]) c = held[1];
  if (held && !forward && target < near && c > held[0] && c <= held[1]) c = held[0];
  const distance = Math.abs(target - c);
  const rate = PLAY_RATE * (1 + CATCH_UP * Math.max(0, distance - 1));
  const move = Math.min(distance, (rate * Math.max(0, dt)) / 1000);
  return forward ? c + move : c - move;
};

/**
 * Where playback starts when the stage first shows (or comes back on screen): the last change of
 * step before `target`, so the visitor sees it arrive without replaying the whole story.
 */
export const playStart = (target: number): number => (target >= 1 ? target - 1 + EXIT[0] : -1);

/** Seconds the Sketch / Product switch takes to un-print or re-print the shown step. */
export const VIEW_TIME = 1.1;

/**
 * How far the spine is filled (0…1): `nodes` are the step nodes' positions along it (any unit,
 * in order); the fill reaches the point that position `t` maps to between them.
 */
export const spineFill = (nodes: readonly number[], t: number): number => {
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (first === undefined || last === undefined || last <= first || t <= 0) return 0;
  if (t >= nodes.length - 1) return 1;
  const i = Math.floor(t);
  const a = nodes[i] ?? first;
  const b = nodes[i + 1] ?? a;
  return clamp01((a + (b - a) * (t - i) - first) / (last - first));
};

/**
 * The spine's colours: hard stops, the stretch leading to each step's node in that step's plate
 * ink. `fractions` are the nodes' positions along the spine (0…1, in order).
 */
export const spineGradient = (fractions: readonly number[]): string => {
  if (fractions.length < 2) return 'none';
  const stops: string[] = [];
  for (let i = 1; i < fractions.length; i += 1) {
    const from = ((fractions[i - 1] ?? 0) * 100).toFixed(3);
    const to = ((fractions[i] ?? 1) * 100).toFixed(3);
    stops.push(`var(--color-${journeyInk(i)}) ${from}% ${to}%`);
  }
  return `linear-gradient(to bottom, ${stops.join(', ')})`;
};

// ------------------------------------------------------------------------------------------------
// DOM
// ------------------------------------------------------------------------------------------------

/**
 * Same condition as the live-stage CSS in IdeaJourney.astro. Below it (phones, tablets, reduced
 * motion) the stage part does nothing and the stills take over (src/scripts/journey-stills.ts).
 */
export const LIVE_QUERY = '(min-width: 64rem) and (prefers-reduced-motion: no-preference)';
const FINE_QUERY = '(hover: hover) and (pointer: fine)';
/** Before the stage is first reached: blank paper, so the sketch draws in front of the visitor. */
const BLANK_STAGE = 'blank';
/** Smoothing of the lean (per second). */
const LEAN_FOLLOW = 6;
/** Largest lean towards the pointer (degrees): forward and back, and side to side. */
const LEAN_X = 4;
const LEAN_Y = 6;
const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const EASE_SNAP = 'cubic-bezier(0.3, 1.5, 0.5, 1)';
/** On-screen size of the hover split, in mark units at scale 1. */
const SPLIT_GAIN = 1.4;

const pad = (n: number): string => String(n).padStart(2, '0');

const isDarkTheme = (): boolean => document.documentElement.dataset['theme'] === 'dark';

/**
 * The stage photographs' URLs from `data-journey-photos` (a JSON array, one per step in story
 * order). Anything else (missing, malformed, the wrong length, a non-string) gives none, and the
 * stage keeps its sketches.
 */
export const parsePhotoUrls = (raw: string | undefined, count: number): string[] => {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length !== count) return [];
    return value.every((url) => typeof url === 'string' && url.length > 0)
      ? (value as string[])
      : [];
  } catch {
    return [];
  }
};

const initStage = (root: HTMLElement): void => {
  const stage = root.querySelector<HTMLElement>('[data-journey-stage]');
  const art = root.querySelector<HTMLElement>('[data-journey-art]');
  const grid = root.querySelector<HTMLElement>('[data-journey-grid]');
  const column = root.querySelector<HTMLElement>('[data-journey-steps]');
  const fill = root.querySelector<HTMLElement>('[data-journey-fill]');
  const counter = root.querySelector<HTMLElement>('[data-journey-count]');
  const steps = Array.from(root.querySelectorAll<HTMLElement>('[data-journey-step]'));
  const svg = art?.querySelector<SVGSVGElement>('svg');
  const mark = svg?.querySelector<SVGGElement>('[data-journey-mark]');
  if (!stage || !art || !grid || !column || !svg || !mark || steps.length === 0) return;

  const nodes = steps.map((step) => step.querySelector<HTMLElement>('[data-journey-node]'));
  const objects = JOURNEY_STEPS.map((step) =>
    svg.querySelector<SVGGElement>(`[data-journey-obj="${step.id}"]`),
  );
  const sketch = svg.querySelector<SVGGElement>('[data-journey-sketch]');
  const plates = MARK_PLATES.map((plate) =>
    svg.querySelector<SVGGElement>(`[data-journey-plate="${plate.id}"]`),
  );
  const printHost = art.querySelector<HTMLElement>('[data-journey-print]');
  const slots = JOURNEY_STEPS.map((step) =>
    root.querySelector<HTMLElement>(`[data-journey-slot="${step.id}"]`),
  );
  /** Each slot's centre relative to the stage's centre (CSS px) and its size over the stage's. */
  let flights = JOURNEY_STEPS.map(() => ({ x: 0, y: 0, scale: 1 }));
  const photoUrls = parsePhotoUrls(art.dataset['journeyPhotos'], JOURNEY_STEPS.length);
  /** The photographs under the line art; created when the stage first goes live. */
  let printer: PrintLayer | null = null;
  let printerRequested = false;

  const live = matchMedia(LIVE_QUERY);
  const fine = matchMedia(FINE_QUERY);

  /** Node centres in document px; the stage reaches step i when node i is mid-viewport. */
  let anchors: number[] = [];
  /** Set when the anchors move, so the next frame redraws even if `t` did not change. */
  let dirty = true;
  let current = Number.NaN;
  let frame = 0;
  let lastTime = 0;
  let visible = false;
  let listening = false;
  let active = -2;
  let markScale = MARK_AT.idea.s;
  let lastScrollT = Number.NaN;
  /** The step the scroll has picked (-1 before the first); the stage plays towards it. */
  let goal = -1;
  /**
   * Sketch / Product switch: 1 shows the product, 0 the sketch (`view` follows `viewGoal`). It
   * applies only to the step it was used on (`viewStep`, always the picked step, including one
   * chosen as a sketch before it has started to print). When the visitor moves on, that step keeps
   * its look, frozen, while it leaves the stage (`leavingStep`, `leavingView`); the next step
   * arrives as its product.
   */
  let view = 1;
  let viewGoal: 0 | 1 = 1;
  let viewStep = -1;
  let leavingStep = -1;
  let leavingView = 1;
  const viewButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-journey-view]'));
  let printed = false;
  let splitting = false;
  /** The stage's lean (rotateX, rotateY) and where it is heading, in degrees. */
  const lean = { x: 0, y: 0, toX: 0, toY: 0 };
  let pointer: { x: number; y: number } | null = null;

  const measure = (): void => {
    const scroll = window.scrollY;
    anchors = nodes.map((node, i) => {
      const box = (node ?? steps[i])?.getBoundingClientRect();
      return box ? box.top + box.height / 2 + scroll : 0;
    });
    const top = anchors[0] ?? 0;
    const bottom = anchors[anchors.length - 1] ?? top;
    const length = bottom - top;
    // Layout boxes (offsets within the stage), not rects: the stage may be leaning in 3D.
    const artCx = art.offsetLeft + art.offsetWidth / 2;
    const artCy = art.offsetTop + art.offsetHeight / 2;
    flights = slots.map((slot) => {
      if (!slot || art.offsetWidth <= 0 || slot.offsetParent !== art.offsetParent) {
        return { x: 0, y: 0, scale: 1 };
      }
      return {
        x: slot.offsetLeft + slot.offsetWidth / 2 - artCx,
        y: slot.offsetTop + slot.offsetHeight / 2 - artCy,
        scale: slot.offsetWidth / art.offsetWidth,
      };
    });
    const columnTop = column.getBoundingClientRect().top + scroll;
    column.style.setProperty('--ij-spine-top', `${(top - columnTop).toFixed(1)}px`);
    column.style.setProperty('--ij-spine-h', `${Math.max(0, length).toFixed(1)}px`);
    if (fill) {
      fill.style.backgroundImage =
        length > 0 ? spineGradient(anchors.map((a) => (a - top) / length)) : 'none';
    }
    dirty = true;
  };

  const setActive = (index: number): void => {
    if (index === active) return;
    active = index;
    const id = index >= 0 ? steps[index]?.dataset.journeyStep : undefined;
    stage.dataset.stage = id ?? BLANK_STAGE;
    steps.forEach((step, i) => {
      step.classList.toggle('is-active', i === index);
      step.classList.toggle('is-read', i < index);
    });
    if (counter) counter.textContent = `${pad(Math.max(index, 0) + 1)} / ${pad(steps.length)}`;
  };

  /** `t` is the played position, `scrollT` the scroll's (the spine follows the scroll). */
  const render = (t: number, scrollT: number): void => {
    const f = stageFrame(t);
    // A step prints only once its photograph is ready; until then it stays a sketch. The
    // Sketch / Product switch un-prints and re-prints it.
    const look = (i: number): number =>
      i === viewStep ? view : i === leavingStep ? leavingView : 1;
    const real = f.real.map((r, i) => (printer?.ready(i) ? r * look(i) : 0));
    // A step that left as a sketch is off the stage: forget it. The picked step back to its
    // product: the switch is spent.
    if (leavingStep >= 0 && leavingStep !== goal && (f.real[leavingStep] ?? 0) === 0) {
      leavingStep = -1;
      leavingView = 1;
    }
    if (viewStep >= 0 && view === 1 && viewGoal === 1) viewStep = -1;
    let printing = -1;
    real.forEach((r, i) => {
      if (r > 0 && (printing < 0 || r > (real[printing] ?? 0))) printing = i;
    });
    const inkDown = printing >= 0 ? (real[printing] ?? 0) : 0;
    // As the photograph flies to its slot, the vector mark takes over again and travels on.
    const leaving = printing >= 0 ? (f.exit[printing] ?? 0) : 0;
    const handover = inkDown * (1 - leaving);
    objects.forEach((obj, i) => {
      if (!obj) return;
      const r = real[i] ?? 0;
      obj.style.setProperty('--draw', (f.draw[i] ?? 0).toFixed(4));
      obj.style.setProperty('--line', lineFade(r).toFixed(4));
      obj.style.setProperty('--fill', fillFade(r).toFixed(4));
    });
    const to = flights[printing];
    printer?.draw(printing, inkDown, leaving > 0 && to ? flight(leaving, to) : null);
    const markVisible = markFade(handover);
    mark.style.opacity = markVisible === 1 ? '' : markVisible.toFixed(4);
    // The photo's sheet is light in both themes. In dark theme the mark's screen-blended plates
    // would vanish on it, so they leave as the sheet lands (the photographed mark prints after);
    // `--fill` lets the stage CSS turn the light sketch lines to dark ink on the sheet.
    const sheetClear = fillFade(handover);
    const plateFade = isDarkTheme() ? sheetClear : 1;
    mark.style.setProperty('--fill', sheetClear.toFixed(4));
    if (sketch) {
      sketch.style.setProperty('--sk', f.sketch.toFixed(4));
      sketch.style.opacity = f.sketchOpacity.toFixed(4);
    }
    plates.forEach((plate, j) => {
      const state = f.plates[j];
      const offset = MARK_PLATES[j];
      if (!plate || !state || !offset) return;
      const dx = (offset.ox * state.shift).toFixed(2);
      const dy = (offset.oy * state.shift).toFixed(2);
      plate.style.opacity = (state.opacity * plateFade).toFixed(4);
      plate.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    const { x, y, r, s } = f.mark;
    const place = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
    mark.style.transform = `${place} rotate(${r.toFixed(2)}deg) scale(${s.toFixed(4)})`;
    markScale = s;
    printed =
      (f.plates[f.plates.length - 1]?.opacity ?? 0) > 0.98 && markVisible > 0.5 && plateFade > 0.5;
    column.style.setProperty('--ij-fill', spineFill(anchors, scrollT).toFixed(4));
    const now = goal;
    slots.forEach((slot, i) => {
      if (!slot) return;
      const filled = slotFilled(t, i, slots.length);
      // The thumbnail is added once its photograph has loaded (before the slot fills), so it pops
      // in with the slot's transition when the photograph lands.
      const url = photoUrls[i];
      if ((printer?.ready(i) || filled) && url && !slot.querySelector('img')) {
        const image = document.createElement('img');
        image.className = 'ij-slot-img';
        image.alt = '';
        image.decoding = 'async';
        image.src = url;
        slot.append(image);
      }
      slot.classList.toggle('is-done', filled);
      slot.classList.toggle('is-current', i === now);
    });
  };

  const tick = (time: number): void => {
    frame = 0;
    const dt = lastTime ? Math.min(64, time - lastTime) : 16;
    lastTime = time;

    // Read everything first, then write.
    const scroll = window.scrollY;
    const scrollT = journeyPosition(
      anchors.map((a) => a - scroll),
      window.innerHeight / 2,
    );
    const picked = activeStepAt(scrollT, steps.length);
    if (pointer && fine.matches) {
      const box = art.getBoundingClientRect();
      const nx = box.width > 0 ? clamp01((pointer.x - box.left) / box.width) * 2 - 1 : 0;
      const ny = box.height > 0 ? clamp01((pointer.y - box.top) / box.height) * 2 - 1 : 0;
      lean.toX = -ny * LEAN_X;
      lean.toY = nx * LEAN_Y;
    } else {
      lean.toX = 0;
      lean.toY = 0;
    }

    if (picked !== goal) {
      goal = picked;
      setActive(goal);
      if (leavingStep >= 0 && goal === leavingStep) {
        // Back to the step that was leaving as a sketch: it is the switched step again.
        viewStep = leavingStep;
        view = leavingView;
        viewGoal = leavingView < 1 ? 0 : 1;
        leavingStep = -1;
        leavingView = 1;
      } else if (viewStep >= 0 && viewStep !== goal) {
        // The switched step leaves with its look frozen; the next one arrives as its product.
        if (view < 1) {
          leavingStep = viewStep;
          leavingView = view;
        }
        viewStep = -1;
        view = 1;
        viewGoal = 1;
      }
      showView(viewStep === goal ? viewGoal : 1);
    }
    const next = Number.isNaN(current) ? playStart(goal) : playToward(current, goal, dt);
    const viewNext =
      view === viewGoal
        ? view
        : viewGoal > view
          ? Math.min(viewGoal, view + dt / 1000 / VIEW_TIME)
          : Math.max(viewGoal, view - dt / 1000 / VIEW_TIME);
    const settled = next === goal && viewNext === viewGoal;
    if (dirty || next !== current || viewNext !== view || scrollT !== lastScrollT) {
      current = next;
      view = viewNext;
      lastScrollT = scrollT;
      dirty = false;
      render(current, scrollT);
    }
    lean.x = damp(lean.x, lean.toX, LEAN_FOLLOW, dt);
    lean.y = damp(lean.y, lean.toY, LEAN_FOLLOW, dt);
    const leanSettled = Math.abs(lean.x - lean.toX) < 0.01 && Math.abs(lean.y - lean.toY) < 0.01;
    if (leanSettled) {
      lean.x = lean.toX;
      lean.y = lean.toY;
    }
    art.style.transform =
      lean.x === 0 && lean.y === 0
        ? ''
        : `perspective(1400px) rotateX(${lean.x.toFixed(3)}deg) rotateY(${lean.y.toFixed(3)}deg)`;

    if (!settled || !leanSettled) schedule();
    else lastTime = 0;
  };

  const schedule = (): void => {
    if (!frame) frame = requestAnimationFrame(tick);
  };

  const onResize = (): void => {
    measure();
    schedule();
  };
  const resizeObserver = new ResizeObserver(onResize);

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    pointer = { x: event.clientX, y: event.clientY };
    schedule();
  };
  const onPointerLeave = (): void => {
    pointer = null;
    schedule();
  };

  /** Loads the print layer (code and photographs) the first time the stage is live on screen. */
  const startPrinter = (): void => {
    if (printerRequested || !printHost || photoUrls.length === 0) return;
    printerRequested = true;
    void import('./journey-print')
      .then(({ createPrintLayer }) => {
        printer = createPrintLayer(printHost, photoUrls, (index) => {
          // A photograph that arrives while its step is already held prints in, not pops in.
          const held = heldSpan(index);
          if (index === goal && held && current >= held[0] && current <= held[1]) {
            current = index + PRINT_IN[0];
          }
          root.classList.add('has-print');
          dirty = true;
          if (listening) schedule();
        });
        printer.load();
      })
      .catch(() => {
        // Without the print layer the stage keeps its sketches.
      });
  };

  /** Listen only while the stage is live and on screen. */
  const sync = (): void => {
    const on = live.matches && visible;
    if (on && !listening) {
      startPrinter();
      window.addEventListener('scroll', schedule, { passive: true });
      window.addEventListener('resize', onResize);
      grid.addEventListener('pointermove', onPointerMove);
      grid.addEventListener('pointerleave', onPointerLeave);
      resizeObserver.observe(column);
      listening = true;
      // Coming back on screen: start from where the scroll is now, not from where it was.
      current = Number.NaN;
      measure();
      schedule();
    } else if (!on && listening) {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', onResize);
      grid.removeEventListener('pointermove', onPointerMove);
      grid.removeEventListener('pointerleave', onPointerLeave);
      resizeObserver.disconnect();
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
      pointer = null;
      listening = false;
    }
  };

  const enter = (): void => {
    current = Number.NaN;
    active = -2;
    goal = -1;
    setActive(-1);
    root.classList.add('is-live');
  };

  const leave = (): void => {
    root.classList.remove('is-live');
    steps.forEach((step) => step.classList.remove('is-active', 'is-read'));
    art.style.transform = '';
    lean.x = 0;
    lean.y = 0;
  };

  /** Scrolls step `index` to the middle of the viewport (the stage follows the scroll). */
  const goTo = (index: number): void => {
    measure();
    const anchor = anchors[index];
    if (anchor === undefined) return;
    window.scrollTo({ top: Math.max(0, anchor - window.innerHeight / 2), behavior: 'smooth' });
  };

  /** Sketch / Product switch: un-prints the shown step to its sketch, or prints it again. */
  function showView(value: 0 | 1): void {
    viewButtons.forEach((button) => {
      button.setAttribute('aria-pressed', String(Number(button.dataset['journeyView']) === value));
    });
  }
  function setView(value: 0 | 1): void {
    if (goal < 0) return;
    if (value === 0) viewStep = goal;
    else if (viewStep !== goal) {
      showView(1);
      return;
    }
    viewGoal = value;
    showView(value);
    schedule();
  }
  viewButtons.forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset['journeyView'] === '0' ? 0 : 1));
  });

  // Pointer shortcut: a slot on the contact sheet scrolls to its step (the step titles are the
  // accessible way there; the stage is hidden from assistive technology).
  slots.forEach((slot, i) => {
    slot?.addEventListener('click', () => {
      if (live.matches) goTo(i);
    });
  });

  steps.forEach((step, i) => {
    const link = step.querySelector<HTMLAnchorElement>('[data-journey-goto]');
    link?.addEventListener('click', (event) => {
      if (!live.matches) return;
      event.preventDefault();
      goTo(i);
    });
    step.addEventListener('focusin', (event) => {
      const target = event.target;
      if (live.matches && target instanceof Element && target.matches(':focus-visible')) goTo(i);
    });
  });

  // Hovering the mark separates its plates; they snap back into register.
  mark.addEventListener('pointerenter', (event) => {
    if (!fine.matches || !live.matches || !printed || splitting) return;
    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    splitting = true;
    const gain = SPLIT_GAIN / Math.max(markScale, 0.3);
    const moves = MARK_PLATES.map((offset, j) => {
      const shape = plates[j]?.firstElementChild;
      if (!shape) return Promise.resolve();
      const dx = (offset.ox * gain).toFixed(2);
      const dy = (offset.oy * gain).toFixed(2);
      const animation = shape.animate(
        [
          { transform: 'translate(0px, 0px)', easing: EASE_OUT },
          { transform: `translate(${dx}px, ${dy}px)`, offset: 0.35, easing: EASE_SNAP },
          { transform: 'translate(0px, 0px)' },
        ],
        { duration: 760, delay: j * 30 },
      );
      return animation.finished.then(
        () => undefined,
        () => undefined,
      );
    });
    void Promise.all(moves).then(() => {
      splitting = false;
    });
  });

  const observer = new IntersectionObserver((entries) => {
    const entry = entries[entries.length - 1];
    if (entry) visible = entry.isIntersecting;
    sync();
  });
  observer.observe(grid);

  if (live.matches) enter();
  live.addEventListener('change', () => {
    if (live.matches) enter();
    else leave();
    sync();
  });
  // The theme decides how the mark leaves for the photo's sheet: redraw the frame on a switch.
  document.addEventListener('dt:themechange', () => {
    dirty = true;
    if (listening) schedule();
  });
  // Web fonts change the steps' heights, and with them the anchors.
  void document.fonts.ready.then(() => {
    if (listening) onResize();
  });
};

const initChooser = (root: HTMLElement): void => {
  const chips = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-journey-choice]'));
  const cta = root.querySelector<HTMLAnchorElement>('[data-journey-cta]');
  const label = root.querySelector<HTMLElement>('[data-journey-cta-label]');
  const status = root.querySelector<HTMLElement>('[data-journey-status]');
  if (!cta || chips.length === 0) return;
  const strings = homeText.el.journey.chooser;

  const update = (announce: boolean): void => {
    const picked = chips
      .filter((chip) => chip.getAttribute('aria-pressed') === 'true')
      .map((chip) => chip.dataset.journeyChoice ?? '');
    cta.href = journeyQuoteHref(picked);
    const count = picked.filter(Boolean).length;
    if (label) label.textContent = countText(count, strings.cta);
    if (status && announce) status.textContent = countText(count, strings.status);
  };

  chips.forEach((chip) => {
    chip.disabled = false;
    chip.addEventListener('click', () => {
      const pressed = chip.getAttribute('aria-pressed') === 'true';
      chip.setAttribute('aria-pressed', String(!pressed));
      update(true);
    });
  });
  // Match the button to the chips as rendered (none pressed), without an announcement.
  update(false);
};

export const initIdeaJourney = (): void => {
  const root = document.querySelector<HTMLElement>('[data-journey]');
  if (!root) return;
  initChooser(root);
  initStage(root);
};
