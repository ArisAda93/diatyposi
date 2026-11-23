/**
 * /ypiresies/ chapters and index rail (markup: src/pages/ypiresies.astro,
 * src/components/services/ServiceIndex.astro, src/components/services/ServiceSection.astro).
 *
 * - The index marks the chapter in the reading band of the viewport (aria-current) and the
 *   chapters before it (.is-read) with an IntersectionObserver, with or without motion. Below
 *   64rem, where the index is a sideways chip row, the current chip is scrolled to the middle of
 *   the row (the row's own scrollLeft: the page itself never scrolls), except while a finger is on
 *   the row, and the row's edges fade only on the sides that have more chips (`data-edges`).
 *   Until the visitor acts the row jumps rather than glides (a deep link lands with its chip
 *   centred), and whenever the page comes to rest a current chip left out of view is brought back.
 *   The chip-row helpers (`trackScrollEdges`, `centreInRow`) are shared with the /erga/ filter
 *   chips (src/scripts/gallery.ts).
 * - With motion allowed, GSAP ScrollTrigger (loaded after the page has loaded) drives, scrubbed to
 *   scroll: each chapter's photo frame straightens out of a 3D turn (alternating sides), its
 *   plate-colour rule draws in, and the rail's CMYK fill follows reading progress through the
 *   chapters (desktop only: below 64rem the rail is a chip row with no fill, so nothing is
 *   written per scroll frame there). Nothing is pinned. On phones the turn is shallower. The
 *   giant outlined numbers and the halftone under-plates drift at their own depths through
 *   `data-parallax`, which the site-wide motion layer runs.
 *
 * Starting states are applied by JS only, and only to elements still below the fold when the
 * effects start, so nothing in view jumps and nothing is hidden without JS. Under reduced motion
 * (or if GSAP fails to load) the chapters rest flat and the rail fill steps with the active
 * chapter.
 */

export const PLATE_INKS = ['cyan', 'magenta', 'yellow', 'key'] as const;
export type PlateInk = (typeof PLATE_INKS)[number];

/** Plate colour of the chapter at `index` (0-based): C, M, Y, K, then round again. */
export const plateInk = (index: number): PlateInk =>
  PLATE_INKS[((index % PLATE_INKS.length) + PLATE_INKS.length) % PLATE_INKS.length] ?? 'key';

/** Rail fill (0–1) when chapter `index` of `total` is active; 0 when none is. */
export const stepProgress = (index: number, total: number): number =>
  total > 0 && index >= 0 ? Math.min(1, (index + 1) / total) : 0;

/** State of an index entry for the chapter at `index` while chapter `active` is in view. */
export type IndexState = 'read' | 'current' | 'ahead';
export const indexState = (index: number, active: number): IndexState => {
  if (index < 0 || active < 0 || index > active) return 'ahead';
  return index === active ? 'current' : 'read';
};

/**
 * Scroll offset that centres an item in a sideways scroller, kept inside the scroll range.
 * `start` is the item's offset from the start of the scrolled content, `view` the visible width,
 * `content` the full scrollable width.
 */
export const centredScroll = (
  start: number,
  size: number,
  view: number,
  content: number,
): number => {
  const max = Math.max(0, content - view);
  return Math.min(max, Math.max(0, start - (view - size) / 2));
};

/** Which ends of a sideways scroller have content beyond them. */
export interface ScrollEdges {
  start: boolean;
  end: boolean;
}

/**
 * Edges of a sideways scroller with more content beyond them. `slack` absorbs sub-pixel scroll
 * positions; overscroll (iOS rubber-banding past either end) counts as resting at that end.
 */
export const scrollEdges = (
  scrollLeft: number,
  view: number,
  content: number,
  slack = 1,
): ScrollEdges => {
  const max = Math.max(0, content - view);
  const position = Math.min(max, Math.max(0, scrollLeft));
  return { start: position > slack, end: position < max - slack };
};

/** `data-edges` value for the CSS fade: 'start', 'end', 'start end' or '' (everything fits). */
export const edgesAttr = ({ start, end }: ScrollEdges): string =>
  [start ? 'start' : '', end ? 'end' : ''].filter(Boolean).join(' ');

