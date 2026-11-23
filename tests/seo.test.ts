import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServicePageCopy } from '../src/i18n/service-page-types';

const SITE = 'https://www.diatyposi.gr';

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('~/data/site');
});

/** Mocks src/data/site with the real data plus `overrides` merged into `site`. */
const mockSite = async (overrides: (actual: typeof import('../src/data/site')) => object) => {
  const actual = await vi.importActual<typeof import('../src/data/site')>('../src/data/site');
  vi.doMock('~/data/site', () => ({ ...actual, site: { ...actual.site, ...overrides(actual) } }));
  return actual;
};

/** A minimal service page copy; only the fields the structured data reads matter. */
const copy: ServicePageCopy = {
  metaTitle: 'Διαφημιστικά δώρα με λογότυπο',
  metaDescription: 'Κούπες, στυλό και τσάντες με το λογότυπό σας. Ζητήστε προσφορά.',
  h1: 'Διαφημιστικά δώρα με το λογότυπό σας',
  intro: 'Εισαγωγή.',
  sections: [],
  faq: [
    { q: 'Ποια είναι η ελάχιστη ποσότητα;', a: 'Εξαρτάται από το προϊόν.\n\nΡωτήστε μας.' },
    { q: 'Πόσο χρόνο χρειάζεται;', a: 'Συνήθως λίγες εργάσιμες.' },
  ],
  related: [],
};

describe('buildLocalBusiness', () => {
  it('describes the business with absolute URLs and all ten services', async () => {
    const { buildLocalBusiness } = await import('../src/lib/seo');
    const data = buildLocalBusiness('https://www.diatyposi.gr');
    expect(data['@type']).toBe('LocalBusiness');
    expect(data.name).toBe('ΔΙΑΤΥΠΩΣΗ');
    expect(data.url).toBe('https://www.diatyposi.gr/');
    expect(data.logo).toBe('https://www.diatyposi.gr/icon-512.png');
    const catalog = data.hasOfferCatalog as { itemListElement: { itemOffered: { url: string } }[] };
    expect(catalog.itemListElement).toHaveLength(10);
    expect(catalog.itemListElement[0]?.itemOffered.url).toBe(
      'https://www.diatyposi.gr/ypiresies/diafimistika-dora/',
    );
  });

  it('leaves placeholder contact details out', async () => {
    const { buildLocalBusiness } = await import('../src/lib/seo');
    const data = buildLocalBusiness('https://www.diatyposi.gr');
    expect(data).not.toHaveProperty('telephone');
    expect(data).not.toHaveProperty('address');
    expect(data).not.toHaveProperty('openingHoursSpecification');
    expect(data).not.toHaveProperty('hasMap');
    expect(data).not.toHaveProperty('areaServed');
  });

  it('lists the name and its Greeklish spellings once each', async () => {
    const { buildLocalBusiness } = await import('../src/lib/seo');
    const names = buildLocalBusiness(SITE).alternateName as string[];
    expect(names).toEqual(expect.arrayContaining(['Διατύπωση', 'Diatyposi', 'Diatiposi']));
    expect(new Set(names).size).toBe(names.length);
  });

  it('publishes the areas served only once contact details are real', async () => {
    const actual = await mockSite((real) => ({
      contactIsPlaceholder: false,
      address: { ...real.site.address, areaServed: ['Αθήνα', 'Πειραιάς'] },
    }));
    const { buildLocalBusiness } = await import('../src/lib/seo');
    const data = buildLocalBusiness(SITE);
    expect(data.areaServed).toEqual([
      { '@type': 'Place', name: 'Αθήνα' },
      { '@type': 'Place', name: 'Πειραιάς' },
    ]);
    expect(data.hasMap).toBe(actual.site.address.mapUrl);
  });

  it('includes contact details, hours and profiles once they are real', async () => {
    const actual = await vi.importActual<typeof import('../src/data/site')>('../src/data/site');
    vi.doMock('~/data/site', () => ({
      ...actual,
      site: {
        ...actual.site,
        contactIsPlaceholder: false,
        hours: [
          {
            days: ['Monday'],
            label: { el: 'Δευτέρα' },
            ranges: [{ opens: '09:00', closes: '14:00' }],
          },
          { days: ['Sunday'], label: { el: 'Κυριακή' }, ranges: [] },
        ],
      },
    }));
    const { buildLocalBusiness } = await import('../src/lib/seo');
    const data = buildLocalBusiness('https://www.diatyposi.gr');
    expect(data.telephone).toBe(actual.site.contact.phone);
    expect(data.address).toMatchObject({ '@type': 'PostalAddress', addressCountry: 'GR' });
    expect(data.openingHoursSpecification).toEqual([
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday'],
        opens: '09:00',
        closes: '14:00',
      },
    ]);
    expect(data.sameAs).toHaveLength(2);
  });

  it("builds the shop's opening hours, leaving the closed Sunday out", async () => {
    const actual = await mockSite(() => ({ contactIsPlaceholder: false }));
    const { buildLocalBusiness } = await import('../src/lib/seo');
    const data = buildLocalBusiness(SITE);
    expect(data.telephone).toBe('+306974122163');
    expect(data.hasMap).toBe(actual.site.address.mapUrl);
    expect(data.openingHoursSpecification).toEqual([
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday'],
        opens: '09:00',
        closes: '21:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Tuesday', 'Wednesday', 'Thursday'],
        opens: '15:00',
        closes: '21:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Friday'],
        opens: '09:00',
        closes: '21:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Saturday'],
        opens: '09:00',
        closes: '18:00',
      },
    ]);
  });
});

