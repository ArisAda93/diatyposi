# ΔΙΑΤΥΠΩΣΗ — Design

## 1. Concept: the print process

The site is built the way a print job is made. Every visual device comes from the press room, used as a system:

| Device                       | Where it is used                                  | Rule                                                                                                          |
| ---------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **CMYK overprint**           | Logo arches, journey mark, 404, icon plates       | Overlapping inks use `mix-blend-mode: multiply`, so C+M makes blue, M+Y red, C+Y green, as on press.          |
| **Crop marks and ink drops** | Hero sheet corners, framed images, section starts | Thin key-black hairlines, never more than one framed object per screen.                                       |
| **Halftone dots**            | Image hover reveal, statement section             | CSS radial-gradient dots, low contrast, masked.                                                               |
| **Paper**                    | Every light section                               | Warm off-white with a faint fixed grain (SVG noise, 3.5% opacity). Dark sections read as solid key-black ink. |
| **Plate separation**         | Service icons on hover, logo mark                 | Four stacked copies (C, M, Y, K) split by a few px, then snap back into register.                             |
| **Colour bar**               | Footer top, values strip, section and page heads  | The control strip printed at the edge of every press sheet: four solid patches plus tints.                    |

**Signature moments.** (Round 1 limited the site to two; the owner's round-2 direction makes the whole site feel alive: see §7.)

1. **Hero (home).** Round 3 (§8): a WebGL scene (OGL, loaded after first paint) of the four arches as extruded CMYK plates running the metamorphosis loop (mark → ring → wave → mark), with overprint blending and pointer parallax, over the site-wide living background. Intro once per session (`sessionStorage`): the plates arrive from depth out of register and snap into the stack while the headline's C/M/Y ghosts converge. The headline is painted at first paint (LCP-safe). On scroll the plates return to the mark and hand over to the header logo. Without WebGL, under reduced motion or before load, the static SVG mark shows (a short CSS intro plays on it where motion is allowed). Reduced motion: the composed state, no animation.
2. **Μία ιδέα. Παντού. (home, round 3).** A sample mark is sketched, printed and placed on product after product on a CSS-sticky stage while the steps scroll past (no pinning or scroll-jacking). Reduced motion or no JS: every step shows its finished illustration.

Round 1 kept everything else quiet. Round 2 replaces that with a site-wide motion layer (§7). Still no scroll-jacking, no pinning that traps the visitor, and no custom cursor.

## 2. Palette (sampled from the logo raster, median of pure pixels)

| Token               | Hex       | Use                                                                                    |
| ------------------- | --------- | -------------------------------------------------------------------------------------- |
| `--color-cyan`      | `#00AEEF` | Graphics, plates, fills. Ink text on it is fine (6.2:1). Never as text on paper.       |
| `--color-magenta`   | `#ED008C` | Graphics, plates. Never as small text, never as a button fill with white text (4.2:1). |
| `--color-yellow`    | `#FFF100` | Graphics, plates, text selection, fills under ink text.                                |
| `--color-key`       | `#221F20` | The logo's black: wordmark, primary buttons, body text.                                |
| `--color-red`       | `#C03529` | The logo subtitle red: spaced caps labels on paper (5.3:1 on paper, AA).               |
| `--color-paper`     | `#FAFAF7` | Page background.                                                                       |
| `--color-paper-2`   | `#F1EFE8` | Alternate light section, card fills.                                                   |
| `--color-line`      | `#DCD9CF` | Warm grey hairlines and borders (decorative only).                                     |
| `--color-muted`     | `#5A5650` | Secondary text on paper (6.9:1).                                                       |
| `--color-ink`       | `#161514` | Solid ink sections (statement, footer).                                                |
| `--color-ink-muted` | `#ABA79E` | Secondary text on ink (7.4:1).                                                         |

Text pairs: key on paper 15.6:1, paper on ink 17.6:1, red on paper 5.3:1, muted on paper 6.9:1, key on yellow 15:1, key on cyan 6.2:1. Cyan, magenta and yellow are never used for text on paper.

## 3. Typography

All three faces were checked by rendering `ά έ ή ί ό ύ ώ ϊ ϋ ΐ ΰ Ά Έ Ή Ί Ό Ύ Ώ Ϊ Ϋ` (screenshot in the build report).

| Role    | Face                                                                  | Notes                                                                                                                                       |
| ------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Display | **Commissioner** (variable, Greek designer Kostas Bartsokas), 750–900 | Echoes the geometric weight of the wordmark. Uppercase strings are written in uppercase in the source (no accents), never `text-transform`. |
| Text    | **Inter** (variable), 400–600                                         | Body, forms, UI.                                                                                                                            |
| Voice   | **Comfortaa** (variable), 300–400                                     | Only for the tagline, echoing the logo's light hand-drawn line. Not preloaded.                                                              |

Self-hosted WOFF2, `greek` + `latin` subsets with `unicode-range`, `font-display: swap`. Preloaded: Commissioner greek and Inter greek only.

**Scale** (fluid, `clamp`, 360 → 1920):

| Token        | Size                                      | Line height | Use                                                |
| ------------ | ----------------------------------------- | ----------- | -------------------------------------------------- |
| `display-xl` | 2.6rem → 7.25rem                          | 0.95        | Hero h1                                            |
| `display-l`  | 2.25rem → 5.25rem                         | 1.0         | Statement, page h1                                 |
| `h2`         | 1.9rem → 3.5rem                           | 1.05        | Section titles                                     |
| `h3`         | 1.25rem → 1.75rem                         | 1.2         | Card and step titles                               |
| `lead`       | 1.125rem → 1.375rem                       | 1.55        | Intro paragraphs                                   |
| `body`       | 1.0625rem                                 | 1.65        | Running text                                       |
| `small`      | 0.875rem                                  | 1.5         | Meta                                               |
| `label`      | 0.75rem → 0.8125rem, 700, tracking 0.24em | 1.2         | Spaced caps labels in red, after the logo subtitle |

## 4. Space and grid

- 4 px base. Section padding `clamp(4.5rem, 2.5rem + 8vw, 10rem)`.
- Content width 1440 px max (`--wrap`), side gutter `clamp(1rem, 4vw, 3rem)` (16 px at 360). 12-column grid, gap `clamp(1rem, 2vw, 2rem)`.
- Radius: 0 (paper is cut square). Buttons and chips are square too; the plate-shadow carries the tactility.
- Touch targets ≥ 44 px everywhere.

## 5. Motion

| Token         | Value                                                            |
| ------------- | ---------------------------------------------------------------- |
| `--dur-fast`  | 140 ms (hover colour, press)                                     |
| `--dur-base`  | 240 ms (lifts, underlines)                                       |
| `--dur-slow`  | 480 ms (menu, lightbox)                                          |
| `--ease-out`  | `cubic-bezier(.2,.8,.2,1)`                                       |
| `--ease-snap` | `cubic-bezier(.3,1.5,.5,1)` (registration snap, small overshoot) |

Hover: buttons get a CMY plate shadow that collapses into register on press; linked cards lift 2 px; images zoom 1.03 inside their frame; underlines draw from left. Every transition is disabled under `prefers-reduced-motion`.

## 6. Pages (wireframes in words)

**Shared header.** Sticky paper bar, 72 px. Left: compact logo (arches + wordmark). Centre-right: nav (Αρχική, Υπηρεσίες, Η εταιρεία, Επικοινωνία; Έργα is hidden while under development, `hiddenSections.work` in `src/data/site.ts`) with a drawn underline for the current page. Right: phone button with icon and number (from 1280 px; a phone icon button between 1024 and 1279 px), then the key-black “Ζητήστε προσφορά”. Under 1024 px: logo, phone icon button, “Μενού” button opening a full-screen paper menu (large display links, phone, CTA, socials; focus trapped; Esc closes).

**Shared footer.** Solid ink. Colour bar on top. Three columns: logo (paper wordmark) with the tagline in Comfortaa; services list; contact details with the social links under them. Bottom row: © year, privacy link.

**Mobile floating contact.** Under 768 px, a two-button bar fixed at the bottom: Κλήση, Viber. Body gets bottom padding so nothing hides under it.

### Αρχική

1. **Hero (one screen, round 3 §8).** One composed block on the left 7 of 12 columns: the two-line h1 “Η ιδέα σας… / γίνεται δημιουργία!”, a hairline ending in an ink drop, the owner's intro paragraph as its lead, and three buttons: “Ζητήστε προσφορά” (key), “Οι υπηρεσίες μας” (outline) and “Γνωρίστε μας” (cyan, `btn-accent`), the last two always side by side. On the right, the arches in motion (the metamorphosis loop). Crop marks at the sheet corners; no foot strip or scroll cue (the header's scroll progress takes that role). Phones: the art above the copy.
2. **Services showcase** (round 2, §7). h2 left, link right. Desktop: a sticky 3D “plate” previews the active service (photo, icon, number, lead sentence) in that service's ink. The change between services is a C/M/Y registration transition. Beside it, an index of the ten services, in the owner's order, as large typographic rows linking to each service's own page (/ypiresies/<slug>/). Phones: rows with thumbnails.
3. **Μία ιδέα. Παντού. (round 3 §8).** Replaces the process section. A sticky stage on desktop where one sample mark (“Η επωνυμία σας”) is sketched, printed plate by plate and then lands on a business card, a T-shirt, a shop sign, a mug and a social post, while seven short steps scroll past, each linking to its service. It closes with “Τι θα θέλατε να φτιάξουμε;”: toggle chips that build a quote link with every chosen service pre-selected, and three promises. Phones, reduced motion and no JS: each step shows its finished illustration.
4. **Selected work** (hidden while `hiddenSections.work`; the sections after it renumber). An editorial, staggered set of four images of different sizes on their own parallax depths, with numbered captions, “Δείτε όλα τα έργα”.
5. **Values strip.** The owner's paragraph “Για εμάς…” on the left; on the right four rows, each a colour-bar patch (C, M, Y, K) that prints in on scroll, and one value in display type.
6. **Statement.** Full-bleed ink section, halftone arches in the background, the tagline in display-l paper type.
7. **Contact band.** Yellow band, ink text, a short line and two buttons (offer, call).