/**
 * Keeps `data-edges` on a sideways chip row up to date (on scroll, on resize of the row or its
 * chips, and once the web fonts have loaded), so the CSS fades only the sides that hide chips.
 * Returns a function that schedules a re-check.
 */
export const trackScrollEdges = (row: HTMLElement): (() => void) => {
  let frame = 0;
  const update = (): void => {
    frame = 0;
    const value = edgesAttr(scrollEdges(row.scrollLeft, row.clientWidth, row.scrollWidth));
    if (row.dataset.edges !== value) row.dataset.edges = value;
  };
  const schedule = (): void => {
    if (frame === 0) frame = requestAnimationFrame(update);
  };
  row.addEventListener('scroll', schedule, { passive: true });
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(schedule);
    observer.observe(row);
    Array.from(row.children).forEach((child) => observer.observe(child));
  } else {
    window.addEventListener('resize', schedule, { passive: true });
  }
  if ('fonts' in document) void document.fonts.ready.then(schedule);
  update();
  return schedule;
};

/**
 * How the chip row moves to the current chip. Until the visitor has touched, clicked, scrolled
 * with a wheel or pressed a key, every page scroll is the browser's own (the deep-link jump, scroll
 * restoration, ScrollTrigger's refresh), and a smooth row scroll started under one of those can be
 * cut off and left where it began: so it jumps. After that it glides, unless motion is reduced.
 */
export const chipScrollBehavior = (interacted: boolean, reduced: boolean): ScrollBehavior =>
  interacted && !reduced ? 'smooth' : 'auto';

/**
 * Whether an item (offset `start`, width `size` in the scrolled content) shows whole in a
 * sideways scroller at `scrollLeft`, clear of an `inset` (the edge fades) on both sides.
 */
export const itemInView = (
  start: number,
  size: number,
  scrollLeft: number,
  view: number,
  inset = 0,
): boolean => start >= scrollLeft + inset && start + size <= scrollLeft + view - inset;

/** Offset of `item` from the start of `row`'s scrolled content (px). */
const offsetInRow = (row: HTMLElement, item: HTMLElement): { start: number; size: number } => {
  const rowBox = row.getBoundingClientRect();
  const box = item.getBoundingClientRect();
  return { start: box.left - rowBox.left - row.clientLeft + row.scrollLeft, size: box.width };
};

/**
 * Whether `item` shows whole in the sideways `row`, clear of `inset` px at each edge (or the
 * row does not scroll at all).
 */
export const shownInRow = (row: HTMLElement, item: HTMLElement, inset = 0): boolean => {
  if (row.scrollWidth <= row.clientWidth) return true;
  const { start, size } = offsetInRow(row, item);
  return itemInView(start, size, row.scrollLeft, row.clientWidth, inset);
};

/**
 * Scrolls a sideways row (its own scrollLeft, never the page) so `item` sits in the middle, as
 * far as the row's scroll range allows.
 */
export const centreInRow = (row: HTMLElement, item: HTMLElement, smooth: boolean): void => {
  const view = row.clientWidth;
  const content = row.scrollWidth;
  if (content <= view) return;
  const { start, size } = offsetInRow(row, item);
  const left = centredScroll(start, size, view, content);
  if (Math.abs(left - row.scrollLeft) < 1) return;
  row.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
};

/** Hard-stop gradient stops for the rail: one plate-colour segment per chapter. */
export const railGradient = (total: number): string => {
  if (total <= 0) return 'none';
  const stops = Array.from({ length: total }, (_, i) => {
    const from = ((i / total) * 100).toFixed(3);
    const to = (((i + 1) / total) * 100).toFixed(3);
    return `var(--color-${plateInk(i)}) ${from}% ${to}%`;
  });
  return `linear-gradient(to bottom, ${stops.join(', ')})`;
};

/** How long a chip row stays the visitor's after the finger lifts (covers a fling). */
const ROW_FLING_MS = 700;
/** Quiet time after the last page scroll before the current chip's place is checked. */
const PAGE_SETTLE_MS = 180;
/** A row that scrolled this recently is still gliding: check it again later. */
const ROW_QUIET_MS = 120;
/** Edge fade of the chip row (2rem in ServiceIndex.astro): a chip under it is not in view. */
const ROW_FADE_PX = 32;

