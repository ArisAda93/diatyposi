/**
 * Strings for the home page (/) and the shared contact band (ContactBand.astro, also used on
 * /etaireia/). The headline, intro, services heading, “Για εμάς…” paragraph, values and closing
 * line are the owner's wording (src/data/site.ts, ownerCopy); everything here is new copy for the
 * owner's review (CONTENT_REVIEW.md). Labels are written in sentence case and shown in accent-free
 * capitals with capsEl().
 */
export const homeText = {
  el: {
    /**
     * <title> text before the optional city (`withLocality`, e.g. " στην Αθήνα") and before
     * " | ΔΙΑΤΥΠΩΣΗ". Leads with what the owner calls the shop, «διαφημιστικό γραφείο»
     * (docs/SEO.md §3.3).
     */
    metaTitle: 'Διαφημιστικό γραφείο & εκτυπώσεις',
    metaDescription:
      'Διαφημιστικό γραφείο ΔΙΑΤΥΠΩΣΗ: ψηφιακές και offset εκτυπώσεις, κάρτες, banners, επιγραφές, στάμπες σε μπλουζάκια και διαφημιστικά δώρα. Ζητήστε προσφορά.',

    services: {
      /** Small label above the owner's “Οι υπηρεσίες μας:” heading (shown in capitals). */
      label: 'Τι κάνουμε',
      allLink: 'Δείτε όλες τις υπηρεσίες',
    },

    /**
     * “Μία ιδέα. Παντού.” (IdeaJourney.astro): one sample mark travels from a sketch to every
     * product. All of it is new copy for the owner's review. Step keys match JOURNEY_STEPS in
     * src/scripts/idea-journey.ts; chooser option keys are service slugs (src/data/site.ts).
     */
    journey: {
      /** Small label above the heading (shown in capitals). */
      label: 'Από την ιδέα στο αποτέλεσμα',
      heading: 'Μία ιδέα. Παντού όπου σας βλέπουν.',
      lead: 'Σχεδιάζουμε το σήμα σας και το τυπώνουμε σε ό,τι χρειάζεστε, από την κάρτα στην τσέπη ως τη βιτρίνα στον δρόμο. Ένας συνεργάτης, η ίδια εικόνα παντού.',
      /** Wordmark of the sample brand in the illustrations, so visitors picture their own name. */
      sampleName: 'Η επωνυμία σας',
      /** Switch on the stage (pointer only): show the shown step as its sketch or as the product. */
      view: { sketch: 'Σκίτσο', product: 'Προϊόν' },
      steps: {
        idea: {
          title: 'Η ιδέα σας',
          text: 'Ξεκινάμε από αυτό που έχετε στο μυαλό σας: ένα πρόχειρο σκίτσο, μια φωτογραφία ή απλώς μια κουβέντα.',
        },
        mark: {
          title: 'Γίνεται σήμα',
          text: 'Το δουλεύουμε μαζί σας μέχρι να γίνει ένα καθαρό σήμα που νιώθετε δικό σας, έτοιμο για χαρτί, ύφασμα και οθόνη.',
        },
        card: {
          title: 'Στην κάρτα σας',
          text: 'Η κάρτα που δίνετε στη χειραψία, το φυλλάδιο, ο κατάλογος, όλα τυπωμένα στο χαρτί που τους ταιριάζει.',
        },
        shirt: {
          title: 'Πάνω στην ομάδα σας',
          text: 'Μπλουζάκια και ρούχα εργασίας με το σήμα σας, ώστε η ομάδα σας να ξεχωρίζει όπου κι αν βρίσκεται.',
        },
        sign: {
          title: 'Στη βιτρίνα σας',
          text: 'Η επιγραφή και η βιτρίνα λένε ποιοι είστε σε όποιον περνά από τον δρόμο, πριν ακόμη μπει μέσα.',
        },
        gift: {
          title: 'Στα χέρια των πελατών σας',
          text: 'Μια κούπα ή ένα σημειωματάριο με το σήμα σας κρατά το όνομά σας στο γραφείο τους, κάθε μέρα.',
        },
        social: {
          title: 'Στην οθόνη τους',
          text: 'Αναρτήσεις και stories με την ίδια εικόνα, για να σας αναγνωρίζουν αμέσως και στο κινητό.',
        },
      },
      chooser: {
        heading: 'Τι θα θέλατε να φτιάξουμε;',
        /** Shown only with JS, next to the toggle chips. */
        hint: 'Σημειώστε ό,τι σας ενδιαφέρει. Θα το βρείτε ήδη επιλεγμένο στη φόρμα προσφοράς.',
        /** Chip labels, keyed by service slug. */
        options: {
          'grafistikos-sxediasmos': 'Λογότυπο',
          'kartes-fylladia-entypa': 'Κάρτες & έντυπα',
          'mplouzakia-rouxismos': 'Μπλουζάκια & ρουχισμός',
          'epigrafes-aftokollita-vitrines': 'Επιγραφή & βιτρίνα',
          'diafimistika-dora': 'Διαφημιστικά δώρα',
          'social-media': 'Αναρτήσεις για social media',
        },
        /** Button label by number of chips pressed; {count} is replaced by the number. */
        cta: {
          none: 'Ζητήστε προσφορά',
          one: 'Ζητήστε προσφορά για 1 επιλογή',
          many: 'Ζητήστε προσφορά για {count} επιλογές',
        },
        /** Announced politely to screen readers after each chip press. */
        status: {
          none: 'Δεν έχετε σημειώσει κάτι ακόμη.',
          one: 'Σημειώσατε 1 επιλογή.',
          many: 'Σημειώσατε {count} επιλογές.',
        },
      },
      /** Three modest promises beside the button (no numbers or years). */
      promises: [
        'Σχεδιασμός και εκτύπωση στο ίδιο μέρος, χωρίς να τρέχετε αλλού.',
        'Βλέπετε δοκίμιο και εγκρίνετε πριν τυπωθεί οτιδήποτε.',
        'Προσωπική εξυπηρέτηση, από την πρώτη ιδέα ως την παράδοση.',
      ],
    },

    work: {
      /** Small label above the work heading (shown in capitals). */
      label: 'Έργα',
      heading: 'Δείγματα δουλειάς',
      allLink: 'Δείτε όλα τα έργα',
    },

    values: {
      /** Label-style heading of the values strip (shown in capitals). */
      label: 'Οι αξίες μας',
    },

    contactBand: {
      /** Small label above the contact band heading (shown in capitals). */
      label: 'Επικοινωνία',
      heading: 'Έχετε μια ιδέα; Ας της δώσουμε μορφή.',
      text: 'Πείτε μας τι χρειάζεστε και θα σας προτείνουμε τη λύση που σας ταιριάζει, με μια προσφορά στα μέτρα σας.',
    },
  },
} as const;
