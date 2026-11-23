/**
 * Interface strings of the service page template (src/pages/ypiresies/[slug].astro and
 * src/components/service-page/*), plus the link on each chapter of /ypiresies/ that opens a
 * service's own page. Each service's own copy (h1, intro, sections, questions) lives in
 * src/i18n/pages/service-<slug>.ts; titles, descriptions and product lists in src/data/site.ts.
 * Everything here is new copy for the owner's review (CONTENT_REVIEW.md). Labels are written in
 * sentence case and shown in accent-free capitals with capsEl().
 */
export const serviceDetailText = {
  el: {
    /** Accessible name of the breadcrumb trail at the top of the page. */
    breadcrumbLabel: 'Διαδρομή',
    /** Small label above the owner's service title, section 01 (shown in capitals). */
    overviewLabel: 'Η υπηρεσία',
    /** Main button under the product list; opens the quote form with this service selected. */
    quoteCta: 'Ζητήστε προσφορά',
    /** Small label above the questions, section 02 (shown in capitals). */
    faqLabel: 'Συχνές ερωτήσεις',
    faqTitle: 'Ό,τι μας ρωτάτε πιο συχνά',
    /** Small label above the related services, section 03 (shown in capitals). */
    relatedLabel: 'Σχετικές υπηρεσίες',
    relatedTitle: 'Μπορεί να σας χρειαστούν επίσης',
    /** On /ypiresies/, under each chapter: opens that service's own page. */
    moreLink: 'Περισσότερα για την υπηρεσία',
  },
} as const;
