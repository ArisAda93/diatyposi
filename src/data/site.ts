/**
 * ΔΙΑΤΥΠΩΣΗ — all business data in one typed file.
 *
 * Every value marked `TODO(owner)` is a placeholder. Replace it with the real value, then set
 * `contactIsPlaceholder` to `false` so the structured data (JSON-LD) includes the contact details.
 *
 * Visitor-facing text is keyed by locale (`el` today) so an English version can be added later
 * by adding an `en` entry next to each `el` entry.
 */
import type { Locale } from '~/i18n/ui';
import type { IconName } from '~/components/icons';

export type Localized<T> = Record<Locale, T>;

export interface OpeningHours {
  /** schema.org day names, used for JSON-LD. */
  days: ('Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday')[];
  label: Localized<string>;
  /** 24h "HH:MM" ranges. Empty array = closed. */
  ranges: { opens: string; closes: string }[];
}

export interface Service {
  /**
   * Latin, Greek-friendly slug: the service page's path segment (/ypiresies/<slug>/, see
   * `serviceHref`), the anchor on /ypiresies/ and the quote form value. Changing it changes a
   * public URL, so add a redirect from the old one.
   */
  slug: string;
  icon: IconName;
  /** File name inside src/assets/portfolio/. */
  image: string;
  text: Localized<{
    /** Owner's wording, verbatim. */
    title: string;
    /** Short wording for compact places (footer, chips). */
    short: string;
    description: string;
    products: string[];
    imageAlt: string;
  }>;
}

export interface PortfolioItem {
  /** File name inside src/assets/portfolio/. Drop the file in that folder and list it here. */
  image: string;
  /** Slug of the service this work belongs to (used by the filter). */
  service: Service['slug'];
  /** `true` while the image is a stand-in; shows the “Ενδεικτική εικόνα” label. */
  standIn: boolean;
  /** Show on the home page teaser. */
  featured?: boolean;
  text: Localized<{ title: string; alt: string }>;
}

export interface NavItem {
  href: string;
  label: Localized<string>;
}

// ---------------------------------------------------------------------------------------------
// Business
// ---------------------------------------------------------------------------------------------

export const site = {
  name: 'ΔΙΑΤΥΠΩΣΗ',
  /** Mixed-case name as written under the logo's social icons. */
  displayName: 'Διατύπωση',
  /**
   * Other spellings people type when they search for the business (mixed case and Greeklish).
   * Used as `alternateName` in the WebSite and LocalBusiness structured data.
   */
  alternateNames: ['Διατύπωση', 'Diatyposi', 'Diatiposi'],
  descriptor: { el: 'Διαφήμιση – Εκτυπώσεις' } satisfies Localized<string>,
  descriptorCaps: { el: 'ΔΙΑΦΗΜΙΣΗ – ΕΚΤΥΠΩΣΕΙΣ' } satisfies Localized<string>,
  tagline: {
    el: 'Πάνω από προϊόντα, χτίζουμε σχέσεις εμπιστοσύνης.',
  } satisfies Localized<string>,

  /** Set to false once every TODO(owner) contact value below is real. */
  contactIsPlaceholder: true,

  contact: {
    /** The owner's mobile, the shop's only phone (there is no landline). International, no spaces. */
    phone: '+306974122163',
    phoneDisplay: '697 412 2163',
    email: 'dafnomilispeter@gmail.com',
    /** Viber number (international, no spaces, no +). */
    viber: '306974122163',
    /** WhatsApp number (international, no spaces, no +). */
    whatsapp: '306974122163',
  },

  address: {
    street: 'Ελ. Βενιζέλου 226',
    city: 'Γάζι Ηρακλείου',
    postalCode: '714 14',
    region: 'Κρήτη',
    country: 'GR',
    /** Address as Google Maps knows it: the query of the embedded map. */
    mapQuery: 'Ελ. Βενιζέλου 226, Γάζι 714 14',
    /** Google's id of the shop's place (from the owner's share link): pins the business itself. */
    mapPlaceId: '0x149a5715a9164429:0xe5509f386ea99da8',
    /** The owner's Google Maps share link: opens the shop in the Google Maps app or site. */
    mapUrl: 'https://maps.app.goo.gl/5qruSfzat3Tdy5386',
    // TODO(owner): shop coordinates (decimal degrees). Used for JSON-LD only.
    geo: { lat: 0, lng: 0 },
    /**
     * TODO(owner): the city in the Greek locative, with its article, e.g. 'στην Αθήνα',
     * 'στο Περιστέρι', 'στη Θεσσαλονίκη'. Appended to the service pages' titles (`withLocality`
     * in src/lib/seo.ts) so they match local searches. Empty = no locality in titles.
     */
    locative: '' as string,
    /**
     * TODO(owner): cities or areas the shop serves, in Greek (e.g. 'Αθήνα', 'Πειραιάς').
     * Listed as `areaServed` in the structured data once `contactIsPlaceholder` is false.
     * Empty = not stated (service pages then say the whole of Greece).
     */
    areaServed: [] as string[],
  },

  /** Owner's opening hours, in weekday order. */
  hours: [
    {
      days: ['Monday'],
      label: { el: 'Δευτέρα' },
      ranges: [{ opens: '09:00', closes: '21:00' }],
    },
    {
      days: ['Tuesday', 'Wednesday', 'Thursday'],
      label: { el: 'Τρίτη – Πέμπτη' },
      ranges: [{ opens: '15:00', closes: '21:00' }],
    },
    {
      days: ['Friday'],
      label: { el: 'Παρασκευή' },
      ranges: [{ opens: '09:00', closes: '21:00' }],
    },
    {
      days: ['Saturday'],
      label: { el: 'Σάββατο' },
      ranges: [{ opens: '09:00', closes: '18:00' }],
    },
    {
      days: ['Sunday'],
      label: { el: 'Κυριακή' },
      ranges: [],
    },
  ] satisfies OpeningHours[],

  social: {
    // TODO(owner): Facebook page URL.
    facebook: 'https://www.facebook.com/',
    // TODO(owner): Instagram profile URL.
    instagram: 'https://www.instagram.com/',
  },

  /** About page photo (file in src/assets/portfolio/). TODO(owner): add a real shop or team photo. */
  aboutPhoto: null as null | { image: string; alt: Localized<string> },
} as const;

