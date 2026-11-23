/**
 * Site-wide motion layer, loaded on every page by BaseLayout. Elements opt in with data
 * attributes; some shared classes are picked up automatically (styles: src/styles/motion.css).
 *
 * - Registration (`data-reveal="registration"`, auto on `.h2` and `.display-l` outside the hero):
 *   C/M/Y copies of the heading converge on the key text, scrubbed while its top travels from 95%
 *   to 60% of the viewport. Headings already on screen at load converge once instead.
 * - Depth (`data-reveal="depth"`): a tilted, lowered, slightly smaller start state settles to rest,
 *   scrubbed while the top travels from 100% to 65% of the viewport. Siblings are staggered.
 * - Halftone (`data-halftone`, auto on `.media` and `.colorbar`): on first entry the element
 *   prints in through a growing halftone dot mask; the mask is removed afterwards.
 * - Tilt (`data-tilt`, auto on `.card-lift`, fine pointers only): ±6° towards the pointer, a soft
 *   ink sheen and a C/M/Y plate shadow opposite the tilt.
 * - Magnetic (`data-magnetic`, auto on `.btn`, fine pointers only): a pull of up to 6 px towards
 *   the pointer; the button's plate shadow points towards the pointer.
 * - Parallax (`data-parallax="<speed>"`, -0.4…0.4): the element is offset by
 *   (its centre − the viewport centre) × −speed × PARALLAX_GAIN (1.6, an emphasized depth),
 *   at most 26vh, smoothed. Positive speeds lag the scroll (the element recedes), negative ones
 *   lead it. Written to the `translate` property (`--px-y`), so it composes with any transform;
 *   only elements near the viewport are updated.
 *   It measures the element's box (minus its own offset), so it also works in sticky containers.
 * - Ink ripple (`.btn`, `.icon-btn`): on press, C/M/Y rings expand from the pointer and snap into
 *   register as they fade (touch included: it is press feedback, not a hover effect).
 * - Toggles (`[aria-pressed]`): a short registration snap whenever one is clicked.
 * - Header: scroll-velocity misregistration of `.site-header .logo-plate` (translate only, springs
 *   back into register), and `--scroll-progress` (0–1) on `[data-scroll-progress]`. The progress
 *   is a direct mapping of the scroll position, like a scrollbar, so it also runs with reduced
 *   motion; everything else is off then.
 * - `data-motion="off"` opts an element and its descendants out.
 * - Phones and touch screens (motionProfile): the halftone prints quickly and starts a little
 *   before the element enters (`html.mo-quick`); on phones (`html.mo-compact`, COMPACT_QUERY) the
 *   depth entry rises less, the scrubs settle sooner and parallax moves half as far. Desktop
 *   keeps the values above.
 *
 * Start states are applied from here only, and only to elements below the fold at init, so nothing
 * is hidden without JS. Reduced motion (live) tears the effects down to the composed page. GSAP and
 * ScrollTrigger are imported on demand, after load or on the first scroll, and only when something
 * needs scrubbing. The effects share one pointer listener, one scroll listener and one rAF loop
 * that idles when nothing moves. The scroll progress (trackProgress) deliberately has its own
 * scroll listener, ResizeObserver and rAF, because it lives outside the motion session and keeps
 * running under reduced motion.
 */

// ------------------------------------------------------------------------------------------------
// Pure helpers (covered by tests/motion.test.ts)
// ------------------------------------------------------------------------------------------------

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Frame-rate independent exponential smoothing towards `target` (`lambda` per second, `dt` ms). */
export const damp = (current: number, target: number, lambda: number, dt: number): number =>
  target + (current - target) * Math.exp((-lambda * dt) / 1000);

export interface Spring {
  x: number;
  v: number;
}

/** One step of a damped spring (mass 1), in sub-steps of at most 8 ms (long frames stay stable). */
export const springStep = (
  spring: Spring,
  target: number,
  dt: number,
  stiffness: number,
  damping: number,
): Spring => {
  let { x, v } = spring;
  let left = clamp(dt, 0, 100) / 1000;
  while (left > 0) {
    const h = Math.min(left, 0.008);
    v += (stiffness * (target - x) - damping * v) * h;
    x += v * h;
    left -= h;
  }
  return { x, v };
};

/** Logo misregistration (px) for a scroll velocity (px/ms), clamped to ±max. */
export const velocityOffset = (velocity: number, gain: number, max: number): number =>
  clamp(velocity * gain, -max, max);

/** Page scroll progress, 0–1 (0 when the page does not scroll). */
export const scrollProgress = (scrollY: number, maxScroll: number): number =>
  maxScroll > 0 ? clamp(scrollY / maxScroll, 0, 1) : 0;

/** Pointer position relative to a box, -1…1 on each axis (0 at the centre). */
export const pointerNorm = (
  x: number,
  y: number,
  left: number,
  top: number,
  width: number,
  height: number,
): [number, number] => [
  width > 0 ? clamp(((x - left) / width) * 2 - 1, -1, 1) : 0,
  height > 0 ? clamp(((y - top) / height) * 2 - 1, -1, 1) : 0,
];

/** Largest tilt for a box: 6° up to about 420 px wide, less for big panels, never under 2.5°. */
export const tiltLimit = (width: number): number => clamp((6 * 420) / Math.max(width, 1), 2.5, 6);

/** Depth rotation amplitude: full up to 560 px tall, scaled down for tall panels (min 0.25). */
export const depthAmplitude = (height: number): number => clamp(560 / Math.max(height, 1), 0.25, 1);

/** Magnetic pull: a fraction of the pointer's offset from the centre, at most `max` px long. */
export const magneticPull = (
  dx: number,
  dy: number,
  strength: number,
  max: number,
): [number, number] => {
  const x = dx * strength;
  const y = dy * strength;
  const length = Math.hypot(x, y);
  if (length <= max) return [x, y];
  const k = max / length;
  return [x * k, y * k];
};

