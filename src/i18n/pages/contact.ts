/**
 * Strings for the contact page (/epikoinonia/), the quote form, its "ready" panel and the
 * composed message. New copy, not the owner's wording: listed in CONTENT_REVIEW.md for review.
 *
 * No imports on purpose: src/lib/quote.ts reads this file and is unit-tested without the `~` alias.
 */
export const contactText = {
  el: {
    meta: {
      title: 'Επικοινωνία & προσφορά για εκτυπώσεις',
      description:
        'Τηλέφωνο, email, Viber, WhatsApp, διεύθυνση και ωράριο της ΔΙΑΤΥΠΩΣΗΣ. Πείτε μας τι χρειάζεστε από τη φόρμα και ζητήστε προσφορά για τη δουλειά σας.',
    },
    header: {
      label: 'Επικοινωνία',
      title: 'Επικοινωνία και αίτημα προσφοράς',
      intro:
        'Πείτε μας τι έχετε στο μυαλό σας. Συμπληρώστε τη φόρμα και στείλτε μας το αίτημα με το email, το Viber ή το WhatsApp σας. Μπορείτε επίσης να μας τηλεφωνήσετε ή να περάσετε από το κατάστημα.',
    },
    details: {
      heading: 'Στοιχεία επικοινωνίας',
      quickHeading: 'Γρήγορο μήνυμα',
      viber: 'Μήνυμα στο Viber',
      whatsapp: 'Μήνυμα στο WhatsApp',
    },
    map: {
      heading: 'Πού θα μας βρείτε',
      iframeTitle: 'Χάρτης Google με τη θέση της ΔΙΑΤΥΠΩΣΗΣ',
      open: 'Άνοιγμα στους Χάρτες Google',
    },
    form: {
      ticket: 'Δελτίο προσφοράς',
      intro:
        'Πείτε μας τι χρειάζεστε. Η φόρμα ετοιμάζει το μήνυμα, εσείς το στέλνετε με την εφαρμογή σας και σας απαντάμε το συντομότερο.',
      requiredNote: 'Όλα τα πεδία χρειάζονται, εκτός από όσα γράφουν «προαιρετικό».',
      optional: '(προαιρετικό)',
      /** Headings of the form's two parts (numbered 01 and 02 on the ticket). */
      partContact: 'Τα στοιχεία σας',
      partJob: 'Η δουλειά',
      nameLabel: 'Το όνομά σας',
      phoneLabel: 'Τηλέφωνο',
      emailLabel: 'Email',
      servicesLegend: 'Τι σας ενδιαφέρει;',
      quantityLabel: 'Ποσότητα',
      dateLabel: 'Πότε το χρειάζεστε;',
      messageLabel: 'Περιγραφή',
      messageHint:
        'Πείτε μας για τη δουλειά: διαστάσεις, χρώματα, υλικό ή ό,τι άλλο έχετε σκεφτεί.',
      /** Label of the three send buttons (the visitor's own email, Viber or WhatsApp app). */
      sendLegend: 'Στείλτε το με:',
      sendEmail: 'Αποστολή με email',
      sendViber: 'Αποστολή με Viber',
      sendWhatsapp: 'Αποστολή με WhatsApp',
      noSend:
        'Ο ιστότοπος δεν στέλνει και δεν κρατάει τα στοιχεία σας: ανοίγει τη δική σας εφαρμογή με το μήνυμα έτοιμο και το στέλνετε εσείς.',
      privacyLink: 'Πολιτική απορρήτου',
      summaryTitle: 'Λείπουν ή χρειάζονται διόρθωση κάποια στοιχεία:',
      errorPrefix: 'Σφάλμα:',
      noJsTitle: 'Η φόρμα χρειάζεται JavaScript',
      noJsText:
        'Για να ετοιμάσει το μήνυμα, η φόρμα χρειάζεται JavaScript. Μέχρι τότε, μπορείτε να μας βρείτε απευθείας:',
    },
    errors: {
      nameRequired: 'Γράψτε το όνομά σας.',
      phoneRequired: 'Γράψτε ένα τηλέφωνο, για να σας καλέσουμε.',
      phoneInvalid:
        'Το τηλέφωνο δεν φαίνεται σωστό. Χρειάζονται 10 έως 15 ψηφία· μπορείτε να βάλετε κενά, παύλες, παρενθέσεις ή + στην αρχή.',
      emailInvalid: 'Το email δεν φαίνεται σωστό. Ελέγξτε το ή αφήστε το κενό.',
      dateInvalid: 'Η ημερομηνία δεν είναι έγκυρη.',
      datePast: 'Η ημερομηνία έχει περάσει. Διαλέξτε τη σημερινή ή μια μελλοντική ημερομηνία.',
      messageRequired: 'Γράψτε λίγα λόγια για τη δουλειά που χρειάζεστε.',
      messageShort: 'Γράψτε λίγο περισσότερα, τουλάχιστον 10 χαρακτήρες.',
    },
    result: {
      /** The message is composed and the visitor's chosen app is opening with it. */
      ready: {
        heading: 'Το μήνυμά σας είναι έτοιμο',
        text: 'Ανοίγει η εφαρμογή σας με το μήνυμα συμπληρωμένο. Για να μας έρθει, πατήστε «Αποστολή» εκεί.',
        files:
          'Έχετε λογότυπο, σκίτσο ή φωτογραφίες; Επισυνάψτε τα στο ίδιο μήνυμα πριν το στείλετε.',
        /** The fallback box: another app, or the text to copy (followed by the shop's email). */
        notOpenedHeading: 'Δεν άνοιξε η εφαρμογή;',
        notOpenedHint: 'Δοκιμάστε έναν άλλο τρόπο ή αντιγράψτε το κείμενο και στείλτε το εσείς στο',
        email: 'Αποστολή με email',
        viber: 'Αποστολή με Viber',
        whatsapp: 'Αποστολή με WhatsApp',
        /** Opens the copyable text (a disclosure under the send links). */
        previewSummary: 'Δείτε και αντιγράψτε το κείμενο',
        previewLabel: 'Το κείμενο του μηνύματος',
        previewHint:
          'Αν το κείμενο δεν εμφανιστεί στην εφαρμογή, αντιγράψτε το από εδώ και επικολλήστε το.',
        copy: 'Αντιγραφή κειμένου',
        copied: 'Το κείμενο αντιγράφηκε.',
        copyFallback:
          'Το κείμενο επιλέχθηκε. Αντιγράψτε το με Ctrl+C (Cmd+C σε Mac) ή, στο κινητό, με παρατεταμένο πάτημα.',
        /** Back to the form with everything kept. */
        edit: 'Πίσω στη φόρμα',
        /** Clears the form and brings it back. */
        again: 'Νέο αίτημα',
      },
    },
    message: {
      subject: 'Αίτημα προσφοράς',
      greeting: 'Γεια σας,',
      intro: 'θα ήθελα μια προσφορά για τα παρακάτω.',
      nameLabel: 'Όνομα',
      phoneLabel: 'Τηλέφωνο',
      emailLabel: 'Email',
      servicesLabel: 'Υπηρεσίες',
      quantityLabel: 'Ποσότητα',
      dateLabel: 'Επιθυμητή ημερομηνία',
      messageLabel: 'Περιγραφή',
    },
  },
} as const;