// ---------------------------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------------------------

/**
 * Sections still under development: hidden from the menus and the home page and marked noindex,
 * but still built. To turn one back on, set its flag to false and remove its sitemap filter in
 * astro.config.mjs.
 */
export const hiddenSections = {
  /** /erga/ (portfolio page) and the home page's work teaser. */
  work: true,
} as const;

const allNav: NavItem[] = [
  { href: '/', label: { el: 'Αρχική' } },
  { href: '/ypiresies/', label: { el: 'Υπηρεσίες' } },
  { href: '/erga/', label: { el: 'Έργα' } },
  { href: '/etaireia/', label: { el: 'Η εταιρεία' } },
  { href: '/epikoinonia/', label: { el: 'Επικοινωνία' } },
];

export const nav: NavItem[] = allNav.filter(
  (item) => !(hiddenSections.work && item.href === '/erga/'),
);

export const routes = {
  home: '/',
  services: '/ypiresies/',
  work: '/erga/',
  about: '/etaireia/',
  contact: '/epikoinonia/',
  quote: '/epikoinonia/#prosfora',
  privacy: '/politiki-aporritou/',
} as const;

/** Link to the quote form with one service pre-selected. */
export const quoteHref = (slug?: string): string =>
  slug ? `/epikoinonia/?ypiresia=${encodeURIComponent(slug)}#prosfora` : routes.quote;

/** Path of a service's own page (src/pages/ypiresies/[slug].astro). */
export const serviceHref = (slug: string): string => `/ypiresies/${slug}/`;

// ---------------------------------------------------------------------------------------------
// Owner copy (verbatim)
// ---------------------------------------------------------------------------------------------

export const ownerCopy = {
  el: {
    headline: 'Η ιδέα σας… γίνεται δημιουργία!',
    intro:
      'Στη ΔΙΑΤΥΠΩΣΗ δίνουμε μορφή στις ιδέες σας, προσφέροντας ολοκληρωμένες λύσεις διαφήμισης, εκτύπωσης και προβολής για κάθε επαγγελματία και ιδιώτη.',
    servicesHeading: 'Οι υπηρεσίες μας:',
    partnership:
      'Για εμάς, κάθε συνεργασία είναι κάτι περισσότερο από μια παραγγελία. Είναι μια ευκαιρία να δημιουργήσουμε κάτι ξεχωριστό, με ποιότητα, συνέπεια, δημιουργικότητα και προσωπική εξυπηρέτηση.',
    closing: 'ΔΙΑΤΥΠΩΣΗ — Πάνω από προϊόντα, χτίζουμε σχέσεις εμπιστοσύνης.',
    values: ['Ποιότητα', 'Συνέπεια', 'Δημιουργικότητα', 'Προσωπική εξυπηρέτηση'],
  },
} as const satisfies Localized<unknown>;