describe('buildWebSite', () => {
  it('names the site, its spellings and links to the business as publisher', async () => {
    const { buildWebSite } = await import('../src/lib/seo');
    const data = buildWebSite(SITE);
    expect(data['@type']).toBe('WebSite');
    expect(data['@id']).toBe('https://www.diatyposi.gr/#website');
    expect(data.url).toBe('https://www.diatyposi.gr/');
    expect(data.inLanguage).toBe('el-GR');
    expect(data.alternateName).toContain('Diatyposi');
    expect(data.publisher).toEqual({ '@id': 'https://www.diatyposi.gr/#business' });
    expect(data).not.toHaveProperty('potentialAction');
  });
});

describe('buildBreadcrumbs', () => {
  it('numbers the trail from 1 with absolute URLs', async () => {
    const { buildBreadcrumbs } = await import('../src/lib/seo');
    const data = buildBreadcrumbs(SITE, [
      { name: 'Αρχική', path: '/' },
      { name: 'Υπηρεσίες', path: '/ypiresies/' },
      { name: 'Διαφημιστικά δώρα', path: '/ypiresies/diafimistika-dora/' },
    ]);
    expect(data['@type']).toBe('BreadcrumbList');
    const items = data.itemListElement as { position: number; name: string; item: string }[];
    expect(items.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(items[0]?.item).toBe('https://www.diatyposi.gr/');
    expect(items[2]).toMatchObject({
      name: 'Διαφημιστικά δώρα',
      item: 'https://www.diatyposi.gr/ypiresies/diafimistika-dora/',
    });
  });
});

describe('pageCrumbs', () => {
  it('has no trail on the home page', async () => {
    const { pageCrumbs } = await import('../src/lib/seo');
    expect(pageCrumbs('/', 'Αρχική')).toEqual([]);
  });

  it('names a navigation page by its menu label', async () => {
    const { pageCrumbs } = await import('../src/lib/seo');
    expect(pageCrumbs('/epikoinonia/', 'Κάτι άλλο')).toEqual([
      { name: 'Αρχική', path: '/' },
      { name: 'Επικοινωνία', path: '/epikoinonia/' },
    ]);
  });

  it('falls back to the title, or to nothing, for pages outside the navigation', async () => {
    const { pageCrumbs } = await import('../src/lib/seo');
    expect(pageCrumbs('/politiki-aporritou/', 'Πολιτική απορρήτου')).toEqual([
      { name: 'Αρχική', path: '/' },
      { name: 'Πολιτική απορρήτου', path: '/politiki-aporritou/' },
    ]);
    expect(pageCrumbs('/politiki-aporritou/')).toEqual([]);
  });
});

describe('buildServiceNode', () => {
  it('names the service by the owner title, with the business as provider', async () => {
    const { services } = await import('../src/data/site');
    const { buildServiceNode } = await import('../src/lib/seo');
    const service = services[0]!;
    const data = buildServiceNode(SITE, service, copy);
    expect(data['@type']).toBe('Service');
    expect(data['@id']).toBe('https://www.diatyposi.gr/ypiresies/diafimistika-dora/#service');
    expect(data.name).toBe(service.text.el.title);
    expect(data.description).toBe(copy.metaDescription);
    expect(data.provider).toEqual({ '@id': 'https://www.diatyposi.gr/#business' });
    const catalog = data.hasOfferCatalog as { itemListElement: unknown[] };
    expect(catalog.itemListElement).toHaveLength(service.text.el.products.length);
  });

  it('says the whole of Greece while the contact details are placeholders', async () => {
    const { services } = await import('../src/data/site');
    const { buildServiceNode } = await import('../src/lib/seo');
    expect(buildServiceNode(SITE, services[0]!, copy).areaServed).toEqual({
      '@type': 'Country',
      name: 'Ελλάδα',
    });
  });
});

describe('buildFaqPage', () => {
  it('turns each question and answer into a Question with plain-text answer', async () => {
    const { buildFaqPage } = await import('../src/lib/seo');
    const data = buildFaqPage(SITE, '/ypiresies/diafimistika-dora/', copy.faq);
    expect(data['@type']).toBe('FAQPage');
    expect(data['@id']).toBe('https://www.diatyposi.gr/ypiresies/diafimistika-dora/#faq');
    const questions = data.mainEntity as { name: string; acceptedAnswer: { text: string } }[];
    expect(questions).toHaveLength(2);
    expect(questions[0]?.name).toBe('Ποια είναι η ελάχιστη ποσότητα;');
    expect(questions[0]?.acceptedAnswer.text).toBe('Εξαρτάται από το προϊόν. Ρωτήστε μας.');
  });
});

describe('buildGraph', () => {
  it('wraps the nodes in one @graph with a single @context', async () => {
    const { buildGraph, buildLocalBusiness, buildWebSite } = await import('../src/lib/seo');
    const data = buildGraph([buildWebSite(SITE), buildLocalBusiness(SITE)]);
    expect(data['@context']).toBe('https://schema.org');
    const nodes = data['@graph'] as Record<string, unknown>[];
    expect(nodes.map((n) => n['@type'])).toEqual(['WebSite', 'LocalBusiness']);
    for (const node of nodes) expect(node).not.toHaveProperty('@context');
  });
});

describe('withLocality', () => {
  it('leaves the title alone while no locality is set', async () => {
    const { withLocality } = await import('../src/lib/seo');
    expect(withLocality('Διαφημιστικά δώρα')).toBe('Διαφημιστικά δώρα');
  });

  it('appends the locality once the owner sets it', async () => {
    await mockSite((actual) => ({
      address: { ...actual.site.address, locative: ' στην Αθήνα ' },
    }));
    const { withLocality } = await import('../src/lib/seo');
    expect(withLocality('Διαφημιστικά δώρα')).toBe('Διαφημιστικά δώρα στην Αθήνα');
  });
});

describe('fillLocality', () => {
  it('drops the {loc} token while no locality is set', async () => {
    const { fillLocality } = await import('../src/lib/seo');
    expect(fillLocality('Τυπώνουμε κάρτες{loc} για εσάς.')).toBe('Τυπώνουμε κάρτες για εσάς.');
  });

  it('fills the {loc} token with the locality once it is set', async () => {
    await mockSite((actual) => ({
      address: { ...actual.site.address, locative: 'στην Πάτρα' },
    }));
    const { fillLocality } = await import('../src/lib/seo');
    expect(fillLocality('Τυπώνουμε κάρτες{loc} για εσάς.')).toBe(
      'Τυπώνουμε κάρτες στην Πάτρα για εσάς.',
    );
  });
});
