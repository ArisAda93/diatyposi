# Credits

## Service photographs (AI-generated)

The ten service photographs in `src/assets/portfolio/` listed below are AI-generated illustrative
images, not photographs of work made by ΔΙΑΤΥΠΩΣΗ. They show what each service delivers, with
fictional logos and sample designs, and the site marks each one with the label “Ενδεικτική εικόνα”.
They were generated on 2026-11-23 with OpenAI GPT Image 2.6 Sunburst
(`openai/gpt-image-2.6-sunburst`, through OpenRouter). The prompt for each image is in
`scripts/service-images.mjs`; to regenerate one, run
`OPENROUTER_API_KEY=… node scripts/service-images.mjs --only <slug>` (each image costs money).
The script centre-crops each image to 4:3, resizes it to 2000 × 1500 and re-encodes it as an sRGB
JPEG (mozjpeg, quality 86) with all metadata removed.

| File                   | Service (slug)                   | Subject                                                                                   |
| ---------------------- | -------------------------------- | ----------------------------------------------------------------------------------------- |
| `dora-01.jpg`          | `diafimistika-dora`              | Mugs, glass, pens, planner, notepads and tote bag with one logo, and a personalised mug   |
| `rouxismos-01.jpg`     | `mplouzakia-rouxismos`           | Printed team and event T-shirts and staff workwear (polo, apron, cap, hoodie) with a logo |
| `3d-ektyposeis-01.jpg` | `3d-ektyposeis`                  | FDM 3D printer mid-print beside a prototype, spare part, maquette, figurine and letters   |
| `grafistiko-01.jpg`    | `grafistikos-sxediasmos`         | Logo sketches, the final logo on a laptop and printed brand identity applications         |
| `banners-01.jpg`       | `banners-afises-mousamades`      | Facade banner, roll-up banner and window poster on a shop front                           |
| `epigrafes-01.jpg`     | `epigrafes-aftokollita-vitrines` | Shop sign, window vinyl, product labels and a van door decal                              |
| `social-01.jpg`        | `social-media`                   | Social media posts and a story on laptop, phone and tablet, with the matching print       |
| `ektyposeis-01.jpg`    | `psifiakes-offset-ektyposeis`    | Freshly printed offset sheets with a colour bar and loupe, digital prints, paper samples  |
| `kartes-01.jpg`        | `kartes-fylladia-entypa`         | Business cards, flyer, tri-fold brochure, menu, letterhead, envelope and notepad          |
| `prosklitiria-01.jpg`  | `prosklitiria-kartes`            | Wedding invitation suite with envelope, ribbon, menu and place cards, and a baptism card  |

## Stand-in photographs

The other photographs in `src/assets/portfolio/` are licence-free stand-ins. They are not work
made by ΔΙΑΤΥΠΩΣΗ, and the site marks each one with the label “Ενδεικτική εικόνα”. They will be
replaced by photographs of the studio's own work.

To replace a stand-in or an AI-generated image with real work:

1. Put the photo in `src/assets/portfolio/` (JPEG, landscape, about 2000 px wide).
2. In `src/data/site.ts`, point the entry in `portfolio` (and, for a service photo, in
   `services`) at the new file name, update the title and alt text, and set `standIn: false`.
3. Remove the row for the old file from the tables in this file once it is no longer used.

The Unsplash and Pexels licences do not require attribution; the photographers are credited here
anyway. Every file was resized to 2000 px wide, converted to sRGB and re-encoded as JPEG
(quality 82) with all metadata removed.

| File                 | Subject                                                   | Author             | Source                                                                                  | Licence                                           | Modifications                                          |
| -------------------- | --------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------ |
| `ektyposeis-02.jpg`  | Large-format printer printing a pink and turquoise banner | Geri Sakti         | [Unsplash](https://unsplash.com/photos/industrial-printer-with-pink-banner-CYrYxz-uvE4) | [Unsplash License](https://unsplash.com/license)  | Resized, converted to sRGB, re-encoded                 |
| `entypa-01.jpg`      | Folded printed pamphlets spread on a dark wooden table    | RDNE Stock project | [Pexels](https://www.pexels.com/photo/a-close-up-shot-of-program-pamphlets-7648514/)    | [Pexels License](https://www.pexels.com/license/) | Resized, re-encoded                                    |
| `aftokollita-01.jpg` | Sheets of holographic die-cut stickers on a dark desk     | Sticker it         | [Unsplash](https://unsplash.com/photos/a-drawing-on-a-table-nTLxaQn5xxk)                | [Unsplash License](https://unsplash.com/license)  | Cropped to 3:2, resized, converted to sRGB, re-encoded |

## Journey product photographs

The seven photographs in `src/assets/journey/` (home section 02, “Από την ιδέα στο αποτέλεσμα”)
are AI-generated with OpenAI GPT Image 2.6 Sunburst (`openai/gpt-image-2.6-sunburst`, through
OpenRouter), each from the step's own line drawing as a reference so the photo lines up with the
sketch. They show the sample brand “Η επωνυμία σας”, not real work. Re-encoded as JPEG (quality
88), 1024 × 1024. The phone (`social.jpg`) shows an Instagram-style feed post on an iPhone, as a mock-up of the social media service. To regenerate one, render the step's still drawing at 1024 px and use it as the
reference image, keeping the composition and the light #FAFAF7 backdrop.

## Icons

The Facebook, Instagram, WhatsApp and Viber brand glyphs come from
[Simple Icons](https://simpleicons.org), released under
[CC0 1.0](https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md). The brand names
and logos remain trademarks of their owners.

## Fonts

Commissioner, Inter and Comfortaa are licensed under the
[SIL Open Font License 1.1](https://openfontlicense.org) and are self-hosted through
[Fontsource](https://fontsource.org).
