/**
 * Shared interface strings (header, footer, buttons, SEO defaults).
 * Page-specific strings live in src/i18n/pages/*.ts.
 * Every string here that is not the owner's wording is listed in CONTENT_REVIEW.md.
 */
export const locales = ['el'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'el';

/** BCP 47 tag per locale, for og:locale and JSON-LD. */
export const localeTags: Record<Locale, { html: string; og: string }> = {
  el: { html: 'el', og: 'el_GR' },
};

export const ui = {
  el: {
    skipLink: 'Μετάβαση στο περιεχόμενο',
    navLabel: 'Κύρια πλοήγηση',
    menuOpen: 'Μενού',
    menuClose: 'Κλείσιμο',
    menuDialogLabel: 'Μενού πλοήγησης',
    homeLinkLabel: 'ΔΙΑΤΥΠΩΣΗ, αρχική σελίδα',
    callUs: 'Καλέστε μας',
    callShort: 'Κλήση',
    viber: 'Viber',
    whatsapp: 'WhatsApp',
    email: 'Email',
    requestQuote: 'Ζητήστε προσφορά',
    ourServices: 'Οι υπηρεσίες μας',
    phoneLabel: 'Τηλέφωνο',
    emailLabel: 'Email',
    addressLabel: 'Διεύθυνση',
    hoursLabel: 'Ωράριο',
    closed: 'Κλειστά',
    followUs: 'Ακολουθήστε μας',
    facebookLabel: 'Η ΔΙΑΤΥΠΩΣΗ στο Facebook',
    instagramLabel: 'Η ΔΙΑΤΥΠΩΣΗ στο Instagram',
    footerServices: 'Υπηρεσίες',
    footerContact: 'Επικοινωνία',
    /** Footer column heading over the page links (shown in capitals). */
    footerPages: 'Σελίδες',
    footerPrivacy: 'Πολιτική απορρήτου',
    copyright: 'Με επιφύλαξη παντός δικαιώματος.',
    floatingLabel: 'Γρήγορη επικοινωνία',
    /** Section rail (SectionRail.astro, ≥ 1280px): the landmark's accessible name. */
    sectionNavLabel: 'Ενότητες σελίδας',
    /** Theme toggle: its accessible name (a toggle button, pressed = dark theme on). */
    themeToggle: 'Σκούρο θέμα',
    /** Theme toggle state words, shown in its tooltip and in the menu row. */
    themeOn: 'Ενεργό',
    themeOff: 'Ανενεργό',
    newTab: '(ανοίγει σε νέα καρτέλα)',
    standInLabel: 'Ενδεικτική εικόνα',
    defaultDescription:
      'ΔΙΑΤΥΠΩΣΗ, διαφημιστικό γραφείο: σχεδιάζουμε και τυπώνουμε κάρτες, έντυπα, banners, επιγραφές, ρούχα και διαφημιστικά δώρα για επαγγελματίες και ιδιώτες.',
    ogImageAlt:
      'Το λογότυπο της ΔΙΑΤΥΠΩΣΗΣ με τις τέσσερις καμάρες σε κυανό, ματζέντα, κίτρινο και μαύρο',
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type UiKey = keyof (typeof ui)['el'];

export const t = (key: UiKey, locale: Locale = defaultLocale): string => ui[locale][key];
