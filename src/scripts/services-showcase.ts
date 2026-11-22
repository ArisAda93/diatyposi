/**
 * Home services showcase, "the plate and the index" (markup and styles:
 * src/components/home/ServicesShowcase.astro).
 *
 * One service is active at a time. On desktop (from 64rem) the sticky plate on the left shows the
 * active service: its photo, plate icon, number and lead sentence. The active row is the hovered
 * row (mouse or pen, after a short hover intent), the focused row (keyboard), or, while neither
 * applies, the row crossing the middle of the viewport as the visitor scrolls. Below 64rem there
 * is no plate; the row in the middle of the viewport only gets a subtle emphasis (CSS).
 *
 * A plate change is a registration move: the number flips, the card turns slightly in 3D, and the
 * new photo arrives as offset cyan, magenta and yellow separations that snap into register before
 * the colour photo prints over them. The photo of each service waits in a <template> until it is
 * first shown, so a change costs at most one image request (the separations reuse the loaded file).
 *
 * Web Animations only (transform and opacity), no animation library. Without JS the list is a
 * plain list of links and the plate shows the first service. Under reduced motion nothing moves:
 * hover and focus swap the plate instantly and scrolling does not change the active row.
 */

/** First sentence of a description, for compact places (plate caption, mobile rows). */
export const leadSentence = (text: string): string => {
  const trimmed = text.trim();
  const match = /^.+?[.!?;…](?=\s|$)/su.exec(trimmed);
  return match ? match[0] : trimmed;
};

/** Index of the value closest to `target` (the first one on a tie); -1 for an empty list. */
export const closestIndex = (values: readonly number[], target: number): number => {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  values.forEach((value, i) => {
    const distance = Math.abs(value - target);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  });
  return best;
};

/** Direction of travel through the list: 1 down, -1 up. */
export const stepDirection = (from: number, to: number): 1 | -1 => (to >= from ? 1 : -1);

const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const EASE_SNAP = 'cubic-bezier(0.3, 1.5, 0.5, 1)';
/** Hover intent, so sweeping the pointer across the list does not fetch every photo. */
const HOVER_DELAY = 70;
/** Settle time before the row in the middle of the viewport takes over while scrolling. */
const SCROLL_DELAY = 90;
/** Longest wait for a photo before the transition runs anyway. */
const LOAD_TIMEOUT = 1500;
/** Starting offsets (px) of the C, M and Y separations; y is mirrored when moving up. */
const GHOST_OFFSETS = [
  ['c', -18, -10],
  ['m', 16, -6],
  ['y', -6, 14],
] as const;

/** Plate-icon split on a change (px), as the .plate-hover keyframes in global.css. */
const ICON_SHIFTS = [
  ['p-c', -4, -2.4],
  ['p-m', 4, -1.6],
  ['p-y', -1.2, 4],
] as const;

interface PlateEntry {
  layer: HTMLElement;
  icon: Element | null;
}

