/**
 * Strings for the home page (/) and the shared contact band (ContactBand.astro, also used on
 * /etaireia/). The headline, intro, services heading, “Για εμάς…” paragraph, values and closing
 * line are the owner's wording (src/data/site.ts, ownerCopy); everything here is new copy for the
 * owner's review (CONTENT_REVIEW.md). Labels are written in sentence case and shown in accent-free
 * capitals with capsEl().
 */
export const homeText = {
  el: {
    metaDescription:
      'ΔΙΑΤΥΠΩΣΗ, διαφήμιση και εκτυπώσεις: σχεδιάζουμε και τυπώνουμε λογότυπα, κάρτες, έντυπα, banners, επιγραφές, ρουχισμό και διαφημιστικά δώρα για επαγγελματίες και ιδιώτες.',

    intro: {
      /** Label-style heading of the intro section (shown in capitals). */
      label: 'Ποιοι είμαστε',
      aboutLink: 'Γνωρίστε μας',
    },

    services: {
      /** Small label above the owner's “Οι υπηρεσίες μας:” heading (shown in capitals). */
      label: 'Τι κάνουμε',
      allLink: 'Δείτε όλες τις υπηρεσίες',
    },

    process: {
      /** Small label above the process heading (shown in capitals). */
      label: 'Πώς δουλεύουμε',
      heading: 'Η ιδέα σας, βήμα βήμα',
      intro: 'Κάθε δουλειά περνά από τέσσερα βήματα, και σε καθένα αποφασίζουμε μαζί.',
      /** Step titles are given by the brief; the texts are new copy. */
      steps: [
        {
          title: 'Ιδέα',
          text: 'Μας λέτε τι έχετε στο μυαλό σας, ακόμη κι αν είναι μόνο μια σκέψη. Συζητάμε μαζί τι χρειάζεστε και πού θα το χρησιμοποιήσετε.',
        },
        {
          title: 'Σχεδιασμός',
          text: 'Δίνουμε μορφή στην ιδέα και επιλέγουμε μαζί χρώματα, χαρτί και διαστάσεις, ώστε το αποτέλεσμα να σας ταιριάζει.',
        },
        {
          title: 'Δοκίμιο & έγκριση',
          text: 'Βλέπετε το δοκίμιο πριν από την εκτύπωση. Διορθώνουμε ό,τι χρειάζεται και προχωράμε όταν είστε σίγουροι.',
        },
        {
          title: 'Εκτύπωση & παράδοση',
          text: 'Τυπώνουμε με προσοχή στο χρώμα και στο φινίρισμα, και σας παραδίδουμε τη δουλειά έτοιμη για χρήση.',
        },
      ],
      /** Poster print line (shown in capitals; τετραχρωμία = four-colour print). */
      posterKicker: 'Τετραχρωμία · C M Y K',
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
