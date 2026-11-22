/**
 * Pure helpers for the /erga/ gallery: categories, filtering, the filter URL parameter, the count
 * message, lightbox wrap-around and the tile rhythm. No DOM here, so it runs in the build, in the
 * browser and under vitest (tests/portfolio.test.ts). Only type imports, which are erased.
 */
import type { PortfolioItem, Service } from '../data/site';
import type { Locale } from '../i18n/ui';

/** Filter value that shows every item. */
export const ALL = 'all';

/** Query parameter that holds the active category on /erga/ (e.g. `?kategoria=social-media`). */
export const FILTER_PARAM = 'kategoria';

export interface Category {
  /** Service slug, used as the filter value. */
  slug: string;
  /** Short service title, shown on the chip and the tiles. */
  label: string;
}

type HasService = Pick<PortfolioItem, 'service'>;

/** Categories that have at least one item, in the order of `services`. */
export const categoriesFor = (
  items: readonly HasService[],
  services: readonly Service[],
  locale: Locale = 'el',
): Category[] =>
  services
    .filter((service) => items.some((item) => item.service === service.slug))
    .map((service) => ({ slug: service.slug, label: service.text[locale].short }));

/** Short label of the service an item belongs to, or undefined for an unknown slug. */
export const categoryLabel = (
  slug: string,
  services: readonly Service[],
  locale: Locale = 'el',
): string | undefined => services.find((service) => service.slug === slug)?.text[locale].short;

/** Whether an item of `service` shows under `filter`: every item for `ALL`, else an exact match. */
export const matchesFilter = (service: string, filter: string): boolean =>
  filter === ALL || service === filter;

/** Reads the filter from a query string. Missing, empty or unknown values fall back to `ALL`. */
export const parseFilter = (search: string, validSlugs: readonly string[]): string => {
  const value = new URLSearchParams(search).get(FILTER_PARAM);
  return value && validSlugs.includes(value) ? value : ALL;
};

/** Query string with the filter set (or removed for `ALL`), keeping any other parameters. */
export const searchWithFilter = (search: string, filter: string): string => {
  const params = new URLSearchParams(search);
  if (filter === ALL) params.delete(FILTER_PARAM);
  else params.set(FILTER_PARAM, filter);
  const query = params.toString();
  return query ? `?${query}` : '';
};

/** Fills `{n}` in the singular form for 1 and in the plural form otherwise (Greek has two). */
export const formatCount = (n: number, forms: { one: string; other: string }): string =>
  (n === 1 ? forms.one : forms.other).replace('{n}', String(n));

/** Replaces `{name}` placeholders in a template. */
export const fillTemplate = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );

/** Index wrapped into 0..length-1, so previous/next go round within the visible set. */
export const wrapIndex = (index: number, length: number): number =>
  length > 0 ? ((index % length) + length) % length : 0;

/**
 * Tile shapes. On the 12-column desktop grid: wide = 8 columns × 2 rows, tall = 4 × 4,
 * square = 4 × 2. On the 6-column tablet grid: wide = 6 × 2, tall and square = 3 × 2.
 * On phones every tile is full width with an aspect ratio per shape.
 */
export type TileShape = 'wide' | 'tall' | 'square';

/** Six tiles that fill six desktop rows exactly: wide+tall, square+square, square+wide. */
const CYCLE: readonly TileShape[] = ['wide', 'tall', 'square', 'square', 'square', 'wide'];

/** Endings for 0–5 leftover tiles, chosen so desktop rows close without holes. */
const ENDINGS: readonly (readonly TileShape[])[] = [
  [],
  ['wide'],
  ['wide', 'square'],
  ['square', 'square', 'square'],
  ['wide', 'square', 'square', 'wide'],
  ['wide', 'square', 'square', 'square', 'square'],
];

/** Seven tiles that close desktop rows (used instead of a full cycle plus one lone wide tile). */
const SEVEN: readonly TileShape[] = [
  'wide',
  'square',
  'square',
  'wide',
  'square',
  'square',
  'square',
];

/** Shapes for `count` visible tiles, in order. Re-run after filtering so the rhythm holds. */
export const tileLayout = (count: number): TileShape[] => {
  const n = Math.max(0, Math.floor(count));
  let cycles = Math.floor(n / CYCLE.length);
  let ending = ENDINGS[n % CYCLE.length] ?? [];
  if (n % CYCLE.length === 1 && cycles > 0) {
    cycles -= 1;
    ending = SEVEN;
  }
  return [...Array.from({ length: cycles }, () => CYCLE).flat(), ...ending];
};

/**
 * `sizes` per shape (rendered width of the image; tall tiles crop a landscape photo, so the image
 * is drawn wider than the tile).
 */
export const tileSizes: Record<TileShape, string> = {
  wide: '(min-width: 1024px) min(62vw, 940px), (min-width: 768px) 92vw, calc(100vw - 2rem)',
  tall: '(min-width: 1024px) min(48vw, 740px), (min-width: 768px) 46vw, calc(167vw - 3.5rem)',
  square: '(min-width: 1024px) min(30vw, 470px), (min-width: 768px) 46vw, calc(133vw - 2.75rem)',
};
