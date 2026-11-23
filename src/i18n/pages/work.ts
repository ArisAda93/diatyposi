/**
 * Strings for /erga/ (gallery, filter and lightbox). Item titles and alt texts live in
 * src/data/site.ts; everything here is new copy for the owner's review (CONTENT_REVIEW.md).
 * `{n}`, `{total}` and `{title}` are filled in by the page.
 */
export const workText = {
  el: {
    metaTitle: 'Έργα: κάρτες, επιγραφές, στάμπες & έντυπα',
    metaDescription:
      'Τα είδη εργασιών της ΔΙΑΤΥΠΩΣΗΣ: λογότυπα, κάρτες, φυλλάδια, αφίσες, επιγραφές, αυτοκόλλητα, ρουχισμός και διαφημιστικά δώρα. Δείτε τα και ρωτήστε μας.',
    headerLabel: 'Έργα',
    headerTitle: 'Τι μπορούμε να φτιάξουμε για εσάς',
    headerIntro:
      'Μια ματιά στα είδη εργασιών που αναλαμβάνουμε, από την κάρτα μέχρι την επιγραφή. Πατήστε σε μια εικόνα για να τη δείτε μεγαλύτερη.',
    /** Shown under the intro only while at least one image is a stand-in. */
    standInNote:
      'Όπου βλέπετε την ένδειξη «Ενδεικτική εικόνα», η φωτογραφία δείχνει το είδος της εργασίας και όχι κάποια δική μας δουλειά.',
    /** Accessible name of the filter button group. */
    filterGroupLabel: 'Φιλτράρισμα έργων ανά κατηγορία',
    filterAll: 'Όλα',
    /** Live count after filtering: singular and plural. */
    countOne: 'Εμφανίζεται {n} έργο',
    countOther: 'Εμφανίζονται {n} έργα',
    /** Extra description read on each tile. */
    tileOpenHint: 'Άνοιγμα σε μεγέθυνση',
    lightboxClose: 'Κλείσιμο',
    lightboxPrevious: 'Προηγούμενο έργο',
    lightboxNext: 'Επόμενο έργο',
    /** Visible position in the lightbox, e.g. “3 / 12”. */
    lightboxCounter: '{n} / {total}',
    /** Announced to screen readers when moving to another item in the lightbox. */
    lightboxPositionStatus: '{title}, {n} από {total}',
  },
} as const;
