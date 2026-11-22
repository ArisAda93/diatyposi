/**
 * Home hero intro (signature moment 1).
 *
 * The four arch plates arrive as separate inks, multiply-blended and slightly out of register,
 * then snap into register with a small overshoot while the C/M/Y ghosts of the headline converge
 * on the key text. At the snap the arches switch to the logo's knock-out stacking. About 1.45 s.
 *
 * Contract with BaseLayout: `html.hero-intro` is set before first paint only when the intro should
 * play (once per session, never with reduced motion). The CSS default is the final composed state;
 * the start state lives under `html.hero-intro` / `.hero.is-playing` (Hero.astro). Only CSS custom
 * properties and opacity are tweened. When the timeline ends, the classes and inline styles are
 * removed so the composed CSS state holds.
 */

const PLAYED_KEY = 'dt-hero-played';
/** Print order: yellow, magenta, cyan, key. */
const PLATE_ORDER = ['y', 'm', 'c', 'k'] as const;

const markPlayed = (): void => {
  try {
    sessionStorage.setItem(PLAYED_KEY, '1');
  } catch {
    // Storage blocked: the intro may play again on the next visit, nothing else depends on it.
  }
};

/** GSAP is loaded on demand so it never blocks first paint. */
const loadGsap = async () => {
  try {
    return (await import('gsap')).gsap;
  } catch {
    // Chunk failed to load (offline, blocked): the caller shows the composed hero instead.
    return null;
  }
};

export const initHero = async (): Promise<void> => {
  const root = document.documentElement;
  if (!root.classList.contains('hero-intro')) return;

  const hero = document.querySelector<HTMLElement>('[data-hero]');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const plates = hero
    ? PLATE_ORDER.map((id) =>
        hero.querySelector<SVGGElement>(`.logo-plate[data-plate="${id}"]`),
      ).filter((el): el is SVGGElement => el !== null)
    : [];

  if (!hero || reduceMotion || plates.length !== PLATE_ORDER.length) {
    root.classList.remove('hero-intro');
    return;
  }

  const ghosts = Array.from(hero.querySelectorAll<HTMLElement>('[data-hero-ghost]'));
  const gsap = await loadGsap();
  if (!gsap) {
    root.classList.remove('hero-intro');
    return;
  }
  // BaseLayout's safety net may already have revealed the composed hero; never replay over it.
  if (!root.classList.contains('hero-intro')) return;

  markPlayed();
  // Hand the start state from the pre-paint class to the hero itself (same frame, no flash).
  hero.classList.add('is-playing');
  root.classList.remove('hero-intro');

  const animated: Element[] = [...plates, ...ghosts];
  const finish = (): void => {
    hero.classList.remove('is-playing', 'is-registered');
    animated.forEach((el) => el.removeAttribute('style'));
  };

  const snapAt = 0.95;
  const snap = { duration: 0.45, ease: 'back.out(2.4)' };
  const tl = gsap.timeline({ onComplete: finish });

  // 1. Plates come in one by one and settle slightly out of register.
  plates.forEach((plate, i) => {
    tl.fromTo(
      plate,
      { '--reg': 1, opacity: 0 },
      { '--reg': 0.3, opacity: 1, duration: 0.5, ease: 'power3.out' },
      i * 0.11,
    );
  });
  if (ghosts.length > 0) {
    tl.fromTo(ghosts, { '--hl': 1 }, { '--hl': 0.45, duration: 0.85, ease: 'power1.inOut' }, 0);
  }

  // 2. Everything snaps into register together.
  tl.to(plates, { '--reg': 0, ...snap }, snapAt);
  tl.call(() => hero.classList.add('is-registered'), [], snapAt + 0.14);
  if (ghosts.length > 0) {
    tl.to(ghosts, { '--hl': 0, ...snap }, snapAt);
    tl.to(ghosts, { opacity: 0, duration: 0.2, ease: 'none' }, snapAt + 0.3);
  }
};