/**
 * Direction of a plate shadow towards the pointer, scaled so the larger component is ±1 (the CSS
 * default (1, 1) is the classic bottom-right shadow). Null near the centre, where it is unstable.
 */
export const plateDirection = (
  nx: number,
  ny: number,
  deadZone = 0.12,
): [number, number] | null => {
  const m = Math.max(Math.abs(nx), Math.abs(ny));
  return m < deadZone ? null : [nx / m, ny / m];
};

/**
 * Scroll positions where a scrub starts and ends: when the element's top reaches the `from` and
 * `to` fractions of the viewport, but never past the end of the page, so every scrub can finish.
 */
export const scrubRange = (
  top: number,
  viewport: number,
  from: number,
  to: number,
  maxScroll: number,
): [number, number] => {
  const end = Math.max(1, Math.min(top - viewport * to, maxScroll));
  return [Math.max(0, Math.min(top - viewport * from, end - 1)), end];
};

/** Largest parallax speed either way (`data-parallax`). */
export const PARALLAX_LIMIT = 0.4;
/**
 * Global parallax gain: every `data-parallax` speed is multiplied by it, so the layers separate
 * more strongly while their relative order stays. (living-background/text-rects.ts mirrors it.)
 */
export const PARALLAX_GAIN = 1.6;
/** Largest parallax offset, as a fraction of the viewport height (scaled with the gain). */
export const PARALLAX_MAX = 0.26;

/** The speed a `data-parallax` speed moves at, with the global gain. */
export const effectiveParallax = (speed: number): number => speed * PARALLAX_GAIN;

/** A `data-parallax` value as a speed, clamped to ±PARALLAX_LIMIT; null if missing, bad or 0. */
export const parallaxSpeed = (value: string | null): number | null => {
  if (value === null || value.trim() === '') return null;
  const speed = Number(value);
  if (!Number.isFinite(speed) || speed === 0) return null;
  return clamp(speed, -PARALLAX_LIMIT, PARALLAX_LIMIT);
};

/**
 * Parallax offset (px) for an element whose layout centre is at `centre` (viewport px): its
 * distance from the viewport centre times −speed, clamped to ±max. Zero at the centre, so every
 * element passes through its own layout position, and never more than `max` away from it.
 */
export const parallaxOffset = (
  centre: number,
  viewportCentre: number,
  speed: number,
  max: number,
): number => clamp((centre - viewportCentre) * -speed, -max, max) || 0;

/**
 * Phones: portrait under 48rem, or a short landscape touch screen. Read once per motion session
 * (a rotation keeps a phone on the same side of it).
 */
export const COMPACT_QUERY = '(max-width: 47.99rem), (max-height: 31.99rem) and (pointer: coarse)';
/** Longest halftone transition (motion.css `.mo-ht-in`, 250 + 1100 ms) plus a margin. */
export const HALFTONE_MS = 1700;
/** Longest quick halftone transition (motion.css `.mo-quick .mo-ht-in`: 80 + 460 ms) + margin. */
export const HALFTONE_QUICK_MS = 900;

/** Per-device tuning of the motion layer (see the module comment). */
export interface MotionProfile {
  /** Short halftone print-in on phones and touch screens (`html.mo-quick`). */
  quickPrint: boolean;
  /** IntersectionObserver rootMargin that starts the halftone print-in. */
  halftoneMargin: string;
  /** Safety timeout that unmasks an element whose print-in never reports its end (ms). */
  halftoneMs: number;
  /** Factor on every parallax speed and on the largest offset. */
  parallaxScale: number;
  /** Viewport fraction of the element's top where the depth scrub ends (it starts at 1). */
  depthTo: number;
  /** Viewport fraction of a heading's top where the registration scrub ends (starts at 0.95). */
  registrationTo: number;
}

/**
 * The motion tuning for a device. `compact`: a phone (COMPACT_QUERY). `finePointer`: a mouse or
 * trackpad that hovers. Desktop (not compact, fine pointer) keeps the original values.
 */
export const motionProfile = (compact: boolean, finePointer: boolean): MotionProfile => {
  const quickPrint = compact || !finePointer;
  return {
    quickPrint,
    halftoneMargin: quickPrint ? '0px 0px 12% 0px' : '0px 0px -8% 0px',
    halftoneMs: quickPrint ? HALFTONE_QUICK_MS : HALFTONE_MS,
    parallaxScale: compact ? 0.5 : 1,
    depthTo: compact ? 0.8 : 0.65,
    registrationTo: compact ? 0.72 : 0.6,
  };
};

/** Diameter (px) of a ripple from (x, y) in a box that reaches the box's farthest corner. */
export const rippleDiameter = (x: number, y: number, width: number, height: number): number =>
  2 * Math.hypot(Math.max(x, width - x), Math.max(y, height - y));

/** Perspective distance (px) of the depth and tilt transform (motion.css uses the same value). */
export const PERSPECTIVE = 1000;
/** Largest depth rotation (deg) before the amplitude is applied. */
export const DEPTH_TILT = 10;

/**
 * How much a point `z` px towards the viewer is magnified by the perspective. The near edge of a
 * rotated element is magnified, so its projected width can exceed its box.
 */
export const perspectiveGrow = (z: number): number => PERSPECTIVE / (PERSPECTIVE - z);

/**
 * Start scale of the depth entry: the design's 0.96, or less if needed so the near (bottom) edge,
 * rotated forward around the centre, never projects wider than the element's own box.
 */
export const depthStartScale = (height: number, amplitude: number): number => {
  const z = (height / 2) * Math.sin((DEPTH_TILT * amplitude * Math.PI) / 180);
  return Math.min(0.96, 0.995 / perspectiveGrow(z));
};

/**
 * Scale that keeps a tilted element inside the viewport: its near edge may grow into the free
 * `room` beside it (px to the nearer viewport edge), never further. 1 when nothing is needed.
 */
