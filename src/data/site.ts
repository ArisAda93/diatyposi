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
  /** File name inside src/assets/portfolio/: the photo on the home page and /ypiresies/. */
  image: string;
  /** The service page's photo (src/assets/portfolio/): a different scene from `image`. */
  pageImage: string;
  text: Localized<{
    /** Owner's wording, verbatim. */
    title: string;
    /** Short wording for compact places (footer, chips). */
    short: string;
    description: string;
    products: string[];
    imageAlt: string;
    pageImageAlt: string;
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
  tagline: {
    el: 'Πάνω από προϊόντα, χτίζουμε σχέσεις εμπιστοσύνης.',
  } satisfies Localized<string>,

  /**
   * Registered business details, as the public ΓΕΜΗ registry lists them
   * (https://publicity.businessportal.gr/company/189676427000, checked 2026-11-25). Shown in the
   * footer and on the privacy page: ΠΔ 131/2003 art. 4 asks a business website for its name,
   * ΓΕΜΗ number and ΑΦΜ, and GDPR Art. 13 for the identity of the data controller.
   */
  legal: {
    /** Registered name of the sole proprietorship, as in ΓΕΜΗ (surname first). */
    name: 'Δαφνομήλης Πέτρος του Ιωάννη',
    /** The same name in reading order, for running text. */
    nameInText: 'Πέτρος Δαφνομήλης του Ιωάννη',
    legalForm: { el: 'ατομική επιχείρηση' } satisfies Localized<string>,
    /** Registered distinctive title, as written in ΓΕΜΗ. */
    tradeName: 'ΔΙΑΤΥΠΩΣΗ ΔΙΑΦΗΜΙΣΗ – ΕΚΤΥΠΩΣΕΙΣ',
    vatId: '132972806',
    gemi: '189676427000',
    /** The chamber that keeps the ΓΕΜΗ entry. */
    chamber: { el: 'Επιμελητήριο Ηρακλείου' } satisfies Localized<string>,
  },

  /** Set to false once every TODO(owner) contact value below is real. */
  contactIsPlaceholder: true,

  contact: {
    /** The owner's mobile, the shop's only phone (there is no landline). International, no spaces. */
    phone: '+306974122163',
    phoneDisplay: '6974 122 163',
    email: 'dafnomilispeter@gmail.com',
    /** Viber number (international, no spaces, no +). */
    viber: '306974122163',
    /** WhatsApp number (international, no spaces, no +). */
    whatsapp: '306974122163',
  },

  address: {
    street: 'Ελ. Βενιζέλου 205',
    city: 'Γάζι Ηρακλείου',
    postalCode: '714 14',
    region: 'Κρήτη',
    country: 'GR',
    /**
     * Address as Google Maps knows it: the query of the embedded map, which pins the street
     * address. (The owner's Google place still lists no. 226, so the map does not pin the place.)
     */
    mapQuery: 'Ελ. Βενιζέλου 205, Γάζι 714 14',
    /**
     * Opens the address in the Google Maps app or site: a Google Maps URL search for `mapQuery`
     * (https://developers.google.com/maps/documentation/urls/get-started).
     */
    mapUrl:
      'https://www.google.com/maps/search/?api=1&query=%CE%95%CE%BB.%20%CE%92%CE%B5%CE%BD%CE%B9%CE%B6%CE%AD%CE%BB%CE%BF%CF%85%20205%2C%20%CE%93%CE%AC%CE%B6%CE%B9%20714%2014',
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
    facebook: 'https://www.facebook.com/profile.php?id=61585943139657',
    instagram: 'https://www.instagram.com/diatyposi',
  },
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
    pageImage: 'dora-02.jpg',
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
          'Κούπες και υφασμάτινη τσάντα με το λογότυπο ενός φούρνου και δύο κόκκινα στυλό, σε ξύλινο τραπέζι στο φως του πρωινού',
        pageImageAlt:
          'Κούπα τυπωμένη με παιδική ζωγραφιά, δώρο γιορτής, με κάρτα «ΧΡΟΝΙΑ ΠΟΛΛΑ», κουλουράκια και ελληνικό καφέ',
      },
    },
  },
  {
    slug: 'mplouzakia-rouxismos',
    icon: 'shirt',
    image: 'rouxismos-01.jpg',
    pageImage: 'rouxismos-02.jpg',
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
          'Μπλε μπλουζάκια και ποδιά με τυπωμένο λογότυπο ψαριού σε κρεμάστρα και καρέκλα, με το λιμάνι στο βάθος',
        pageImageAlt:
          'Πράσινα μπλουζάκια ποδοσφαιρικής ομάδας με τυπωμένο σήμα, απλωμένα σε πάγκο γηπέδου',
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
    pageImage: '3d-ektyposeis-02.jpg',
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
        imageAlt: 'Το ακροφύσιο ενός 3D εκτυπωτή τυπώνει πορτοκαλί ανταλλακτικό, σε κοντινό πλάνο',
        pageImageAlt:
          'Μακέτα πολυκατοικίας, ανταλλακτικό κουμπί, γρανάζι, καραβάκι και κουπάτ σε σχήμα χταποδιού, τυπωμένα σε 3D εκτυπωτή',
      },
    },
  },
  {
    slug: 'grafistikos-sxediasmos',
    icon: 'design',
    image: 'grafistiko-01.jpg',
    pageImage: 'grafistiko-02.jpg',
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
          'Δοκιμαστικές ετικέτες για τσίπουρο τυλιγμένες σε τρία μπουκάλια, πάνω στα σκίτσα του σήματος',
        pageImageAlt:
          'Τρεις τυπωμένες προτάσεις λογοτύπου με μέλισσα και δείγματα χρωμάτων σε μαρμάρινο τραπέζι καφετέριας',
      },
    },
  },
  {
    slug: 'banners-afises-mousamades',
    icon: 'banner',
    image: 'banners-01.jpg',
    pageImage: 'banners-02.jpg',
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
          'Κίτρινος μουσαμάς «ΓΥΜΝΑΣΤΗΡΙΟ» δεμένος στο κάγκελο μπαλκονιού μιας πολυκατοικίας',
        pageImageAlt:
          'Roll-up banner με αμπελώνα και σήμα σταφυλιού σε πλατεία χωριού, δίπλα σε κιβώτιο με κρασιά',
      },
    },
  },
  {
    slug: 'epigrafes-aftokollita-vitrines',
    icon: 'sign',
    image: 'epigrafes-01.jpg',
    pageImage: 'epigrafes-02.jpg',
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
        imageAlt: 'Πράσινη επιγραφή «ΚΟΥΡΕΙΟ» και αυτοκόλλητο ψαλίδι στη βιτρίνα ενός κουρείου',
        pageImageAlt:
          'Φρεσκοκολλημένα γράμματα «ΥΔΡΑΥΛΙΚΟΣ» στην πόρτα λευκού βαν, με τη μεμβράνη ακόμα στη μία γωνία',
      },
    },
  },
  {
    slug: 'social-media',
    icon: 'social',
    image: 'social-01.jpg',
    pageImage: 'social-02.jpg',
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
          'Κινητό σε βάση δείχνει φωτογραφία μπουγάτσας δίπλα στο πραγματικό πιάτο, σε μαρμάρινο πάγκο',
        pageImageAlt:
          'Σχέδια αναρτήσεων για φούρνο στην οθόνη ενός κινητού και σε τυπωμένα καρτελάκια, σε μαρμάρινο τραπέζι',
      },
    },
  },
  {
    slug: 'psifiakes-offset-ektyposeis',
    icon: 'press',
    image: 'ektyposeis-01.jpg',
    pageImage: 'ektyposeis-03.jpg',
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
          'Κύλινδροι μηχανής όφσετ με κυανό, ματζέντα και κίτρινο μελάνι και ανοιχτό κουτί μελανιού με σπάτουλα',
        pageImageAlt:
          'Φρεσκοτυπωμένα φυλλάδια συναυλίας με ένα μπουζούκι στη σκηνή, δίπλα σε δείγματα χαρτιού',
      },
    },
  },
  {
    slug: 'kartes-fylladia-entypa',
    icon: 'cards',
    image: 'kartes-01.jpg',
    pageImage: 'kartes-02.jpg',
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
        imageAlt: 'Επαγγελματικές κάρτες «ΣΥΝΕΡΓΕΙΟ» με κλειδιά αυτοκινήτου σε μεταλλικό γραφείο',
        pageImageAlt: 'Δύο τυπωμένοι κατάλογοι «ΜΕΝΟΥ» σε τραπέζι ταβέρνας με ψωμί και καράφα νερό',
      },
    },
  },
  {
    slug: 'prosklitiria-kartes',
    icon: 'invite',
    image: 'prosklitiria-01.jpg',
    pageImage: 'prosklitiria-02.jpg',
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
          'Προσκλητήρια γάμου με φακέλους, κορδέλα και λευκά λουλούδια σε λινό τραπεζομάντιλο',
        pageImageAlt: 'Καρτελάκι «ΒΑΠΤΙΣΗ» με καραβάκι, μενού και μπομπονιέρα σε τραπέζι δεξίωσης',
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
        title: 'Επαγγελματικές κάρτες',
        alt: 'Επαγγελματικές κάρτες «ΣΥΝΕΡΓΕΙΟ» με κλειδιά αυτοκινήτου σε μεταλλικό γραφείο',
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
        title: 'Μουσαμάς σε πρόσοψη',
        alt: 'Κίτρινος μουσαμάς «ΓΥΜΝΑΣΤΗΡΙΟ» δεμένος στο κάγκελο μπαλκονιού μιας πολυκατοικίας',
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
        title: 'Μπλουζάκια και ποδιές ταβέρνας',
        alt: 'Μπλε μπλουζάκια και ποδιά με τυπωμένο λογότυπο ψαριού σε κρεμάστρα και καρέκλα, με το λιμάνι στο βάθος',
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
        title: 'Προσκλητήρια γάμου',
        alt: 'Προσκλητήρια γάμου με φακέλους, κορδέλα και λευκά λουλούδια σε λινό τραπεζομάντιλο',
      },
    },
  },
  {
    image: 'grafistiko-01.jpg',
    service: 'grafistikos-sxediasmos',
    standIn: true,
    text: {
      el: {
        title: 'Σχεδιασμός ετικέτας',
        alt: 'Δοκιμαστικές ετικέτες για τσίπουρο τυλιγμένες σε τρία μπουκάλια, πάνω στα σκίτσα του σήματος',
      },
    },
  },
  {
    image: 'grafistiko-02.jpg',
    service: 'grafistikos-sxediasmos',
    standIn: true,
    text: {
      el: {
        title: 'Προτάσεις λογοτύπου',
        alt: 'Τρεις τυπωμένες προτάσεις λογοτύπου με μέλισσα και δείγματα χρωμάτων σε μαρμάρινο τραπέζι καφετέριας',
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
        alt: 'Κύλινδροι μηχανής όφσετ με κυανό, ματζέντα και κίτρινο μελάνι και ανοιχτό κουτί μελανιού με σπάτουλα',
      },
    },
  },
  {
    image: 'ektyposeis-03.jpg',
    service: 'psifiakes-offset-ektyposeis',
    standIn: true,
    text: {
      el: {
        title: 'Ψηφιακή εκτύπωση φυλλαδίων',
        alt: 'Φρεσκοτυπωμένα φυλλάδια συναυλίας με ένα μπουζούκι στη σκηνή, δίπλα σε δείγματα χαρτιού',
      },
    },
  },
  {
    image: 'ektyposeis-02.jpg',
    service: 'psifiakes-offset-ektyposeis',
    standIn: true,
    text: {
      el: {
        title: 'Εκτύπωση μεγάλου φορμά',
        alt: 'Αφίσα με ψαροκάικο σε τιρκουάζ νερά βγαίνει από εκτυπωτή μεγάλου φορμά',
      },
    },
  },
  {
    image: 'kartes-02.jpg',
    service: 'kartes-fylladia-entypa',
    standIn: true,
    text: {
      el: {
        title: 'Κατάλογοι ταβέρνας',
        alt: 'Δύο τυπωμένοι κατάλογοι «ΜΕΝΟΥ» σε τραπέζι ταβέρνας με ψωμί και καράφα νερό',
      },
    },
  },
  {
    image: 'entypa-01.jpg',
    service: 'kartes-fylladia-entypa',
    standIn: true,
    text: {
      el: {
        title: 'Φυλλάδια',
        alt: 'Στοίβα φυλλάδια σχολής χορού «ΧΟΡΟΣ» με παραδοσιακά παπούτσια χορού, σε μαρμάρινο τραπέζι καφετέριας',
      },
    },
  },
  {
    image: 'epigrafes-01.jpg',
    service: 'epigrafes-aftokollita-vitrines',
    standIn: true,
    text: {
      el: {
        title: 'Επιγραφή και βιτρίνα',
        alt: 'Πράσινη επιγραφή «ΚΟΥΡΕΙΟ» και αυτοκόλλητο ψαλίδι στη βιτρίνα ενός κουρείου',
      },
    },
  },
  {
    image: 'epigrafes-02.jpg',
    service: 'epigrafes-aftokollita-vitrines',
    standIn: true,
    text: {
      el: {
        title: 'Αυτοκόλλητα οχήματος',
        alt: 'Φρεσκοκολλημένα γράμματα «ΥΔΡΑΥΛΙΚΟΣ» στην πόρτα λευκού βαν, με τη μεμβράνη ακόμα στη μία γωνία',
      },
    },
  },
  {
    image: 'aftokollita-01.jpg',
    service: 'epigrafes-aftokollita-vitrines',
    standIn: true,
    text: {
      el: {
        title: 'Ετικέτες προϊόντων',
        alt: 'Βάζα με θυμαρίσιο μέλι και τυπωμένες ετικέτες «ΜΕΛΙ», με ρολό ετικετών και κυψέλες στο βάθος',
      },
    },
  },
  {
    image: 'banners-02.jpg',
    service: 'banners-afises-mousamades',
    standIn: true,
    text: {
      el: {
        title: 'Roll-up banner',
        alt: 'Roll-up banner με αμπελώνα και σήμα σταφυλιού σε πλατεία χωριού, δίπλα σε κιβώτιο με κρασιά',
      },
    },
  },
  {
    image: 'rouxismos-02.jpg',
    service: 'mplouzakia-rouxismos',
    standIn: true,
    text: {
      el: {
        title: 'Μπλουζάκια ομάδας',
        alt: 'Πράσινα μπλουζάκια ποδοσφαιρικής ομάδας με τυπωμένο σήμα, απλωμένα σε πάγκο γηπέδου',
      },
    },
  },
  {
    image: 'prosklitiria-02.jpg',
    service: 'prosklitiria-kartes',
    standIn: true,
    text: {
      el: {
        title: 'Καρτελάκια βάπτισης',
        alt: 'Καρτελάκι «ΒΑΠΤΙΣΗ» με καραβάκι, μενού και μπομπονιέρα σε τραπέζι δεξίωσης',
      },
    },
  },
  {
    image: 'dora-01.jpg',
    service: 'diafimistika-dora',
    standIn: true,
    text: {
      el: {
        title: 'Διαφημιστικά δώρα φούρνου',
        alt: 'Κούπες και υφασμάτινη τσάντα με το λογότυπο ενός φούρνου και δύο κόκκινα στυλό, σε ξύλινο τραπέζι στο φως του πρωινού',
      },
    },
  },
  {
    image: 'dora-02.jpg',
    service: 'diafimistika-dora',
    standIn: true,
    text: {
      el: {
        title: 'Προσωποποιημένη κούπα',
        alt: 'Κούπα τυπωμένη με παιδική ζωγραφιά, δώρο γιορτής, με κάρτα «ΧΡΟΝΙΑ ΠΟΛΛΑ», κουλουράκια και ελληνικό καφέ',
      },
    },
  },
  {
    image: 'social-01.jpg',
    service: 'social-media',
    standIn: true,
    text: {
      el: {
        title: 'Υλικό για social media',
        alt: 'Κινητό σε βάση δείχνει φωτογραφία μπουγάτσας δίπλα στο πραγματικό πιάτο, σε μαρμάρινο πάγκο',
      },
    },
  },
  {
    image: 'social-02.jpg',
    service: 'social-media',
    standIn: true,
    text: {
      el: {
        title: 'Αναρτήσεις και stories',
        alt: 'Σχέδια αναρτήσεων για φούρνο στην οθόνη ενός κινητού και σε τυπωμένα καρτελάκια, σε μαρμάρινο τραπέζι',
      },
    },
  },
  {
    image: '3d-ektyposeis-01.jpg',
    service: '3d-ektyposeis',
    standIn: true,
    text: {
      el: {
        title: '3D εκτύπωση εξαρτήματος',
        alt: 'Το ακροφύσιο ενός 3D εκτυπωτή τυπώνει πορτοκαλί ανταλλακτικό, σε κοντινό πλάνο',
      },
    },
  },
  {
    image: '3d-ektyposeis-02.jpg',
    service: '3d-ektyposeis',
    standIn: true,
    text: {
      el: {
        title: 'Αντικείμενα από 3D εκτυπωτή',
        alt: 'Μακέτα πολυκατοικίας, ανταλλακτικό κουμπί, γρανάζι, καραβάκι και κουπάτ σε σχήμα χταποδιού, τυπωμένα σε 3D εκτυπωτή',
      },
    },
  },
];
