/**
 * Joins each service (src/data/site.ts) to the copy of its own page, /ypiresies/<slug>/
 * (src/i18n/pages/service-<slug>.ts), by slug. Plain data: the page template is
 * src/pages/ypiresies/[slug].astro and the shape of the copy is src/i18n/service-page-types.ts.
 */
import { services } from '~/data/site';
import type { ServicePageCopy, ServicePageText } from './service-page-types';
import type { Locale } from './ui';
import { serviceDiafimistikaDoraText } from './pages/service-diafimistika-dora';
import { serviceMplouzakiaRouxismosText } from './pages/service-mplouzakia-rouxismos';
import { service3dEktyposeisText } from './pages/service-3d-ektyposeis';
import { serviceGrafistikosSxediasmosText } from './pages/service-grafistikos-sxediasmos';
import { serviceBannersAfisesMousamadesText } from './pages/service-banners-afises-mousamades';
import { serviceEpigrafesAftokollitaVitrinesText } from './pages/service-epigrafes-aftokollita-vitrines';
import { serviceSocialMediaText } from './pages/service-social-media';
import { servicePsifiakesOffsetEktyposeisText } from './pages/service-psifiakes-offset-ektyposeis';
import { serviceKartesFylladiaEntypaText } from './pages/service-kartes-fylladia-entypa';
import { serviceProsklitiriaKartesText } from './pages/service-prosklitiria-kartes';

const copyBySlug = new Map<string, ServicePageText>([
  ['diafimistika-dora', serviceDiafimistikaDoraText],
  ['mplouzakia-rouxismos', serviceMplouzakiaRouxismosText],
  ['3d-ektyposeis', service3dEktyposeisText],
  ['grafistikos-sxediasmos', serviceGrafistikosSxediasmosText],
  ['banners-afises-mousamades', serviceBannersAfisesMousamadesText],
  ['epigrafes-aftokollita-vitrines', serviceEpigrafesAftokollitaVitrinesText],
  ['social-media', serviceSocialMediaText],
  ['psifiakes-offset-ektyposeis', servicePsifiakesOffsetEktyposeisText],
  ['kartes-fylladia-entypa', serviceKartesFylladiaEntypaText],
  ['prosklitiria-kartes', serviceProsklitiriaKartesText],
]);

/** Slugs of the service pages, in the owner's order of services. */
export const servicePageSlugs: string[] = services.map((service) => service.slug);

/** The copy of a service's page. Throws for a slug that has no page copy. */
export const servicePageCopy = (slug: string, locale: Locale = 'el'): ServicePageCopy => {
  const text = copyBySlug.get(slug);
  if (!text) {
    throw new Error(
      `No service page copy for "${slug}": add src/i18n/pages/service-${slug}.ts and list it in src/i18n/service-pages.ts.`,
    );
  }
  return text[locale];
};