export const fitScale = (width: number, room: number, z: number): number => {
  const half = width / 2;
  if (half <= 0) return 1;
  return Math.min(1, (half + Math.max(0, room)) / (half * perspectiveGrow(z)));
};

// ------------------------------------------------------------------------------------------------
// Runtime
// ------------------------------------------------------------------------------------------------

type Cleanup = () => void;

interface FrameTask {
  /** Layout reads, run for every task before any write. */
  read?: () => void;
  /** Writes; return true while another frame is needed. */
  write: (dt: number) => boolean;
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Scrub {
  el: HTMLElement;
  prop: '--mo-d' | '--mo-reg';
  /** Class that carries the effect while the element is not at rest. */
  live: string;
  /** Viewport fractions for the element's top at the start and the end of the scrub. */
  from: number;
  to: number;
}

const OFF = '[data-motion="off"]';
const HERO = '[data-hero]';
const REGISTRATION = '[data-reveal="registration"], .h2, .display-l';
const DEPTH = '[data-reveal="depth"]';
const HALFTONE = '[data-halftone], .media, .colorbar';
const TILT = '[data-tilt], .card-lift';
const MAGNETIC = '[data-magnetic], .btn';
const PARALLAX = '[data-parallax]';
const RIPPLE = '.btn, .icon-btn';
const TOGGLE = '[aria-pressed]';
const TILT_VARS = [
  '--mo-rx',
  '--mo-ry',
  '--mo-sx',
  '--mo-sy',
  '--mo-lift',
  '--mo-px',
  '--mo-py',
  '--mo-fit',
];
const MAGNET_VARS = ['--mo-mx', '--mo-my', '--mo-bx', '--mo-by'];
/** How long to wait for the GSAP chunks before showing the scrubbed elements at rest. */
const GSAP_WAIT_MS = 8000;
/** Parallax smoothing (per second) and the band around the viewport where it is updated. */
const PARALLAX_LAMBDA = 10;
const PARALLAX_NEAR = '25% 0px 25% 0px';
/** Longest ripple ring (motion.css: 640 ms plus the 50 ms delay) plus a margin. */
const RIPPLE_MS = 900;
/** Toggle snap (motion.css) plus a margin. */
const TOGGLE_MS = 600;

const measure = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/** Document offset of an element's top, ignoring transforms (the depth start state moves it). */
const docTop = (el: HTMLElement): number => {
  let top = 0;
  let node: HTMLElement | null = el;
  while (node) {
    top += node.offsetTop;
    node = node.offsetParent instanceof HTMLElement ? node.offsetParent : null;
  }
  return top;
};

const pick = <T extends Element>(selector: string, skipHero: boolean): T[] =>
  Array.from(document.querySelectorAll<T>(selector)).filter(
    (el) => !el.closest(OFF) && !(skipHero && el.closest(HERO)),
  );

const clearVars = (el: HTMLElement, vars: readonly string[]): void => {
  vars.forEach((name) => el.style.removeProperty(name));
};

/**
 * Runs one effect's callback so that an error in it cannot stop the other effects sharing the
 * loop or the listener. The failing effect simply stops changing; nothing is hidden by it.
 */
const isolated = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

const createTicker = () => {
  const tasks: FrameTask[] = [];
  let raf = 0;
  let last = 0;
  const frame = (now: number): void => {
    raf = 0;
    const dt = last ? Math.min(now - last, 100) : 1000 / 60;
    last = now;
    tasks.forEach((task) => isolated(() => task.read?.(), undefined));
    let again = false;
    tasks.forEach((task) => {
      if (isolated(() => task.write(dt), false)) again = true;
    });
    if (again) raf = requestAnimationFrame(frame);
    else last = 0;
  };
  return {
    add: (task: FrameTask): void => {
      tasks.push(task);
    },
    wake: (): void => {
      if (!raf) raf = requestAnimationFrame(frame);
    },
    size: (): number => tasks.length,
    /** Drop the tasks added after `size` (used when an effect fails to set up). */
    truncate: (size: number): void => {
      tasks.length = Math.min(tasks.length, size);
    },
    stop: (): void => {
      cancelAnimationFrame(raf);
      raf = 0;
      tasks.length = 0;
    },
  };
};

type Ticker = ReturnType<typeof createTicker>;

/** Shared state of one motion session (from start to teardown). */
interface Session {
  ticker: Ticker;
  cleanups: Cleanup[];
  scroll: { y: number };
  pointer: { x: number; y: number };
  /** Called on every scroll event, after `scroll.y` is updated. */
  onScroll: Cleanup[];
  /** Called on every pointer move (mouse or pen). */
  onPointer: Cleanup[];
  /** Called when the window or the page height changes. */
  onResize: Cleanup[];
  /** Device tuning, fixed for the session. */
  profile: MotionProfile;
  stopped: boolean;
}

const listen = (
  session: Session,
  target: EventTarget,
  type: string,
  handler: (event: Event) => void,
  options: AddEventListenerOptions = { passive: true },
): void => {
  target.addEventListener(type, handler, options);
  session.cleanups.push(() => target.removeEventListener(type, handler, options));
};

// --- Registration and depth (scrubbed) --------------------------------------------------------

const setupScrubs = (session: Session, vh: number): void => {
  const scrubs: Scrub[] = [];
  const intro: HTMLElement[] = [];

  // Measure everything first, then write.
  const headings = pick<HTMLElement>(REGISTRATION, true).map((el) => ({ el, box: measure(el) }));
  const depths = pick<HTMLElement>(DEPTH, false).map((el) => ({ el, box: measure(el) }));

  headings.forEach(({ el, box }) => {
    if (box.height === 0) return;
    if (box.top < vh) {
      if (box.top + box.height > 0) intro.push(el);
      return;
    }
    scrubs.push({
      el,
      prop: '--mo-reg',
      live: 'mo-reg',
      from: 0.95,
      to: session.profile.registrationTo,
    });
  });

  const siblings = new Map<Element | null, number>();
  depths.forEach(({ el, box }) => {
    if (box.height === 0 || box.top < vh) return;
    const index = Math.min(siblings.get(el.parentElement) ?? 0, 4);
    siblings.set(el.parentElement, index + 1);
    const amplitude = depthAmplitude(box.height);
    el.style.setProperty('--mo-amp', amplitude.toFixed(3));
    el.style.setProperty('--mo-s0', depthStartScale(box.height, amplitude).toFixed(4));
    scrubs.push({
      el,
      prop: '--mo-d',
      live: 'mo-d-live',
      from: 1 - index * 0.03,
      to: session.profile.depthTo - index * 0.03,
    });
  });

  // Headings on screen at load converge once (only their C/M/Y copies move; the text is crisp).
  if (intro.length) {
    // Offset copies first (no transition), then, once that state is styled, converge.
    intro.forEach((el) => {
      el.classList.add('mo-reg');
      el.style.setProperty('--mo-reg', '1');
    });
    const clearIntro = (): void => {
      intro.forEach((el) => {
        el.classList.remove('mo-reg', 'mo-reg-intro');
        el.style.removeProperty('--mo-reg');
      });
    };
    const converge = (): void => {
      intro.forEach((el) => {
        el.classList.add('mo-reg-intro');
        el.style.setProperty('--mo-reg', '0');
      });
    };
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(converge);
    });
    const done = window.setTimeout(clearIntro, 1400);
    session.cleanups.push(() => {
      cancelAnimationFrame(raf);
      window.clearTimeout(done);
      clearIntro();
    });
  }

  if (!scrubs.length) return;

  // Start states now (all below the fold); the scrubs take over once GSAP is in.
  scrubs.forEach((s) => {
    s.el.classList.add(s.live);
    s.el.style.setProperty(s.prop, '1');
  });
  const revert = (): void => {
    scrubs.forEach((s) => {
      s.el.classList.remove(s.live);
      s.el.style.removeProperty(s.prop);
      s.el.style.removeProperty('--mo-amp');
      s.el.style.removeProperty('--mo-s0');
    });
  };
  session.cleanups.push(revert);

  let started = false;
  let idle = 0;
  let fallback = 0;
  let giveUp = 0;
  const job = { cancelled: false };
  const kick = (): void => {
    if (started || session.stopped) return;
    started = true;
    // A chunk that never arrives must not leave headings misregistered or blocks tilted.
    giveUp = window.setTimeout(() => {
      job.cancelled = true;
      revert();
    }, GSAP_WAIT_MS);
    runScrubs(session, job, scrubs, revert)
      .catch(revert)
      .finally(() => window.clearTimeout(giveUp));
  };
  const scheduleIdle = (): void => {
    if (typeof window.requestIdleCallback === 'function') {
      idle = window.requestIdleCallback(kick, { timeout: 1500 });
    } else {
      fallback = window.setTimeout(kick, 300);
    }
  };
  session.cleanups.push(() => {
    if (idle) window.cancelIdleCallback(idle);
    window.clearTimeout(fallback);
    window.clearTimeout(giveUp);
  });

  // A deep link may land next to an element in its start state: load right away.
  if (location.hash) {
    kick();
    return;
  }
  session.onScroll.push(kick);
  if (document.readyState === 'complete') scheduleIdle();
  else listen(session, window, 'load', scheduleIdle, { once: true, passive: true });
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
    return null;
  }
};

