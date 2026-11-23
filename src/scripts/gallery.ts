/**
 * /erga/ gallery behaviour: category filter (chips with aria-pressed, live count, `?kategoria=`)
 * and the lightbox (native modal <dialog>, previous/next within the filtered set, arrow keys,
 * focus back to the opening tile). Markup: src/components/portfolio/WorkGallery.astro.
 *
 * Feedback hooks for the CSS: `.is-tick` on the live count when a chip changes the filter,
 * `data-entering` (with `--enter-i`) on tiles a filter brings back into view, and `.is-swap` on
 * the lightbox stage when previous/next shows another picture. None of them is set under reduced
 * motion, and none hides anything: they only replay short CSS animations.
 *
 * Phones: the filter chips scroll sideways; the pressed chip is brought to the middle of the row
 * and the row fades on the sides that hide chips (helpers shared with the /ypiresies/ chip row).
 * In the lightbox a finger drags the picture: sideways turns to the previous or next picture
 * (distance or flick, see `swipeIntent`), down closes it (the chrome and the dark ground fade
 * with the drag), anything less springs back. Two fingers belong to the browser's pinch-zoom,
 * and while the page is zoomed one finger pans it as usual. Under reduced motion a swipe swaps
 * the picture with no slide. The neighbours' large images are fetched once the shown one has
 * loaded, so a swipe finds them ready.
 */
import {
  ALL,
  fillTemplate,
  formatCount,
  matchesFilter,
  parseFilter,
  searchWithFilter,
  tileLayout,
  tileSizes,
  wrapIndex,
} from '~/lib/portfolio';
import { workText } from '~/i18n/pages/work';
import { centreInRow, trackScrollEdges } from '~/scripts/services-page';

const text = workText.el;

/** Longest tile print-in: 460ms animation plus the largest stagger (8 × 45ms), with a margin. */
const ENTER_CLEAR_MS = 1100;
/** Tiles after this many share the last stagger step, so a long list does not drag. */
const ENTER_MAX_STEP = 8;

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Restarts a one-shot CSS animation keyed on `className`. */
const replay = (el: HTMLElement, className: string): void => {
  if (prefersReducedMotion()) return;
  el.classList.remove(className);
  // Reading layout commits the removal, so adding the class again starts the animation afresh.
  void el.offsetWidth;
  el.classList.add(className);
};

// -------------------------------------------------------------------------------------------
// Swipe decisions (pure, unit-tested in tests/gallery-gestures.test.ts)
// -------------------------------------------------------------------------------------------

/** A pointer position (px) at a moment (ms). */
export interface Sample {
  x: number;
  y: number;
  t: number;
}

export type SwipeAxis = 'x' | 'y';
export type SwipeIntent = 'next' | 'prev' | 'close' | 'none';

export interface SwipeInput {
  /** Travel since the finger went down (px); negative is left / up. */
  dx: number;
  dy: number;
  /** Release velocity (px/ms); negative is left / up. */
  vx: number;
  vy: number;
  /** Size of the stage the picture sits on (px). */
  width: number;
  height: number;
  /** Axis the drag locked to; without it the longer travel decides. */
  axis?: SwipeAxis;
}

export const SWIPE = {
  /** Travel (px) before a drag locks to an axis; less is a tap. */
  slop: 10,
  /** Release speed (px/ms) that counts as a flick. */
  flickSpeed: 0.35,
  /** Smallest travel (px) for a sideways flick, so a tap's jitter never turns the picture. */
  flickMin: 24,
  /** Smallest travel (px) for a downward flick. */
  closeFlickMin: 40,
  /** A slow sideways drag turns once it covers this share of the stage width, within px bounds. */
  turnShare: 0.22,
  turnMin: 56,
  turnMax: 160,
  /** A slow drag down closes once it covers this share of the stage height, within px bounds. */
  closeShare: 0.15,
  closeMin: 72,
  closeMax: 160,
  /** Newest stretch of the drag (ms) that sets the release velocity. */
  velocityWindow: 100,
} as const;

const clampTo = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Axis a drag locks to once it has travelled past the slop; null while it may still be a tap. */
export const lockAxis = (dx: number, dy: number, slop: number = SWIPE.slop): SwipeAxis | null => {
  if (Math.hypot(dx, dy) < slop) return null;
  return Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
};

/**
 * Release velocity (px/ms) over the samples within the velocity window before the last one. A
 * finger that rested before lifting has no velocity.
 */
