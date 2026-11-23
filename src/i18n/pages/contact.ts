/**
 * Strings for the contact page (/epikoinonia/), the quote form, its result panels (sent, not
 * sent) and the composed message. New copy, not the owner's wording: listed in CONTENT_REVIEW.md
 * for review.
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
        'Πείτε μας τι έχετε στο μυαλό σας. Συμπληρώστε τη φόρμα και το αίτημά σας έρχεται αμέσως σε εμάς. Μπορείτε επίσης να μας τηλεφωνήσετε, να μας στείλετε μήνυμα ή να περάσετε από το κατάστημα.',
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
        'Πείτε μας τι χρειάζεστε. Με την αποστολή, το αίτημά σας έρχεται κατευθείαν στο email μας και σας απαντάμε το συντομότερο.',
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
      /** Label of the hidden anti-spam field (people never see it; a bot that fills it is ignored). */
      honeyLabel: 'Αφήστε αυτό το πεδίο κενό',
      submit: 'Αποστολή αιτήματος',
      /** The submit (and retry) button while the request is on its way. */
      sending: 'Αποστολή…',
      /** Announced to screen readers while the request is on its way. */
      sendingStatus: 'Το αίτημά σας στέλνεται. Περιμένετε λίγο.',
      noSend:
        'Με την αποστολή, τα στοιχεία σας έρχονται στο email μας μέσω της υπηρεσίας FormSubmit και τα χρησιμοποιούμε μόνο για να σας απαντήσουμε.',
      privacyLink: 'Πολιτική απορρήτου',
      summaryTitle: 'Λείπουν ή χρειάζονται διόρθωση κάποια στοιχεία:',
      errorPrefix: 'Σφάλμα:',
      noJsTitle: 'Η φόρμα χρειάζεται JavaScript',
      noJsText:
        'Για να στείλει το αίτημα, η φόρμα χρειάζεται JavaScript. Μέχρι τότε, μπορείτε να μας βρείτε απευθείας:',
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
      /** The request reached the shop. */
      success: {
        heading: 'Το μήνυμά σας στάλθηκε',
        text: 'Ευχαριστούμε! Λάβαμε το αίτημά σας και θα σας καλέσουμε ή θα σας απαντήσουμε σύντομα.',
        files: 'Έχετε λογότυπο, σκίτσο ή φωτογραφίες; Στείλτε τα μας με email, Viber ή WhatsApp.',
        /** Subject of the email (and first line of the chat) that carries the files. */
        filesSubject: 'Αρχεία για το αίτημα προσφοράς',
        again: 'Νέο αίτημα',
      },
      /** Sending failed: retry, or send the same text with the visitor's own app. */
      failure: {
        heading: 'Το μήνυμα δεν στάλθηκε',
        text: 'Λυπούμαστε, η αποστολή δεν ολοκληρώθηκε. Τα στοιχεία σας δεν χάθηκαν: δοκιμάστε ξανά ή στείλτε το ίδιο κείμενο με τη δική σας εφαρμογή.',
        retry: 'Δοκιμάστε ξανά',
        fallbackHeading: 'Ή στείλτε το με την εφαρμογή σας',
        fallbackHint:
          'Θα ανοίξει η εφαρμογή σας με το κείμενο συμπληρωμένο. Εκεί μπορείτε να επισυνάψετε και αρχεία.',
        email: 'Αποστολή με email',
        viber: 'Αποστολή με Viber',
        whatsapp: 'Αποστολή με WhatsApp',
        /** Opens the copyable text (a disclosure under the send buttons). */
        previewSummary: 'Δείτε και αντιγράψτε το κείμενο',
        previewLabel: 'Το κείμενο του μηνύματος',
        previewHint:
          'Αν το κείμενο δεν εμφανιστεί στην εφαρμογή, αντιγράψτε το από εδώ και επικολλήστε το.',
        copy: 'Αντιγραφή κειμένου',
        copied: 'Το κείμενο αντιγράφηκε.',
        copyFallback:
          'Το κείμενο επιλέχθηκε. Αντιγράψτε το με Ctrl+C (Cmd+C σε Mac) ή, στο κινητό, με παρατεταμένο πάτημα.',
        edit: 'Πίσω στη φόρμα',
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