const runScrubs = async (
  session: Session,
  job: { cancelled: boolean },
  scrubs: Scrub[],
  revert: Cleanup,
): Promise<void> => {
  const lib = await loadGsap();
  if (session.stopped || job.cancelled) return;
  if (!lib) {
    // Chunk failed to load (offline, blocked): show everything at rest.
    revert();
    return;
  }
  const { gsap, ScrollTrigger } = lib;
  type Tween = ReturnType<typeof gsap.fromTo>;
  type Trigger = ReturnType<typeof ScrollTrigger.create>;
  const made: { tween: Tween; trigger: Trigger }[] = [];
  const kill = (): void => {
    made.splice(0).forEach(({ tween, trigger }) => {
      trigger.kill();
      tween.kill();
    });
  };

  try {
    scrubs.forEach((s) => {
      const range = (): [number, number] =>
        scrubRange(docTop(s.el), window.innerHeight, s.from, s.to, ScrollTrigger.maxScroll(window));
      // Declared before the tween exists: GSAP calls onUpdate while fromTo() is still running.
      let tween: Tween | null = null;
      // At rest (progress 1) the element carries no transform or text-shadow at all.
      const sync = (): void => {
        if (tween) s.el.classList.toggle(s.live, tween.progress() < 0.999);
      };
      tween = gsap.fromTo(
        s.el,
        { [s.prop]: 1 },
        { [s.prop]: 0, ease: 'none', paused: true, onUpdate: sync },
      );
      const trigger = ScrollTrigger.create({
        animation: tween,
        start: () => range()[0],
        end: () => range()[1],
        scrub: 0.6,
      });
      made.push({ tween, trigger });
      sync();
    });
  } catch {
    // One broken scrub must not leave elements tilted or misregistered: show them at rest.
    kill();
    revert();
    return;
  }

  // Images and filtered grids change the page height: re-measure (debounced).
  let timer = 0;
  session.onResize.push(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => ScrollTrigger.refresh(), 250);
  });
  session.cleanups.push(() => {
    window.clearTimeout(timer);
    kill();
  });
};

// --- Halftone print-in ------------------------------------------------------------------------