// ---------------------------------------------------------------------------------------------
// Services — titles and their order are the owner's; every list of services on the site (home
// showcase, /ypiresies/, footer, quote form, /erga/ filters, structured data) follows this order.
// Descriptions, products and alt texts are new copy listed in CONTENT_REVIEW.md for approval.
// ---------------------------------------------------------------------------------------------

export const services: Service[] = [
  {
    slug: 'diafimistika-dora',
    icon: 'gift',
    image: 'dora-01.jpg',
    text: {
      el: {
        title: 'Διαφημιστικά δώρα & προσωποποιημένα προϊόντα',
        short: 'Διαφημιστικά δώρα',
        description:
          'Μικρά αντικείμενα που κρατούν το όνομά σας στο χέρι των πελατών σας, ή ένα προσωπικό δώρο για κάποιον ξεχωριστό.',
        products: [
          'Κούπες και ποτήρια',
          'Στυλό, μπλοκ και ημερολόγια',
          'Τσάντες υφασμάτινες',
          'Προσωποποιημένα δώρα',
        ],
        imageAlt:
          'Κούπες, ποτήρι, στυλό, σημειωματάριο, μπλοκ και υφασμάτινη τσάντα με το ίδιο λογότυπο, και κούπα με παιδική ζωγραφιά',
      },
    },
  },
  {
    slug: 'mplouzakia-rouxismos',
    icon: 'shirt',
    image: 'rouxismos-01.jpg',
    text: {
      el: {
        title: 'Εκτυπώσεις σε μπλουζάκια & επαγγελματικό ρουχισμό',
        short: 'Μπλουζάκια & ρουχισμός',
        description:
          'Μπλουζάκια για την ομάδα, την εκδήλωση ή το μαγαζί σας, και επαγγελματικός ρουχισμός με το λογότυπό σας.',
        products: [
          'Τυπωμένα μπλουζάκια',
          'Ρούχα εργασίας με λογότυπο',
          'Φούτερ, καπέλα και ποδιές',
          'Μπλουζάκια για εκδηλώσεις και ομάδες',
        ],
        imageAlt:
          'Μπλουζάκια ομάδας με λογότυπο σε κρεμάστρα και ρούχα εργασίας με το ίδιο λογότυπο: πόλο, ποδιά, καπέλο και φούτερ',
      },
    },
  },
  // Added after the owner's original nine: the title is new wording too, so all of this entry is
  // for the owner's review (CONTENT_REVIEW.md). TODO(owner): confirm whether you also draw the 3D
  // model from an idea or a sketch, or print from the customer's file only.
  {
    slug: '3d-ektyposeis',
    icon: 'print3d',
    image: '3d-ektyposeis-01.jpg',
    text: {
      el: {
        title: 'Τρισδιάστατες εκτυπώσεις (3D printing)',
        short: '3D εκτυπώσεις',
        description:
          'Πρωτότυπα, ανταλλακτικά, φιγούρες, δώρα και διακοσμητικά, τυπωμένα σε τρεις διαστάσεις από το δικό σας αρχείο. Έχετε μόνο την ιδέα; Φέρτε μας ένα σκίτσο ή μια φωτογραφία, και θα σας πούμε αν και πώς μπορεί να γίνει.',
        products: [
          'Πρωτότυπα και μακέτες',
          'Ανταλλακτικά και μικρά εξαρτήματα',
          'Φιγούρες, δώρα και διακοσμητικά',
          'Τρισδιάστατα γράμματα και λογότυπα',
        ],
        imageAlt:
          '3D εκτυπωτής τυπώνει ένα κομμάτι δίπλα σε έτοιμα αντικείμενα: ανταλλακτικό, μακέτα σπιτιού, φιγούρα και γράμματα',
      },
    },
  },
  {
    slug: 'grafistikos-sxediasmos',
    icon: 'design',
    image: 'grafistiko-01.jpg',
    text: {
      el: {
        title: 'Γραφιστικός σχεδιασμός & δημιουργία λογοτύπων',
        short: 'Γραφιστικός σχεδιασμός',
        description:
          'Από το πρώτο σκίτσο μέχρι το τελικό αρχείο, σχεδιάζουμε μαζί σας την εικόνα που σας ταιριάζει. Λογότυπο, χρώματα, γραμματοσειρές και ό,τι χρειάζεται για να σας αναγνωρίζουν με την πρώτη ματιά.',
        products: [
          'Λογότυπα και εταιρική ταυτότητα',
          'Σχεδιασμός εντύπων και συσκευασιών',
          'Ανανέωση υπάρχουσας εικόνας',
          'Αρχεία έτοιμα για εκτύπωση',
        ],
        imageAlt:
          'Σκίτσα λογοτύπου, το τελικό λογότυπο σε φορητό υπολογιστή, κάρτες, επιστολόχαρτο, φάκελος, σακούλα και αυτοκόλλητα',
      },
    },
  },
  {
    slug: 'banners-afises-mousamades',
    icon: 'banner',
    image: 'banners-01.jpg',
    text: {
      el: {
        title: 'Διαφημιστικά banners, αφίσες & μουσαμάδες',
        short: 'Banners, αφίσες & μουσαμάδες',
        description:
          'Μεγάλες εκτυπώσεις που φαίνονται από μακριά: για το κατάστημα, την εκδήλωση, την έκθεση ή το εργοτάξιο.',
        products: [
          'Roll-up banners',
          'Αφίσες κάθε μεγέθους',
          'Μουσαμάδες για προσόψεις και εκδηλώσεις',
          'Πανό για εκθέσεις',
        ],
        imageAlt:
          'Μουσαμάς στην πρόσοψη, roll-up banner στην είσοδο και αφίσα στη βιτρίνα ενός ανθοπωλείου',
      },
    },
  },
  {
    slug: 'epigrafes-aftokollita-vitrines',
    icon: 'sign',
    image: 'epigrafes-01.jpg',
    text: {
      el: {
        title: 'Επιγραφές, αυτοκόλλητα & βιτρίνες καταστημάτων',
        short: 'Επιγραφές & βιτρίνες',
        description:
          'Η πρόσοψη και η βιτρίνα είναι η πρώτη εικόνα του καταστήματός σας. Σχεδιάζουμε και κατασκευάζουμε επιγραφές και αυτοκόλλητα που τραβούν το βλέμμα.',
        products: [
          'Επιγραφές καταστημάτων',
          'Αυτοκόλλητα βιτρίνας',
          'Αυτοκόλλητα οχημάτων',
          'Ετικέτες και αυτοκόλλητα προϊόντων',
        ],
        imageAlt:
          'Επιγραφή και αυτοκόλλητα βιτρίνας σε κατάστημα με τοπικά προϊόντα, και αυτοκόλλητο λογότυπο στην πόρτα ενός βαν',
      },
    },
  },
  {
    slug: 'social-media',
    icon: 'social',
    image: 'social-01.jpg',
    text: {
      el: {
        title: 'Σχεδιασμός διαφημιστικού υλικού για τα social media',
        short: 'Υλικό για social media',
        description:
          'Αναρτήσεις, stories και εικόνες εξωφύλλου με την ίδια εικόνα που έχουν τα έντυπά σας, ώστε να σας αναγνωρίζουν παντού.',
        products: [
          'Αναρτήσεις για Facebook και Instagram',
          'Stories και εικόνες εξωφύλλου',
          'Προσκλήσεις και ανακοινώσεις σε ψηφιακή μορφή',
          'Ενιαία εικόνα σε έντυπα και οθόνες',
        ],
        imageAlt:
          'Σειρά αναρτήσεων σε φορητό υπολογιστή, story σε κινητό και τάμπλετ, δίπλα σε φυλλάδιο και κάρτες στο ίδιο ύφος',
      },
    },
  },
  {
    slug: 'psifiakes-offset-ektyposeis',
    icon: 'press',
    image: 'ektyposeis-01.jpg',
    text: {
      el: {
        title: 'Ψηφιακές & offset εκτυπώσεις',
        short: 'Ψηφιακές & offset εκτυπώσεις',
        description:
          'Μικρές ποσότητες σε ψηφιακή εκτύπωση ή μεγάλα τιράζ σε offset: επιλέγουμε τη μέθοδο που ταιριάζει στη δουλειά σας, με προσοχή στο χρώμα και στο χαρτί.',
        products: [
          'Ψηφιακές εκτυπώσεις μικρών ποσοτήτων',
          'Offset εκτυπώσεις για μεγάλα τιράζ',
          'Επιλογή χαρτιού και φινιρίσματος',
          'Έλεγχος χρώματος πριν από την εκτύπωση',
        ],
        imageAlt:
          'Μηχανή όφσετ με φρεσκοτυπωμένα φύλλα και χρωματική κλίμακα, μεγεθυντικός φακός, έτοιμα έντυπα και δείγματα χαρτιού',
      },
    },
  },
  {
    slug: 'kartes-fylladia-entypa',
    icon: 'cards',
    image: 'kartes-01.jpg',
    text: {
      el: {
        title: 'Επαγγελματικές κάρτες, φυλλάδια & έντυπα',
        short: 'Κάρτες, φυλλάδια & έντυπα',
        description:
          'Η κάρτα που αφήνετε, το φυλλάδιο που μοιράζετε, ο κατάλογος που ξεφυλλίζουν οι πελάτες σας. Έντυπα που μιλούν για εσάς, τυπωμένα με φροντίδα.',
        products: [
          'Επαγγελματικές κάρτες',
          'Φυλλάδια και flyers',
          'Κατάλογοι και μενού',
          'Επιστολόχαρτα, φάκελοι και μπλοκ',
        ],
        imageAlt:
          'Επαγγελματικές κάρτες, τρίπτυχο, καρτ ποστάλ, επιστολόχαρτο, φάκελος και μπλοκ στο ίδιο σχέδιο',
      },
    },
  },
  {
    slug: 'prosklitiria-kartes',
    icon: 'invite',
    image: 'prosklitiria-01.jpg',
    text: {
      el: {
        title: 'Προσκλητήρια, κάρτες & ειδικές κατασκευές',
        short: 'Προσκλητήρια & κάρτες',
        description:
          'Για τον γάμο, τη βάπτιση, τη γιορτή ή την εταιρική εκδήλωση: προσκλητήρια και κάρτες που κρατάει κανείς για ενθύμιο.',
        products: [
          'Προσκλητήρια γάμου και βάπτισης',
          'Ευχετήριες κάρτες',
          'Μενού και καρτελάκια τραπεζιού',
          'Ειδικές κατασκευές κατόπιν συνεννόησης',
        ],
        imageAlt:
          'Σετ προσκλητηρίων με φάκελο και κορδέλα, μενού και καρτελάκια τραπεζιού, με κλαδιά ελιάς σε λινό ύφασμα',
      },
    },
  },
];

