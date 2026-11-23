/**
 * Strings for /etaireia/. The intro, the “Για εμάς…” paragraph and the four values are the
 * owner's wording (src/data/site.ts, ownerCopy); everything here is new copy for the owner's
 * review (CONTENT_REVIEW.md).
 */
export const aboutText = {
  el: {
    metaTitle: 'Η εταιρεία: διαφήμιση & εκτυπώσεις',
    metaDescription:
      'Η ΔΙΑΤΥΠΩΣΗ δίνει μορφή στις ιδέες σας με λύσεις διαφήμισης, εκτύπωσης και προβολής, με ποιότητα, συνέπεια και προσωπική εξυπηρέτηση. Γνωρίστε μας.',
    headerLabel: 'Η εταιρεία',
    headerTitle: 'Από την ιδέα στο χαρτί, μαζί σας',
    /** Label-style heading above the “Για εμάς…” paragraph (shown in capitals). */
    approachHeading: 'Πώς δουλεύουμε',
    /** Small label above the values heading (shown in capitals). */
    valuesLabel: 'Οι αξίες μας',
    valuesTitle: 'Ό,τι μας καθοδηγεί σε κάθε δουλειά',
    /** One line under each of the owner's four values, keyed by the value as written. */
    valueNotes: {
      Ποιότητα:
        'Προσέχουμε το χαρτί, το χρώμα και κάθε λεπτομέρεια, ώστε το αποτέλεσμα να σας εκπροσωπεί σωστά.',
      Συνέπεια: 'Τηρούμε ό,τι συμφωνούμε μαζί σας, από την πρώτη κουβέντα μέχρι την παράδοση.',
      Δημιουργικότητα: 'Αναζητούμε την ιδέα που θα κάνει τη δική σας δουλειά να ξεχωρίζει.',
      'Προσωπική εξυπηρέτηση':
        'Σας ακούμε και σας συμβουλεύουμε σε κάθε βήμα, για κάθε δουλειά, μικρή ή μεγάλη.',
    },
  },
} as const;