export const releaseVelocity = (
  samples: readonly Sample[],
  windowMs: number = SWIPE.velocityWindow,
): { vx: number; vy: number } => {
  const last = samples[samples.length - 1];
  if (!last) return { vx: 0, vy: 0 };
  let first = last;
  for (let i = samples.length - 2; i >= 0; i -= 1) {
    const sample = samples[i];
    if (!sample || last.t - sample.t > windowMs) break;
    first = sample;
  }
  const dt = last.t - first.t;
  if (dt <= 0) return { vx: 0, vy: 0 };
  return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
};

/**
 * What a released drag on the lightbox picture does. Sideways: a drag left shows the next
 * picture and a drag right the previous one, when it covered enough of the stage or was flicked;
 * a flick back against the drag cancels it. Down: closes on distance or a flick; a flick back up
 * cancels; up never closes.
 */
export const swipeIntent = ({ dx, dy, vx, vy, width, height, axis }: SwipeInput): SwipeIntent => {
  const sideways = axis ? axis === 'x' : Math.abs(dx) > Math.abs(dy);
  if (sideways) {
    if (dx === 0) return 'none';
    const dir = Math.sign(dx);
    const speed = Math.abs(vx);
    if (speed >= SWIPE.flickSpeed && Math.sign(vx) === -dir) return 'none';
    const far = Math.abs(dx) >= clampTo(width * SWIPE.turnShare, SWIPE.turnMin, SWIPE.turnMax);
    const flick = speed >= SWIPE.flickSpeed && Math.abs(dx) >= SWIPE.flickMin;
    if (!far && !flick) return 'none';
    return dir < 0 ? 'next' : 'prev';
  }
  if (dy <= 0 || vy <= -SWIPE.flickSpeed) return 'none';
  const far = dy >= clampTo(height * SWIPE.closeShare, SWIPE.closeMin, SWIPE.closeMax);
  const flick = vy >= SWIPE.flickSpeed && dy >= SWIPE.closeFlickMin;
  return far || flick ? 'close' : 'none';
};

/**
 * Resisted offset for a drag the picture cannot follow freely (up, or sideways with a single
 * picture): it gives a little, ever less, and never reaches `dimension`.
 */
export const rubberBand = (offset: number, dimension: number, coefficient = 0.55): number => {
  if (offset === 0 || dimension <= 0) return 0;
  const distance = Math.abs(offset);
  return Math.sign(offset) * (1 - 1 / ((distance * coefficient) / dimension + 1)) * dimension;
};

/** How far a drag down has gone towards closing (0–1): half the stage height fades everything. */
export const closeProgress = (dy: number, height: number): number =>
  height > 0 ? clampTo(dy / (height * 0.5), 0, 1) : 0;

/** Easing of the swipe animations (the design's --ease-out, and its mirror for leaving). */
const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const EASE_IN = 'cubic-bezier(0.6, 0, 0.8, 0.2)';

/** True for the error a cancelled Web Animation's `finished` promise rejects with. */
const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