export const serviceBySlug = (slug: string): Service | undefined =>
  services.find((s) => s.slug === slug);

// ---------------------------------------------------------------------------------------------
// Portfolio — to add real work: put the image in src/assets/portfolio/ and add an entry here.
// Stand-in images are credited in CREDITS.md; set `standIn: false` on real work.
// ---------------------------------------------------------------------------------------------

export const portfolio: PortfolioItem[] = [
  {
    image: 'kartes-01.jpg',
    service: 'kartes-fylladia-entypa',
    standIn: true,
    featured: true,
    text: {
      el: {
        title: 'Κάρτες και έντυπα',
        alt: 'Επαγγελματικές κάρτες, τρίπτυχο, καρτ ποστάλ, επιστολόχαρτο, φάκελος και μπλοκ στο ίδιο σχέδιο',
      },
    },
  },
  {
    image: 'banners-01.jpg',
    service: 'banners-afises-mousamades',
    standIn: true,
    featured: true,
    text: {
      el: {
        title: 'Μουσαμάς, roll-up και αφίσα',
        alt: 'Μουσαμάς στην πρόσοψη, roll-up banner στην είσοδο και αφίσα στη βιτρίνα ενός ανθοπωλείου',
      },
    },
  },
  {
    image: 'rouxismos-01.jpg',
    service: 'mplouzakia-rouxismos',
    standIn: true,
    featured: true,
    text: {
      el: {
        title: 'Μπλουζάκια και ρούχα εργασίας',
        alt: 'Μπλουζάκια ομάδας με λογότυπο σε κρεμάστρα και ρούχα εργασίας με το ίδιο λογότυπο: πόλο, ποδιά, καπέλο και φούτερ',
      },
    },
  },
  {
    image: 'prosklitiria-01.jpg',
    service: 'prosklitiria-kartes',
    standIn: true,
    featured: true,
    text: {
      el: {
        title: 'Προσκλητήρια και καρτελάκια',
        alt: 'Σετ προσκλητηρίων με φάκελο και κορδέλα, μενού και καρτελάκια τραπεζιού, με κλαδιά ελιάς σε λινό ύφασμα',
      },
    },
  },
  {
    image: 'grafistiko-01.jpg',
    service: 'grafistikos-sxediasmos',
    standIn: true,
    text: {
      el: {
        title: 'Λογότυπο και εταιρική ταυτότητα',
        alt: 'Σκίτσα λογοτύπου, το τελικό λογότυπο σε φορητό υπολογιστή, κάρτες, επιστολόχαρτο, φάκελος, σακούλα και αυτοκόλλητα',
      },
    },
  },
  {
    image: 'ektyposeis-01.jpg',
    service: 'psifiakes-offset-ektyposeis',
    standIn: true,
    text: {
      el: {
        title: 'Offset εκτύπωση',
        alt: 'Μηχανή όφσετ με φρεσκοτυπωμένα φύλλα και χρωματική κλίμακα, μεγεθυντικός φακός, έτοιμα έντυπα και δείγματα χαρτιού',
      },
    },
  },
  {
    image: 'ektyposeis-02.jpg',
    service: 'psifiakes-offset-ektyposeis',
    standIn: true,
    text: {
      el: { title: 'Ψηφιακή εκτύπωση', alt: 'Εκτυπωτής μεγάλου φορμά τυπώνει πολύχρωμο πανό' },
    },
  },
  {
    image: 'entypa-01.jpg',
    service: 'kartes-fylladia-entypa',
    standIn: true,
    text: { el: { title: 'Φυλλάδια', alt: 'Τυπωμένα φυλλάδια απλωμένα σε ξύλινο τραπέζι' } },
  },
  {
    image: 'epigrafes-01.jpg',
    service: 'epigrafes-aftokollita-vitrines',
    standIn: true,
    text: {
      el: {
        title: 'Επιγραφή και αυτοκόλλητα βιτρίνας',
        alt: 'Επιγραφή και αυτοκόλλητα βιτρίνας σε κατάστημα με τοπικά προϊόντα, και αυτοκόλλητο λογότυπο στην πόρτα ενός βαν',
      },
    },
  },
  {
    image: 'aftokollita-01.jpg',
    service: 'epigrafes-aftokollita-vitrines',
    standIn: true,
    text: {
      el: { title: 'Αυτοκόλλητα', alt: 'Φύλλα με ολογραφικά αυτοκόλλητα σε σκούρο γραφείο' },
    },
  },
  {
    image: 'dora-01.jpg',
    service: 'diafimistika-dora',
    standIn: true,
    text: {
      el: {
        title: 'Διαφημιστικά δώρα με λογότυπο',
        alt: 'Κούπες, ποτήρι, στυλό, σημειωματάριο, μπλοκ και υφασμάτινη τσάντα με το ίδιο λογότυπο, και κούπα με παιδική ζωγραφιά',
      },
    },
  },
  {
    image: 'social-01.jpg',
    service: 'social-media',
    standIn: true,
    text: {
      el: {
        title: 'Αναρτήσεις και stories',
        alt: 'Σειρά αναρτήσεων σε φορητό υπολογιστή, story σε κινητό και τάμπλετ, δίπλα σε φυλλάδιο και κάρτες στο ίδιο ύφος',
      },
    },
  },
  {
    image: '3d-ektyposeis-01.jpg',
    service: '3d-ektyposeis',
    standIn: true,
    text: {
      el: {
        title: '3D εκτυπώσεις',
        alt: '3D εκτυπωτής τυπώνει ένα κομμάτι δίπλα σε έτοιμα αντικείμενα: ανταλλακτικό, μακέτα σπιτιού, φιγούρα και γράμματα',
      },
    },
  },
];
