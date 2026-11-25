# Credits

## Service photographs (AI-generated)

All 23 photographs in `src/assets/portfolio/` are AI-generated illustrative images, not
photographs of work made by ΔΙΑΤΥΠΩΣΗ. They show what each service delivers, product-focused in
everyday Greek settings and without people, with fictional logos and sample designs, and the site marks each one
with the label “Ενδεικτική εικόνα”. They were generated on 2026-11-24 with ByteDance Seedream 5.5
(`bytedance-seed/seedream-5-5`, through OpenRouter) at its highest resolution (2K, 2048 × 1536).
The prompt for each image is in `scripts/service-images.mjs`; to regenerate one, run
`OPENROUTER_API_KEY=… node scripts/service-images.mjs --only <file>` (each image costs money).
The script centre-crops each image to 4:3, resizes it to 2000 × 1500 and re-encodes it as an sRGB
JPEG (mozjpeg, quality 86) with all metadata removed. Small generated text was retouched out in five images: two specks on the flyer in `entypa-01.jpg`
and two marks on the inked sheet in `ektyposeis-01.jpg` (cloned from the plain surface beside
them), a glass maker's mark on the van window in `epigrafes-02.jpg` (cloned from the blurred trees
beside it), and the tiny numerals on the printer's front ruler in `ektyposeis-02.jpg` (softened
with a feathered blur, like foreground depth of field), and a line of fine print on the inner page edge of the flat menu in `kartes-02.jpg` (softened with a
feathered blur). Each service uses two of them: `image` on the
home page and /ypiresies/, `pageImage` on its own page.

| File                   | Service (slug)                   | Subject                                                                 |
| ---------------------- | -------------------------------- | ----------------------------------------------------------------------- |
| `dora-01.jpg`          | `diafimistika-dora`              | Bakery logo mugs and tote bag with plain red pens on a sunlit table     |
| `dora-02.jpg`          | `diafimistika-dora`              | Name-day gift: a mug printed with a child's drawing                     |
| `rouxismos-01.jpg`     | `mplouzakia-rouxismos`           | Printed taverna staff T-shirts and apron, harbour behind                |
| `rouxismos-02.jpg`     | `mplouzakia-rouxismos`           | Printed football team shirts on a pitch-side bench                      |
| `3d-ektyposeis-01.jpg` | `3d-ektyposeis`                  | Macro of a 3D printer nozzle printing a replacement part                |
| `3d-ektyposeis-02.jpg` | `3d-ektyposeis`                  | Finished 3D-printed objects: building model, knob, gear, boat, cutter   |
| `grafistiko-01.jpg`    | `grafistikos-sxediasmos`         | Label proofs on tsipouro bottles over the pencil sketches               |
| `grafistiko-02.jpg`    | `grafistikos-sxediasmos`         | Printed logo proposals and colour swatches on a café table              |
| `banners-01.jpg`       | `banners-afises-mousamades`      | Vinyl banner tied to a balcony railing of an apartment building         |
| `banners-02.jpg`       | `banners-afises-mousamades`      | Roll-up banner in a village square                                      |
| `epigrafes-01.jpg`     | `epigrafes-aftokollita-vitrines` | Barber shop fascia sign and window vinyl over a closed blind            |
| `epigrafes-02.jpg`     | `epigrafes-aftokollita-vitrines` | Cut-vinyl lettering on a van door                                       |
| `aftokollita-01.jpg`   | `epigrafes-aftokollita-vitrines` | Printed honey jar labels                                                |
| `social-01.jpg`        | `social-media`                   | A bougatsa photo on a phone beside the real plate                       |
| `social-02.jpg`        | `social-media`                   | Bakery post designs on a phone and as printed square cards              |
| `ektyposeis-01.jpg`    | `psifiakes-offset-ektyposeis`    | Offset press rollers inked in cyan, magenta and yellow, with an ink tin |
| `ektyposeis-02.jpg`    | `psifiakes-offset-ektyposeis`    | Poster of a fishing boat on turquoise water from a wide-format printer  |
| `ektyposeis-03.jpg`    | `psifiakes-offset-ektyposeis`    | Concert flyers (a bouzouki on an empty stage) with paper samples        |
| `kartes-01.jpg`        | `kartes-fylladia-entypa`         | Garage business cards with car keys                                     |
| `kartes-02.jpg`        | `kartes-fylladia-entypa`         | Two closed printed menus with a jug mark on a village taverna table     |
| `entypa-01.jpg`        | `kartes-fylladia-entypa`         | A stack of dance school flyers showing traditional dance shoes          |
| `prosklitiria-01.jpg`  | `prosklitiria-kartes`            | Wedding invitation suite on linen                                       |
| `prosklitiria-02.jpg`  | `prosklitiria-kartes`            | Baptism place card, menu and favour                                     |

