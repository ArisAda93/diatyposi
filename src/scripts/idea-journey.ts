/**
 * Home “Μία ιδέα. Παντού.” (markup and styles: src/components/home/IdeaJourney.astro and
 * src/components/home/journey/JourneyArt.astro).
 *
 * Stage. From 64rem, with JS and motion allowed, a sticky stage (CSS `position: sticky`; nothing
 * is pinned and scrolling is never taken over) tells one continuous story: a pencil sketch is
 * printed plate by plate into a mark, and the same mark travels along an arc onto a card, a
 * T-shirt, a shop front, a mug and a phone. A scroll-scrubbed timeline drives it: the position
 * `t` runs from -1 (before the first step) through 0…6 (step i holds the middle of the viewport
 * at t = i), so every frame is a pure function of the scroll (`stageFrame`) and scrolling back
 * reverses cleanly. Between two steps the outgoing object draws out (its strokes retract), the
 * incoming one draws in, and the mark lifts, turns and scales on its way. The steps' left rule is
 * one spine that fills in the steps' plate inks up to the middle of the viewport, with a node per
 * step. Fine pointers: the stage leans towards the pointer, and hovering the mark separates its
 * C, M, Y and K plates, which snap back into register. Step titles link to their step; following
 * one, or moving keyboard focus into a step, scrolls that step to the middle, so the stage goes
 * there too. Writes are transforms, opacity and a few custom properties, batched in one rAF loop
 * that idles when the stage is settled or off screen.
 *
 * Below 64rem, under reduced motion or without JS, each step shows its own still illustration in
 * its final state, and the stage part does nothing.
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
  social: { x: 300, y: 258, s: 0.62 },
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

/** Share of each step change during which the mark rests on its object at both ends. */
const HOLD = 0.18;

export interface StageFrame {
  /** Draw amount of each object (0 hidden … 1 fully drawn), in step order. */
  draw: number[];
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
 * JOURNEY_STEPS order. The sketchbook draws in from -1 to 0 and the sketch on it from -0.6 to 0;
 * from 0 to 1 the plates print Y → M → C → K while the sketch fades; then for each change of step
 * the outgoing object draws out over the first 60 %, the incoming one draws in over the last
 * 65 %, and the mark travels between them, resting for the first and last 18 %.
 */
export const stageFrame = (t: number): StageFrame => {
  const count = JOURNEY_STEPS.length;
  const draw = JOURNEY_STEPS.map((_, i) => {
    const drawIn =
      i === 0 ? smoothstep(ramp(t, -0.95, -0.4)) : smoothstep(ramp(t, i - 0.65, i - 0.05));
    const drawOut = i === count - 1 ? 1 : 1 - smoothstep(ramp(t, i + 0.05, i + 0.6));
    return Math.min(drawIn, drawOut);
  });

  const sketch = ramp(t, -0.6, 0);
  const sketchOpacity = sketch > 0 ? 1 - smoothstep(ramp(t, 0.15, 0.6)) : 0;

  const plates = MARK_PLATES.map((_, j) => {
    const p = ramp(t, 0.2 + 0.14 * j, 0.5 + 0.14 * j);
    return { opacity: smoothstep(ramp(p, 0, 0.6)), shift: 1 - easeOutBack(p) };
  });

  const places = JOURNEY_STEPS.map((step) => MARK_AT[step.id]);
  const firstPlace = places[0] ?? MARK_AT.idea;
  const lastPlace = places[count - 1] ?? firstPlace;
  let mark = { ...firstPlace, r: 0 };
  if (t >= count - 1) {
    mark = { ...lastPlace, r: 0 };
  } else if (t > 0) {
    const segment = Math.floor(t);
    const m = easeInOutCubic(ramp(t - segment, HOLD, 1 - HOLD));
    const a = places[segment] ?? firstPlace;
    const b = places[segment + 1] ?? a;
    mark = markBetween(a, b, m, segment);
  }

  return { draw, sketch, sketchOpacity, plates, mark };
};

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

/** Same condition as the live-stage CSS in IdeaJourney.astro. */
const LIVE_QUERY = '(min-width: 64rem) and (prefers-reduced-motion: no-preference)';
const FINE_QUERY = '(hover: hover) and (pointer: fine)';
/** Before the stage is first reached: blank paper, so the sketch draws in front of the visitor. */
const BLANK_STAGE = 'blank';
/** Smoothing of the timeline and of the lean (per second). */
const FOLLOW = 9;
const LEAN_FOLLOW = 6;
/** Largest lean towards the pointer (degrees): forward and back, and side to side. */
const LEAN_X = 4;
const LEAN_Y = 6;
const SETTLED = 0.0004;
const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const EASE_SNAP = 'cubic-bezier(0.3, 1.5, 0.5, 1)';
/** On-screen size of the hover split, in mark units at scale 1. */
const SPLIT_GAIN = 1.4;

const pad = (n: number): string => String(n).padStart(2, '0');

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

  const render = (t: number): void => {
    const f = stageFrame(t);
    objects.forEach((obj, i) => obj?.style.setProperty('--draw', (f.draw[i] ?? 0).toFixed(4)));
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
      plate.style.opacity = state.opacity.toFixed(4);
      plate.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    const { x, y, r, s } = f.mark;
    const place = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
    mark.style.transform = `${place} rotate(${r.toFixed(2)}deg) scale(${s.toFixed(4)})`;
    markScale = s;
    printed = (f.plates[f.plates.length - 1]?.opacity ?? 0) > 0.98;
    column.style.setProperty('--ij-fill', spineFill(anchors, t).toFixed(4));
    setActive(activeStepAt(t, steps.length));
  };

  const tick = (time: number): void => {
    frame = 0;
    const dt = lastTime ? Math.min(64, time - lastTime) : 16;
    lastTime = time;

    // Read everything first, then write.
    const scroll = window.scrollY;
    const target = journeyPosition(
      anchors.map((a) => a - scroll),
      window.innerHeight / 2,
    );
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

    const next = Number.isNaN(current) ? target : damp(current, target, FOLLOW, dt);
    const settled = Math.abs(next - target) < SETTLED;
    if (dirty || next !== current) {
      current = settled ? target : next;
      dirty = false;
      render(current);
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

  /** Listen only while the stage is live and on screen. */
  const sync = (): void => {
    const on = live.matches && visible;
    if (on && !listening) {
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