const setupHalftone = (session: Session, vh: number): void => {
  if (!('IntersectionObserver' in window)) return;
  const candidates = pick<HTMLElement>(HALFTONE, true)
    // An element inside another print-in element prints with it.
    .filter((el) => !el.parentElement?.closest(HALFTONE))
    .map((el) => ({ el, box: measure(el) }))
    .filter(({ box }) => box.height > 0 && box.top >= vh)
    .map(({ el }) => el);
  if (!candidates.length) return;

  const pending = new Set<HTMLElement>(candidates);
  const started = new Set<HTMLElement>();
  const timers = new Map<HTMLElement, number>();

  const finish = (el: HTMLElement): void => {
    el.classList.remove('mo-ht', 'mo-ht-fine', 'mo-ht-in');
    el.removeEventListener('transitionend', onEnd);
    window.clearTimeout(timers.get(el));
    timers.delete(el);
    pending.delete(el);
    started.delete(el);
  };
  function onEnd(event: Event): void {
    const t = event as TransitionEvent;
    if (t.propertyName !== '--mo-sweep' || t.target !== t.currentTarget) return;
    if (t.target instanceof HTMLElement) finish(t.target);
  }

  const printIn = (el: HTMLElement): void => {
    if (started.has(el) || !pending.has(el)) return;
    started.add(el);
    el.addEventListener('transitionend', onEnd);
    el.classList.add('mo-ht-in');
    // Safety: never leave an element masked if the transition does not report its end.
    timers.set(
      el,
      window.setTimeout(() => finish(el), session.profile.halftoneMs),
    );
  };
  const io = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) return;
        observer.unobserve(entry.target);
        printIn(entry.target);
      });
    },
    { rootMargin: session.profile.halftoneMargin },
  );

  // Safety net for an observer that never reports: when scrolling stops, print anything on screen.
  let idleCheck = 0;
  session.onScroll.push(() => {
    window.clearTimeout(idleCheck);
    idleCheck = window.setTimeout(() => {
      const viewport = window.innerHeight;
      Array.from(pending)
        .filter((el) => !started.has(el))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.bottom > 0 && r.top < viewport;
        })
        .forEach((el) => {
          io.unobserve(el);
          printIn(el);
        });
    }, 500);
  });
  session.cleanups.push(() => window.clearTimeout(idleCheck));

  candidates.forEach((el) => {
    const fine = el.matches('.colorbar, [data-halftone="fine"]');
    el.classList.add('mo-ht');
    if (fine) el.classList.add('mo-ht-fine');
    io.observe(el);
  });

  const revealAll = (): void => {
    io.disconnect();
    Array.from(pending).forEach(finish);
  };
  // A printed page must show every picture.
  listen(session, window, 'beforeprint', revealAll);
  session.cleanups.push(revealAll);
};

// --- Pointer effects (tilt, magnetic) ---------------------------------------------------------

interface Hover {
  el: HTMLElement;
  box: Box;
  hovered: boolean;
  /** The page scrolled while hovered: re-measure in the next read phase. */
  stale: boolean;
}

interface HoverSpec<S extends Hover> {
  /** Class present while the effect is moving. */
  live: string;
  vars: readonly string[];
  create: (el: HTMLElement) => S;
  measure: (state: S) => Box;
  enter: (state: S, fresh: boolean) => void;
  /** Advance one frame; return true when the element is back at rest. */
  step: (state: S, dt: number) => boolean;
  apply: (state: S) => void;
}

/** Shared enter/leave tracking and frame loop for the pointer effects (one hovered at a time). */
const hoverEffect = <S extends Hover>(
  session: Session,
  elements: HTMLElement[],
  spec: HoverSpec<S>,
): void => {
  const states = new Map<HTMLElement, S>();
  const moving = new Set<S>();
  let active: S | null = null;

  elements.forEach((el) => {
    listen(session, el, 'pointerenter', (event) => {
      const pe = event as PointerEvent;
      if (pe.pointerType === 'touch') return;
      session.pointer.x = pe.clientX;
      session.pointer.y = pe.clientY;
      const known = states.get(el);
      const state = known ?? spec.create(el);
      states.set(el, state);
      const fresh = !known || !moving.has(state);
      state.box = spec.measure(state);
      state.hovered = true;
      state.stale = false;
      active = state;
      moving.add(state);
      el.classList.add(spec.live);
      spec.enter(state, fresh);
      session.ticker.wake();
    });
    listen(session, el, 'pointerleave', () => {
      const state = states.get(el);
      if (!state) return;
      state.hovered = false;
      if (active === state) active = null;
      session.ticker.wake();
    });
  });

  session.onPointer.push(() => {
    if (active) session.ticker.wake();
  });
  // Re-measure rather than offset by the scroll delta: the element may sit in the sticky header.
  session.onScroll.push(() => {
    if (!active) return;
    active.stale = true;
    session.ticker.wake();
  });
  session.ticker.add({
    read: () => {
      if (!active?.stale) return;
      active.stale = false;
      active.box = spec.measure(active);
    },
    write: (dt) => {
      moving.forEach((state) => {
        const atRest = spec.step(state, dt);
        if (atRest && !state.hovered) {
          moving.delete(state);
          state.el.classList.remove(spec.live);
          clearVars(state.el, spec.vars);
        } else {
          spec.apply(state);
        }
      });
      return moving.size > 0;
    },
  });
  session.cleanups.push(() => {
    elements.forEach((el) => {
      el.classList.remove(spec.live);
      clearVars(el, spec.vars);
    });
  });
};

const pointerIn = (session: Session, box: Box): [number, number] =>
  pointerNorm(session.pointer.x, session.pointer.y, box.left, box.top, box.width, box.height);

const EMPTY_BOX: Box = { left: 0, top: 0, width: 0, height: 0 };

interface TiltState extends Hover {
  limit: number;
  /** Free px between the element and the nearer viewport edge. */
  room: number;
  tx: number;
  ty: number;
  x: number;
  y: number;
  lift: number;
}