export const initGallery = (root: HTMLElement): void => {
  const filterBar = root.querySelector<HTMLElement>('[data-filter-bar]');
  const chipRow = filterBar?.querySelector<HTMLElement>('[data-chip-row]') ?? null;
  const chips = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-filter]'));
  const status = root.querySelector<HTMLElement>('[data-filter-status]');
  const items = Array.from(root.querySelectorAll<HTMLElement>('[data-work-item]'));

  const visibleItems = (): HTMLElement[] => items.filter((item) => !item.hidden);

  const enterTimers = new WeakMap<HTMLElement, number>();
  /** Prints a tile back in after a filter change (CSS keyed on data-entering). */
  const printIn = (item: HTMLElement, order: number): void => {
    if (prefersReducedMotion()) return;
    window.clearTimeout(enterTimers.get(item));
    item.style.setProperty('--enter-i', String(Math.min(order, ENTER_MAX_STEP)));
    item.dataset.entering = '';
    enterTimers.set(
      item,
      window.setTimeout(() => {
        delete item.dataset.entering;
        item.style.removeProperty('--enter-i');
        enterTimers.delete(item);
      }, ENTER_CLEAR_MS),
    );
  };

  // ---------------------------------------------------------------------------------------------
  // Filter
  // ---------------------------------------------------------------------------------------------

  const validSlugs = chips
    .map((chip) => chip.dataset.filter ?? '')
    .filter((slug) => slug !== '' && slug !== ALL);

  /** Phones: brings the pressed chip to the middle of the sideways chip row. */
  const revealPressed = (smooth: boolean): void => {
    const pressed = chips.find((chip) => chip.getAttribute('aria-pressed') === 'true');
    if (chipRow && pressed) centreInRow(chipRow, pressed, smooth && !prefersReducedMotion());
  };

  const applyFilter = (filter: string, updateUrl: boolean): void => {
    chips.forEach((chip) => {
      chip.setAttribute('aria-pressed', String(chip.dataset.filter === filter));
    });
    revealPressed(updateUrl);
    const wasHidden = new Set(items.filter((item) => item.hidden));
    items.forEach((item) => {
      item.hidden = !matchesFilter(item.dataset.service ?? '', filter);
    });

    // Re-deal the tile shapes over the visible set so the grid rhythm holds after filtering.
    const visible = visibleItems();
    const shapes = tileLayout(visible.length);
    visible.forEach((item, i) => {
      const shape = shapes[i] ?? 'square';
      if (item.dataset.shape === shape) return;
      item.dataset.shape = shape;
      item.querySelectorAll('source[sizes], img[sizes]').forEach((el) => {
        el.setAttribute('sizes', tileSizes[shape]);
      });
    });

    let entering = 0;
    visible.forEach((item) => {
      if (wasHidden.has(item)) printIn(item, entering++);
    });

    if (status) {
      status.textContent = formatCount(visible.length, {
        one: text.countOne,
        other: text.countOther,
      });
      if (updateUrl) replay(status, 'is-tick');
    }

    if (updateUrl) {
      const { pathname, search, hash } = window.location;
      const url = `${pathname}${searchWithFilter(search, filter)}${hash}`;
      history.replaceState(history.state, '', url);
    }
  };

  if (filterBar && chips.length > 0) {
    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        applyFilter(chip.dataset.filter ?? ALL, true);
      });
    });
    if (chipRow) trackScrollEdges(chipRow);
    const initial = parseFilter(window.location.search, validSlugs);
    if (initial !== ALL) {
      applyFilter(initial, false);
      // The chips change width when the web fonts arrive: centre the pressed one again then.
      if ('fonts' in document) void document.fonts.ready.then(() => revealPressed(false));
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Lightbox
  // ---------------------------------------------------------------------------------------------

  const dialog = root.querySelector<HTMLDialogElement>('[data-lightbox]');
  const stage = dialog?.querySelector<HTMLElement>('[data-lb-stage]');
  // The picture goes in the print, which sits on the stage and carries the stand-in chip.
  const print = stage?.querySelector<HTMLElement>('[data-lb-print]');
  const titleEl = dialog?.querySelector<HTMLElement>('[data-lb-title]');
  const categoryEl = dialog?.querySelector<HTMLElement>('[data-lb-category]');
  const counterEl = dialog?.querySelector<HTMLElement>('[data-lb-counter]');
  const standInEl = dialog?.querySelector<HTMLElement>('[data-lb-standin]');
  const statusEl = dialog?.querySelector<HTMLElement>('[data-lb-status]');
  const closeBtn = dialog?.querySelector<HTMLButtonElement>('[data-lb-close]');
  const prevBtn = dialog?.querySelector<HTMLButtonElement>('[data-lb-prev]');
  const nextBtn = dialog?.querySelector<HTMLButtonElement>('[data-lb-next]');

  if (
    !dialog ||
    !stage ||
    !print ||
    !titleEl ||
    !categoryEl ||
    !counterEl ||
    !standInEl ||
    !statusEl ||
    !closeBtn ||
    !prevBtn ||
    !nextBtn ||
    typeof dialog.showModal !== 'function'
  ) {
    // No lightbox support: the tiles stay plain links to the large images.
    return;
  }

  const image = document.createElement('img');
  image.decoding = 'async';
  image.sizes = '(min-width: 1024px) min(80vw, 1400px), 100vw';

  let current = 0;
  let opener: HTMLElement | null = null;

  const tileOf = (item: HTMLElement | undefined): HTMLAnchorElement | null =>
    item?.querySelector<HTMLAnchorElement>('[data-work-tile]') ?? null;

  // Neighbours' large images, fetched at low priority once the shown picture has loaded.
  const preloaded = new Set<string>();
  const preload = (tile: HTMLAnchorElement | null): void => {
    if (!tile) return;
    const src = tile.dataset.largeSrc ?? tile.href;
    if (preloaded.has(src)) return;
    preloaded.add(src);
    const next = new Image();
    next.decoding = 'async';
    next.setAttribute('fetchpriority', 'low');
    next.sizes = image.sizes;
    if (tile.dataset.largeSrcset) next.srcset = tile.dataset.largeSrcset;
    next.src = src;
  };
  const preloadNeighbours = (): void => {
    const visible = visibleItems();
    if (visible.length < 2) return;
    preload(tileOf(visible[wrapIndex(current + 1, visible.length)]));
    preload(tileOf(visible[wrapIndex(current - 1, visible.length)]));
  };
  image.addEventListener('load', preloadNeighbours);

  /** Shows item `index` of the visible set; `wipe` plays the print-in (buttons and keys). */
  const show = (index: number, announce: boolean, wipe: boolean = announce): void => {
    const visible = visibleItems();
    if (visible.length === 0) return;
    current = wrapIndex(index, visible.length);
    const tile = tileOf(visible[current]);
    if (!tile) return;
    const data = tile.dataset;

    const width = Number(data.largeWidth);
    const height = Number(data.largeHeight);
    if (width > 0 && height > 0) {
      image.width = width;
      image.height = height;
    } else {
      image.removeAttribute('width');
      image.removeAttribute('height');
    }
    image.alt = data.alt ?? '';
    image.srcset = data.largeSrcset ?? '';
    image.src = data.largeSrc ?? tile.href;
    if (!image.isConnected) print.append(image);
    if (image.complete && image.naturalWidth > 0) preloadNeighbours();

    const title = data.title ?? '';
    const position = { n: current + 1, total: visible.length };
    titleEl.textContent = title;
    categoryEl.textContent = data.category ?? '';
    categoryEl.hidden = !data.category;
    standInEl.hidden = data.standIn !== 'true';
    counterEl.textContent = fillTemplate(text.lightboxCounter, position);

    const single = visible.length < 2;
    prevBtn.hidden = single;
    nextBtn.hidden = single;

    statusEl.textContent = announce
      ? fillTemplate(text.lightboxPositionStatus, { title, ...position })
      : '';
    // Previous/next: the new picture prints in.
    if (wipe) replay(stage, 'is-swap');
  };

  // -------------------------------------------------------------------------------------------
  // Touch: drag the picture sideways to turn, down to close
  // -------------------------------------------------------------------------------------------

  interface Drag {
    id: number;
    x0: number;
    y0: number;
    dx: number;
    dy: number;
    axis: SwipeAxis | null;
    samples: Sample[];
    width: number;
    height: number;
  }
  let drag: Drag | null = null;
  /** Touch points down on the stage; a second one hands the gesture to pinch-zoom. */
  const touches = new Set<number>();
  /** A drag just ended: the click that may follow it must not close the lightbox. */
  let dragged = false;
  let frame = 0;
  /** Bumped by anything that interrupts a swipe animation, so its later steps stand down. */
  let swipeToken = 0;
  let animating = false;
  let animations: Animation[] = [];
  const canAnimate = typeof print.animate === 'function';

  const zoomed = (): boolean => (window.visualViewport?.scale ?? 1) > 1.01;
  const syncZoom = (): void => {
    if (zoomed()) dialog.dataset.zoomed = '';
    else delete dialog.dataset.zoomed;
  };

  const setFade = (value: number): void => {
    dialog.style.setProperty('--lb-fade', value.toFixed(3));
  };
  const clearDragState = (): void => {
    print.style.removeProperty('transform');
    stage.classList.remove('is-dragging');
    delete dialog.dataset.drag;
    dialog.style.removeProperty('--lb-fade');
  };
  /** Stops any swipe in progress or animating and puts the picture back at rest. */
  const resetSwipe = (): void => {
    swipeToken += 1;
    animating = false;
    drag = null;
    touches.clear();
    if (frame !== 0) cancelAnimationFrame(frame);
    frame = 0;
    animations.forEach((animation) => animation.cancel());
    animations = [];
    clearDragState();
  };
  const track = (animation: Animation): Animation => {
    animations.push(animation);
    return animation;
  };
  /** Runs `next` when `animation` finishes, unless the swipe was interrupted meanwhile. */
  const after = (animation: Animation, token: number, next: () => void): void => {
    void animation.finished.then(
      () => {
        if (token === swipeToken) next();
      },
      (error: unknown) => {
        // A cancelled animation (resetSwipe) is expected; anything else is a real failure.
        if (!isAbort(error)) throw error;
      },
    );
  };

  /** The picture follows the finger on the locked axis (resisted where it cannot go). */
  const paint = (d: Drag): void => {
    if (d.axis === 'x') {
      const x = visibleItems().length < 2 ? rubberBand(d.dx, d.width) : d.dx;
      print.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
    } else if (d.axis === 'y') {
      const y = d.dy > 0 ? d.dy : rubberBand(d.dy, d.height);
      const progress = closeProgress(d.dy, d.height);
      const scale = (1 - progress * 0.12).toFixed(4);
      print.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0) scale(${scale})`;
      setFade(progress);
    }
  };
  const paintFrame = (): void => {
    frame = 0;
    if (drag) paint(drag);
  };

  /** Not far enough: the picture springs back and the chrome returns. */
  const settle = (): void => {
    const from = print.style.transform;
    const fade = Number(dialog.style.getPropertyValue('--lb-fade')) || 0;
    if (!canAnimate || prefersReducedMotion() || !from) {
      clearDragState();
      return;
    }
    const token = swipeToken;
    print.style.removeProperty('transform');
    stage.classList.remove('is-dragging');
    const spring = track(
      print.animate([{ transform: from }, { transform: 'none' }], {
        duration: 280,
        easing: EASE_OUT,
      }),
    );
    if (fade > 0) {
      track(
        dialog.animate([{ '--lb-fade': fade }, { '--lb-fade': 0 }], {
          duration: 280,
          easing: EASE_OUT,
        }),
      );
      // The animation covers the way back; at its end the resting value must already be there.
      setFade(0);
    }
    after(spring, token, () => {
      animations = [];
      clearDragState();
    });
  };

  /** Far enough sideways: the picture leaves the way it was pushed and the next one comes in. */
  const turn = (step: 1 | -1): void => {
    const from = print.style.transform || 'none';
    if (!canAnimate || prefersReducedMotion()) {
      clearDragState();
      show(current + step, true, false);
      return;
    }
    const token = swipeToken;
    const width = stage.clientWidth;
    animating = true;
    print.style.removeProperty('transform');
    stage.classList.remove('is-dragging');
    delete dialog.dataset.drag;
    const out = track(
      print.animate(
        [
          { transform: from, opacity: 1 },
          { transform: `translate3d(${(-step * width * 0.5).toFixed(1)}px, 0, 0)`, opacity: 0 },
        ],
        { duration: 160, easing: EASE_IN, fill: 'forwards' },
      ),
    );
    after(out, token, () => {
      show(current + step, true, false);
      out.cancel();
      const enter = track(
        print.animate(
          [
            { transform: `translate3d(${(step * width * 0.3).toFixed(1)}px, 0, 0)`, opacity: 0 },
            { transform: 'none', opacity: 1 },
          ],
          { duration: 260, easing: EASE_OUT },
        ),
      );
      after(enter, token, () => {
        animations = [];
        animating = false;
      });
    });
  };

  /** Far enough down: the picture drops away with the ground, then the lightbox closes. */
  const dismiss = (): void => {
    const from = print.style.transform || 'none';
    if (!canAnimate || prefersReducedMotion()) {
      dialog.close();
      return;
    }
    const token = swipeToken;
    const drop = `translate3d(0, ${(stage.clientHeight * 0.35).toFixed(1)}px, 0)`;
    const fade = Number(dialog.style.getPropertyValue('--lb-fade')) || 0;
    animating = true;
    print.style.removeProperty('transform');
    const out = track(
      print.animate(
        [
          { transform: from, opacity: 1 },
          { transform: from === 'none' ? drop : `${from} ${drop}`, opacity: 0 },
        ],
        { duration: 200, easing: EASE_IN, fill: 'forwards' },
      ),
    );
    track(
      dialog.animate([{ '--lb-fade': fade }, { '--lb-fade': 1 }], {
        duration: 200,
        easing: EASE_IN,
        fill: 'forwards',
      }),
    );
    after(out, token, () => dialog.close());
  };

  // Any new touch starts clean: a click after an earlier drag is a real click again.
  dialog.addEventListener('pointerdown', () => {
    dragged = false;
  });

  stage.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse') return;
    touches.add(event.pointerId);
    if (touches.size > 1) {
      // Two fingers: a pinch. Let the browser zoom; the picture goes back to rest.
      if (drag) {
        drag = null;
        settle();
      }
      return;
    }
    if (!event.isPrimary || animating || zoomed()) return;
    // Caught while springing back: stop the spring, the finger takes the picture from rest.
    if (animations.length > 0) {
      swipeToken += 1;
      animations.forEach((animation) => animation.cancel());
      animations = [];
      clearDragState();
    }
    const box = stage.getBoundingClientRect();
    drag = {
      id: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
      dx: 0,
      dy: 0,
      axis: null,
      samples: [{ x: event.clientX, y: event.clientY, t: event.timeStamp }],
      width: box.width,
      height: box.height,
    };
  });

  stage.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    drag.dx = event.clientX - drag.x0;
    drag.dy = event.clientY - drag.y0;
    drag.samples.push({ x: event.clientX, y: event.clientY, t: event.timeStamp });
    if (drag.samples.length > 24) drag.samples.shift();
    if (!drag.axis) {
      drag.axis = lockAxis(drag.dx, drag.dy);
      if (!drag.axis) return;
      dragged = true;
      stage.classList.add('is-dragging');
      dialog.dataset.drag = drag.axis;
    }
    if (frame === 0) frame = requestAnimationFrame(paintFrame);
  });

  const release = (event: PointerEvent): void => {
    touches.delete(event.pointerId);
    if (!drag || event.pointerId !== drag.id) return;
    const ended = drag;
    drag = null;
    if (frame !== 0) cancelAnimationFrame(frame);
    frame = 0;
    if (!ended.axis) return;
    if (event.type === 'pointercancel') {
      settle();
      return;
    }
    ended.dx = event.clientX - ended.x0;
    ended.dy = event.clientY - ended.y0;
    ended.samples.push({ x: event.clientX, y: event.clientY, t: event.timeStamp });
    const { vx, vy } = releaseVelocity(ended.samples);
    const intent = swipeIntent({
      dx: ended.dx,
      dy: ended.dy,
      vx,
      vy,
      width: ended.width,
      height: ended.height,
      axis: ended.axis,
    });
    // Paint where the finger lifted, so the next step starts from there.
    paint(ended);
    if ((intent === 'next' || intent === 'prev') && visibleItems().length > 1) {
      turn(intent === 'next' ? 1 : -1);
    } else if (intent === 'close') {
      dismiss();
    } else {
      settle();
    }
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  const open = (tile: HTMLAnchorElement): void => {
    const index = visibleItems().findIndex((item) => item.contains(tile));
    if (index < 0) return;
    opener = tile;
    resetSwipe();
    show(index, false);
    dialog.showModal();
    syncZoom();
    window.visualViewport?.addEventListener('resize', syncZoom);
    closeBtn.focus();
  };

  items.forEach((item) => {
    const tile = tileOf(item);
    if (!tile) return;
    tile.setAttribute('aria-haspopup', 'dialog');
    tile.addEventListener('click', (event) => {
      // Let new-tab and download gestures through to the plain link.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      open(tile);
    });
  });

  /** Buttons and arrow keys: any swipe in flight stops, the next picture prints in. */
  const goBy = (by: 1 | -1): void => {
    resetSwipe();
    show(current + by, true);
  };
  prevBtn.addEventListener('click', () => goBy(-1));
  nextBtn.addEventListener('click', () => goBy(1));
  closeBtn.addEventListener('click', () => dialog.close());

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goBy(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      goBy(1);
    }
  });

  // A click on the empty area around the picture closes, as on most photo viewers (not the
  // click that may follow a drag). The print is sized to the picture; it is listed in case a
  // browser leaves a sliver beside it.
  const emptyAreas = new Set<EventTarget>([dialog, stage, print]);
  if (stage.parentElement) emptyAreas.add(stage.parentElement);
  if (dialog.firstElementChild) emptyAreas.add(dialog.firstElementChild);
  dialog.addEventListener('click', (event) => {
    if (dragged) {
      dragged = false;
      return;
    }
    if (event.target && emptyAreas.has(event.target)) dialog.close();
  });

  dialog.addEventListener('close', () => {
    resetSwipe();
    window.visualViewport?.removeEventListener('resize', syncZoom);
    delete dialog.dataset.zoomed;
    statusEl.textContent = '';
    // The page did not move behind the lightbox: give focus back without scrolling it.
    opener?.focus({ preventScroll: true });
    opener = null;
  });
};
