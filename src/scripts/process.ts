/**
 * Home process poster (signature moment 2).
 *
 * As each of the four steps scrolls past the trigger line (62% of the screen, kept below the
 * sticky strip on small screens), its plate prints onto the poster (Y → M → C → K): it lands
 * slightly off register and snaps in with a small overshoot. Scrolling back takes the plates off
 * again. Stickiness is pure CSS (Process.astro): a column on desktop, a strip under the header
 * below 64rem, and not sticky at all below 64rem on short screens (max-height 30rem), where the
 * poster scrolls with the page. Nothing is pinned and scrolling is never taken over.
 *
 * Default (no JS, reduced motion, or anything missing): all plates printed, steps static. Only a
 * CSS custom property (--reg, the plate offset) and opacity are tweened.
 */

const PLATE_ORDER = ['y', 'm', 'c', 'k'] as const;

const loadGsap = async () => {
  try {
    const [{ gsap }, { ScrollTrigger }] = await Promise.all([
      import('gsap'),
      import('gsap/ScrollTrigger'),
    ]);
    gsap.registerPlugin(ScrollTrigger);
    return { gsap, ScrollTrigger };
  } catch {
    // Chunk failed to load (offline, blocked): the poster stays fully printed.
    return null;
  }
};

export const initProcess = async (): Promise<void> => {
  const section = document.querySelector<HTMLElement>('[data-process]');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  if (!section || motion.matches) return;

  const steps = Array.from(section.querySelectorAll<HTMLElement>('[data-step]'));
  const plates = PLATE_ORDER.map((id) =>
    section.querySelector<SVGGElement>(`[data-pp-plate="${id}"]`),
  ).filter((el): el is SVGGElement => el !== null);
  const chips = PLATE_ORDER.map((id) =>
    section.querySelector<HTMLElement>(`[data-pp-chip="${id}"]`),
  );
  if (steps.length !== PLATE_ORDER.length || plates.length !== PLATE_ORDER.length) return;

  const poster = section.querySelector<HTMLElement>('[data-process-poster]');
  const desktop = matchMedia('(min-width: 64rem)');

  /**
   * Viewport line (px from the top) at which a step becomes active: 62% of the screen, but below
   * the sticky poster strip when the strip is stuck under the header (below 64rem), and never
   * under the 64px floating contact bar.
   */
  const triggerLine = (): number => {
    const vh = window.innerHeight;
    let line = vh * 0.62;
    if (poster && !desktop.matches) {
      const style = getComputedStyle(poster);
      if (style.position === 'sticky') {
        const stripBottom = (parseFloat(style.top) || 0) + poster.offsetHeight;
        line = Math.max(line, stripBottom + 24);
      }
    }
    return Math.round(Math.min(line, vh - 80));
  };

  const lib = await loadGsap();
  // Reduced motion may have been switched on while the chunk loaded.
  if (!lib || motion.matches) return;
  const { gsap, ScrollTrigger } = lib;

  const printed: boolean[] = plates.map(() => true);
  let stage = -1;

  /** Show the first `count` plates and mark step `count` as active. */
  const setStage = (count: number, instant: boolean): void => {
    if (count === stage) return;
    stage = count;

    plates.forEach((plate, i) => {
      const shouldPrint = i < count;
      chips[i]?.classList.toggle('is-printed', shouldPrint);
      if (printed[i] === shouldPrint) return;
      printed[i] = shouldPrint;
      gsap.killTweensOf(plate);

      if (instant) {
        gsap.set(plate, shouldPrint ? { '--reg': 0, opacity: 1 } : { '--reg': 1, opacity: 0 });
      } else if (shouldPrint) {
        // Lands off register, then snaps into place.
        gsap.to(plate, { opacity: 1, duration: 0.18, ease: 'none' });
        gsap.to(plate, { '--reg': 0, duration: 0.6, delay: 0.08, ease: 'back.out(2.2)' });
      } else {
        gsap.to(plate, { '--reg': 1, opacity: 0, duration: 0.3, ease: 'power2.in' });
      }
    });

    steps.forEach((step, i) => step.classList.toggle('is-active', i === count - 1));
  };

  // Every plate starts in register and printed (matching the CSS default) so tweens have a start.
  gsap.set(plates, { '--reg': 0, opacity: 1 });
  section.classList.add('is-enhanced');

  // Each trigger runs from its step's start line to the end of the page, so the number of triggers
  // already started is the number of plates printed, whatever order the callbacks arrive in.
  const triggers: ReturnType<typeof ScrollTrigger.create>[] = [];
  let ready = false;
  const update = (instant: boolean): void => {
    setStage(triggers.filter((st) => st.progress > 0).length, instant);
  };
  steps.forEach((step) => {
    triggers.push(
      ScrollTrigger.create({
        trigger: step,
        start: () => `top ${triggerLine()}px`,
        end: 'max',
        // Ignore the callbacks fired while the triggers are still being created.
        onToggle: () => {
          if (ready) update(false);
        },
      }),
    );
  });
  // First state without animation (the page may load already scrolled past some steps).
  ready = true;
  update(true);

  // If reduced motion is switched on later, put everything back to the static, printed state.
  const teardown = (): void => {
    triggers.forEach((st) => st.kill());
    gsap.killTweensOf(plates);
    plates.forEach((plate) => plate.removeAttribute('style'));
    chips.forEach((chip) => chip?.classList.remove('is-printed'));
    steps.forEach((step) => step.classList.remove('is-active'));
    section.classList.remove('is-enhanced');
  };
  motion.addEventListener('change', (event) => {
    if (event.matches) teardown();
  });
};