const setupTilt = (session: Session): void => {
  const elements = pick<HTMLElement>(TILT, false);
  if (!elements.length) return;

  // Init reads first: the sheen needs a free ::after and a positioned box.
  const plans = elements.map((el) => ({
    el,
    sheen: getComputedStyle(el, '::after').content === 'none',
    staticPos: getComputedStyle(el).position === 'static',
  }));
  plans.forEach(({ el, sheen, staticPos }) => {
    if (sheen) el.classList.add('mo-sheen');
    if (sheen && staticPos) el.classList.add('mo-sheen-rel');
  });
  session.cleanups.push(() => {
    elements.forEach((el) => el.classList.remove('mo-sheen', 'mo-sheen-rel'));
  });

  hoverEffect<TiltState>(session, elements, {
    live: 'mo-tilt-live',
    vars: TILT_VARS,
    create: (el) => ({
      el,
      box: EMPTY_BOX,
      hovered: false,
      stale: false,
      limit: 0,
      room: 0,
      tx: 0,
      ty: 0,
      x: 0,
      y: 0,
      lift: 0,
    }),
    measure: (s) => {
      const box = measure(s.el);
      const viewport = document.documentElement.clientWidth;
      s.room = Math.min(box.left, viewport - (box.left + box.width));
      return box;
    },
    enter: (s) => {
      s.limit = tiltLimit(s.box.width);
    },
    step: (s, dt) => {
      const [tx, ty]: [number, number] = s.hovered ? pointerIn(session, s.box) : [0, 0];
      s.tx = tx;
      s.ty = ty;
      s.x = damp(s.x, s.tx, 9, dt);
      s.y = damp(s.y, s.ty, 9, dt);
      s.lift = damp(s.lift, s.hovered ? 1 : 0, 10, dt);
      return s.lift < 0.01 && Math.abs(s.x) < 0.005 && Math.abs(s.y) < 0.005;
    },
    apply: (s) => {
      const style = s.el.style;
      // The side under the pointer dips away; the plates fall the opposite way.
      style.setProperty('--mo-rx', `${(-s.y * s.limit).toFixed(2)}deg`);
      style.setProperty('--mo-ry', `${(s.x * s.limit).toFixed(2)}deg`);
      style.setProperty('--mo-sx', `${((s.x + 1) * 50).toFixed(1)}%`);
      style.setProperty('--mo-sy', `${((s.y + 1) * 50).toFixed(1)}%`);
      style.setProperty('--mo-lift', s.lift.toFixed(3));
      style.setProperty('--mo-px', (-s.x * 2 * s.lift).toFixed(2));
      style.setProperty('--mo-py', (-s.y * 2 * s.lift).toFixed(2));
      // The edge tilted towards the viewer grows; keep it inside the viewport.
      const rad = (s.limit * Math.PI) / 180;
      const z =
        (s.box.width * Math.sin(Math.abs(s.x) * rad) +
          s.box.height * Math.sin(Math.abs(s.y) * rad)) /
        2;
      style.setProperty('--mo-fit', fitScale(s.box.width, s.room, z).toFixed(4));
    },
  });
};

interface MagnetState extends Hover {
  x: number;
  y: number;
  tx: number;
  ty: number;
  bx: number;
  by: number;
  btx: number;
  bty: number;
}

const MAGNET_MAX = 6;
const MAGNET_STRENGTH = 0.22;

const setupMagnetic = (session: Session): void => {
  const elements = pick<HTMLElement>(MAGNETIC, false);
  if (!elements.length) return;
  elements.forEach((el) => el.classList.add('mo-mag'));
  session.cleanups.push(() => elements.forEach((el) => el.classList.remove('mo-mag')));

  /** Target pull and shadow direction for the pointer's current position. */
  const aim = (s: MagnetState): void => {
    const { box } = s;
    [s.tx, s.ty] = magneticPull(
      session.pointer.x - (box.left + box.width / 2),
      session.pointer.y - (box.top + box.height / 2),
      MAGNET_STRENGTH,
      MAGNET_MAX,
    );
    const [nx, ny] = pointerIn(session, box);
    const dir = plateDirection(nx, ny);
    if (dir) [s.btx, s.bty] = dir;
  };

  hoverEffect<MagnetState>(session, elements, {
    live: 'mo-mag-live',
    vars: MAGNET_VARS,
    create: (el) => ({
      el,
      box: EMPTY_BOX,
      hovered: false,
      stale: false,
      x: 0,
      y: 0,
      tx: 0,
      ty: 0,
      bx: 1,
      by: 1,
      btx: 1,
      bty: 1,
    }),
    // The resting box: without the pull the button carries at the moment.
    measure: (s) => {
      const box = measure(s.el);
      return { ...box, left: box.left - s.x, top: box.top - s.y };
    },
    enter: (s, fresh) => {
      aim(s);
      if (fresh) {
        // Start the shadow on the entry side instead of sweeping from the last direction.
        s.bx = s.btx;
        s.by = s.bty;
      }
    },
    step: (s, dt) => {
      if (s.hovered) {
        aim(s);
      } else {
        s.tx = 0;
        s.ty = 0;
      }
      s.x = damp(s.x, s.tx, 14, dt);
      s.y = damp(s.y, s.ty, 14, dt);
      s.bx = damp(s.bx, s.btx, 10, dt);
      s.by = damp(s.by, s.bty, 10, dt);
      return Math.abs(s.x) < 0.05 && Math.abs(s.y) < 0.05;
    },
    apply: (s) => {
      const style = s.el.style;
      style.setProperty('--mo-mx', `${s.x.toFixed(2)}px`);
      style.setProperty('--mo-my', `${s.y.toFixed(2)}px`);
      style.setProperty('--mo-bx', s.bx.toFixed(3));
      style.setProperty('--mo-by', s.by.toFixed(3));
    },
  });
};

// --- Parallax ---------------------------------------------------------------------------------

interface ParallaxItem {
  el: HTMLElement;
  speed: number;
  /** Inside the band around the viewport where offsets are updated. */
  near: boolean;
  /** Entered the band since the last read: start at the target when not on screen. */
  entered: boolean;
  target: number;
  current: number;
  /** The offset the element carries now (px, as written). */
  written: number;
}

