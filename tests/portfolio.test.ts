import { describe, it, expect } from 'vitest';
import { portfolio, services, type PortfolioItem } from '../src/data/site';
import {
  ALL,
  FILTER_PARAM,
  categoriesFor,
  categoryLabel,
  fillTemplate,
  formatCount,
  matchesFilter,
  parseFilter,
  searchWithFilter,
  tileLayout,
  wrapIndex,
  type TileShape,
} from '../src/lib/portfolio';

const item = (service: string, title = service): PortfolioItem => ({
  image: `${title}.jpg`,
  service,
  text: { el: { title, alt: title } },
});

const slugAt = (i: number): string => {
  const service = services[i];
  if (!service) throw new Error(`No service at index ${i}`);
  return service.slug;
};

describe('categoriesFor', () => {
  it('lists only categories that have items, in services order, with short labels', () => {
    const last = slugAt(services.length - 1);
    const first = slugAt(0);
    // Items deliberately listed in reverse service order, one category twice.
    const items = [item(last, 'a'), item(first, 'b'), item(last, 'c')];

    const result = categoriesFor(items, services);

    expect(result.map((c) => c.slug)).toEqual([first, last]);
    expect(result.map((c) => c.label)).toEqual([
      services[0]?.text.el.short,
      services[services.length - 1]?.text.el.short,
    ]);
  });

  it('ignores items whose service slug is unknown', () => {
    expect(categoriesFor([item('no-such-service')], services)).toEqual([]);
  });

  it('returns no categories for an empty portfolio', () => {
    expect(categoriesFor([], services)).toEqual([]);
  });

  it('matches the real data: exactly the services that have work, in services order', () => {
    const result = categoriesFor(portfolio, services);
    const serviceOrder = services.map((s) => s.slug);
    const withWork = serviceOrder.filter((slug) => portfolio.some((p) => p.service === slug));

    expect(result.map((c) => c.slug)).toEqual(withWork);
    const positions = result.map((c) => serviceOrder.indexOf(c.slug));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});

describe('categoryLabel', () => {
  it('returns the short title of a known service and undefined otherwise', () => {
    expect(categoryLabel(slugAt(0), services)).toBe(services[0]?.text.el.short);
    expect(categoryLabel('no-such-service', services)).toBeUndefined();
  });
});

describe('matchesFilter', () => {
  it('shows every item for ALL', () => {
    expect(matchesFilter('a', ALL)).toBe(true);
    expect(matchesFilter('', ALL)).toBe(true);
  });

  it('shows only items of the selected category', () => {
    expect(matchesFilter('a', 'a')).toBe(true);
    expect(matchesFilter('b', 'a')).toBe(false);
  });

  it('shows nothing for an unknown category or an item without one', () => {
    expect(matchesFilter('a', 'zzz')).toBe(false);
    expect(matchesFilter('', 'a')).toBe(false);
  });

  it('selects, from the real data, the items of one service', () => {
    const slug = portfolio[0]?.service ?? '';
    const shown = portfolio.filter((p) => matchesFilter(p.service, slug));
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((p) => p.service === slug)).toBe(true);
    expect(portfolio.filter((p) => matchesFilter(p.service, ALL))).toHaveLength(portfolio.length);
  });
});

describe('parseFilter', () => {
  const valid = ['a', 'b'];

  it('reads a known category from the query string', () => {
    expect(parseFilter(`?${FILTER_PARAM}=b`, valid)).toBe('b');
    expect(parseFilter(`?x=1&${FILTER_PARAM}=a`, valid)).toBe('a');
  });

  it('falls back to ALL when the parameter is missing, empty or unknown', () => {
    expect(parseFilter('', valid)).toBe(ALL);
    expect(parseFilter(`?${FILTER_PARAM}=`, valid)).toBe(ALL);
    expect(parseFilter(`?${FILTER_PARAM}=zzz`, valid)).toBe(ALL);
    expect(parseFilter(`?${FILTER_PARAM}=${ALL}`, valid)).toBe(ALL);
  });
});

describe('searchWithFilter', () => {
  it('sets the category and keeps other parameters', () => {
    expect(searchWithFilter('', 'a')).toBe(`?${FILTER_PARAM}=a`);
    expect(searchWithFilter(`?x=1&${FILTER_PARAM}=a`, 'b')).toBe(`?x=1&${FILTER_PARAM}=b`);
  });

  it('removes the parameter for ALL', () => {
    expect(searchWithFilter(`?${FILTER_PARAM}=a`, ALL)).toBe('');
    expect(searchWithFilter(`?x=1&${FILTER_PARAM}=a`, ALL)).toBe('?x=1');
  });

  it('round-trips through parseFilter', () => {
    expect(parseFilter(searchWithFilter('', 'b'), ['b'])).toBe('b');
  });
});

describe('formatCount', () => {
  const forms = { one: 'Εμφανίζεται {n} έργο', other: 'Εμφανίζονται {n} έργα' };

  it('uses the singular for one item', () => {
    expect(formatCount(1, forms)).toBe('Εμφανίζεται 1 έργο');
  });

  it('uses the plural otherwise', () => {
    expect(formatCount(3, forms)).toBe('Εμφανίζονται 3 έργα');
    expect(formatCount(0, forms)).toBe('Εμφανίζονται 0 έργα');
  });
});

describe('fillTemplate', () => {
  it('fills known placeholders and leaves unknown ones', () => {
    expect(fillTemplate('{n} / {total}', { n: 3, total: 12 })).toBe('3 / 12');
    expect(fillTemplate('{title}, {x}', { title: 'Α' })).toBe('Α, {x}');
  });
});

describe('wrapIndex', () => {
  it('wraps past either end of the visible set', () => {
    expect(wrapIndex(3, 3)).toBe(0);
    expect(wrapIndex(-1, 3)).toBe(2);
    expect(wrapIndex(1, 3)).toBe(1);
    expect(wrapIndex(7, 3)).toBe(1);
  });

  it('returns 0 for an empty set', () => {
    expect(wrapIndex(5, 0)).toBe(0);
  });
});

describe('tileLayout', () => {
  // Desktop grid: 12 columns; wide = 8×2, tall = 4×4, square = 4×2 (column × row units).
  const area: Record<TileShape, number> = { wide: 16, tall: 16, square: 8 };
  const FULL_ROW_PAIR = 12 * 2;

  it('returns one shape per tile', () => {
    for (let n = 0; n <= 20; n += 1) expect(tileLayout(n)).toHaveLength(n);
  });

  it('fills whole desktop rows for every count of two or more', () => {
    for (let n = 2; n <= 20; n += 1) {
      const total = tileLayout(n).reduce((sum, shape) => sum + area[shape], 0);
      expect(total % FULL_ROW_PAIR, `count ${n}`).toBe(0);
    }
  });

  it('repeats the six-tile cycle and varies the shapes', () => {
    const twelve = tileLayout(12);
    expect(twelve.slice(0, 6)).toEqual(twelve.slice(6));
    expect(new Set(twelve)).toEqual(new Set(['wide', 'tall', 'square']));
  });

  it('treats negative and fractional counts safely', () => {
    expect(tileLayout(-3)).toEqual([]);
    expect(tileLayout(2.7)).toHaveLength(2);
  });
});