### Υπηρεσίες

Page header (h1, short intro). Desktop: a slim sticky rail index of the ten services with CMYK reading-progress fill. Beside it, ten calm chapters on paper (round 2, §7). Each chapter has: a plate-colour rule; a folio with icon and number; h2 (owner's title); the photo in a crop-marked 3D frame that straightens on scroll; a giant number behind, tinted and outlined in the chapter's ink (round 5); the description at lead size; “Συνήθεις εργασίες” as tag chips; “Ζητήστε προσφορά για αυτό”, which pre-selects the service in the form, and “Περισσότερα για την υπηρεσία”, which opens the service's own page. Mobile: the index becomes a horizontal chip row.

### Μία υπηρεσία (`/ypiresies/<slug>/`)

One page per service, ten from one template, each in the service's plate ink (its colour on Υπηρεσίες). A quiet breadcrumb trail under the header (Αρχική › Υπηρεσίες › the service, the current page as plain text). Page header: the service's short name as the label, the keyword-led h1 and a short intro. 01 the service: the owner's title as the h2; the photo in a crop-marked frame with a halftone under-plate beside the description, “Συνήθεις εργασίες” as tag chips and “Ζητήστε προσφορά”, which pre-selects the service; then two to four body sections, each a hairline, its h2 on the left and a reading column on the right (stacked on phones). 02 Συχνές ερωτήσεις: native expandable rows between hairlines, every answer in the page, a square plus marker that fills with the page's ink when open. 03 Σχετικές υπηρεσίες: two or three linked cards (ink rule, plate icon, short name, first sentence), with “Δείτε όλες τις υπηρεσίες” in the head. Contact band. No script of its own.

### Έργα

Page header. Filter chips (Όλα + categories that have items), with `aria-pressed` and a live count. A varied grid (wide, tall, square tiles). Each tile opens an accessible lightbox (`<dialog>`, arrows, Esc, focus returns). Stand-in images carry a visible “Ενδεικτική εικόνα” chip driven by the data file.

### Η εταιρεία

Page header with the owner's intro. A two-column block: a crop-marked 4:3 photograph of the studio's work table (AI-generated, labelled «Ενδεικτική εικόνα»; it shows the work for every service) with four numbered markers on the sketch, the logo proposals, the colours and the proof, and beside it the owner's “Για εμάς…” paragraph with the four steps listed under it, numbered like the markers. Below 64rem the list follows the photo. The steps are buttons: pointing at one (or its marker), focusing it or tapping it marks both; with motion allowed and WebGL the photo is a depth-parallax scene (`src/scripts/workbench/`, depth map from `scripts/workbench-depth.mjs`) whose camera glides and zooms to the marked step under a soft spotlight, looks around with the pointer while the frame tilts a few degrees under a faint glare, and breathes slowly when idle. Reduced motion or no WebGL: the plain photo, with the marking only. No JS: the plain photo and its markers; the step buttons do nothing. Values in four plate-coloured blocks. Contact band.

### Επικοινωνία

Page header. Two columns: left, contact details, hours table, social links, the Google map of the shop (the whole box opens Google Maps); right, the quote form (anchor `#prosfora`). The form ends in three send buttons (email, Viber, WhatsApp) that open the visitor's own app with the composed message prefilled to the shop; the site sends nothing itself. A valid submit shows a “ready” panel in place of the form: send it from the app, attach any files there, and, if the app did not open, the other two apps, the shop's email and the text to copy.

### Πολιτική απορρήτου

Plain reading page (max 68ch) with a numbered contents list from 1024px, honest about what the site does: no cookies or analytics, only the theme choice and the hero-intro marker in the browser; the Google map loads with the contact page; the quote form sends nothing through the site, it opens the visitor's own app. It names the controller, purposes and legal bases, retention, recipients (Cloudflare, Google/Gmail, Viber, WhatsApp), transfers outside the EU and the visitor's rights (GDPR Art. 13).

### 404

“Misprint”: a huge 404 printed in C, M, Y and K plates out of register; hovering or focusing the home button snaps it into register. A short line and a button home.

## 7. Round 2: the living sheet

The owner asked for one unified header and hero, a full-hero motion graphic built from the logo, a site that feels alive with 3D interactivity while scrolling, and better services sections.

- **Unified hero and header (home).** The header sits transparent over a full-viewport hero and belongs to its composition. It turns into the solid paper bar once the hero has scrolled away.
- **The plates in 3D.** A WebGL scene (OGL, loaded after first paint) extrudes the logo's four arches into solid CMYK plates. The plates float in an exploded stack with overprint blending, follow the pointer with damped parallax, and sit over a quiet field of the arch motif. On scroll, the plates collapse into register and **dock into the header logo**: the hero art becomes the logo. The fallback is the static SVG mark (no WebGL, reduced motion, or before load).
- **Motion layer (every page)**, driven by data attributes:
  - heading registration reveal (C/M/Y converge);
  - 3D depth entry;
  - halftone print-in for photos;
  - pointer tilt with an ink sheen;
  - magnetic buttons whose plate shadow follows the pointer;
  - a CMYK scroll-progress hairline;
  - scroll-velocity misregistration on the header logo.

  Every effect is off under reduced motion, except the scroll-progress hairline, which is a direct, non-animated mapping of the scroll position. Pointer effects are off on touch devices. No effect hides content when JS is unavailable.

- **Statement.** An interactive halftone field prints the arches in dots, which swell around the pointer.
- **Services (home).** A sticky 3D "plate" previews the active service; the change between services is a registration transition. Beside it, a large typographic index of the ten services.
- **Services page.** Calm editorial chapters: a photo in a 3D frame that straightens on scroll, a giant tinted number, a plate-colour rule, product tags, and a rail index with CMYK progress.

## 8. Notes on skills

The `design-taste-frontend` skill was loaded. Its craft rules were followed (left-aligned layouts, one system, real hover layer, no fade-on-scroll, honest copy, stand-ins listed). Where it conflicts with this brief, the brief wins: the brief asks for grain, halftone, crop marks and CMYK overprint (the skill reserves effects for tech sites), visible stand-in labels, and placeholder contact values.

## 8. Round 3: the living site

The owner asked for a reworked hero motion graphic built from the logo shapes, one unified hero instead of a hero plus an intro, a background that feels alive and three-dimensional on every page, professional parallax, a replacement for the process section, the services in the client's order, and more polish and feedback everywhere.

- **Hero metamorphosis.** The four extruded plates run an 18 s loop: the logo mark (exploded in depth, breathing) → the ring (the four arches turn to 0°, 90°, 180° and 270° and close into a ring that turns slowly) → a wave (plates side by side, alternately upright and inverted) → back to the mark with the registration snap. Moves are staggered in print order Y, M, C, K and lift off the sheet mid-move. On scroll the plates return to the mark and hand over to the header logo, whose arches print in. Static SVG mark for reduced motion and no WebGL. Tuning: `src/scripts/hero-scene/choreography.ts` and the top of `scene.ts`.
- **Unified hero.** The owner's intro is the headline's lead inside the hero; the separate intro section is gone.
- **Living background (every page).** A fixed WebGL canvas behind all content (`LivingBackground.astro`, `src/scripts/living-background/`). Round 5 replaced the round-3 glyph sheet and the round-4 floating plates with ink lines (see §10). Crossing lines combine with a per-channel darken (MIN) blend on paper and lighten (MAX) on dark paper. No WebGL: paper and grain. Reduced motion: one still frame.
- **Parallax.** `data-parallax="<speed>"` (−0.4…0.4, amplified ×1.6 in round 4; positive recedes, negative leads) on decorative layers on every page, driven by the CSS `translate` property so it composes with other transforms. Off under reduced motion.
- **Feedback.** Buttons lift on hover and focus and press in, with a C/M/Y ink ripple from the pointer; links draw their underline; toggles snap; the header nav draws a registration underline and marks the current page with a CMYK rule; the mobile menu opens with a registration wipe; form fields show focus, valid and invalid states; page changes use a short cross-document view transition. All off under reduced motion.
- **Services order** (client's request): διαφημιστικά δώρα, μπλουζάκια και ρουχισμός, γραφιστικός σχεδιασμός, banners, επιγραφές, social media, ψηφιακές και offset εκτυπώσεις, κάρτες και έντυπα, προσκλητήρια. Every list follows `services` in `src/data/site.ts`.

## 9. Round 4: the living logo field, dark mode, sections

The owner asked for the logo's shapes to move across the whole page, stronger parallax and 3D, a professional dark mode switchable from the navigation bar, page headers whose arches feel connected, a more unified journey section, and clear sections so visitors never get lost.

- **Floating plates (every page, round 4; replaced in round 5 by the ink lines, §10).** The living background drew the logo arch as extruded 3D plates drifting through the page. The owner found them too prominent and clashing with the UI.
- **Text-aware ink.** Text and UI blocks are measured from the DOM and passed to the shaders (round 5: the lines keep clear of them, §10).
- **Dark mode.** `html[data-theme]` is set before first paint from the stored choice (`dt-theme`) or the system setting, and the toggle in the header (and in the mobile menu) switches it with a circular reveal. Semantic tokens flip (paper #141311, raised #1C1A18, key #F2EFE8, muted #ADA89F, label red #F26A5B); CMY never flip. Overprint uses `--blend-ink` (multiply on paper, screen on dark), so inks combine towards light on dark paper, and the K plate becomes the light key. Ink sections stay darker than the page with a hairline edge; yellow and cyan blocks keep their light-mode design through `.tokens-light`. The hero and the living background switch live (`dt:themechange`). Without JS the page is light.
- **Sections.** `Section.astro` gives every home section (and the company page) the same head: a hairline rule that starts with a colour-bar segment and ends with an ink drop, the section number and red caps label, the h2, and an optional lead and link; variants plain, sheet (a raised press sheet with crop marks), ink and band. `SectionRail.astro` lists the sections at the right edge on wide screens and marks the current one.
- **Page headers.** Inner pages open with a masthead: the colour bar, a key hairline and an ink drop, with the four arches standing on that rule as halftone outlines, like the arches standing over the wordmark in the logo; the label and title hang below. On scroll the arches print in Y, M, C, K and snap into register.
- **Journey.** Scrolling only picks the step; the sticky stage then plays each change by itself at a calm pace (faster when catching up), so visitors never have to scroll through an effect or stop on a half-finished frame. The mark travels on an arc between objects; a CMYK spine with a node per step joins the steps; the stage leans with the pointer and the mark separates into its plates on hover. Objects are drawn at true proportions (card 85 × 55, a current iPhone body 71.9 × 150 mm with Dynamic Island). Each object arrives as a line sketch and its hyper-realistic photograph (src/assets/journey/, generated from the sketch so the composition matches) prints over it: halftone C, M, Y, K plates in press order, out of register and snapping in, resolving into the photo (WebGL; image cross-fade without it). The product then holds and never reverts to a sketch: it flies into its slot on a seven-slot contact sheet under the stage while the mark lifts off and travels to the next sketch, so by the last step the sheet shows the whole journey; a slot click jumps to its step, and a Sketch / Product switch shows the shown step's sketch again. Steps are 70svh tall. The phone shows an Instagram-style feed. Phones and reduced motion get stills, each on its own opaque sheet of paper. With motion allowed each still plays in three beats, each started by scrolling and then running by itself: its sketch draws in once 30 % of it is in view (lines, then fills, then the mark's plates sliding into register, about 1.1 s), holds, and once practically all of it is in view (85 %) the photo prints over it on the same WebGL halftone press as the desktop stage (about 1.7 s; the canvas exists only while it prints). Without WebGL the photo fades in while the sheet settles into register. A still scrolled back below the screen plays again; one scrolled past shows its product.

## 10. Round 5: quiet ink lines, filled numbers

The owner found the floating plates too prominent: on the services page they drifted over and across the UI. The background stays alive but becomes quiet.

- **Ink lines (every page).** The living background now draws a few braids of hairlines (about 1–1.5 px) in the logo's C, M, Y and K. Each braid follows a slow wave across the screen; its four lines weave around it, cross one another and meet at travelling nodes, where they print a little stronger, like registration lines on a press sheet. They move slowly with time (one wave cycle takes over a minute), the scroll carries each braid up at its own parallax rate (0.18–0.32 of the page, so it reads as depth) and shifts the waves, and a fine pointer gently parts the lines near it. Two braids on desktop and tablet, one on phones and low-end devices. Section accents (`data-bg-accent`) let that section's ink lead and quieten the others. Tuning: top of `src/scripts/living-background/scene.ts` (LINES, BRAIDS, INK_CEILINGS, TEXT) and the formulas in `lines.ts` (mirrored in `shaders.ts`).
- **Never across the UI.** Text, links, buttons, fields, images, icons and anything marked `data-bg-avoid` are measured; the lines fade out over a 36 px feather around them and keep only a fifth of their ink on them, never above the contrast-safe caps, so they pass behind the content instead of across it. Where text cannot be tracked (reduced motion, very old GPUs) the lines print at the caps everywhere.
- **Services numbers.** The giant chapter numbers on Υπηρεσίες are tinted with the chapter's ink and keep their outline, in both themes. Each tint is held under the strength at which any text crossing the number would fall below 4.6:1.
- **Polish (site-wide).** Hover lifts and fills apply only on devices that hover, so a tap never leaves a button raised; disabled buttons fade and stop responding; long button labels may wrap below 24rem. Print drops the fixed header, call bar, rail and skip link and keeps ink sections legible; Windows high-contrast mode falls back to real underlines and system colours. The header and the call bar hold still across page changes (view transitions). Inner page headers on phones show only the four solid patches of the colour bar and keep the arches within the hairline. Quote-form fields that share a row line up their controls even when only one has a hint. The lightbox stand-in chip sits on the picture's corner. Chip rows on Υπηρεσίες and Έργα run to the screen edges on phones with a fade on whichever side hides chips; the pressed or current chip is kept in the middle. The lightbox takes swipes: sideways to turn, down to close.

## 11. Round 6: the phone pass

A dedicated pass over every page at 320–430 px (portrait) and 844 × 390 (landscape), light and dark. Desktop keeps its look.

- **Shell.** The header row fits 320 px (smaller logo and tighter button under 360 px). Global tokens `--header-h` and `--float-bar-h` (call bar height including the home-indicator safe area; 0 at 768 px and up) drive the body padding and scroll padding. On touch screens the call bar slides away while a form field has focus. The menu clears the notch and scrolls on short landscape screens. Every control has a 44 px hit area; no visible text is under 12 px; iOS shows press states (a passive touch listener).
- **Hero (phones).** The primary button runs full width, the services and company buttons share the next row, and the whole block clears the call bar. The art height follows `svh`. Landscape phones place the copy beside the art as on desktop. WebGL drawing resolution is capped at 1.5× on phones.
- **Motion (phones and touch).** Reveals travel less and finish sooner, parallax moves half as far, and the halftone photo print-in uses finer dots and finishes in about half a second, starting just before the photo enters the screen. The off-register number on the active home services row is desktop-only; phones keep it crisp.
- **Services (landscape phones).** The chip bar stays in the flow instead of sticking, so the header and bar never take a third of the height.
- **Forms.** Enter moves to the next field on touch screens (`enterkeyhint="next"`); a failed submit focuses the first invalid field; the date field matches the other fields on iOS; service tiles are tappable across the whole row.
- **Contact and About.** Contact rows (phone, mobile, e-mail) are tappable across the whole row with a trailing icon; time ranges never break. The “Πώς δουλεύουμε” photo keeps 1.5rem side margins on phones, so its crop marks stay inside the gutter.
