/**
 * /ypiresies/ chapters and index rail (markup: src/pages/ypiresies.astro,
 * src/components/services/ServiceIndex.astro, src/components/services/ServiceSection.astro).
 *
 * - The index marks the chapter in the reading band of the viewport (aria-current) and the
 *   chapters before it (.is-read) with an IntersectionObserver, with or without motion. Below
 *   64rem, where the index is a sideways chip row, the current chip is scrolled to the middle of
 *   the row (the page itself never scrolls).
 * - With motion allowed, GSAP ScrollTrigger (loaded after the page has loaded) drives, scrubbed to
 *   scroll: each chapter's photo frame straightens out of a 3D turn (alternating sides), its
 *   plate-colour rule draws in, and the rail's CMYK fill follows reading progress through the
 *   chapters. Nothing is pinned. The giant outlined numbers and the halftone under-plates drift
 *   at their own depths through `data-parallax`, which the site-wide motion layer runs.
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

  /** Below 64rem: bring the chip of the chapter in view to the middle of the chip row. */
  const revealChip = (link: HTMLAnchorElement | undefined): void => {
    if (!link || !chipRow || desktop.matches) return;
    const view = chipRow.clientWidth;
    const content = chipRow.scrollWidth;
    if (content <= view) return;
    const rowBox = chipRow.getBoundingClientRect();
    const box = link.getBoundingClientRect();
    const start = box.left - rowBox.left + chipRow.scrollLeft;
    chipRow.scrollTo({
      left: centredScroll(start, box.width, view, content),
      behavior: reduce.matches ? 'auto' : 'smooth',
    });
  };

  // Active chapter: the one crossing the band from 35% to 40% of the viewport height.
  const chapterIndex = new Map(chapters.map((chapter, i): [string, number] => [chapter.id, i]));
  const links = new Map<string, HTMLAnchorElement>();
  rail?.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
    links.set(a.hash.slice(1), a);
  });
  const setCurrent = (id: string): void => {
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
    const angle = window.innerWidth < 768 ? 10 : 16;
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
              rotateX: 7,
              scale: 0.94,
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
        ScrollTrigger.create({
          trigger: list,
          start: 'top 40%',
          end: 'bottom 60%',
          onUpdate: (self) => setFill(self.progress),
          onRefresh: (self) => setFill(self.progress),
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
