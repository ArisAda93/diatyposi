/**
 * Home “Μία ιδέα. Παντού.” (markup and styles: src/components/home/IdeaJourney.astro).
 *
 * Stage. From 64rem, with JS and motion allowed, a sticky stage shows one sample mark travelling
 * from a pencil sketch to every product. The step crossing the middle of the viewport is the
 * active one; this script only writes its id to `data-stage` on the stage (and marks the step),
 * and CSS transitions do the drawing, printing and moving. Nothing is pinned and scrolling is
 * never taken over. Below 64rem, under reduced motion or without JS, each step shows its own still
 * illustration in its final state, and this part does nothing.
 *
 * Chooser. Toggle chips (aria-pressed) pick the products; the button's href is the quote form
 * with every picked service pre-selected, and its label counts them. A polite live region
 * announces the count. Without JS the chips stay disabled and hidden, and the button links to the
 * plain quote form.
 *
 * Relative imports, so the pure helpers can be unit-tested (tests/idea-journey.test.ts).
 */
import { routes } from '../data/site';
import { homeText } from '../i18n/pages/home';
import { PRESELECT_PARAM } from '../lib/quote';

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

/** Services offered as chips: one per product in the story, in story order. */
export const JOURNEY_CHOICES = [
  'grafistikos-sxediasmos',
  'kartes-fylladia-entypa',
  'mplouzakia-rouxismos',
  'epigrafes-aftokollita-vitrines',
  'diafimistika-dora',
  'social-media',
] as const;

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

/**
 * Active step by the viewport-centre rule: the last step whose top (px from the viewport top, in
 * document order) is at or above `line`; the first step while none has reached it; -1 for none.
 */
export const pickActiveStep = (tops: readonly number[], line: number): number => {
  if (tops.length === 0) return -1;
  let active = 0;
  tops.forEach((top, i) => {
    if (top <= line) active = i;
  });
  return active;
};

// ------------------------------------------------------------------------------------------------
// DOM
// ------------------------------------------------------------------------------------------------

/** Same condition as the live-stage CSS in IdeaJourney.astro. */
const LIVE_QUERY = '(min-width: 64rem) and (prefers-reduced-motion: no-preference)';
/** Before the stage is first seen: blank paper, so the sketch draws in front of the visitor. */
const BLANK_STAGE = 'blank';
/** Share of the stage art in view before the stage starts following the scroll. */
const SEEN_RATIO = 0.35;

const pad = (n: number): string => String(n).padStart(2, '0');

const initStage = (root: HTMLElement): void => {
  const stage = root.querySelector<HTMLElement>('[data-journey-stage]');
  const art = root.querySelector<HTMLElement>('[data-journey-art]');
  const counter = root.querySelector<HTMLElement>('[data-journey-count]');
  const steps = Array.from(root.querySelectorAll<HTMLElement>('[data-journey-step]'));
  if (!stage || !art || steps.length === 0) return;

  const live = matchMedia(LIVE_QUERY);
  let active = -1;
  let frame = 0;
  let visible = false;
  let listening = false;

  const apply = (index: number): void => {
    if (index === active) return;
    const id = steps[index]?.dataset.journeyStep;
    if (!id) return;
    active = index;
    stage.dataset.stage = id;
    steps.forEach((step, i) => step.classList.toggle('is-active', i === index));
    if (counter) counter.textContent = `${pad(index + 1)} / ${pad(steps.length)}`;
  };

  const measure = (): void => {
    frame = 0;
    const tops = steps.map((step) => step.getBoundingClientRect().top);
    const index = pickActiveStep(tops, window.innerHeight / 2);
    if (index >= 0) apply(index);
  };

  const schedule = (): void => {
    if (!frame) frame = requestAnimationFrame(measure);
  };

  /** Listen to scrolling only while the stage is live and on screen. */
  const sync = (): void => {
    const on = live.matches && visible;
    if (on && !listening) {
      window.addEventListener('scroll', schedule, { passive: true });
      window.addEventListener('resize', schedule);
      listening = true;
      schedule();
    } else if (!on && listening) {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      listening = false;
    }
  };

  const enter = (): void => {
    active = -1;
    stage.dataset.stage = BLANK_STAGE;
    root.classList.add('is-live');
  };

  const leave = (): void => {
    active = -1;
    root.classList.remove('is-live');
    steps.forEach((step) => step.classList.remove('is-active'));
  };

  // The art box, not the sticky column: it is on screen exactly while the stage can be seen. It
  // counts as seen from a third in view, so the first sketch draws where the visitor can see it.
  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[entries.length - 1];
      if (entry) visible = entry.isIntersecting && entry.intersectionRatio >= SEEN_RATIO;
      sync();
    },
    { threshold: [0, SEEN_RATIO] },
  );
  observer.observe(art);

  if (live.matches) enter();
  live.addEventListener('change', () => {
    if (live.matches) enter();
    else leave();
    sync();
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
