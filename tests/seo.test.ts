import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('~/data/site');
});

describe('buildLocalBusiness', () => {
  it('describes the business with absolute URLs and all nine services', async () => {
    const { buildLocalBusiness } = await import('../src/lib/seo');
    const data = buildLocalBusiness('https://www.diatyposi.gr');
    expect(data['@type']).toBe('LocalBusiness');
    expect(data.name).toBe('ΔΙΑΤΥΠΩΣΗ');
    expect(data.url).toBe('https://www.diatyposi.gr/');
    expect(data.logo).toBe('https://www.diatyposi.gr/icon-512.png');
    const catalog = data.hasOfferCatalog as { itemListElement: { itemOffered: { url: string } }[] };
    expect(catalog.itemListElement).toHaveLength(9);
    expect(catalog.itemListElement[0]?.itemOffered.url).toBe(
      'https://www.diatyposi.gr/ypiresies/#diafimistika-dora',
    );
  });

  it('leaves placeholder contact details out', async () => {
    const { buildLocalBusiness } = await import('../src/lib/seo');
    const data = buildLocalBusiness('https://www.diatyposi.gr');
    expect(data).not.toHaveProperty('telephone');
    expect(data).not.toHaveProperty('address');
    expect(data).not.toHaveProperty('openingHoursSpecification');
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
});
