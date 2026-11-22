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
  /** Latin, Greek-friendly slug used as the anchor on /ypiresies/ and as the form value. */
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
  descriptor: { el: 'Διαφήμιση – Εκτυπώσεις' } satisfies Localized<string>,
  descriptorCaps: { el: 'ΔΙΑΦΗΜΙΣΗ – ΕΚΤΥΠΩΣΕΙΣ' } satisfies Localized<string>,
  tagline: {
    el: 'Πάνω από προϊόντα, χτίζουμε σχέσεις εμπιστοσύνης.',
  } satisfies Localized<string>,

  /** Set to false once every TODO(owner) contact value below is real. */
  contactIsPlaceholder: true,

  contact: {
    // TODO(owner): landline, international format without spaces.
    phone: '+302100000000',
    phoneDisplay: '210 000 0000',
    // TODO(owner): mobile, international format without spaces.
    mobile: '+306900000000',
    mobileDisplay: '690 000 0000',
    // TODO(owner): public e-mail address.
    email: 'info@diatyposi.example',
    // TODO(owner): Viber number (international, no spaces, no +).
    viber: '306900000000',
    // TODO(owner): WhatsApp number (international, no spaces, no +).
    whatsapp: '306900000000',
  },

  address: {
    // TODO(owner): street and number.
    street: 'Οδός Παραδείγματος 1',
    // TODO(owner): city or town.
    city: 'Πόλη',
    // TODO(owner): postcode.
    postalCode: '00000',
    region: 'Ελλάδα',
    country: 'GR',
    /** Text used for the click-to-load Google map. TODO(owner): check it finds the shop. */
    mapQuery: 'ΔΙΑΤΥΠΩΣΗ Διαφήμιση Εκτυπώσεις',
    // TODO(owner): shop coordinates (decimal degrees). Used for JSON-LD only.
    geo: { lat: 0, lng: 0 },
  },

  // TODO(owner): real opening hours.
  hours: [
    {
      days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      label: { el: 'Δευτέρα – Παρασκευή' },
      ranges: [{ opens: 'ΧΧ:ΧΧ', closes: 'ΧΧ:ΧΧ' }],
    },
    {
      days: ['Saturday'],
      label: { el: 'Σάββατο' },
      ranges: [{ opens: 'ΧΧ:ΧΧ', closes: 'ΧΧ:ΧΧ' }],
    },
    {
      days: ['Sunday'],
      label: { el: 'Κυριακή' },
      ranges: [{ opens: 'ΧΧ:ΧΧ', closes: 'ΧΧ:ΧΧ' }],
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

export const nav: NavItem[] = [
  { href: '/', label: { el: 'Αρχική' } },
  { href: '/ypiresies/', label: { el: 'Υπηρεσίες' } },
  { href: '/erga/', label: { el: 'Έργα' } },
  { href: '/etaireia/', label: { el: 'Η εταιρεία' } },
  { href: '/epikoinonia/', label: { el: 'Επικοινωνία' } },
];

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
        imageAlt: 'Δύο απλές κεραμικές κούπες σε ξύλινο δίσκο',
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
        imageAlt: 'Μεταξοτυπία: χέρια περνούν τη ράκλα πάνω από το τελάρο με χρώματα',
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
        imageAlt: 'Χέρια σχεδιάζουν με μολύβι προσχέδια λογοτύπου σε ξύλινο γραφείο',
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
        imageAlt: 'Μεγάλο λευκό πανό σε τοίχο από τούβλα',
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
        imageAlt: 'Χέρια με γάντια τοποθετούν λευκό βινύλιο σε καπό αυτοκινήτου',
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
        imageAlt: 'Σχεδιασμός ανάρτησης για τα social media σε φορητό υπολογιστή',
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
        imageAlt: 'Μηχανή όφσετ με στοίβα από τυπωμένα φύλλα',
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
        imageAlt: 'Στοίβα από λευκές επαγγελματικές κάρτες σε παστέλ φόντο',
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
        imageAlt: 'Σετ προσκλητηρίων γάμου με φάκελο, κορδέλα και αποξηραμένα στάχυα',
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
        alt: 'Στοίβα από λευκές επαγγελματικές κάρτες σε παστέλ φόντο',
      },
    },
  },
  {
    image: 'banners-01.jpg',
    service: 'banners-afises-mousamades',
    standIn: true,
    featured: true,
    text: { el: { title: 'Πανό μεγάλου μεγέθους', alt: 'Μεγάλο λευκό πανό σε τοίχο από τούβλα' } },
  },
  {
    image: 'rouxismos-01.jpg',
    service: 'mplouzakia-rouxismos',
    standIn: true,
    featured: true,
    text: {
      el: {
        title: 'Μεταξοτυπία',
        alt: 'Χέρια περνούν τη ράκλα πάνω από τελάρο μεταξοτυπίας με χρώματα',
      },
    },
  },
  {
    image: 'prosklitiria-01.jpg',
    service: 'prosklitiria-kartes',
    standIn: true,
    featured: true,
    text: {
      el: { title: 'Προσκλητήρια γάμου', alt: 'Σετ προσκλητηρίων γάμου με φάκελο και κορδέλα' },
    },
  },
  {
    image: 'grafistiko-01.jpg',
    service: 'grafistikos-sxediasmos',
    standIn: true,
    text: { el: { title: 'Σχεδιασμός λογοτύπου', alt: 'Προσχέδια λογοτύπου με μολύβι σε χαρτί' } },
  },
  {
    image: 'ektyposeis-01.jpg',
    service: 'psifiakes-offset-ektyposeis',
    standIn: true,
    text: { el: { title: 'Offset εκτύπωση', alt: 'Μηχανή όφσετ με στοίβα από τυπωμένα φύλλα' } },
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
      el: { title: 'Επικάλυψη με βινύλιο', alt: 'Τοποθέτηση λευκού βινυλίου σε καπό αυτοκινήτου' },
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
    text: { el: { title: 'Κούπες', alt: 'Δύο απλές κεραμικές κούπες σε ξύλινο δίσκο' } },
  },
  {
    image: 'social-01.jpg',
    service: 'social-media',
    standIn: true,
    text: {
      el: { title: 'Υλικό για social media', alt: 'Σχεδιασμός ανάρτησης σε φορητό υπολογιστή' },
    },
  },
];
