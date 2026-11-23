import { describe, expect, it } from 'vitest';
import { services } from '../src/data/site';
import { servicePageCopy, servicePageSlugs } from '../src/i18n/service-pages';

const slugs = services.map((s) => s.slug);

describe('service pages (content contract)', () => {
  it('has a page for every service, in the owner order', () => {
    expect(servicePageSlugs).toEqual(slugs);
  });

  describe.each(slugs)('%s', (slug) => {
    const copy = servicePageCopy(slug);

    it('has a non-empty h1', () => {
      expect(copy.h1.trim()).not.toBe('');
    });

    it('keeps the meta title to 50 characters at most', () => {
      expect(copy.metaTitle.trim()).not.toBe('');
      expect(copy.metaTitle.length).toBeLessThanOrEqual(50);
    });

    it('keeps the meta description between 130 and 160 characters', () => {
      expect(copy.metaDescription.length).toBeGreaterThanOrEqual(130);
      expect(copy.metaDescription.length).toBeLessThanOrEqual(160);
    });

    it('has two to four body sections', () => {
      expect(copy.sections.length).toBeGreaterThanOrEqual(2);
      expect(copy.sections.length).toBeLessThanOrEqual(4);
    });

    it('asks four to six questions, each ending with the Greek question mark', () => {
      expect(copy.faq.length).toBeGreaterThanOrEqual(4);
      expect(copy.faq.length).toBeLessThanOrEqual(6);
      for (const { q, a } of copy.faq) {
        // U+003B; the Greek question mark U+037E normalises to it.
        expect(q.trim()).toMatch(/[;\u037e]$/u);
        expect(a.trim()).not.toBe('');
      }
    });

    it('uses the {loc} locality token at most once, and only in the intro', () => {
      expect((copy.intro.match(/\{loc\}/g) ?? []).length).toBeLessThanOrEqual(1);
      expect(copy.intro).not.toMatch(/ \{loc\}/);
      expect(JSON.stringify({ ...copy, intro: '' })).not.toContain('{loc}');
    });

    it('relates to two or three other existing services, each once', () => {
      expect(copy.related.length).toBeGreaterThanOrEqual(2);
      expect(copy.related.length).toBeLessThanOrEqual(3);
      expect(new Set(copy.related).size).toBe(copy.related.length);
      for (const related of copy.related) {
        expect(slugs).toContain(related);
        expect(related).not.toBe(slug);
      }
    });
  });

  it('gives every page its own meta title and h1', () => {
    const copies = slugs.map((slug) => servicePageCopy(slug));
    expect(new Set(copies.map((c) => c.metaTitle)).size).toBe(slugs.length);
    expect(new Set(copies.map((c) => c.h1)).size).toBe(slugs.length);
  });

  it('throws for a slug without a page', () => {
    expect(() => servicePageCopy('nope')).toThrow(/nope/);
  });
});
