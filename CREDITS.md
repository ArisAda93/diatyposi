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
JPEG (mozjpeg, quality 86) with all metadata removed. Generated fine print was removed by cloning the plain surface beside it in two images: two specks on the
flyer in `entypa-01.jpg` and two marks on the inked sheet in `ektyposeis-01.jpg`. Each service uses two of them: `image` on the
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
| `kartes-02.jpg`        | `kartes-fylladia-entypa`         | Two closed printed menus on a village taverna table                     |
| `entypa-01.jpg`        | `kartes-fylladia-entypa`         | A stack of dance school flyers showing traditional dance shoes          |
| `prosklitiria-01.jpg`  | `prosklitiria-kartes`            | Wedding invitation suite on linen                                       |
| `prosklitiria-02.jpg`  | `prosklitiria-kartes`            | Baptism place card, menu and favour                                     |

To replace an AI-generated image with real work:

1. Put the photo in `src/assets/portfolio/` (JPEG, landscape, about 2000 px wide).
2. In `src/data/site.ts`, point the entry in `portfolio` (and, for a service photo, in
   `services`) at the new file name, update the title and alt text, and set `standIn: false`.
3. Remove the row for the old file from the table above once it is no longer used.

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