const setupParallax = (session: Session): void => {
  if (!('IntersectionObserver' in window)) return;
  const items: ParallaxItem[] = pick<HTMLElement>(PARALLAX, false)
    .map((el) => ({ el, speed: parallaxSpeed(el.getAttribute('data-parallax')) }))
    .filter((item): item is { el: HTMLElement; speed: number } => item.speed !== null)
    .map(({ el, speed }) => ({
      el,
      speed,
      near: false,
      entered: false,
      target: 0,
      current: 0,
      written: 0,
    }));
  if (!items.length) return;

  const byElement = new Map(items.map((item) => [item.el, item]));
  let dirty = true;
  const invalidate = (): void => {
    dirty = true;
    session.ticker.wake();
  };

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const item = byElement.get(entry.target as HTMLElement);
        if (!item) return;
        if (entry.isIntersecting && !item.near) item.entered = true;
        item.near = entry.isIntersecting;
      });
      invalidate();
    },
    { rootMargin: PARALLAX_NEAR },
  );
  items.forEach((item) => {
    item.el.classList.add('mo-px');
    io.observe(item.el);
  });
  session.onScroll.push(invalidate);
  session.onResize.push(invalidate);

  session.ticker.add({
    read: () => {
      if (!dirty) return;
      dirty = false;
      const viewport = window.innerHeight;
      const scale = session.profile.parallaxScale;
      const max = viewport * PARALLAX_MAX * scale;
      items.forEach((item) => {
        if (!item.near) return;
        // The box carries the offset written last frame: take it out to get the layout centre.
        const box = item.el.getBoundingClientRect();
        const centre = box.top + box.height / 2 - item.written;
        item.target = parallaxOffset(
          centre,
          viewport / 2,
          effectiveParallax(item.speed) * scale,
          max,
        );
        if (item.entered) {
          item.entered = false;
          // Off screen: jump straight to the offset. On screen (at load): settle into it.
          if (box.bottom < 0 || box.top > viewport) item.current = item.target;
        }
      });
    },
    write: (dt) => {
      let moving = false;
      items.forEach((item) => {
        if (!item.near) return;
        item.current = damp(item.current, item.target, PARALLAX_LAMBDA, dt);
        if (Math.abs(item.current - item.target) < 0.1) item.current = item.target;
        else moving = true;
        const value = Math.round(item.current * 100) / 100;
        if (value === item.written) return;
        item.written = value;
        item.el.style.setProperty('--px-y', `${value}px`);
      });
      return moving;
    },
  });

  session.cleanups.push(() => {
    io.disconnect();
    items.forEach((item) => {
      item.el.classList.remove('mo-px');
      item.el.style.removeProperty('--px-y');
    });
  });
};

// --- Press feedback: ink ripple and toggle snap -----------------------------------------------

const setupRipple = (session: Session): void => {
  const live = new Set<HTMLElement>();
  const timers = new Set<number>();

  listen(session, document, 'pointerdown', (event) => {
    const pe = event as PointerEvent;
    if (!pe.isPrimary || pe.button !== 0 || !(pe.target instanceof Element)) return;
    const host = pe.target.closest<HTMLElement>(RIPPLE);
    if (!host || host.closest(OFF) || host.matches(':disabled, [aria-disabled="true"]')) return;

    // Relative to the padding box (the layer sits inside the border).
    const box = host.getBoundingClientRect();
    const width = host.clientWidth;
    const height = host.clientHeight;
    const x = pe.clientX - box.left - host.clientLeft;
    const y = pe.clientY - box.top - host.clientTop;
    if (width <= 0 || height <= 0) return;

    const layer = document.createElement('span');
    layer.className = 'mo-ripple';
    layer.setAttribute('aria-hidden', 'true');
    layer.style.setProperty('--mo-rx', `${x.toFixed(1)}px`);
    layer.style.setProperty('--mo-ry', `${y.toFixed(1)}px`);
    layer.style.setProperty('--mo-rd', `${rippleDiameter(x, y, width, height).toFixed(1)}px`);
    ['c', 'm', 'y'].forEach((plate) => {
      const ring = document.createElement('span');
      ring.className = `mo-ripple-${plate}`;
      layer.append(ring);
    });

    const done = (): void => {
      window.clearTimeout(timer);
      timers.delete(timer);
      live.delete(layer);
      layer.remove();
    };
    // The yellow ring ends last; the timeout covers a missing animationend.
    layer.lastElementChild?.addEventListener('animationend', done, { once: true });
    const timer = window.setTimeout(done, RIPPLE_MS);
    timers.add(timer);
    live.add(layer);
    host.append(layer);
  });

  session.cleanups.push(() => {
    timers.forEach((timer) => window.clearTimeout(timer));
    timers.clear();
    live.forEach((layer) => layer.remove());
    live.clear();
  });
};

const setupToggles = (session: Session): void => {
  const timers = new Map<HTMLElement, number>();
  const finish = (el: HTMLElement): void => {
    window.clearTimeout(timers.get(el));
    timers.delete(el);
    el.classList.remove('mo-toggle');
  };

  listen(session, document, 'click', (event) => {
    if (!(event.target instanceof Element)) return;
    const el = event.target.closest<HTMLElement>(TOGGLE);
    if (!el || el.closest(OFF)) return;
    // Restart the snap if it is still playing (reading layout commits the removal). The class
    // goes after a timeout rather than on animationend, which children's animations also fire.
    finish(el);
    void el.offsetWidth;
    el.classList.add('mo-toggle');
    timers.set(
      el,
      window.setTimeout(() => finish(el), TOGGLE_MS),
    );
  });

  session.cleanups.push(() => Array.from(timers.keys()).forEach(finish));
};

// --- Header: velocity misregistration and scroll progress -------------------------------------