const whenLoaded = (img: HTMLImageElement | null): Promise<void> =>
  new Promise((resolve) => {
    if (!img || (img.complete && img.naturalWidth > 0)) {
      resolve();
      return;
    }
    const done = (): void => {
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(done, LOAD_TIMEOUT);
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
  });

export const initServicesShowcase = (): void => {
  const root = document.querySelector<HTMLElement>('[data-svc-show]');
  const list = root?.querySelector<HTMLElement>('[data-svc-list]');
  if (!root || !list) return;
  const rows = Array.from(list.querySelectorAll<HTMLAnchorElement>('[data-svc-row]'));
  if (rows.length === 0) return;

  const card = root.querySelector<HTMLElement>('[data-svc-plate-card]');
  const media = root.querySelector<HTMLElement>('[data-svc-plate-media]');
  const numBox = root.querySelector<HTMLElement>('[data-svc-plate-num]');
  const iconSlot = root.querySelector<HTMLElement>('[data-svc-plate-icon]');
  const leads = Array.from(root.querySelectorAll<HTMLElement>('[data-svc-plate-lead]'));
  const stage =
    card && media && numBox && iconSlot && leads.length === rows.length
      ? { card, media, numBox, iconSlot, leads }
      : null;

  const templates = new Map<number, HTMLTemplateElement>();
  root.querySelectorAll<HTMLTemplateElement>('template[data-svc-tpl]').forEach((tpl) => {
    const i = Number(tpl.dataset.svcTpl);
    if (Number.isInteger(i)) templates.set(i, tpl);
  });

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 64rem)');

  /** Row marked active. */
  let active = 0;
  /** Service whose photo is fully on the plate. */
  let shown = 0;
  /** Bumped on every plate change; an async step that sees a newer value stops. */
  let seq = 0;
  let running: Animation[] = [];
  const entries = new Map<number, PlateEntry>();

  if (stage) {
    const firstLayer = stage.media.querySelector<HTMLElement>('[data-svc-layer]');
    if (firstLayer) entries.set(0, { layer: firstLayer, icon: stage.iconSlot.firstElementChild });
  }

  const track = (animation: Animation): Animation => {
    running.push(animation);
    return animation;
  };

  const getEntry = (i: number): PlateEntry | null => {
    const cached = entries.get(i);
    if (cached) return cached;
    const tpl = templates.get(i);
    if (!tpl) return null;
    const fragment = document.importNode(tpl.content, true);
    const layer = fragment.querySelector<HTMLElement>('[data-svc-layer]');
    if (!layer) return null;
    // It is inserted into the visible plate right away; load it now, not on intersection.
    layer.querySelectorAll('img').forEach((img) => {
      img.loading = 'eager';
    });
    const entry = { layer, icon: fragment.querySelector('.plate-icon') };
    entries.set(i, entry);
    return entry;
  };

  /** Stops a running change and leaves the plate showing `shown`, cleanly. */
  const settle = (): void => {
    if (!stage) return;
    running.forEach((animation) => animation.cancel());
    running = [];
    const base = entries.get(shown)?.layer;
    Array.from(stage.media.children).forEach((child) => {
      if (child !== base) child.remove();
    });
    if (base) base.style.removeProperty('opacity');
    while (stage.numBox.children.length > 1) stage.numBox.firstElementChild?.remove();
  };

  const setNumber = (next: number, dir: 1 | -1, instant: boolean): void => {
    if (!stage) return;
    const label = String(next + 1).padStart(2, '0');
    const current = stage.numBox.lastElementChild;
    if (!(current instanceof HTMLElement)) return;
    if (instant) {
      current.textContent = label;
      return;
    }
    const incoming = document.createElement('span');
    incoming.textContent = label;
    stage.numBox.append(incoming);
    const out = track(
      current.animate(
        [{ transform: 'translateY(0)' }, { transform: `translateY(${-dir * 110}%)` }],
        { duration: 380, easing: EASE_OUT, fill: 'forwards' },
      ),
    );
    out.onfinish = () => current.remove();
    track(
      incoming.animate(
        [{ transform: `translateY(${dir * 110}%)` }, { transform: 'translateY(0)' }],
        { duration: 560, easing: EASE_SNAP },
      ),
    );
  };

  const setCaption = (next: number, instant: boolean): void => {
    if (!stage) return;
    stage.leads.forEach((lead, i) => lead.classList.toggle('is-current', i === next));
    const lead = stage.leads[next];
    if (lead && !instant) {
      track(
        lead.animate(
          [
            { opacity: 0, transform: 'translateY(0.5rem)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          { duration: 420, delay: 120, easing: EASE_OUT, fill: 'backwards' },
        ),
      );
    }
  };

  /** The new icon's C, M and Y plates part and snap back into register. */
  const splitIcon = (icon: Element): void => {
    ICON_SHIFTS.forEach(([plate, x, y]) => {
      const svg = icon.querySelector(`.${plate}`);
      if (!svg) return;
      track(
        svg.animate(
          [
            { transform: 'translate(0, 0)' },
            { transform: `translate(${x}px, ${y}px)`, offset: 0.35 },
            { transform: 'translate(0, 0)' },
          ],
          { duration: 620, delay: 180, easing: EASE_SNAP },
        ),
      );
    });
  };

  const buildGhosts = (src: string, dir: 1 | -1): { wrap: HTMLElement; plates: HTMLElement[] } => {
    const wrap = document.createElement('div');
    wrap.className = 'svc-plate-ghosts';
    const plates = GHOST_OFFSETS.map(([ink, x, y]) => {
      const plate = document.createElement('span');
      plate.className = `svc-plate-ghost svc-plate-ghost-${ink}`;
      plate.dataset.x = String(x);
      plate.dataset.y = String(y * dir);
      const img = document.createElement('img');
      img.alt = '';
      img.src = src;
      plate.append(img);
      wrap.append(plate);
      return plate;
    });
    return { wrap, plates };
  };

  const changePlate = async (next: number, dir: 1 | -1, forceInstant = false): Promise<void> => {
    if (!stage) return;
    const token = ++seq;
    settle();
    const entry = getEntry(next);
    if (!entry) return;
    const instant = forceInstant || reduce.matches;

    setNumber(next, dir, instant);
    setCaption(next, instant);
    if (entry.icon) {
      stage.iconSlot.replaceChildren(entry.icon);
      if (!instant) splitIcon(entry.icon);
    }
    if (next === shown) return;

    if (instant) {
      entry.layer.style.removeProperty('opacity');
      stage.media.replaceChildren(entry.layer);
      shown = next;
      return;
    }

    track(
      stage.card.animate(
        [
          { transform: 'none' },
          {
            transform: `rotateX(${dir * 6}deg) rotateY(${dir * -5}deg) translateZ(-40px)`,
            offset: 0.4,
          },
          { transform: 'none' },
        ],
        { duration: 820, easing: EASE_OUT },
      ),
    );

    // The new photo waits, invisible, above the old one while it loads.
    entry.layer.style.opacity = '0';
    stage.media.append(entry.layer);
    const img = entry.layer.querySelector('img');
    await whenLoaded(img);
    if (token !== seq) return;

    // Separations only from a decoded photo: over an empty image the three inks would print
    // as a solid dark block (slow network, timeout or error), so then the photo simply fades in.
    const loaded = img !== null && img.complete && img.naturalWidth > 0;
    const src = loaded ? img.currentSrc || img.src : '';
    let printDelay = 0;
    if (src) {
      const { wrap, plates } = buildGhosts(src, dir);
      stage.media.insertBefore(wrap, entry.layer);
      track(wrap.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'linear' }));
      plates.forEach((plate, k) => {
        const x = Number(plate.dataset.x);
        const y = Number(plate.dataset.y);
        track(
          plate.animate(
            [
              { transform: `translate(${x}px, ${y}px) scale(1.04)` },
              { transform: 'translate(0, 0) scale(1)' },
            ],
            { duration: 620, delay: k * 50, easing: EASE_SNAP, fill: 'backwards' },
          ),
        );
      });
      printDelay = 460;
    }

    const print = track(
      entry.layer.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 280,
        delay: printDelay,
        easing: 'linear',
        fill: 'forwards',
      }),
    );
    try {
      await print.finished;
    } catch {
      // Cancelled by a newer change, which has already cleaned up.
      return;
    }
    if (token !== seq) return;

    entry.layer.style.removeProperty('opacity');
    print.cancel();
    Array.from(stage.media.children).forEach((child) => {
      if (child !== entry.layer) child.remove();
    });
    shown = next;
    running = [];
  };

  const activate = (i: number): void => {
    if (i < 0 || i >= rows.length || i === active) return;
    const dir = stepDirection(active, i);
    active = i;
    rows.forEach((row, k) => row.classList.toggle('is-active', k === i));
    if (desktop.matches) void changePlate(i, dir);
  };

  // Hover (mouse and pen) and keyboard focus.
  let hoverTimer = 0;
  let pointerInside = false;
  const isHoverPointer = (event: PointerEvent): boolean =>
    event.pointerType === 'mouse' || event.pointerType === 'pen';

  rows.forEach((row, i) => {
    row.addEventListener('pointerenter', (event) => {
      if (!isHoverPointer(event)) return;
      window.clearTimeout(hoverTimer);
      hoverTimer = window.setTimeout(() => activate(i), HOVER_DELAY);
    });
    row.addEventListener('pointerleave', () => window.clearTimeout(hoverTimer));
    row.addEventListener('focus', () => activate(i));
  });
  list.addEventListener('pointerenter', (event) => {
    if (isHoverPointer(event)) pointerInside = true;
  });
  list.addEventListener('pointerleave', () => {
    pointerInside = false;
  });

  // Scrolling: the row in a thin band across the middle of the viewport becomes active, unless
  // the pointer is over the list or a row has keyboard focus. Rects come from the observer
  // entries, so the callback forces no layout. A short settle delay means a fast fling only
  // changes the plate where it lands.
  if ('IntersectionObserver' in window) {
    const centres = new Map<number, number>();
    let scrollTimer = 0;
    const observer = new IntersectionObserver(
      (observed) => {
        for (const entry of observed) {
          const i = rows.indexOf(entry.target as HTMLAnchorElement);
          if (i < 0) continue;
          if (entry.isIntersecting) {
            centres.set(i, entry.boundingClientRect.top + entry.boundingClientRect.height / 2);
          } else {
            centres.delete(i);
          }
        }
        const scrollMayLead = (): boolean =>
          !reduce.matches && !pointerInside && !list.matches(':focus-within');
        if (!scrollMayLead()) return;
        const candidates = Array.from(centres.keys());
        const pick = candidates[closestIndex(Array.from(centres.values()), innerHeight / 2)];
        if (pick === undefined) return;
        window.clearTimeout(scrollTimer);
        scrollTimer = window.setTimeout(() => {
          if (scrollMayLead()) activate(pick);
        }, SCROLL_DELAY);
      },
      { rootMargin: '-46% 0px -46% 0px' },
    );
    rows.forEach((row) => observer.observe(row));
  }

  // Crossing into desktop: bring the plate up to date without animation.
  desktop.addEventListener('change', () => {
    if (desktop.matches && active !== shown) void changePlate(active, 1, true);
  });
  // Reduced motion switched on mid-change: finish in the composed state.
  reduce.addEventListener('change', () => {
    if (reduce.matches && active !== shown) void changePlate(active, 1, true);
  });

  // The first row starts active, matching the plate. On phones under reduced motion nothing
  // follows the scroll, so no row is singled out there.
  if (desktop.matches || !reduce.matches) rows[0]?.classList.add('is-active');
  root.classList.add('is-enhanced');
};