To replace an AI-generated image with real work:

1. Put the photo in `src/assets/portfolio/` (JPEG, landscape, about 2000 px wide).
2. In `src/data/site.ts`, point the entry in `portfolio` (and, for a service photo, in
   `services`) at the new file name, update the title and alt text, and set `standIn: false`.
3. Remove the row for the old file from the table above once it is no longer used.

## Journey product photographs

The seven photographs in `src/assets/journey/` (home section 02, “Μία ιδέα. Παντού.”) are
AI-generated illustrative images with ByteDance Seedream 5.5 (`bytedance-seed/seedream-5-5`,
through OpenRouter) at its highest resolution (2K, 2048 × 2048), generated on 2026-11-25. They
show the sample brand “Η επωνυμία σας”, not real work. Each was made from the step's previous
photograph as the reference image, so it keeps the composition of the step's line drawing it
prints over; the mug photo has a soft contact shadow where the drawing has a ground hairline; the phone (`social.jpg`) shows a generic feed post with grey placeholder bars, as a
mock-up of the social media service. The prompts are in `scripts/journey-images.mjs`; to regenerate one, copy the current photographs to a folder outside `src/assets/journey/` and run `OPENROUTER_API_KEY=… node scripts/journey-images.mjs --ref <that folder> --only <step>` (each image costs money). The
script writes a metadata-free sRGB JPEG (mozjpeg, quality 90). One retouch: a stray accent the
model added before the first letter of the wordmark on the mug (`gift.jpg`) was removed with a
feathered clone from the plain glaze above it.

## Company page photograph

`src/assets/about/workbench.jpg` (/etaireia/, section «Πώς δουλεύουμε») is an AI-generated
illustrative image made with ByteDance Seedream 5.5 (`bytedance-seed/seedream-5-5`, through
OpenRouter) on 2026-11-25 at 2K (2048 × 1536), resized to 2000 × 1500 (mozjpeg, quality 86). It
shows a print studio's work table with fictional shape-only logos, not real work, and carries the
label “Ενδεικτική εικόνα”. The tiny illegible text the model put on the cards, the invitation,
the proof and the colour chips was removed by a second Seedream pass with the first image as the
reference (same composition, text removed); two colour-chip labels and the out-of-focus phone
clock keep faint, unreadable traces. On 2026-11-25 a third Seedream pass with that photo as the reference replaced the
sketchbook and pencil on the left with an iMac running vector design software (the first sketch of
the wheat logo on screen), keeping the rest of the table; the interface labels on the screen are
tiny and unreadable. The four numbered markers are drawn by the page
(`src/components/about/Workbench.astro`), at fixed percentages of this exact image: a replacement
photo needs new marker positions. Its depth map for the parallax scene,
`src/assets/about/workbench-depth.png`, is not AI-generated: `scripts/workbench-depth.mjs` computes
it (a perspective ramp of the table plus soft shapes placed by hand on the standing objects), so a
replacement photo needs new shapes there too.

## Icons

The Facebook, Instagram, WhatsApp and Viber brand glyphs come from
[Simple Icons](https://simpleicons.org), released under
[CC0 1.0](https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md). The brand names
and logos remain trademarks of their owners.

## Fonts

Commissioner, Inter and Comfortaa are licensed under the
[SIL Open Font License 1.1](https://openfontlicense.org) and are self-hosted through
[Fontsource](https://fontsource.org).
