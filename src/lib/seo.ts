/**
 * Structured data (schema.org JSON-LD) built from src/data/site.ts, plus small title helpers.
 *
 * BaseLayout joins the nodes a page needs into one `@graph` (`buildGraph`); nodes point at each
 * other by `@id` (`<site>/#business`, `<site>/#website`, `<page>#service`, `<page>#faq`).
 *
 * Contact fields (and anything that describes where the shop is) are left out while
 * `site.contactIsPlaceholder` is true, so search engines never receive placeholder values.
 */
import { nav, routes, serviceHref, services, site, type Service } from '~/data/site';
import type { ServicePageCopy, ServicePageFaq } from '~/i18n/service-page-types';
import { t, ui, type Locale } from '~/i18n/ui';

export type Json = Record<string, unknown>;

/** One step of a breadcrumb trail. `path` is site-absolute with a trailing slash: '/ypiresies/'. */
export interface Crumb {
  name: string;
  path: string;
}

/** The site root with a trailing slash, e.g. 'https://www.diatyposi.gr/'. */
const baseOf = (siteUrl: string | URL): string => new URL('/', siteUrl).href;
const businessId = (base: string): string => `${base}#business`;

/** The visible name first, then the spellings people type (Greeklish), without repeats. */
const alternateNames = (): string[] => [...new Set([site.displayName, ...site.alternateNames])];

/**
 * The owner's list of served areas as schema.org places, or null when it must not be published:
 * empty, or still part of the placeholder contact data.
 */
const servedAreas = (): Json[] | null => {
  const areas = site.address.areaServed.map((name) => name.trim()).filter(Boolean);
  if (site.contactIsPlaceholder || areas.length === 0) return null;
  return areas.map((name) => ({ '@type': 'Place', name }));
};

export const buildLocalBusiness = (siteUrl: string | URL, locale: Locale = 'el'): Json => {
  const base = baseOf(siteUrl);
  const data: Json = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': businessId(base),
    name: site.name,
    alternateName: alternateNames(),
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
          url: new URL(serviceHref(s.slug), base).href,
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
      // The owner's Google Maps link to the shop, the one the contact page's map opens.
      hasMap: site.address.mapUrl,
      // Closed days (no ranges) are left out: schema.org reads a missing day as closed.
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
    const areas = servedAreas();
    if (areas) data.areaServed = areas;
  }

  return data;
};

/** The site itself. No SearchAction: the site has no search. */
export const buildWebSite = (siteUrl: string | URL, locale: Locale = 'el'): Json => {
  const base = baseOf(siteUrl);
  return {
    '@type': 'WebSite',
    '@id': `${base}#website`,
    url: base,
    name: site.name,
    alternateName: alternateNames(),
    description: ui[locale].defaultDescription,
    inLanguage: 'el-GR',
    publisher: { '@id': businessId(base) },
  };
};

/** BreadcrumbList for a full trail (Home first), with absolute URLs and positions from 1. */
export const buildBreadcrumbs = (siteUrl: string | URL, crumbs: Crumb[]): Json => {
  const base = baseOf(siteUrl);
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: new URL(crumb.path, base).href,
    })),
  };
};

/**
 * The default trail for a page that does not pass its own: Home → the page's navigation label,
 * or Home → its title when it is not in the navigation (privacy page). Empty on the home page and
 * when there is nothing to name the page by.
 */
export const pageCrumbs = (pathname: string, title?: string, locale: Locale = 'el'): Crumb[] => {
  const home = nav.find((item) => item.href === routes.home);
  if (!home || pathname === routes.home) return [];
  const homeCrumb: Crumb = { name: home.label[locale], path: routes.home };
  const navItem = nav.find((item) => item.href === pathname);
  if (navItem) return [homeCrumb, { name: navItem.label[locale], path: pathname }];
  if (title) return [homeCrumb, { name: title, path: pathname }];
  return [];
};

/** The Service node of a service page (/ypiresies/<slug>/). */
export const buildServiceNode = (
  siteUrl: string | URL,
  service: Service,
  copy: ServicePageCopy,
  locale: Locale = 'el',
): Json => {
  const base = baseOf(siteUrl);
  const pageUrl = new URL(serviceHref(service.slug), base).href;
  const text = service.text[locale];
  return {
    '@type': 'Service',
    '@id': `${pageUrl}#service`,
    name: text.title,
    serviceType: text.short,
    description: copy.metaDescription,
    url: pageUrl,
    provider: { '@id': businessId(base) },
    // Without a published list of areas the honest claim is the country the shop works in.
    areaServed: servedAreas() ?? { '@type': 'Country', name: 'Ελλάδα' },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: text.title,
      itemListElement: text.products.map((product) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: product },
      })),
    },
  };
};

/**
 * FAQPage for the questions shown on a page. Answers are plain text; their paragraph breaks
 * ("\n\n") become single spaces, since the structured data carries one block of text per answer.
 */
export const buildFaqPage = (siteUrl: string | URL, path: string, faq: ServicePageFaq[]): Json => {
  const pageUrl = new URL(path, baseOf(siteUrl)).href;
  return {
    '@type': 'FAQPage',
    '@id': `${pageUrl}#faq`,
    mainEntity: faq.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a.replace(/\s*\n\s*/g, ' ').trim() },
    })),
  };
};

/** One JSON-LD document for the page; a node's own '@context' would be redundant inside it. */
export const buildGraph = (nodes: Json[]): Json => ({
  '@context': 'https://schema.org',
  '@graph': nodes.map((node) => {
    const copy = { ...node };
    delete copy['@context'];
    return copy;
  }),
});

/**
 * Appends the owner's locality ('στην Αθήνα') to a title, so service pages match "… + city"
 * searches. Returns the text unchanged while `site.address.locative` is empty.
 */
export const withLocality = (text: string): string => {
  const locative = site.address.locative.trim();
  return locative ? `${text} ${locative}` : text;
};

/**
 * Fills the `{loc}` token a service page's intro may carry (src/i18n/service-page-types.ts):
 * " στην Αθήνα" once `site.address.locative` is set, nothing while it is empty, so the sentence
 * reads correctly either way.
 */
export const fillLocality = (text: string): string => {
  const locative = site.address.locative.trim();
  return text.replace(/\{loc\}/g, locative ? ` ${locative}` : '');
};