const setupHeader = (session: Session): void => {
  const plates = Array.from(document.querySelectorAll<SVGGElement>('.site-header .logo-plate'));
  const logos = Array.from(
    new Set(plates.map((p) => p.ownerSVGElement).filter((svg) => svg !== null)),
  ).map((svg) => ({ svg, scale: 0 }));
  if (!logos.length) return;

  let dirty = true;
  let lastY = session.scroll.y;
  let velocity = 0;
  let spring: Spring = { x: 0, v: 0 };

  session.onResize.push(() => {
    dirty = true;
    session.ticker.wake();
  });
  session.onScroll.push(session.ticker.wake);

  session.ticker.add({
    read: () => {
      if (!dirty) return;
      dirty = false;
      // CSS px in the plate translate are SVG user units: convert screen px to user units.
      logos.forEach((logo) => {
        const width = logo.svg.getBoundingClientRect().width;
        const viewBox = logo.svg.viewBox.baseVal;
        logo.scale = width > 0 && viewBox ? viewBox.width / width : 0;
      });
    },
    write: (dt) => {
      const y = session.scroll.y;
      const moved = y - lastY;
      lastY = y;
      velocity = damp(velocity, dt > 0 ? moved / dt : 0, 14, dt);
      spring = springStep(spring, velocityOffset(velocity, 1.4, 5), dt, 240, 18);
      const settled =
        moved === 0 &&
        Math.abs(velocity) < 0.002 &&
        Math.abs(spring.x) < 0.02 &&
        Math.abs(spring.v) < 0.05;
      if (settled) {
        spring = { x: 0, v: 0 };
        velocity = 0;
      }
      logos.forEach(({ svg, scale }) => {
        svg.style.setProperty('--mo-logo', (spring.x * scale).toFixed(2));
      });
      return !settled;
    },
  });
  session.ticker.wake();

  session.cleanups.push(() => {
    logos.forEach(({ svg }) => svg.style.removeProperty('--mo-logo'));
  });
};

/**
 * `--scroll-progress` (0–1) on `[data-scroll-progress]`. It maps the scroll position directly,
 * like a scrollbar (no transition, nothing animated), so it also runs under reduced motion and
 * lives outside the motion session.
 */
const trackProgress = (): void => {
  const bar = document.querySelector<HTMLElement>('[data-scroll-progress]');
  if (!bar) return;
  let maxScroll = 0;
  let dirty = true;
  let raf = 0;
  let shown = -1;
  const update = (): void => {
    raf = 0;
    if (dirty) {
      dirty = false;
      maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    }
    const p = scrollProgress(window.scrollY, maxScroll);
    if (Math.abs(p - shown) < 0.0005) return;
    shown = p;
    bar.style.setProperty('--scroll-progress', p.toFixed(4));
  };
  const queue = (): void => {
    if (!raf) raf = requestAnimationFrame(update);
  };
  const remeasure = (): void => {
    dirty = true;
    queue();
  };
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', remeasure, { passive: true });
  if (typeof ResizeObserver === 'function') new ResizeObserver(remeasure).observe(document.body);
  queue();
};

// --- Session ----------------------------------------------------------------------------------

const start = (finePointer: boolean): Cleanup => {
  const root = document.documentElement;
  const ticker = createTicker();
  const compact = matchMedia(COMPACT_QUERY).matches;
  const profile = motionProfile(compact, finePointer);
  const session: Session = {
    ticker,
    cleanups: [],
    scroll: { y: window.scrollY },
    pointer: { x: -1, y: -1 },
    onScroll: [],
    onPointer: [],
    onResize: [],
    profile,
    stopped: false,
  };

  root.classList.add('mo-on');
  if (finePointer) root.classList.add('mo-fine');
  if (compact) root.classList.add('mo-compact');
  if (profile.quickPrint) root.classList.add('mo-quick');

  /**
   * Each effect is set up on its own: if one throws, what it had applied is undone and its hooks
   * are dropped (those elements show their composed state), and the other effects still run.
   */
  const guarded = (setup: () => void): void => {
    const marks = {
      cleanups: session.cleanups.length,
      onScroll: session.onScroll.length,
      onPointer: session.onPointer.length,
      onResize: session.onResize.length,
      tasks: ticker.size(),
    };
    try {
      setup();
    } catch {
      session.onScroll.length = marks.onScroll;
      session.onPointer.length = marks.onPointer;
      session.onResize.length = marks.onResize;
      ticker.truncate(marks.tasks);
      session.cleanups
        .splice(marks.cleanups)
        .reverse()
        .forEach((fn) => isolated(fn, undefined));
    }
  };

  const vh = window.innerHeight;
  guarded(() => setupScrubs(session, vh));
  guarded(() => setupHalftone(session, vh));
  if (finePointer) {
    guarded(() => setupTilt(session));
    guarded(() => setupMagnetic(session));
  }
  guarded(() => setupHeader(session));
  guarded(() => setupParallax(session));
  guarded(() => setupRipple(session));
  guarded(() => setupToggles(session));

  listen(session, window, 'scroll', () => {
    session.scroll.y = window.scrollY;
    session.onScroll.forEach((fn) => isolated(fn, undefined));
  });
  if (finePointer) {
    listen(session, document, 'pointermove', (event) => {
      const pe = event as PointerEvent;
      if (pe.pointerType === 'touch') return;
      session.pointer.x = pe.clientX;
      session.pointer.y = pe.clientY;
      session.onPointer.forEach((fn) => isolated(fn, undefined));
    });
  }
  const resized = (): void => session.onResize.forEach((fn) => isolated(fn, undefined));
  listen(session, window, 'resize', resized);
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(resized);
    ro.observe(document.body);
    session.cleanups.push(() => ro.disconnect());
  }

  return () => {
    session.stopped = true;
    ticker.stop();
    session.cleanups.reverse().forEach((fn) => isolated(fn, undefined));
    root.classList.remove('mo-on', 'mo-fine', 'mo-compact', 'mo-quick');
  };
};

const boot = (): void => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  let stop: Cleanup | null = null;
  const restart = (): void => {
    stop?.();
    stop = reduce.matches ? null : start(fine.matches);
  };
  reduce.addEventListener('change', restart);
  fine.addEventListener('change', restart);
  trackProgress();
  restart();
};

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
}
