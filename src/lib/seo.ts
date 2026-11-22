/**
 * Structured data (schema.org LocalBusiness) built from src/data/site.ts.
 * Contact fields are left out while `site.contactIsPlaceholder` is true, so search engines never
 * receive placeholder values.
 */
import { site, services } from '~/data/site';
import { t, ui, type Locale } from '~/i18n/ui';

type Json = Record<string, unknown>;

export const buildLocalBusiness = (siteUrl: string | URL, locale: Locale = 'el'): Json => {
  const base = new URL('/', siteUrl).href;
  const data: Json = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${base}#business`,
    name: site.name,
    alternateName: site.displayName,
    description: ui[locale].defaultDescription,
    slogan: site.tagline[locale],
    url: base,
    logo: new URL('/icon-512.png', base).href,
    image: new URL('/og.jpg', base).href,
    knowsLanguage: 'el',
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: t('footerServices', locale),
      itemListElement: services.map((s) => ({
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: s.text[locale].title,
          url: new URL(`/ypiresies/#${s.slug}`, base).href,
        },
      })),
    },
  };

  if (!site.contactIsPlaceholder) {
    Object.assign(data, {
      telephone: site.contact.phone,
      email: site.contact.email,
      address: {
        '@type': 'PostalAddress',
        streetAddress: site.address.street,
        addressLocality: site.address.city,
        postalCode: site.address.postalCode,
        addressRegion: site.address.region,
        addressCountry: site.address.country,
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: site.address.geo.lat,
        longitude: site.address.geo.lng,
      },
      openingHoursSpecification: site.hours
        .filter((h) => h.ranges.length > 0)
        .flatMap((h) =>
          h.ranges.map((r) => ({
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: h.days,
            opens: r.opens,
            closes: r.closes,
          })),
        ),
      sameAs: [site.social.facebook, site.social.instagram],
    });
  }

  return data;
};
