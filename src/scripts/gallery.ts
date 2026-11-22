/**
 * /erga/ gallery behaviour: category filter (chips with aria-pressed, live count, `?kategoria=`)
 * and the lightbox (native modal <dialog>, previous/next within the filtered set, arrow keys,
 * focus back to the opening tile). Markup: src/components/portfolio/WorkGallery.astro.
 *
 * Feedback hooks for the CSS: `.is-tick` on the live count when a chip changes the filter,
 * `data-entering` (with `--enter-i`) on tiles a filter brings back into view, and `.is-swap` on
 * the lightbox stage when previous/next shows another picture. None of them is set under reduced
 * motion, and none hides anything: they only replay short CSS animations.
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

export const initGallery = (root: HTMLElement): void => {
  const filterBar = root.querySelector<HTMLElement>('[data-filter-bar]');
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

  const applyFilter = (filter: string, updateUrl: boolean): void => {
    chips.forEach((chip) => {
      chip.setAttribute('aria-pressed', String(chip.dataset.filter === filter));
    });
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
    const initial = parseFilter(window.location.search, validSlugs);
    if (initial !== ALL) applyFilter(initial, false);
  }

  // ---------------------------------------------------------------------------------------------
  // Lightbox
  // ---------------------------------------------------------------------------------------------

  const dialog = root.querySelector<HTMLDialogElement>('[data-lightbox]');
  const stage = dialog?.querySelector<HTMLElement>('[data-lb-stage]');
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

  const show = (index: number, announce: boolean): void => {
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
    if (!image.isConnected) stage.append(image);

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
    if (announce) replay(stage, 'is-swap');
  };

  const open = (tile: HTMLAnchorElement): void => {
    const index = visibleItems().findIndex((item) => item.contains(tile));
    if (index < 0) return;
    opener = tile;
    show(index, false);
    dialog.showModal();
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

  prevBtn.addEventListener('click', () => show(current - 1, true));
  nextBtn.addEventListener('click', () => show(current + 1, true));
  closeBtn.addEventListener('click', () => dialog.close());

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      show(current - 1, true);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      show(current + 1, true);
    }
  });

  // A click on the empty area around the picture closes, as on most photo viewers.
  const emptyAreas = new Set<EventTarget>([dialog, stage]);
  if (stage.parentElement) emptyAreas.add(stage.parentElement);
  if (dialog.firstElementChild) emptyAreas.add(dialog.firstElementChild);
  dialog.addEventListener('click', (event) => {
    if (event.target && emptyAreas.has(event.target)) dialog.close();
  });

  dialog.addEventListener('close', () => {
    statusEl.textContent = '';
    opener?.focus();
    opener = null;
  });
};
