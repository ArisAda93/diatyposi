# SEO strategy for ΔΙΑΤΥΠΩΣΗ (Greek market)

Research date: 23 November 2026. Base reference: `12dfa94`. Written for the owner, the copywriters and whoever launches the site. English prose; Greek search terms are in Greek.

The shop's city is not known yet. Wherever this document writes **{Πόλη}** (nominative, e.g. Αθήνα) or **{στην Πόλη}** (locative with article, e.g. στην Αθήνα, see §3.1), put the real city or municipality in.

---

## 1. Summary of findings

- **Google is the whole market.** In 2026 Google holds about 95–96% of search in Greece; Bing is about 3% ([StatCounter, Greece](https://gs.statcounter.com/search-engine-market-share/all/greece)). Optimise for Google first; Bing Webmaster Tools is a 10-minute extra.
- **Local intent dominates this sector.** Google's own autocomplete in Greek (hl=el, gl=gr) completes almost every head term with a city or "κοντά μου": τυπογραφείο κοντά μου, τυπογραφείο θεσσαλονίκη, επιγραφές καταστημάτων περιστέρι, στάμπες σε μπλουζάκια αθήνα. The Google Business Profile (GBP) and the city on every page matter more than anything else on the site.
- **Accents, final sigma and Greeklish are handled by Google.** Accented and unaccented queries return the same suggestion sets, and Greeklish queries (typografeio, tipografio, ektyposeis) are completed with Greek-script suggestions. Write correct Greek with τόνοι; do not add accentless or Greeklish copies of keywords to visible text.
- **The brand name is a common Greek word.** "διατύπωση" means "wording, formulation", and "diatyposi" autocompletes to the English rhetoric term "diatyposis". Brand searches will be ambiguous unless the business appears as "Διατύπωση" + "εκτυπώσεις/διαφήμιση" + the city everywhere (GBP, directories, site name markup).
- **One page per service is the biggest on-site win.** Today one URL (/ypiresies/) has to rank for nine unrelated intents (μπλουζάκια, επιγραφές, προσκλητήρια, …). Separate pages with their own title, h1, copy and FAQ match how people search.
- **FAQ rich results are gone.** Google stopped showing FAQ rich results on 7 May 2026 ([Google FAQ documentation changelog](https://developers.google.com/search/docs/appearance/structured-data/faqpage)). Keep visible FAQs (they answer long-tail and AI Mode questions); FAQPage markup is optional and will not produce a rich result.
- **Volumes:** no reliable public monthly search volumes for Greek terms were obtained (no keyword-planner access; Google Trends not queried). Autocomplete presence is reported below as a qualitative signal only. Volumes: **not found**.

---

## 2. Greek search market facts that shape the site

| Fact                                                                                                                                                                                                                                                                                                              | Evidence                                                                                                                                                                                                                                                    | What it means for the site                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google ≈ 95.6%, Bing ≈ 3.0%, Yahoo ≈ 0.5%, DuckDuckGo ≈ 0.4% of search in Greece (Oct 2026). Bing is higher on desktop (≈ 5.8%, June 2026).                                                                                                                                                                       | [StatCounter monthly](https://gs.statcounter.com/search-engine-market-share/monthly/greece), [StatCounter desktop](https://gs.statcounter.com/search-engine-market-share/desktop/greece)                                                                    | Google Search Console + GBP are the priority. Add Bing Webmaster Tools by import (cheap).                                                                                                                  |
| Almost all Google traffic in Greece is recorded on google.com (≈ 94%), not google.gr (≈ 0.6%).                                                                                                                                                                                                                    | [StatCounter host share](https://gs.statcounter.com/search-engine-host-market-share/all/greece)                                                                                                                                                             | Track rankings by _location = Greece / the city_ and _language = el_, not by "google.gr".                                                                                                                  |
| Web page views in Greece: desktop ≈ 62%, mobile ≈ 38% (Sept 2026), with mobile rising through 2026.                                                                                                                                                                                                               | [StatCounter platform share](https://gs.statcounter.com/platform-market-share/desktop-mobile/greece)                                                                                                                                                        | Both matter. Google indexes the mobile version anyway; "κοντά μου" and Maps searches are mobile by nature, so tap-to-call, address and hours must stay one tap away on phones (they already are).          |
| Google AI Mode launched in Greece, in Greek, on 8 October 2025, with links to source pages.                                                                                                                                                                                                                       | [Google Greece blog](https://blog.google/intl/el-gr/etairika-nea/anazhthsh-google-google-search-paroysiash-ths-leitoyrgias-ai-mode-sthn-ellada/), [To Vima](https://www.tovima.com/society/googles-ai-mode-goes-live-in-greece-with-greek-language-support) | Clear, factual answers to real customer questions (the FAQ sections) are what AI answers quote. Whether AI Overviews specifically are live in Greek was not confirmed.                                     |
| Accents (τόνοι): autocomplete returns the same suggestions for τυπογραφείο / τυπογραφειο, επαγγελματικές κάρτες / επαγγελματικες καρτες; suggestions are shown mixed with and without τόνοι. Google's John Mueller: focus on the correct spelling, add the common variant only if the correct one is rarely used. | Autocomplete checks (this research, `suggestqueries.google.com`, hl=el, gl=gr, 23 Nov 2026); [Search Engine Roundtable, June 2021](https://www.seroundtable.com/google-seo-accented-characters-31666.html)                                                  | Write proper Greek with τόνοι in titles, h1 and copy. No accentless duplicates.                                                                                                                            |
| Final sigma (ς/σ): autocomplete normalises everything to σ in its suggestions (e.g. "επαγγελματικέσ κάρτεσ"), i.e. Google treats ς and σ as the same letter when matching.                                                                                                                                        | Autocomplete checks (as above)                                                                                                                                                                                                                              | Nothing to do; never write "σ" at word end in copy.                                                                                                                                                        |
| Greeklish: "typografeio", "tipografio" and "ektyposeis" autocomplete to Greek-script suggestions (τυπογραφειο κοντα μου, εκτυπωσεις …). Brand names in Latin script do get searched (e.g. "lazaridis ektyposeis", "maragos ektyposeis").                                                                          | Autocomplete checks (as above)                                                                                                                                                                                                                              | Google maps Greeklish generic terms to Greek; no Greeklish in visible copy. Do list the brand's Latin spellings (Diatyposi, Diatiposi) as `alternateName` and use them on social profiles' handles.        |
| Brand ambiguity: "διατυπωση" autocompletes to dictionary intents (συνώνυμο, αγγλικά, τι σημαίνει); "diatyposi" to "diatyposis meaning".                                                                                                                                                                           | Autocomplete checks (as above)                                                                                                                                                                                                                              | Pair the brand with the trade and the city everywhere: "Διατύπωση – Διαφήμιση & Εκτυπώσεις, {Πόλη}".                                                                                                       |
| URL slugs: Google recommends words in the audience's language in URLs "(and, if applicable, transliterated words)"; non-ASCII characters are percent-encoded (Greek slugs become long `%CE%…` strings when copied). Accents in URLs work, per Mueller.                                                            | [Google URL structure guide](https://developers.google.com/search/docs/crawling-indexing/url-structure), [SER 2019](https://www.seroundtable.com/google-accents-in-urls-seo-27314.html)                                                                     | Keep the Latin (Greeklish) slugs already in use (/ypiresies/, /ypiresies/kartes-fylladia-entypa/ …). They are allowed, readable when shared on Viber/WhatsApp, and changing them now would need redirects. |
| City searches are typed in the nominative, without a preposition: "τυπογραφειο αθηνα", "επιγραφες καταστηματων περιστερι", "σταμπες σε μπλουζακια νεα ερυθραια". Suburbs and municipalities appear as often as big cities (Καλλιθέα, Περιστέρι, Εύοσμος, Νέα Ερυθραία).                                           | Autocomplete checks (as above)                                                                                                                                                                                                                              | Use the natural locative in copy ("στην Αθήνα"); Google matches the inflected forms. Name the municipality/neighbourhood, not only the big city, on the contact page, in GBP and in the address.           |

### 2.1 How Greek people search this sector (autocomplete evidence)

Suggestions returned by Google autocomplete for Greek seeds (hl=el, gl=gr, 23 Nov 2026). They show that people search these phrasings; they do not show how many people do.

| Seed                                         | Notable completions                                                                                                                                                                                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| τυπογραφείο                                  | κοντά μου; + θεσσαλονίκη, καλλιθέα, λαρισα, ευοσμος, περιστέρι, πάτρα, χαλκίδα, αθηνα, ιωαννινα, χανια; "κοντα μου ανοιχτό τώρα"; "για μπλουζες κοντα μου"                                                                                            |
| εκτυπώσεις κοντά μου                         | ανοιχτό τώρα; κορυφαία; ψηφιακες εκτυπωσεις κοντα μου; εκτυπωσεις μπλουζες κοντα μου; φωτοτυπιες/σχεδιων/φωτογραφιων (not this shop's services)                                                                                                       |
| ψηφιακές εκτυπώσεις                          | + θεσσαλονίκη, λάρισα, αθήνα, πάτρα; κοντά μου                                                                                                                                                                                                        |
| offset εκτυπώσεις                            | ψηφιακές εκτυπώσεις offset (competitor brand names also appear)                                                                                                                                                                                       |
| επαγγελματικές κάρτες                        | εκτύπωση; τιμη; online; σχεδιασμός; διπλης οψης; με qr code; αναγλυφες; διαστάσεις; + αθηνα, θεσσαλονικη, λαρισα; by profession (ψυχολογου, φιλολογων)                                                                                                |
| φυλλάδια                                     | εκτύπωση; φυλλαδια α5 (τιμες, εκτυπωση, διαστασεις, 1000/5000 φυλλαδια α5); τρίπτυχο φυλλάδιο (διαστάσεις). Bare "φυλλάδια" is dominated by supermarket leaflets.                                                                                     |
| αυτοκόλλητα βιτρίνας                         | χριστουγεννιάτικα; εκπτωσεων; black friday; πασχαλινα; αμμοβολη; φαρμακειου; + θεσσαλονικη                                                                                                                                                            |
| επιγραφές καταστημάτων                       | νομοθεσία; τιμες; + θεσσαλονίκη, αθηνα, λαρισα, πατρα, σερρες, περιστερι, καλαματα. Also "φωτεινές επιγραφές" (led, τιμες)                                                                                                                            |
| μουσαμάς                                     | "μουσαμας διαφημιστικος", "μουσαμαδες εκτυπωση" exist as completions                                                                                                                                                                                  |
| roll up                                      | roll up banner; τιμες; διαστασεις; + θεσσαλονικη, χαλκιδα                                                                                                                                                                                             |
| αφίσες / εκτύπωση αφίσας                     | κόστος; α3 (τιμη); κοντα μου; online; + θεσσαλονίκη, αθηνα, ηρακλειο, πατρα                                                                                                                                                                           |
| στάμπες σε μπλουζάκια / σταμπα μπλουζα       | + θεσσαλονικη, αθηνα, νεα ερυθραια, περιστερι; "μαγαζι για σταμπες σε μπλουζάκια"; μπλουζάκια με στάμπα (τιμες); t shirt με στάμπα; μπλουζακια με λογοτυπο                                                                                            |
| μεταξοτυπία                                  | τι είναι; σε μπλουζάκια; σε ύφασμα; θεσσαλονίκη                                                                                                                                                                                                       |
| μπλουζάκια (occasions)                       | μπλουζάκια αποφοίτησης (δημοτικού, λυκείου); μπλουζακια για bachelor (γαμπρου, νυφης); μπλουζακια για ομαδες                                                                                                                                          |
| επαγγελματικός ρουχισμός                     | + ροδος, θεσσαλονικη, αθηνα, χανια, πατρα, ηρακλειο; ξενοδοχειου; κουζινας; εστιασης. "ρούχα εργασίας με λογότυπο" exists                                                                                                                             |
| διαφημιστικά δώρα                            | με λογοτυπο; επιχειρήσεων; τιμες; χονδρικη; εκτυπωσεις; φαρμακειου; + θεσσαλονίκη, αθήνα. "διαφημιστικά είδη (με λογοτυπο)" also used                                                                                                                 |
| κούπες                                       | κούπες με στάμπα; κούπες με λογότυπο; κούπα με φωτογραφία (τιμη, θεσσαλονίκη)                                                                                                                                                                         |
| προσωποποιημένα δώρα                         | για παιδιά; γάμου; για μωρά; για δασκάλους/δασκάλες; χριστουγέννων; για άντρες                                                                                                                                                                        |
| other promo items                            | στυλό με λογότυπο; τσάντες με λογότυπο / πάνινες τσάντες με λογότυπο; καπέλα με λογότυπο / με στάμπα; ποδιές με λογότυπο; ημερολόγια με λογότυπο / εταιρικά ημερολόγια 2026; μπλοκ σημειώσεων με λογότυπο (α5); φούτερ με στάμπα (στην πλάτη, custom) |
| σχεδιασμός λογοτύπου / δημιουργία λογοτύπου  | τιμες / τιμη; δωρεαν; online; ai; επιχειρησης; + αθηνα, θεσσαλονικη. Also "πόσο κοστίζει ένα λογότυπο", "γραφιστασ για λογοτυπο", "γραφιστικο γραφειο + city", "εταιρική ταυτότητα (τι είναι, τι περιλαμβανει, τιμες)"                                |
| σχεδιασμός μενού / φυλλαδίου                 | σχεδιασμος μενου εστιατοριου; σχεδιασμος φυλλαδιου; εκτυπωση μενου (εστιατοριων, γαμου, βαπτισης)                                                                                                                                                     |
| social media design                          | No Greek completions for "σχεδιασμός αναρτήσεων", "δημιουργία posts για instagram", "σχεδιασμός social media". English "social media posts design" completes. "instagram story διαστασεις" exists. → low or unknown Greek demand.                     |
| προσκλητήρια                                 | γάμου; βάπτισης; γάμου και βάπτισης; βαπτισης για αγόρι / κορίτσι / δίδυμα; κείμενο / κειμενα; ιδεες; οικονομικά; τιμές; online; "προσκλητηρια γαμου ποτε στελνουμε"; + θεσσαλονίκη, αθήνα, ηράκλειο                                                  |
| other stationery                             | ευχετήριες κάρτες (γενέθλια, γάμου, χριστουγέννων, βάπτιση); μενού γάμου (εκτυπωση); καρτελάκια τραπεζιού; ετικέτες (για βάζα, κρασιού, τροφίμων); αυτοκόλλητες ετικέτες; αυτοκόλλητα αυτοκινήτου; ντύσιμο αυτοκινήτου με αυτοκόλλητο                 |
| διαφημιστική εταιρεία / διαφημιστικό γραφείο | + αθήνα, θεσσαλονίκη, πατρα, χαλάνδρι, πειραιάς                                                                                                                                                                                                       |

### 2.2 Competitor patterns (typical Greek print shops and online printers)

Observed on Greek printer sites and directory listings ([vrisko.gr τυπογραφεία](https://www.vrisko.gr/dir/typografeia/), [vrisko.gr ψηφιακές εκτυπώσεις](https://www.vrisko.gr/dir/psifiakes-ektyposeis-Offset/), [vrisko.gr επαγγελματικές κάρτες](https://www.vrisko.gr/dir/epaggelmatikes-kartes/), home pages of printfair.gr, eprint.gr, ektiposeis.gr, copycity.gr):

- **Titles are keyword lists with the municipality**: "τυπογραφεια αιγαλεω, εκτυπωσεις αιγαλεω" (ektiposeis.gr), "Επαγγελματικές κάρτες, ψηφιακές εκτυπώσεις, γραφική ύλη & έντυπα" (eprint.gr). Several sites serve no h1 in their HTML and use generic titles ("Αρχική - Printfair"). The bar is low: a clean, descriptive title + h1 + city on each service page already beats many local competitors.
- **Self-descriptions in directories** follow one formula: list of services ("Ψηφιακές Εκτυπώσεις – Εκτυπώσεις Offset – Επαγγελματικές Κάρτες – Εκτύπωση Φυλλαδίων") + years in business + neighbourhood. ΔΙΑΤΥΠΩΣΗ must not copy the years claim (not supplied).
- **Online printers** (product-catalogue sites) win the generic national terms (επαγγελματικές κάρτες, φυλλάδια α5, roll up banner τιμές) with price calculators. A single-location shop without prices should not chase those head terms nationally; it should win **term + city** and **κοντά μου** via GBP, and the long tail of questions (διαστάσεις, τι χαρτί, ψηφιακή ή offset, πότε στέλνουμε προσκλητήρια).
- **Recurring FAQ topics** on printer sites: file formats and bleed, paper weight and finish, CMYK vs screen colours, minimum quantities, proofs before printing, sizes (κάρτα 9×5, Α5, Α3, roll up 85×200), outdoor durability, installation, wedding-invitation wording and timing. Prices and delivery times are also common but **must not** appear here (owner has not supplied them).

---

## 3. Keyword map

Rules used:

- Titles below are the text **before** " | ΔΙΑΤΥΠΩΣΗ" and before any locality the template appends (`withLocality` / `site.address.locative`). All are 30–55 characters. With a long locative ("στη Θεσσαλονίκη") plus the brand, some titles will be truncated in results after about 55–60 characters; that cuts the brand suffix, which is acceptable. Google has no fixed character limit for titles; it truncates to the device width ([Google title links](https://developers.google.com/search/docs/appearance/title-link)).
- Meta descriptions are 130–160 characters and end with a call to action. Counts were checked.
- Only services and products in `src/data/site.ts` are used. No prices, delivery times, years in business, embroidery (κέντημα), installation, lit signs (φωτεινές επιγραφές), vehicle full wraps, DTF or μεταξοτυπία claims, unless the owner confirms them (see §4 "owner must confirm").
- "{Πόλη}" variants: users type the nominative ("τυπογραφείο αθήνα"); copy uses the locative ("τυπογραφείο στην Αθήνα").

### 3.1 City names in Greek copy

| City/area                                                                       | Nominative (queries, GBP, address)                  | Locative for copy and titles                                         |
| ------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------- |
| Feminine (την/στην), starting with a vowel or κ, π, τ, ξ, ψ, μπ, ντ, γκ, τσ, τζ | Αθήνα, Πάτρα, Καλλιθέα, Χαλκίδα (χ → no ν), Κέρκυρα | στην Αθήνα, στην Πάτρα, στην Καλλιθέα, **στη** Χαλκίδα, στην Κέρκυρα |
| Feminine (την/στην), other first letters                                        | Θεσσαλονίκη, Λάρισα, Νέα Σμύρνη, Ρόδος              | στη Θεσσαλονίκη, στη Λάρισα, στη Νέα Σμύρνη, στη Ρόδο                |
| Neuter                                                                          | Περιστέρι, Ηράκλειο, Αιγάλεω, Μαρούσι               | στο Περιστέρι, στο Ηράκλειο, στο Αιγάλεω, στο Μαρούσι                |
| Masculine                                                                       | Πειραιάς, Εύοσμος, Βόλος                            | στον Πειραιά, στον Εύοσμο, στον Βόλο                                 |
| Plural                                                                          | Χανιά, Ιωάννινα, Γιαννιτσά                          | στα Χανιά, στα Ιωάννινα, στα Γιαννιτσά                               |

Only the feminine article την/στην (like δεν and μην) drops its final -ν: it keeps it before a vowel and before κ, π, τ, ξ, ψ, μπ, ντ, γκ, τσ, τζ, and drops it before other consonants. The masculine τον/στον always keeps the -ν (στον Βόλο, στον Πειραιά). `site.address.locative` holds the whole phrase ("στην Αθήνα"), so no code has to inflect.

### 3.2 Compact table

| URL                                          | Primary query                              | Recommended title (before " \| ΔΙΑΤΥΠΩΣΗ")       | Recommended h1                                                |
| -------------------------------------------- | ------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------- |
| `/`                                          | τυπογραφείο {Πόλη}                         | Διαφημιστικό γραφείο & εκτυπώσεις                | Keep the owner's "Η ιδέα σας… γίνεται δημιουργία!" (see note) |
| `/ypiresies/`                                | εκτυπώσεις και διαφήμιση {Πόλη}            | Υπηρεσίες εκτύπωσης & διαφήμισης                 | Υπηρεσίες εκτύπωσης και διαφήμισης                            |
| `/ypiresies/diafimistika-dora/`              | διαφημιστικά δώρα                          | Διαφημιστικά & προσωποποιημένα δώρα              | Διαφημιστικά δώρα με λογότυπο και προσωποποιημένα δώρα        |
| `/ypiresies/mplouzakia-rouxismos/`           | στάμπες σε μπλουζάκια                      | Στάμπες σε μπλουζάκια & επαγγελματικός ρουχισμός | Μπλουζάκια με στάμπα και ρούχα εργασίας με λογότυπο           |
| `/ypiresies/3d-ektyposeis/`                  | 3D εκτύπωση / 3D εκτυπώσεις                | 3D εκτύπωση: πρωτότυπα, ανταλλακτικά, φιγούρες   | 3D εκτυπώσεις: πρωτότυπα, ανταλλακτικά, φιγούρες και δώρα     |
| `/ypiresies/grafistikos-sxediasmos/`         | σχεδιασμός λογοτύπου                       | Σχεδιασμός λογοτύπου & εταιρική ταυτότητα        | Σχεδιασμός λογοτύπου, εταιρικής ταυτότητας και εντύπων        |
| `/ypiresies/banners-afises-mousamades/`      | μουσαμάς διαφημιστικός / roll up banner    | Μουσαμάδες, roll up banners, πανό & αφίσες       | Διαφημιστικοί μουσαμάδες, banners και αφίσες                  |
| `/ypiresies/epigrafes-aftokollita-vitrines/` | επιγραφές καταστημάτων                     | Επιγραφές καταστημάτων & αυτοκόλλητα βιτρίνας    | Επιγραφές καταστημάτων, αυτοκόλλητα βιτρίνας και οχημάτων     |
| `/ypiresies/social-media/`                   | σχεδιασμός αναρτήσεων για social media     | Σχεδιασμός αναρτήσεων για social media           | Σχεδιασμός αναρτήσεων και stories για Facebook και Instagram  |
| `/ypiresies/psifiakes-offset-ektyposeis/`    | ψηφιακές εκτυπώσεις                        | Ψηφιακές & offset εκτυπώσεις, τυπογραφείο        | Ψηφιακές και offset εκτυπώσεις στο τυπογραφείο μας            |
| `/ypiresies/kartes-fylladia-entypa/`         | επαγγελματικές κάρτες                      | Επαγγελματικές κάρτες, φυλλάδια & έντυπα         | Επαγγελματικές κάρτες και φυλλάδια: σχεδιασμός και εκτύπωση   |
| `/ypiresies/prosklitiria-kartes/`            | προσκλητήρια γάμου                         | Προσκλητήρια γάμου, βάπτισης & ευχετήριες κάρτες | Προσκλητήρια γάμου και βάπτισης, ευχετήριες κάρτες            |
| `/erga/`                                     | ΔΙΑΤΥΠΩΣΗ έργα / δείγματα εργασιών         | Έργα: κάρτες, επιγραφές, στάμπες & έντυπα        | Τι μπορούμε να φτιάξουμε για εσάς (keep)                      |
| `/etaireia/`                                 | ΔΙΑΤΥΠΩΣΗ / διατύπωση εκτυπώσεις           | Η εταιρεία: διαφήμιση & εκτυπώσεις               | Από την ιδέα στο χαρτί, μαζί σας (keep)                       |
| `/epikoinonia/`                              | ΔΙΑΤΥΠΩΣΗ τηλέφωνο / τυπογραφείο κοντά μου | Επικοινωνία & προσφορά για εκτυπώσεις            | Επικοινωνία και αίτημα προσφοράς                              |

### 3.3 Details per URL

#### `/` Αρχική

- **Primary:** τυπογραφείο {Πόλη}
- **Secondary / long tail:** εκτυπώσεις {Πόλη}; τυπογραφείο κοντά μου; εκτυπώσεις κοντά μου; διαφημιστική εταιρεία {Πόλη} / διαφημιστικό γραφείο {Πόλη}; ψηφιακές εκτυπώσεις κοντά μου; ΔΙΑΤΥΠΩΣΗ / Διατύπωση εκτυπώσεις; diatyposi (brand, Greeklish); typografeio (Greeklish, mapped to Greek by Google)
- **Intent:** local commercial and navigational (find a print/advertising shop nearby, or find this one by name).
- **Title:** "Διαφημιστικό γραφείο & εκτυπώσεις" (33), as the owner describes the shop (2026-11-24; "τυπογραφείο" stays the target of the digital & offset printing page). On the home page Google recommends the full site name; brand-first ("ΔΙΑΤΥΠΩΣΗ | Διαφημιστικό γραφείο & εκτυπώσεις {στην Πόλη}") or brand-last are both fine. Keep the home title consistent with the `WebSite` name.
- **h1:** the owner's headline "Η ιδέα σας… γίνεται δημιουργία!" (owner copy, verbatim; it carries no search term). The red label that used to sit above it ("ΔΙΑΦΗΜΙΣΗ – ΕΚΤΥΠΩΣΕΙΣ") was removed on 2026-11-25 at the client's request; the search terms are carried by the title, the meta description and the owner's intro, which already says "διαφήμισης, εκτύπωσης και προβολής" and stays the first paragraph. Option (b), putting the descriptor inside the h1 ("ΔΙΑΤΥΠΩΣΗ, διαφήμιση και εκτυπώσεις {στην Πόλη}: Η ιδέα σας… γίνεται δημιουργία!"), needs the owner's approval and was not done.
- **Meta description (154):** "Διαφημιστικό γραφείο ΔΙΑΤΥΠΩΣΗ: ψηφιακές και offset εκτυπώσεις, κάρτες, banners, επιγραφές, στάμπες σε μπλουζάκια και διαφημιστικά δώρα. Ζητήστε προσφορά."

#### `/ypiresies/` Υπηρεσίες (hub)

- **Primary:** εκτυπώσεις και διαφήμιση {Πόλη}
- **Secondary:** υπηρεσίες τυπογραφείου; διαφημιστικό υλικό; διαφημιστικά και εκτυπώσεις; εκτυπώσεις {Πόλη}; ψηφιακές εκτυπώσεις {Πόλη}
- **Intent:** commercial investigation; the hub that links to the ten service pages.
- **Title (32):** "Υπηρεσίες εκτύπωσης & διαφήμισης"
- **h1:** "Υπηρεσίες εκτύπωσης και διαφήμισης" (shipped; the former heading "Ό,τι χρειάζεται η εικόνα σας, σε ένα μέρος." now opens the intro under it).
- **Meta (159):** "Οι υπηρεσίες της ΔΙΑΤΥΠΩΣΗΣ: εκτυπώσεις και 3D εκτυπώσεις, κάρτες, έντυπα, banners, επιγραφές, ρουχισμός, δώρα, λογότυπα και social media. Δείτε τι φτιάχνουμε."
- **Note:** once service pages exist, each chapter on /ypiresies/ should be a short summary that links to its page ("Περισσότερα για …"), not a copy of the service page text, so the two never compete for the same query.

#### `/ypiresies/diafimistika-dora/`

- **Primary:** διαφημιστικά δώρα
- **Secondary:** διαφημιστικά δώρα με λογότυπο; διαφημιστικά δώρα επιχειρήσεων; διαφημιστικά είδη με λογότυπο; κούπες με λογότυπο / κούπες με στάμπα; κούπα με φωτογραφία; προσωποποιημένα δώρα (για δασκάλους, για παιδιά, γάμου, χριστουγέννων); στυλό με λογότυπο; πάνινες / υφασμάτινες τσάντες με λογότυπο; εταιρικά ημερολόγια / μπλοκ σημειώσεων με λογότυπο; διαφημιστικά δώρα {Πόλη}
- **Intent:** commercial (businesses ordering branded giveaways; individuals ordering one personalised gift).
- **Title (35):** "Διαφημιστικά & προσωποποιημένα δώρα"
- **h1:** "Διαφημιστικά δώρα με λογότυπο και προσωποποιημένα δώρα"
- **Meta (148):** "Διαφημιστικά δώρα με το λογότυπό σας: κούπες, ποτήρια, στυλό, μπλοκ, ημερολόγια, υφασμάτινες τσάντες και προσωποποιημένα δώρα. Ζητήστε μας προσφορά."

#### `/ypiresies/mplouzakia-rouxismos/`

- **Primary:** στάμπες σε μπλουζάκια
- **Secondary:** μπλουζάκια με στάμπα; στάμπα μπλούζα {Πόλη}; μπλουζάκια με λογότυπο; επαγγελματικός ρουχισμός (εστίασης, ξενοδοχείου); ρούχα εργασίας με λογότυπο; φούτερ με στάμπα; καπέλα με στάμπα / με λογότυπο; ποδιές με λογότυπο; μπλουζάκια για ομάδες / εκδηλώσεις / αποφοίτησης / bachelor; τυπογραφείο για μπλούζες κοντά μου
- **Intent:** commercial, strongly local ("μαγαζί για στάμπες σε μπλουζάκια").
- **Title (48):** "Στάμπες σε μπλουζάκια & επαγγελματικός ρουχισμός"
- **h1:** "Μπλουζάκια με στάμπα και ρούχα εργασίας με λογότυπο"
- **Meta (153):** "Στάμπες σε μπλουζάκια για ομάδες, εκδηλώσεις και επιχειρήσεις, ρούχα εργασίας, φούτερ, καπέλα και ποδιές με λογότυπο. Στείλτε μας το σχέδιο για προσφορά."
- **Do not:** mention κέντημα (embroidery). Mention μεταξοτυπία or any other method only after the owner confirms it (the current μεταξοτυπία photo is a stand-in).

#### `/ypiresies/3d-ektyposeis/`

- **Primary:** 3D εκτύπωση / 3D εκτυπώσεις
- **Secondary:** 3D printing; τρισδιάστατη εκτύπωση (αντικειμένων); 3D εκτύπωση ανταλλακτικών; 3D εκτύπωση μινιατούρας; 3D εκτύπωση πλαστικού; 3D γράμματα (τοίχου); πρωτότυπα / μακέτες; 3D εκτυπώσεις {Πόλη} / 3D printing {Πόλη}
- **Intent:** commercial, strongly local (autocomplete completes "3d εκτυπώσεις" and "3d printing" with city names, Ηράκλειο among them, checked 23 Nov 2026 with the method of §2). Informational searches about the technology ("τρισδιάστατη εκτύπωση σπιτιού / στην ιατρική") and searches for buying a printer ("3d printer") are a different intent; do not target them.
- **Title (46):** "3D εκτύπωση: πρωτότυπα, ανταλλακτικά, φιγούρες"
- **h1:** "3D εκτυπώσεις: πρωτότυπα, ανταλλακτικά, φιγούρες και δώρα"
- **Meta (153):** "3D εκτυπώσεις από το δικό σας αρχείο: πρωτότυπα, μακέτες, ανταλλακτικά, φιγούρες, δώρα και τρισδιάστατα γράμματα. Στείλτε μας το αρχείο σας για προσφορά."
- **Do not:** name a printing technology (FDM, resin), materials (PLA, PETG, metal), colours, a largest print size or turnaround times until the owner confirms them; "3d εκτύπωση μετάλλου" is searched but not offered.

#### `/ypiresies/grafistikos-sxediasmos/`

- **Primary:** σχεδιασμός λογοτύπου
- **Secondary:** δημιουργία λογοτύπου (επιχείρησης); γραφίστας για λογότυπο; γραφιστικό γραφείο {Πόλη}; εταιρική ταυτότητα (σχεδιασμός, τι περιλαμβάνει); ανανέωση λογοτύπου; σχεδιασμός φυλλαδίου; σχεδιασμός μενού εστιατορίου; σχεδιασμός συσκευασίας; σχεδιασμός λογοτύπου {Πόλη}
- **Intent:** commercial investigation (also informational: "τι περιλαμβάνει η εταιρική ταυτότητα"). Many "δωρεάν/online/ai" logo-maker searches exist; do not target them.
- **Title (41):** "Σχεδιασμός λογοτύπου & εταιρική ταυτότητα"
- **h1:** "Σχεδιασμός λογοτύπου, εταιρικής ταυτότητας και εντύπων"
- **Meta (144):** "Σχεδιασμός λογοτύπου και εταιρικής ταυτότητας, εντύπων και συσκευασιών, με αρχεία έτοιμα για εκτύπωση. Πείτε μας την ιδέα σας και ξεκινάμε μαζί."

#### `/ypiresies/banners-afises-mousamades/`

- **Primary:** μουσαμάς διαφημιστικός (a Greek-specific term) together with roll up banner
- **Secondary:** μουσαμάδες εκτύπωση; εκτύπωση μουσαμά {Πόλη}; roll up banner; roll up banner διαστάσεις; πανό για εκθέσεις / πανό εκτύπωση; εκτύπωση αφίσας (α3, α2, α1, α0); αφίσες εκτύπωση {Πόλη}; εκτυπώσεις μεγάλου μεγέθους; banner εκτύπωση
- **Intent:** commercial, often urgent (event, opening, exhibition).
- **Title (42):** "Μουσαμάδες, roll up banners, πανό & αφίσες"
- **h1:** "Διαφημιστικοί μουσαμάδες, banners και αφίσες"
- **Meta (152):** "Διαφημιστικοί μουσαμάδες για προσόψεις και εκδηλώσεις, roll up banners, πανό για εκθέσεις και αφίσες. Στείλτε μας το σχέδιο ή την ιδέα σας για προσφορά."

#### `/ypiresies/epigrafes-aftokollita-vitrines/`

- **Primary:** επιγραφές καταστημάτων
- **Secondary:** επιγραφές καταστημάτων {Πόλη}; αυτοκόλλητα βιτρίνας (εκπτώσεων, χριστουγεννιάτικα, black friday — seasonal); βιτρίνα καταστήματος; αυτοκόλλητα οχημάτων / αυτοκόλλητα αυτοκινήτου με λογότυπο; ετικέτες προϊόντων / αυτοκόλλητες ετικέτες; ετικέτες για βάζα / ετικέτες κρασιού
- **Intent:** commercial, local (sign must be made and fitted nearby).
- **Title (45):** "Επιγραφές καταστημάτων & αυτοκόλλητα βιτρίνας"
- **h1:** "Επιγραφές καταστημάτων, αυτοκόλλητα βιτρίνας και οχημάτων"
- **Meta (148):** "Επιγραφές καταστημάτων, αυτοκόλλητα βιτρίνας και οχημάτων, ετικέτες προϊόντων, σχεδιασμένα για να σας προσέχουν από τον δρόμο. Ζητήστε μας προσφορά."
- **Do not:** claim φωτεινές επιγραφές, full vehicle wraps ("ντύσιμο αυτοκινήτου"), installation or permit handling unless the owner confirms.

#### `/ypiresies/social-media/`

- **Primary:** σχεδιασμός αναρτήσεων για social media
- **Secondary:** σχεδιασμός posts για Facebook και Instagram; σχεδιασμός instagram stories; εικόνα εξωφύλλου Facebook; ψηφιακές προσκλήσεις; γραφιστικά για social media; διαφημιστικό υλικό για social media
- **Intent:** commercial; Greek demand looks small (no autocomplete completions), so this page mostly supports customers already in contact and cross-sells from κάρτες / προσκλητήρια / λογότυπο.
- **Title (38):** "Σχεδιασμός αναρτήσεων για social media"
- **h1:** "Σχεδιασμός αναρτήσεων και stories για Facebook και Instagram"
- **Meta (143):** "Σχεδιασμός αναρτήσεων για social media: posts, stories, εικόνες εξωφύλλου και ψηφιακές προσκλήσεις, στο ύφος των εντύπων σας. Ζητήστε προσφορά."
- **Do not:** imply account management, posting, ads or follower growth. The service is design.

#### `/ypiresies/psifiakes-offset-ektyposeis/`

- **Primary:** ψηφιακές εκτυπώσεις
- **Secondary:** ψηφιακές εκτυπώσεις {Πόλη}; offset εκτυπώσεις; ψηφιακές εκτυπώσεις offset; εκτυπώσεις κοντά μου; τυπογραφείο {Πόλη}; ψηφιακή ή offset εκτύπωση; εκτυπώσεις μικρών ποσοτήτων; ektyposeis (Greeklish)
- **Intent:** commercial, local; this page is the best non-home target for "τυπογραφείο {Πόλη}".
- **Title (41):** "Ψηφιακές & offset εκτυπώσεις, τυπογραφείο"
- **h1:** "Ψηφιακές και offset εκτυπώσεις στο τυπογραφείο μας"
- **Meta (144):** "Ψηφιακές εκτυπώσεις για μικρές ποσότητες και offset για μεγάλα τιράζ, με επιλογή χαρτιού και φινιρίσματος και έλεγχο χρώματος. Ζητήστε προσφορά."

#### `/ypiresies/kartes-fylladia-entypa/`

- **Primary:** επαγγελματικές κάρτες
- **Secondary:** επαγγελματικές κάρτες εκτύπωση; επαγγελματικές κάρτες {Πόλη}; επαγγελματικές κάρτες διπλής όψης; επαγγελματικές κάρτες με QR code; εκτύπωση φυλλαδίων / φυλλάδια Α5; τρίπτυχο φυλλάδιο; flyers; εκτύπωση μενού εστιατορίου; κατάλογοι; επιστολόχαρτα και φάκελοι
- **Intent:** commercial (national online printers dominate "επαγγελματικές κάρτες" alone; win "+ {Πόλη}" and the question long tail).
- **Title (40):** "Επαγγελματικές κάρτες, φυλλάδια & έντυπα"
- **h1:** "Επαγγελματικές κάρτες και φυλλάδια: σχεδιασμός και εκτύπωση"
- **Meta (151):** "Επαγγελματικές κάρτες, φυλλάδια και flyers, κατάλογοι, μενού, επιστολόχαρτα, φάκελοι και μπλοκ, σχεδιασμένα και τυπωμένα με φροντίδα. Ζητήστε προσφορά."
- **Do not:** mention ανάγλυφες κάρτες, special papers or finishes the owner has not listed.

#### `/ypiresies/prosklitiria-kartes/`

- **Primary:** προσκλητήρια γάμου
- **Secondary:** προσκλητήρια βάπτισης (για αγόρι / για κορίτσι); προσκλητήρια γάμου και βάπτισης; προσκλητήρια γάμου {Πόλη}; ευχετήριες κάρτες (εταιρικές, χριστουγέννων); μενού γάμου εκτύπωση; καρτελάκια τραπεζιού; προσκλητήρια γάμου κείμενο
- **Intent:** commercial with a long research phase (ideas, wording, timing). Seasonal: weddings and baptisms peak in spring–summer, greeting cards before Christmas.
- **Title (48):** "Προσκλητήρια γάμου, βάπτισης & ευχετήριες κάρτες"
- **h1:** "Προσκλητήρια γάμου και βάπτισης, ευχετήριες κάρτες"
- **Meta (146):** "Προσκλητήρια γάμου και βάπτισης, ευχετήριες κάρτες, μενού και καρτελάκια τραπεζιού, σχεδιασμένα μαζί σας για να μείνουν ενθύμιο. Ζητήστε προσφορά."

#### `/erga/` Έργα

- **Primary:** ΔΙΑΤΥΠΩΣΗ έργα / δείγματα εργασιών (brand + trust; low search demand)
- **Secondary:** image-search intents per category once real photos exist: επιγραφές καταστημάτων ιδέες; προσκλητήρια γάμου ιδέες; μπλουζάκια με στάμπα; αυτοκόλλητα βιτρίνας
- **Intent:** trust and investigation before contact.
- **Title (41):** "Έργα: κάρτες, επιγραφές, στάμπες & έντυπα"
- **h1:** keep "Τι μπορούμε να φτιάξουμε για εσάς" while the images are stand-ins; switch to "Έργα και δείγματα εργασιών" once real work is shown.
- **Meta (151):** "Τα είδη εργασιών της ΔΙΑΤΥΠΩΣΗΣ: λογότυπα, κάρτες, φυλλάδια, αφίσες, επιγραφές, αυτοκόλλητα, ρουχισμός και διαφημιστικά δώρα. Δείτε τα και ρωτήστε μας."
- **Note:** do not describe stand-in photos as the shop's work. When real photos arrive, write alt text that says what and for whom ("Επιγραφή για φούρνο {στην Πόλη}" style), and link each item to its service page.

#### `/etaireia/` Η εταιρεία

- **Primary:** ΔΙΑΤΥΠΩΣΗ / Διατύπωση διαφήμιση εκτυπώσεις (brand)
- **Secondary:** diatyposi; τυπογραφείο {Πόλη}; διαφημιστικό γραφείο {Πόλη}
- **Intent:** navigational / trust.
- **Title (34):** "Η εταιρεία: διαφήμιση & εκτυπώσεις"
- **h1:** keep "Από την ιδέα στο χαρτί, μαζί σας"; the first paragraph (owner copy) already names "ΔΙΑΤΥΠΩΣΗ" and "διαφήμισης, εκτύπωσης". The city is added only when the owner edits that copy; nothing inserts it automatically on this page.
- **Meta (147):** "Η ΔΙΑΤΥΠΩΣΗ δίνει μορφή στις ιδέες σας με λύσεις διαφήμισης, εκτύπωσης και προβολής, με ποιότητα, συνέπεια και προσωπική εξυπηρέτηση. Γνωρίστε μας."

#### `/epikoinonia/` Επικοινωνία

- **Primary:** ΔΙΑΤΥΠΩΣΗ τηλέφωνο / διεύθυνση (navigational)
- **Secondary:** τυπογραφείο κοντά μου; εκτυπώσεις κοντά μου; προσφορά για εκτυπώσεις; τυπογραφείο {Πόλη} ωράριο
- **Intent:** navigational / transactional (call, visit, request a quote).
- **Title (37):** "Επικοινωνία & προσφορά για εκτυπώσεις"
- **h1:** "Επικοινωνία και αίτημα προσφοράς" (shipped; "Πείτε μας τι έχετε στο μυαλό σας." now opens the intro).
- **Meta (148):** "Τηλέφωνο, email, Viber, WhatsApp, διεύθυνση και ωράριο της ΔΙΑΤΥΠΩΣΗΣ. Πείτε μας τι χρειάζεστε από τη φόρμα και ζητήστε προσφορά για τη δουλειά σας."
- **Note:** show the full address as text (street, number, ΤΚ, municipality/neighbourhood), written exactly as in GBP, plus a line on how to find the shop (landmark, parking). This is the NAP anchor of the site.

`/politiki-aporritou/` needs no keyword target; keep it indexable and linked from the footer.

---

## 4. Content guidance for the service-page writers

General rules for all ten pages:

- **Length and structure:** a lead paragraph (1–3 sentences) that contains the primary query and the `{loc}` token once, right after a word (see City below); 2–4 sections with h2s; 6–8 FAQs (the template's type allows 4–6 for the page and FAQ markup; pick the strongest from the candidates below); 2–3 related services. Aim for roughly 500–900 words of real content per page. Every page must be distinct; no shared boilerplate paragraphs.
- **Language:** natural Greek with τόνοι and final ς. Use singular and plural naturally (μουσαμάς / μουσαμάδες, επιγραφή / επιγραφές, κάρτα / κάρτες); Google understands inflection. Do not repeat the keyword mechanically; do not add Greeklish or accentless variants.
- **City:** the city is inserted automatically in two places only: the `{loc}` token in each service intro (filled with " στην <Πόλη>" from `site.address.locative`, empty until it is set), and every service and home title (`withLocality`). Do not write the city anywhere else in the body copy; a second in-body mention (e.g. "Περάστε από το κατάστημά μας {στην Πόλη}") waits until the owner edits the copy with the real city. No separate pages per city or suburb (doorway pages).
- **Claims:** only services and products in `src/data/site.ts`. No prices, no delivery or turnaround times, no minimum quantities, no years in business, no "best/cheapest", no embroidery, no techniques the owner has not confirmed. Where customers ask about price or time, answer how it is decided ("εξαρτάται από την ποσότητα, το υλικό και το μέγεθος· στείλτε μας τι χρειάζεστε και θα σας δώσουμε προσφορά") rather than giving figures.
- **Owner must confirm before writers state it:** printing methods for textiles (μεταξοτυπία, DTF, θερμομεταφορά); whether single pieces / small runs are possible per product; whether customers can bring their own garments; whether the shop installs signs and vinyl; outdoor materials offered; poster sizes and roll-up sizes stocked; number of logo proposals and revisions; file formats delivered; proofs (δοκίμιο / μακέτα) before printing. Mark such answers "TODO(owner)" in the copy file rather than guessing.
- **FAQ answers:** 1–3 short sentences that answer the question first, then add the detail. These are the parts AI answers and "People also ask" quote.
- **Calls to action:** every page ends with the quote link pre-filled for that service (`quoteHref(slug)`), and mentions phone/Viber/WhatsApp.

### 4.1 Διαφημιστικά δώρα & προσωποποιημένα προϊόντα (`diafimistika-dora`)

- **Topics:** what branded gifts are for (πελάτες, εκδηλώσεις, εκθέσεις, γιορτές, εταιρικά δώρα τέλους χρονιάς); product groups from site.ts (κούπες και ποτήρια; στυλό, μπλοκ και ημερολόγια; υφασμάτινες τσάντες; προσωποποιημένα δώρα); how to choose an item for the audience; the logo/design step; personal gifts with a photo or name (κούπα με φωτογραφία, δώρο για δασκάλα, γάμου, βάπτισης).
- **FAQ candidates:**
  - Ποια διαφημιστικά δώρα μπορώ να τυπώσω με το λογότυπό μου;
  - Μπορώ να φτιάξω ένα μόνο προσωποποιημένο δώρο, π.χ. μια κούπα με φωτογραφία; (owner)
  - Υπάρχει ελάχιστη ποσότητα για τα διαφημιστικά δώρα; (owner; no numbers unless supplied)
  - Τι αρχείο χρειάζεστε για το λογότυπο;
  - Δεν έχω λογότυπο. Μπορείτε να μου σχεδιάσετε; (→ γραφιστικός σχεδιασμός)
  - Ποιο δώρο ταιριάζει σε πελάτες, ποιο σε εκδήλωση ή έκθεση;
  - Θα δω πώς θα είναι το δώρο πριν από την παραγωγή; (owner)
  - Πόσο κοστίζουν τα διαφημιστικά δώρα; (explain what the price depends on; no figures)
- **Related:** mplouzakia-rouxismos, grafistikos-sxediasmos, 3d-ektyposeis.

### 4.2 Εκτυπώσεις σε μπλουζάκια & επαγγελματικό ρουχισμό (`mplouzakia-rouxismos`)

- **Topics:** occasions (ομάδες, σύλλογοι, εκδηλώσεις, αποφοίτηση, bachelor, επιχειρήσεις, εστίαση, ξενοδοχεία); garment types from site.ts (μπλουζάκια, ρούχα εργασίας, φούτερ, καπέλα, ποδιές); logo placement (στήθος, πλάτη, μανίκι); preparing the design file; care and washing; uniform look with the rest of the brand.
- **FAQ candidates:**
  - Σε ποια ρούχα μπορείτε να τυπώσετε το λογότυπό μου;
  - Μπορώ να παραγγείλω λίγα κομμάτια ή ακόμη και ένα; (owner)
  - Με ποια μέθοδο τυπώνετε τα μπλουζάκια; (owner must confirm the methods)
  - Αντέχει η στάμπα στο πλύσιμο; Πώς πλένω τα τυπωμένα ρούχα;
  - Μπορεί κάθε μπλουζάκι να έχει διαφορετικό όνομα ή νούμερο; (owner)
  - Πού μπορεί να μπει το λογότυπο: στήθος, πλάτη, μανίκι;
  - Μπορώ να φέρω δικά μου ρούχα για τύπωμα; (owner)
  - Τι αρχείο χρειάζεστε για το σχέδιο;
- **Related:** diafimistika-dora, grafistikos-sxediasmos, banners-afises-mousamades.

### 4.3 Γραφιστικός σχεδιασμός & δημιουργία λογοτύπων (`grafistikos-sxediasmos`)

- **Topics:** what a logo needs to do (αναγνωρίσιμο, απλό, να λειτουργεί μικρό και μεγάλο, σε ένα χρώμα); εταιρική ταυτότητα (λογότυπο, χρώματα, γραμματοσειρές, εφαρμογές σε κάρτα, επιγραφή, ρούχα, social media); the process from σκίτσο to final file (site.ts description); refreshing an existing logo; print-ready files; design of έντυπα and συσκευασίες.
- **FAQ candidates:**
  - Τι περιλαμβάνει ο σχεδιασμός λογοτύπου;
  - Τι είναι η εταιρική ταυτότητα και τι περιλαμβάνει;
  - Πώς ξεκινάμε; Τι χρειάζεστε από εμένα;
  - Πόσες προτάσεις και διορθώσεις περιλαμβάνονται; (owner)
  - Σε ποια αρχεία θα πάρω το λογότυπό μου; (owner; e.g. vector and PNG)
  - Μπορείτε να ανανεώσετε το λογότυπο που ήδη έχω;
  - Μπορείτε να ετοιμάσετε το αρχείο μου ώστε να είναι σωστό για εκτύπωση;
  - Πόσο κοστίζει ένα λογότυπο; (what it depends on; no figures)
- **Related:** kartes-fylladia-entypa, epigrafes-aftokollita-vitrines, 3d-ektyposeis.

### 4.4 Διαφημιστικά banners, αφίσες & μουσαμάδες (`banners-afises-mousamades`)

- **Topics:** the three formats and when each fits (μουσαμάς για πρόσοψη, εργοτάξιο, εκδήλωση; roll-up για έκθεση, βιτρίνα, εκδήλωση εσωτερικού χώρου; πανό για εκθέσεις; αφίσες κάθε μεγέθους); reading distance and text size; file resolution and margins for large prints; indoor vs outdoor use; fixing/hanging (owner); municipal rules for outdoor advertising (link to the owner's municipality; do not give legal advice).
- **FAQ candidates:**
  - Ποια είναι η διαφορά ανάμεσα σε μουσαμά, πανό και roll-up banner;
  - Τι διαστάσεις έχει ένα roll-up banner; (common market size 85×200 cm per [Pixartprinting](https://www.pixartprinting.co.uk/blog/roll-up-banner-sizes/); state only the sizes the shop offers)
  - Ο μουσαμάς αντέχει σε εξωτερικό χώρο;
  - Πώς στερεώνεται ο μουσαμάς; (owner)
  - Σε τι ανάλυση πρέπει να είναι το αρχείο για μεγάλη εκτύπωση;
  - Σε ποια μεγέθη τυπώνετε αφίσες; (owner: Α3, Α2, Α1, Α0 …)
  - Χρειάζομαι άδεια για μουσαμά στην πρόσοψη; (answer: depends on the municipality's κανονισμός υπαίθριας διαφήμισης, e.g. framework ν. 2946/2001 noted by [Δήμος Θεσσαλονίκης](https://thessaloniki.gr/wp-content/uploads/2016/12/%CE%95%CE%9A%CE%94%CE%9F%CE%A3%CE%97-%CE%91%CE%94%CE%95%CE%99%CE%A9%CE%9D-%CE%94%CE%99%CE%95%CE%9D%CE%95%CE%A1%CE%93%CE%95%CE%99%CE%91%CE%A3-%CE%A5%CE%A0%CE%91%CE%99%CE%98%CE%A1%CE%99%CE%91%CE%A3-%CE%94%CE%99%CE%91%CE%A6%CE%97%CE%9C%CE%99%CE%A3%CE%97%CE%A3.pdf); advise checking with the δήμος)
  - Μπορείτε να σχεδιάσετε εσείς το banner ή την αφίσα;
- **Related:** epigrafes-aftokollita-vitrines, psifiakes-offset-ektyposeis, grafistikos-sxediasmos.

### 4.5 Επιγραφές, αυτοκόλλητα & βιτρίνες καταστημάτων (`epigrafes-aftokollita-vitrines`)

- **Topics:** the shop front as first impression; επιγραφές καταστημάτων; seasonal window stickers (εκπτώσεις, Χριστούγεννα, Πάσχα, Black Friday) and removable vinyl; αυτοκόλλητα οχημάτων as moving advertising; ετικέτες και αυτοκόλλητα προϊόντων (βάζα, κρασί, τρόφιμα, συσκευασίες); measuring the window; design consistent with the logo. Search demand shows "επιγραφές καταστημάτων νομοθεσία": explain that rules are set by law and by each municipality, without claiming to handle permits.
- **FAQ candidates:**
  - Χρειάζομαι άδεια από τον δήμο για την επιγραφή του καταστήματος; (answer carefully: business signs on the shop front generally follow national specifications and the municipality's rules, see [Υ.Α. 20351/1985](https://www.e-nomothesia.gr/kat-diaphemistikes-epigraphes-diaphemise/ya-20351-1985.html) and local κανονισμοί; tell the customer to check with their δήμος)
  - Τι είδη επιγραφών μπορείτε να φτιάξετε; (owner: materials, lit or not)
  - Τα αυτοκόλλητα βιτρίνας ξεκολλάνε εύκολα όταν τελειώσουν οι εκπτώσεις;
  - Πόσο αντέχουν τα αυτοκόλλητα στον ήλιο και στη βροχή; (owner)
  - Αναλαμβάνετε και την τοποθέτηση; (owner)
  - Χαλάει η βαφή του αυτοκινήτου όταν αφαιρεθούν τα αυτοκόλλητα; (owner)
  - Τι ετικέτες προϊόντων τυπώνετε; (βάζα, κρασί, τρόφιμα)
  - Χρειάζεται να έρθετε να μετρήσετε τη βιτρίνα; (owner)
- **Related:** banners-afises-mousamades, grafistikos-sxediasmos, psifiakes-offset-ektyposeis.

### 4.6 Σχεδιασμός διαφημιστικού υλικού για τα social media (`social-media`)

- **Topics:** posts, stories and cover images (site.ts); one visual identity in print and on screen; digital invitations and announcements (openings, offers, events, weddings, baptisms); formats delivered; working from the customer's logo and photos.
- **FAQ candidates:**
  - Τι υλικό σχεδιάζετε για Facebook και Instagram;
  - Αναλαμβάνετε και τη δημοσίευση ή τη διαχείριση των λογαριασμών; (owner; the listed service is design only)
  - Σε ποιες διαστάσεις παραδίδετε αναρτήσεις και stories; (writers: do not quote platform sizes unless checked at writing time; platforms change them)
  - Μπορούν οι αναρτήσεις να έχουν την ίδια εικόνα με τα έντυπά μου;
  - Μπορείτε να φτιάξετε ψηφιακή πρόσκληση για γάμο, βάπτιση ή εκδήλωση;
  - Μπορώ να παραγγείλω μία ανάρτηση ή χρειάζεται πακέτο; (owner)
  - Χρειάζεται να έχω λογότυπο πριν ξεκινήσουμε;
- **Related:** grafistikos-sxediasmos, kartes-fylladia-entypa, prosklitiria-kartes.

### 4.7 Ψηφιακές & offset εκτυπώσεις (`psifiakes-offset-ektyposeis`)

- **Topics:** digital vs offset in plain words (site.ts: small quantities digital, large runs offset); choosing paper (βάρος σε γραμμάρια, ματ / γυαλιστερό / μη επιχρισμένο) and finish; why screen colours differ from print (RGB vs CMYK) and how colour is checked (site.ts: "Έλεγχος χρώματος πριν από την εκτύπωση"); preparing a print-ready PDF (περιθώρια κοπής / bleed, ανάλυση, γραμματοσειρές); what can be printed (links to κάρτες, φυλλάδια, αφίσες, προσκλητήρια).
- **FAQ candidates:**
  - Ποια είναι η διαφορά ψηφιακής και offset εκτύπωσης;
  - Πότε συμφέρει η offset εκτύπωση; (answer in terms of quantity, no numbers unless owner supplies)
  - Τυπώνετε μικρές ποσότητες;
  - Τι χαρτί να διαλέξω;
  - Γιατί τα χρώματα στην οθόνη μου διαφέρουν από το τυπωμένο;
  - Τι αρχείο χρειάζεστε για να τυπώσετε;
  - Θα δω δοκίμιο πριν από την τελική εκτύπωση; (owner)
  - Μπορείτε να διορθώσετε ή να ετοιμάσετε το αρχείο μου;
- **Related:** kartes-fylladia-entypa, banners-afises-mousamades, prosklitiria-kartes.

### 4.8 Επαγγελματικές κάρτες, φυλλάδια & έντυπα (`kartes-fylladia-entypa`)

- **Topics:** business cards (what to include, one or two sides, QR code, paper); flyers and leaflets (Α5, Α4, τρίπτυχο); catalogues and menus for cafés and restaurants; letterheads, envelopes, pads (site.ts); design + print in one place.
- **FAQ candidates:**
  - Τι διαστάσεις έχει μια επαγγελματική κάρτα; (the common Greek size is 9×5 cm; owner to confirm sizes offered)
  - Τι πρέπει να γράφει μια επαγγελματική κάρτα;
  - Μπορώ να βάλω QR code στην κάρτα μου;
  - Κάρτες μονής ή διπλής όψης: τι να διαλέξω;
  - Τι μέγεθος να έχει το φυλλάδιό μου: Α5, Α4 ή τρίπτυχο;
  - Τυπώνετε μενού για καφέ και εστιατόρια;
  - Μπορείτε να σχεδιάσετε και την κάρτα ή το φυλλάδιο;
  - Τι αρχείο χρειάζεστε για την εκτύπωση;
- **Related:** grafistikos-sxediasmos, psifiakes-offset-ektyposeis, social-media.

### 4.9 Προσκλητήρια, κάρτες & ειδικές κατασκευές (`prosklitiria-kartes`)

- **Topics:** wedding, baptism and joint wedding-and-baptism invitations; wording (κείμενο); timing; matching set (μενού, καρτελάκια τραπεζιού, ευχετήριες κάρτες); corporate greeting cards for the holidays; "ειδικές κατασκευές κατόπιν συνεννόησης" (custom pieces discussed in person); a digital version for Viber/social media (link to social-media).
- **FAQ candidates:**
  - Πόσο νωρίς πρέπει να παραγγείλω τα προσκλητήρια γάμου; (no shop lead times; general guidance only)
  - Πότε στέλνουμε τα προσκλητήρια γάμου; (common guidance: about two to three months before the wedding, per [Vistaprint](https://www.vistaprint.com/hub/when-to-send-out-wedding-invitations); writers may phrase it as general practice)
  - Τι κείμενο γράφει ένα προσκλητήριο γάμου ή βάπτισης;
  - Μπορούμε να έχουμε κοινό προσκλητήριο γάμου και βάπτισης;
  - Πόσα προσκλητήρια χρειάζομαι; (one per household/couple, plus spares)
  - Θα δω δείγμα ή μακέτα πριν από την εκτύπωση; (owner)
  - Μπορείτε να φτιάξετε και μενού, καρτελάκια τραπεζιού και ευχετήριες κάρτες στο ίδιο ύφος;
  - Τι είναι οι ειδικές κατασκευές;
- **Related:** kartes-fylladia-entypa, social-media, diafimistika-dora.

### 4.10 Τρισδιάστατες εκτυπώσεις (3D printing) (`3d-ektyposeis`)

The tenth service, added after the owner's nine and listed third. Its title is new wording, not the owner's, so it goes to the owner for review with the rest of the copy.

- **Topics:** what 3D printing is in one plain paragraph (an object built layer by layer from a digital model, no mould); product groups from site.ts (πρωτότυπα και μακέτες; ανταλλακτικά και μικρά εξαρτήματα; φιγούρες, δώρα και διακοσμητικά; τρισδιάστατα γράμματα και λογότυπα); printing from the customer's ready file (STL); with only an idea, a photo, a sketch with dimensions or the broken part, the shop says whether and how it can be done (no promise to draw the model until the owner confirms it); choosing size, material and colour by use (fit, load, heat, detail); the logo in 3D next to the shop's signs, cards and clothing.
- **FAQ candidates:**
  - Τι χρειάζεστε για να τυπώσετε ένα αντικείμενο σε 3D;
  - Μπορείτε να φτιάξετε ένα ανταλλακτικό που έσπασε;
  - Ποια υλικά και χρώματα χρησιμοποιείτε; (owner; no materials named until confirmed)
  - Πόσο μεγάλο αντικείμενο μπορείτε να τυπώσετε; (owner; no sizes until confirmed)
  - Μπορείτε να σχεδιάσετε το μοντέλο αν δεν έχω αρχείο; (owner)
  - Μπορώ να έχω το λογότυπό μου σε τρισδιάστατη μορφή;
  - Πόσο κοστίζει μια 3D εκτύπωση; (what it depends on; no figures)
- **Owner must confirm:** printing technology, materials, colours, the largest size per print, finishing (sanding, painting), accepted file formats besides STL, whether the shop draws 3D models from an idea or a sketch.
- **Related:** diafimistika-dora, grafistikos-sxediasmos, epigrafes-aftokollita-vitrines.

---

## 5. Off-site and local SEO actions for the owner

Google ranks local results on **relevance, distance and prominence**; prominence includes links and "more reviews and positive ratings", and "there's no way to request or pay for a better local ranking" ([Google Business Profile help](https://support.google.com/business/answer/7091)).

### 5.1 Google Business Profile (most important single action)

1. **Claim and verify** the profile at business.google.com. Unverified profiles rarely show.
2. **Name:** the real-world name as on the sign, e.g. "Διατύπωση" (or "ΔΙΑΤΥΠΩΣΗ Διαφήμιση – Εκτυπώσεις" only if that is exactly what the storefront sign shows). No city, no keywords, no slogans: Google suspends names with "unnecessary information" ([guidelines](https://support.google.com/business/answer/3038177)). Google's guidelines also discourage all-caps unless it is the real name; mixed case "Διατύπωση" is the safe choice.
3. **Categories:** one specific primary category plus the fewest additional ones that complete "this business **is a** …" ([guidelines](https://support.google.com/business/answer/3038177), [categories help](https://support.google.com/business/answer/7249669)). Google's category list is fixed and localised; the exact Greek labels could not be verified from outside the editor, so pick them in the editor (typing the English name also finds them). Suggested:
   - **Primary:** Print shop (Greek UI probably "Τυπογραφείο").
   - **Additional (choose 3–5 that are true):** Digital printing service; Commercial printer (if offset is done in-house); Sign shop; Advertising agency; Graphic designer; Promotional products supplier; Screen printer or a T-shirt / custom apparel printing category **only if** the shop does that printing itself. "Print shop", "Digital printing service" and "Commercial printer" are confirmed category names used by print shops ([GMB Everywhere](https://www.gmbeverywhere.com/categories/print-shop-google-business-profile)); the others must be confirmed in the picker.
4. **Address and map pin:** exact street address (Greek), ΤΚ written "123 45", correct municipality; drag the pin onto the shop door. If customers do not visit (unlikely for this shop), use a service area instead.
5. **Hours:** regular hours plus special hours for holidays (Χριστούγεννα, Πάσχα, 15 Αυγούστου, August closure if any). "ανοιχτό τώρα" queries filter on this.
6. **Phone:** the mobile, 6974 122 163, as the primary number (the shop has no landline). Same number as the site.
7. **Website:** `https://<domain>/`. Optional UTM for tracking in analytics: `https://<domain>/?utm_source=google&utm_medium=organic&utm_campaign=gbp` (the canonical tag makes the parameter harmless).
8. **Services:** add all ten services with their titles and a 1–2 sentence description each, written from the page leads (no prices). Under **Products** (which allow a link), add the key items (Επαγγελματικές κάρτες, Μουσαμάδες, Roll-up banners, Αυτοκόλλητα βιτρίνας, Μπλουζάκια με στάμπα, Κούπες με λογότυπο, Προσκλητήρια γάμου…) each linking to its `/ypiresies/<slug>/` page.
9. **Description (750 chars):** plain Greek: who the shop is, the main services, the city/area. No links, no keyword lists.
10. **Photos (real, not stock):** storefront from the street (helps people find the door), interior and counter, machines, team at work, and 3–5 finished jobs per service. Add new work photos every month. Use the same real photos on /erga/.
11. **Posts:** 2–4 per month: new work, seasonal offers on window stickers (εκπτώσεις, Χριστούγεννα), wedding/baptism season, back-to-school, year-end corporate gifts and calendars. Each post links to the matching service page.
12. **Q&A / messaging:** answer questions from the profile within a day; reuse the FAQ answers.
13. **Booking/quote link:** if available in the profile, point it to `https://<domain>/epikoinonia/#prosfora`.

### 5.2 Reviews

- Ask **every** satisfied customer, in person and with a QR code at the counter, on invoices and (later) on the business cards. Short Greek wording: "Αν μείνατε ευχαριστημένοι, μια κριτική στο Google μάς βοηθά πολύ."
- **Never** offer discounts or gifts for reviews, never ask only happy customers (review gating), never post reviews from staff or relatives: all are banned as fake engagement ([Google contribution policy](https://support.google.com/contributionpolicy/answer/7400114)).
- Reply to every review in Greek, within a few days, mentioning the job naturally ("Χαιρόμαστε που σας άρεσαν τα προσκλητήρια!"). Reply calmly to negative ones with a way to fix it.
- Do **not** add self-written ratings or `aggregateRating` of the shop to the site's structured data: Google supports review markup for local businesses only on sites that review _other_ businesses ([Google LocalBusiness docs](https://developers.google.com/search/docs/appearance/structured-data/local-business)).

### 5.3 NAP consistency

Write one master record and copy it everywhere, character for character:

- **Name:** Διατύπωση (with "Διαφήμιση – Εκτυπώσεις" as the category/description, not in the name field, unless it is on the sign)
- **Address:** Οδός Αριθμός, ΤΚ 123 45, Δήμος/Περιοχή, Πόλη
- **Phone:** 210 xxx xxxx (international +30 210 xxx xxxx)
- **Website:** https://<domain>/

The site already reads all of these from `src/data/site.ts`; keep that file the single source. The legal name/ΑΦΜ in ΓΕΜΗ (check via [gov.gr ΓΕΜΗ search](https://www.gov.gr/ipiresies/epikheirematike-drasterioteta/enarxe-kai-luse-epikheireses/stoikheia-demosiotetas-emporikon-epikheireseon-eggegrammenon-sto-geme)) can differ from the trade name, but the address and phone must match.

### 5.4 Citations (directories)

| Directory                                                      | Why                                                                          | Notes                                                                                                                                                                                                                                |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Google Business Profile                                        | the local pack and Maps                                                      | §5.1                                                                                                                                                                                                                                 |
| Apple Business Connect (Apple Maps, Siri)                      | iPhone users' Maps searches                                                  | free; availability for Greek businesses to be confirmed at sign-up ([Apple](https://www.apple.com/gr/newsroom/2023/01/introducing-apple-business-connect/))                                                                          |
| Bing Places for Business                                       | Bing ≈ 3% (≈ 6% on desktop) and feeds other assistants                       | can import from GBP                                                                                                                                                                                                                  |
| xo.gr (Χρυσός Οδηγός)                                          | the largest Greek business directory, ranks for "τυπογραφεία + city"         | has a "Δωρεάν Καταχώριση" option; paid packages are optional ([xo.gr](https://www.xo.gr/))                                                                                                                                           |
| vrisko.gr                                                      | ranks for "τυπογραφεία / ψηφιακές εκτυπώσεις / επαγγελματικές κάρτες + area" | free listing form "Δωρεάν Καταχώρηση"; categories include Τυπογραφεία, Ψηφιακές Εκτυπώσεις – Offset, Γραφίστες – Γραφικές Τέχνες, Επαγγελματικές Κάρτες, Προσκλητήρια ([vrisko.gr terms](https://www.vrisko.gr/TermsAndConditions/)) |
| 11888.gr                                                       | OTE's national business directory                                            | verify an existing listing and correct it                                                                                                                                                                                            |
| Facebook page                                                  | brand searches, reviews, NAP                                                 | same NAP, link to site; category "Print shop"                                                                                                                                                                                        |
| Instagram business profile                                     | the visual portfolio customers check                                         | address and contact buttons; link to site                                                                                                                                                                                            |
| Local Επιμελητήριο member directory                            | authoritative local link                                                     | ask the chamber the shop belongs to                                                                                                                                                                                                  |
| Local associations, sponsored teams, schools, event organisers | real local links                                                             | e.g. a "Χορηγός" mention for printed team shirts                                                                                                                                                                                     |

Not worth it: **11880.com** is a German directory ("Deutschlands größte Branchenauskunft"), not Greek. Avoid paid "1000 directories" packages.

### 5.5 Social profiles

- Use the same name, logo, NAP, hours and website on Facebook and Instagram. Handles should include the Latin brand spelling (e.g. `diatyposi`), since that is how people type a brand in Latin script.
- When the real URLs exist, put them in `site.social` (they feed `sameAs` in the structured data) and link the site from both profiles.
- Post finished work regularly; the same photos feed GBP and /erga/.

### 5.6 Google Search Console and Bing Webmaster Tools

1. Search Console: add a **Domain property** (DNS TXT record) so www/non-www and http/https are all covered.
2. Submit `https://<domain>/sitemap-index.xml`.
3. URL Inspection → "Request indexing" for `/`, `/ypiresies/`, the ten service pages and `/epikoinonia/`.
4. Watch Pages (indexing), Breadcrumbs enhancement report, and Performance → Queries filtered by country Greece. After 4–8 weeks, rewrite titles of pages with impressions but low CTR.
5. Bing Webmaster Tools: sign in and **import from Search Console** (sites and sitemaps come over). Optional: IndexNow for faster Bing pickup.

### 5.7 Links between GBP and the site

- GBP website → home page; GBP products/posts → the matching service pages; GBP booking/quote → `/epikoinonia/#prosfora`.
- Site → GBP: the contact page's "open in Google Maps" link should open the verified place (today `site.address.mapUrl` and the embedded map point at the street address, Ελ. Βενιζέλου 205, because the owner's Google place still lists no. 226; once the profile shows 205, `mapUrl` can become the place's share link); a "Αφήστε μας κριτική" link to the GBP review URL can go on the contact page.

---

## 6. Launch checklist

In order:

1. **Domain:** done: `SITE_URL` in `astro.config.mjs` is `https://diatyposi.com` (no www). Redirect the other variants (http, `www.diatyposi.com`) to it with 301 in Cloudflare (a redirect rule on the zone).
2. **Owner values:** fill every `TODO(owner)` left (`grep -rn "TODO(owner)" src astro.config.mjs`). Phone, e-mail, Viber, WhatsApp, street, city, postcode, the map (`mapQuery`, `mapUrl`) and hours are real now. Still open: `geo` (at least 5 decimals, per [Google](https://developers.google.com/search/docs/appearance/structured-data/local-business)), `locative` and `areaServed` (step 3), Facebook and Instagram URLs, and real work photos.
3. **Locality:** set `site.address.locative` (e.g. "στην Αθήνα", "στο Περιστέρι", "στη Θεσσαλονίκη"; see §3.1) and `site.address.areaServed` (the municipalities the shop really serves).
4. **Structured data switch:** set `site.contactIsPlaceholder = false` only after steps 2–3 are real.
5. **Copy:** the ten service pages approved by the owner (`npm run content-review`), no "TODO(owner)" left in visible text, stand-in labels still shown on any stand-in image.
6. **Indexing switch:** done 2026-11-24: `public/_headers`, which sent `X-Robots-Tag: noindex` site-wide, is deleted. After any deploy, no page should send `X-Robots-Tag: noindex` or `<meta name="robots" content="noindex">` except the 404 page and hidden sections.
7. **robots.txt and sitemap:** open `https://<domain>/robots.txt` (Allow all, Sitemap line on the real domain) and `https://<domain>/sitemap-index.xml` (all pages, including the ten `/ypiresies/<slug>/`, on the real domain, no 404).
8. **Search Console + Bing:** §5.6 (verify, submit sitemap, request indexing).
9. **Rich results:** test `/`, one service page and `/epikoinonia/` in the [Rich Results Test](https://search.google.com/test/rich-results) (Breadcrumb, Local business) and in the [Schema Markup Validator](https://validator.schema.org/) (WebSite site name, Service, FAQPage, which the Rich Results Test no longer covers).
10. **GBP:** verified, website field pointing to the live domain, NAP identical to the footer/contact page (§5.1, §5.3).
11. **Spot checks after a week:** `site:<domain>` shows the pages; searching "Διατύπωση εκτυπώσεις {Πόλη}" shows the site and the GBP panel.

---

## 7. What the site already does well, and the gaps (at base `12dfa94`)

### 7.1 Already good

- **Fast static HTML** (Astro static output): Lighthouse mobile SEO 100 and Performance 95–100 on every page ([docs/LIGHTHOUSE.md](LIGHTHOUSE.md)); real-host CWV still to be measured.
- **Language and locale:** `<html lang="el">`, `og:locale` `el_GR`, sitemap with `el-GR`, all copy in Greek with correct τόνοι.
- **Crawlability:** `robots.txt` allows all and lists the sitemap (`src/pages/robots.txt.ts`); `@astrojs/sitemap` generates `/sitemap-index.xml`; `trailingSlash: 'always'` + `build.format: 'directory'` give one consistent URL per page.
- **Canonical** on every indexable page; the 404 page is `noindex` (`BaseLayout.astro`).
- **One h1 per page**, semantic headings, Greek alt text on images, AVIF/WebP via Astro images.
- **Latin slugs** (/ypiresies/, /erga/, /etaireia/, /epikoinonia/) that Google accepts as transliterated words.
- **LocalBusiness JSON-LD** (`src/lib/seo.ts`) with a guard that leaves out placeholder contact data (`contactIsPlaceholder`), plus `hasOfferCatalog` listing the services (ten now), `logo`, `image`, `slogan`.
- **Open Graph and Twitter cards** with a 1200×630 share image (matters for links shared on Viber, Messenger, WhatsApp).
- **Self-hosted fonts with Greek subsets**, preloaded; no third-party requests until the visitor opts in to the map.
- **Conversion paths:** tap-to-call, Viber, WhatsApp, a quote form that pre-selects the service (`quoteHref`).
- **Pre-launch protection:** `public/_headers` sent `X-Robots-Tag: noindex` site-wide on purpose (removed at launch, 2026-11-24).

### 7.2 Gaps found at the base

| Gap                                                                                                                                                                 | Where                                                                            | Effect                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No page per service; nine intents share `/ypiresies/`                                                                                                               | `src/pages/ypiresies.astro`                                                      | One URL cannot rank for μπλουζάκια, επιγραφές and προσκλητήρια at once.                                                                                                                                                                                               |
| Generic titles: "Υπηρεσίες", "Έργα", "Η εταιρεία", "Επικοινωνία και προσφορά"; home "ΔΙΑΤΥΠΩΣΗ \| Διαφήμιση – Εκτυπώσεις"                                           | `src/i18n/pages/*.ts`, `BaseLayout.astro`                                        | Titles carry no searched term and no city.                                                                                                                                                                                                                            |
| h1s with no search term (home owner headline, "Ό,τι χρειάζεται η εικόνα σας, σε ένα μέρος", "Πείτε μας τι έχετε στο μυαλό σας.")                                    | hero, `PageHeader` users                                                         | Weak relevance signal; Google uses the h1 for title links.                                                                                                                                                                                                            |
| City nowhere in titles, h1s or copy (placeholder `Πόλη`)                                                                                                            | `src/data/site.ts`                                                               | Cannot match "τυπογραφείο {Πόλη}" or "κοντά μου" beyond GBP.                                                                                                                                                                                                          |
| `hasOfferCatalog` service URLs point to anchors (`/ypiresies/#slug`)                                                                                                | `src/lib/seo.ts`                                                                 | Should point to the service pages once they exist.                                                                                                                                                                                                                    |
| No `WebSite` markup (site name, `alternateName`)                                                                                                                    | `BaseLayout.astro` / `seo.ts`                                                    | Google may show the domain instead of "ΔΙΑΤΥΠΩΣΗ"; brand variants (Διατύπωση, Diatyposi) not declared. Google also accepts the lowercase domain as a fallback `alternateName` ([Google site names](https://developers.google.com/search/docs/appearance/site-names)). |
| No `BreadcrumbList`                                                                                                                                                 | layout                                                                           | Breadcrumb trail in desktop results is lost ([Google: available on desktop](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb)).                                                                                                        |
| No `areaServed`; LocalBusiness only on `/` and `/epikoinonia/`                                                                                                      | `seo.ts`, pages                                                                  | Service area not stated; service pages do not reference the business entity.                                                                                                                                                                                          |
| No FAQ content anywhere                                                                                                                                             | pages                                                                            | Misses the question long tail (§2.1) and AI Mode answers.                                                                                                                                                                                                             |
| ~~`sameAs` would publish the bare `facebook.com/` / `instagram.com/` placeholders~~ (resolved 2026-11-24: `site.social` holds the real Instagram and Facebook URLs) | `site.social`                                                                    | Nothing left to do for the URLs.                                                                                                                                                                                                                                      |
| Portfolio is all stand-in images                                                                                                                                    | `portfolio` in `site.ts`                                                         | No proof of work for users or image search; replace with real jobs.                                                                                                                                                                                                   |
| Footer, home services showcase and idea journey link to `/ypiresies/#slug` anchors                                                                                  | `Footer.astro:88`, `home/ServicesShowcase.astro:45`, `home/IdeaJourney.astro:46` | Internal links should point to the service pages once they exist.                                                                                                                                                                                                     |

### 7.3 Structured data choices (recommendation)

- **Type:** keep `LocalBusiness`. Google asks for the most specific subtype, but schema.org has no print-shop, sign-shop or advertising subtype; `ProfessionalService` is deprecated ("deprecated due to confusion with Service", [schema.org](https://schema.org/ProfessionalService)); `Store` misdescribes a service business; Google does not support `additionalType` ([Google LocalBusiness docs](https://developers.google.com/search/docs/appearance/structured-data/local-business), [schema.org LocalBusiness](https://schema.org/LocalBusiness)). Include `name`, `address` (required), `geo`, `telephone`, `url`, `openingHoursSpecification`, `image`, `logo`, `sameAs`, `areaServed`, `hasMap`. Omit `priceRange` (owner has not given prices) and any self-review rating.
- **WebSite** on the home page only: `name` "ΔΙΑΤΥΠΩΣΗ", `alternateName` ["Διατύπωση", "Diatyposi", "Diatiposi", "<domain>"], `url` the home URL. Site name must match the home title and `og:site_name`; test with the Schema Markup Validator (the Rich Results Test does not cover site names).
- **Service** on each service page: `name` (owner title), `serviceType` (primary query), `description`, `url`, `provider` → `{"@id": "<site>/#business"}`, `areaServed`. No `offers`/prices. There is no Google rich result for `Service`; it clarifies the entity graph for search and AI systems.
- **BreadcrumbList** on every page below home: Αρχική → Υπηρεσίες → <service>. Shown on desktop results.
- **FAQPage:** Google removed FAQ rich results on 7 May 2026 and its FAQ documentation in June 2026 ([Google](https://developers.google.com/search/docs/appearance/structured-data/faqpage); [Search Engine Land](https://searchengineland.com/google-to-no-longer-support-faq-rich-results-476957)). The visible FAQ text is what matters (long-tail queries, AI Mode citations). Keeping FAQPage markup is harmless if it matches the visible Q&A exactly; do not expect a rich result, and do not add it to pages without a visible FAQ.

---

## Sources

- StatCounter, Greece: [search engines](https://gs.statcounter.com/search-engine-market-share/all/greece), [monthly](https://gs.statcounter.com/search-engine-market-share/monthly/greece), [desktop](https://gs.statcounter.com/search-engine-market-share/desktop/greece), [search hosts](https://gs.statcounter.com/search-engine-host-market-share/all/greece), [platforms](https://gs.statcounter.com/platform-market-share/desktop-mobile/greece)
- Google Search Central: [URL structure](https://developers.google.com/search/docs/crawling-indexing/url-structure), [title links](https://developers.google.com/search/docs/appearance/title-link), [site names](https://developers.google.com/search/docs/appearance/site-names), [LocalBusiness](https://developers.google.com/search/docs/appearance/structured-data/local-business), [breadcrumb](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb), [FAQ (deprecated)](https://developers.google.com/search/docs/appearance/structured-data/faqpage)
- Google Business Profile help: [local ranking](https://support.google.com/business/answer/7091), [guidelines](https://support.google.com/business/answer/3038177), [categories](https://support.google.com/business/answer/7249669); [contribution policy (reviews)](https://support.google.com/contributionpolicy/answer/7400114)
- Google Greece blog: [AI Mode in Greece](https://blog.google/intl/el-gr/etairika-nea/anazhthsh-google-google-search-paroysiash-ths-leitoyrgias-ai-mode-sthn-ellada/); [To Vima](https://www.tovima.com/society/googles-ai-mode-goes-live-in-greece-with-greek-language-support)
- Search Engine Roundtable: [accented characters (2021)](https://www.seroundtable.com/google-seo-accented-characters-31666.html), [accents in URLs](https://www.seroundtable.com/google-accents-in-urls-seo-27314.html); Search Engine Land: [FAQ rich results](https://searchengineland.com/google-to-no-longer-support-faq-rich-results-476957)
- schema.org: [LocalBusiness](https://schema.org/LocalBusiness), [ProfessionalService](https://schema.org/ProfessionalService)
- GBP categories: [GMB Everywhere, print shop](https://www.gmbeverywhere.com/categories/print-shop-google-business-profile), [Stacc, print shop categories](https://thestacc.com/blog/print-shop-gbp-categories/)
- Greek directories: [vrisko.gr τυπογραφεία](https://www.vrisko.gr/dir/typografeia/), [vrisko.gr terms](https://www.vrisko.gr/TermsAndConditions/), [xo.gr](https://www.xo.gr/), [11888.gr](https://www.11888.gr/), [Apple Business Connect](https://www.apple.com/gr/newsroom/2023/01/introducing-apple-business-connect/)
- Greek regulations (context for FAQ answers only): [Υ.Α. 20351/1985](https://www.e-nomothesia.gr/kat-diaphemistikes-epigraphes-diaphemise/ya-20351-1985.html), [Δήμος Θεσσαλονίκης, άδειες υπαίθριας διαφήμισης](https://thessaloniki.gr/wp-content/uploads/2016/12/%CE%95%CE%9A%CE%94%CE%9F%CE%A3%CE%97-%CE%91%CE%94%CE%95%CE%99%CE%A9%CE%9D-%CE%94%CE%99%CE%95%CE%9D%CE%95%CE%A1%CE%93%CE%95%CE%99%CE%91%CE%A3-%CE%A5%CE%A0%CE%91%CE%99%CE%98%CE%A1%CE%99%CE%91%CE%A3-%CE%94%CE%99%CE%91%CE%A6%CE%97%CE%9C%CE%99%CE%A3%CE%97%CE%A3.pdf)
- Product references: [Pixartprinting, roll-up sizes](https://www.pixartprinting.co.uk/blog/roll-up-banner-sizes/), [Vistaprint, when to send wedding invitations](https://www.vistaprint.com/hub/when-to-send-out-wedding-invitations)
- Autocomplete evidence: Google suggest endpoint (`suggestqueries.google.com/complete/search`, `hl=el`, `gl=gr`), queried 23 November 2026. Suggestions change over time and indicate phrasing, not volume.
