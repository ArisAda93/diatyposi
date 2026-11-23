/**
 * Shape of the copy for one service page (/ypiresies/<slug>/). Each service has its own file,
 * src/i18n/pages/service-<slug>.ts, exporting one `{ el: ServicePageCopy }` object, so
 * `npm run content-review` lists it for the owner's approval. The page template is
 * src/pages/ypiresies/[slug].astro; the copy is joined to the service by slug in
 * src/i18n/service-pages.ts.
 *
 * The owner's service title (src/data/site.ts, services[].text.el.title) is used word for word
 * elsewhere on the page; nothing here replaces it.
 */
import type { Locale } from './ui';

export interface ServicePageSection {
  /** h2 of the section. */
  heading: string;
  /** One or more paragraphs, plain text. */
  paragraphs: string[];
  /** Optional bullet list shown after the paragraphs. */
  list?: string[];
}

export interface ServicePageFaq {
  /** The question, as a visitor would ask it (ends with the Greek question mark “;”). */
  q: string;
  /** The answer, plain text, one or two short paragraphs separated by "\n\n". */
  a: string;
}

export interface ServicePageCopy {
  /** <title> text before " | ΔΙΑΤΥΠΩΣΗ" (and before the optional locality). Aim for 30–50 characters. */
  metaTitle: string;
  /** Meta description, 130–160 characters, ending in a call to action. */
  metaDescription: string;
  /** The page's single h1. Keyword-led, natural Greek, under ~60 characters. */
  h1: string;
  /**
   * Lead paragraph under the h1 (1–3 sentences). It may carry the token `{loc}` once, right after a
   * word (no space before it): the page fills it with " στην <Πόλη>" from `site.address.locative`,
   * or with nothing while that is empty (`fillLocality` in src/lib/seo.ts). Only here.
   */
  intro: string;
  /** Two to four body sections (each an h2). */
  sections: ServicePageSection[];
  /** Four to six questions and answers, shown on the page and in FAQPage structured data. */
  faq: ServicePageFaq[];
  /** Two or three other service slugs (src/data/site.ts) to link as related services. */
  related: string[];
}

export type ServicePageText = Record<Locale, ServicePageCopy>;