const loadGsap = async () => {
  try {
    const [{ gsap }, { ScrollTrigger }] = await Promise.all([
      import('gsap'),
      import('gsap/ScrollTrigger'),
    ]);
    gsap.registerPlugin(ScrollTrigger);
    return { gsap, ScrollTrigger };
  } catch {
    // Chunk failed to load (offline, blocked): the chapters stay flat and fully visible.
    return null;
  }
};

export const initServicesPage = (): void => {
  const chapters = Array.from(document.querySelectorAll<HTMLElement>('[data-svcp-chapter]'));
  if (chapters.length === 0) return;
  const rail = document.querySelector<HTMLElement>('[data-svc-index]');
  const chipRow = rail?.querySelector<HTMLElement>('[data-svc-index-list]') ?? null;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 64rem)');

  /** True while ScrollTrigger drives the rail fill continuously. */
  let continuous = false;
  let activeIndex = -1;
  const setFill = (value: number): void => {
    rail?.style.setProperty('--svcp-progress', value.toFixed(4));
  };

  const chapterIndex = new Map(chapters.map((chapter, i): [string, number] => [chapter.id, i]));
  const links = new Map<string, HTMLAnchorElement>();
  rail?.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
    links.set(a.hash.slice(1), a);
  });

  // Below 64rem the chip row fades only where it hides chips. While a finger is on the row (and
  // for its fling afterwards) the row is the visitor's: the current chip is not pulled back.
  let rowHeld = false;
  let rowFreeAt = 0;
  let rowScrolledAt = 0;
  if (chipRow) {
    trackScrollEdges(chipRow);
    const hold = (): void => {
      rowHeld = true;
    };
    const release = (): void => {
      rowHeld = false;
      rowFreeAt = performance.now() + ROW_FLING_MS;
    };
    chipRow.addEventListener('touchstart', hold, { passive: true });
    chipRow.addEventListener('touchend', release, { passive: true });
    chipRow.addEventListener('touchcancel', release, { passive: true });
    chipRow.addEventListener(
      'scroll',
      () => {
        rowScrolledAt = performance.now();
      },
      { passive: true },
    );
  }

  // Until the visitor acts, page scrolls are the browser's own: the row jumps to the chip.
  let interacted = false;
  const firstActs = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
  const onFirstAct = (): void => {
    interacted = true;
    firstActs.forEach((type) => window.removeEventListener(type, onFirstAct, true));
  };
  firstActs.forEach((type) =>
    window.addEventListener(type, onFirstAct, { capture: true, passive: true }),
  );

  let currentId = '';
  const rowFree = (): boolean =>
    Boolean(chipRow) && !desktop.matches && !rowHeld && performance.now() >= rowFreeAt;

  /** Below 64rem: bring the chip of the chapter in view to the middle of the chip row. */
  const revealChip = (link: HTMLAnchorElement | undefined): void => {
    if (!link || !chipRow || !rowFree()) return;
    centreInRow(chipRow, link, chipScrollBehavior(interacted, reduce.matches) === 'smooth');
  };

  // Once the page has come to rest (and after load and the web fonts), make sure the current chip
  // really is in view: a glide may have been cut off by a page scroll the browser ran itself, and
  // the chips change width when the fonts arrive. Before the visitor acts it is centred outright;
  // after that only a chip that is out of view (or under a fade) is brought back, so a row the
  // visitor browsed is not pulled about on every pause.
  let settleTimer = 0;
  const checkChip = (): void => {
    settleTimer = 0;
    const link = links.get(currentId);
    if (!chipRow || !link || !rowFree()) return;
    if (performance.now() - rowScrolledAt < ROW_QUIET_MS) {
      settleTimer = window.setTimeout(checkChip, ROW_QUIET_MS);
      return;
    }
    if (interacted && shownInRow(chipRow, link, ROW_FADE_PX)) return;
    centreInRow(chipRow, link, false);
  };
  const scheduleCheck = (delay: number): void => {
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(checkChip, delay);
  };
  if (chipRow) {
    window.addEventListener('scroll', () => scheduleCheck(PAGE_SETTLE_MS), { passive: true });
    if ('onscrollend' in window) {
      window.addEventListener('scrollend', () => scheduleCheck(0), { passive: true });
    }
    const afterLoad = (): void => {
      requestAnimationFrame(() => scheduleCheck(0));
    };
    if (document.readyState === 'complete') afterLoad();
    else window.addEventListener('load', afterLoad, { once: true });
    if ('fonts' in document) void document.fonts.ready.then(() => scheduleCheck(0));
  }

  // Active chapter: the one crossing the band from 35% to 40% of the viewport height.
  const setCurrent = (id: string): void => {
    currentId = id;
    activeIndex = chapterIndex.get(id) ?? -1;
    links.forEach((a, key) => {
      const state = indexState(chapterIndex.get(key) ?? -1, activeIndex);
      if (state === 'current') a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
      a.classList.toggle('is-read', state === 'read');
    });
    if (!continuous) setFill(stepProgress(activeIndex, chapters.length));
    revealChip(links.get(id));
  };
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setCurrent(entry.target.id);
        }
      },
      { rootMargin: '-35% 0px -60% 0px' },
    );
    chapters.forEach((chapter) => observer.observe(chapter));
  }

  const enhance = async (): Promise<void> => {
    if (reduce.matches) return;
    const lib = await loadGsap();
    // Reduced motion may have been switched on while the chunk loaded.
    if (!lib || reduce.matches) return;
    const { gsap, ScrollTrigger } = lib;

    // Read every position first, then write.
    const vh = window.innerHeight;
    // Phones: a shallower turn, so the straightening reads as a settle, not a swing.
    const phone = window.innerWidth < 768;
    const angle = phone ? 10 : 16;
    const tiltX = phone ? 4 : 7;
    const startScale = phone ? 0.96 : 0.94;
    const plan = chapters.map((chapter) => {
      const frame = chapter.querySelector<HTMLElement>('[data-svcp-frame]');
      const rule = chapter.querySelector<HTMLElement>('[data-svcp-rule]');
      return {
        frame,
        rule,
        // Frame on the left turns away to the right, and the other way round.
        side: chapter.dataset.side === 'right' ? -1 : 1,
        frameBelow: frame ? frame.getBoundingClientRect().top > vh : false,
        ruleBelow: rule ? rule.getBoundingClientRect().top > vh : false,
      };
    });
    const list = chapters[0]?.parentElement ?? null;

    const ctx = gsap.context(() => {
      for (const p of plan) {
        if (p.frame && p.frameBelow) {
          gsap.fromTo(
            p.frame,
            {
              rotateY: p.side * angle,
              rotateX: tiltX,
              scale: startScale,
              transformPerspective: 1100,
              transformOrigin: p.side === 1 ? '0% 50%' : '100% 50%',
            },
            {
              rotateY: 0,
              rotateX: 0,
              scale: 1,
              ease: 'none',
              scrollTrigger: { trigger: p.frame, start: 'top bottom', end: 'top 45%', scrub: 0.5 },
            },
          );
        }
        if (p.rule && p.ruleBelow) {
          gsap.fromTo(
            p.rule,
            { scaleX: 0, transformOrigin: '0% 50%' },
            {
              scaleX: 1,
              ease: 'none',
              scrollTrigger: { trigger: p.rule, start: 'top 92%', end: 'top 62%', scrub: 0.4 },
            },
          );
        }
      }

      if (rail && list) {
        continuous = true;
        // The fill only shows on the desktop rail: below 64rem it is not written per frame.
        const trigger = ScrollTrigger.create({
          trigger: list,
          start: 'top 40%',
          end: 'bottom 60%',
          onUpdate: (self) => {
            if (desktop.matches) setFill(self.progress);
          },
          onRefresh: (self) => {
            if (desktop.matches) setFill(self.progress);
          },
        });
        desktop.addEventListener('change', (event) => {
          if (event.matches && continuous) setFill(trigger.progress);
        });
      }
    });

    // Reduced motion switched on later: back to the flat, composed state.
    reduce.addEventListener('change', (event) => {
      if (!event.matches) return;
      ctx.revert();
      continuous = false;
      setFill(stepProgress(activeIndex, chapters.length));
    });
  };

  if (document.readyState === 'complete') void enhance();
  else window.addEventListener('load', () => void enhance(), { once: true });
};
