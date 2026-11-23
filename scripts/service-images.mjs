/**
 * Generates the photograph of each service (src/assets/portfolio/<file>) with OpenAI GPT Image 2.6
 * Sunburst through OpenRouter. The pictures are AI-generated illustrations of what each service
 * delivers, not work made by ΔΙΑΤΥΠΩΣΗ (see CREDITS.md). Every call costs money.
 *
 *   OPENROUTER_API_KEY=… node scripts/service-images.mjs [--only slug1,slug2]
 *
 * Flags:
 *   --only <slugs>        comma-separated service slugs to regenerate (default: all ten)
 *   --quality <q>         high | xhigh | max (default: max; falls back to xhigh once if refused)
 *   --resolution <tier>   optional resolution tier sent to the API, e.g. 2K or 4K (default: none)
 *   --raw <dir>           folder for the untouched API images
 *                         (default: <os tmp>/service-images-raw)
 *   --dry-run             print the prompts and request settings only; no key, no network, no files
 *
 * Each image is requested at 4:3 (3:2 if the API refuses 4:3), saved raw to --raw, then
 * centre-cropped to exactly 4:3, resized to 2000 × 1500 and written as a metadata-free sRGB
 * JPEG (mozjpeg, quality 86). Three images are generated at a time; a request that fails with
 * 429 or 5xx is tried once more after a pause. The exit code is 1 if any image failed.
 *
 * The key is read only from the OPENROUTER_API_KEY environment variable. It is never printed,
 * logged or written anywhere.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';

const ENDPOINT = 'https://openrouter.ai/api/v1/images';
const MODEL = 'openai/gpt-image-2.6-sunburst';
const QUALITIES = ['high', 'xhigh', 'max'];
const ASPECT = '4:3';
const FALLBACK_ASPECT = '3:2';
const OUT_WIDTH = 2000;
const OUT_HEIGHT = 1500;
const JPEG_QUALITY = 86;
const CONCURRENCY = 3;
/** Attempts per request when the API answers 429 or 5xx, or the network fails. */
const MAX_ATTEMPTS = 2;
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

const root = resolve(import.meta.dirname, '..');
const portfolioDir = join(root, 'src', 'assets', 'portfolio');

// ---------------------------------------------------------------------------------------------
// Prompts. One art-direction brief per service (what the customer receives, taken from the
// service's description and product list in src/data/site.ts and its page copy in
// src/i18n/pages/service-<slug>.ts), followed by the shared photographic direction below.
// Things the owner has not confirmed are kept out: no embroidery, no lit signs, no full vehicle
// wraps, no engraving.
// ---------------------------------------------------------------------------------------------

const STYLE = `
Photographic direction: a genuine professional commercial product photograph, taken by a working
photographer for a small print and advertising studio in Heraklion, Crete, Greece. It must look
like a real photograph: not a 3D render, not CGI, not an illustration, not a painting, not a
glossy stock-photo cliché. Full-frame digital camera, true-to-life colour and white balance,
natural contrast, gentle highlight roll-off, fine natural sensor grain, believable optical depth
of field with crisp focus on the hero products. Real materials with small honest imperfections:
paper fibres and slightly soft trimmed edges, fabric weave and creases, tiny dust specks, faint
fingerprints on glossy surfaces, uneven natural light falloff, real contact shadows.
Colour palette: warm paper whites, natural wood and stone, charcoal, with restrained cyan, magenta
and yellow accents that feel natural, never neon or oversaturated.
Composition: landscape 4:3 frame. Keep every important object inside the central 80 percent of
the frame, with breathing room on all four sides, so a slight centre crop loses nothing. One
clear focal area, an uncluttered background and calm negative space; the picture must still read
clearly as a small thumbnail.
Branding and text: every logo is a fictional, simple, clean abstract geometric mark. No real
brands, trademarks, product designs or app interfaces. No legible words, letters or numbers
anywhere unless named in the brief; where a layout needs text, show it only as soft grey lines
too small or too far out of focus to read. No text overlays, captions, watermarks, signatures,
borders or frames.
People: no faces. If people appear, show only hands, arms or torsos, natural and relaxed, with
anatomically correct hands.
`;

/** Same order as `services` in src/data/site.ts. */
const SERVICES = [
  {
    slug: 'diafimistika-dora',
    file: 'dora-01.jpg',
    prompt: `
Subject: the finished promotional gifts one local business ordered with its logo, plus one
personal gift, photographed as a curated still life. Every branded item carries the same
fictional logo, printed: a solid circle cut by a single diagonal wave, in deep teal with a small
coral dot. The group, relaxed and slightly overlapping, seen from about 35 degrees above, on a
pale oak table top in front of a soft warm-white plastered wall:
two glossy white ceramic mugs with the logo printed crisply on their curved sides, following the
curve of the mug; a clear drinking glass with the logo printed in white; four slim ballpoint pens
in teal and white, fanned in a row, the small logo printed on each barrel; a hardcover A5 planner
with a teal linen-textured cover and the logo printed in white; a small stack of notepads with the
logo at the top of the first page; a natural off-white cotton tote bag, softly folded, with the
logo printed large in teal, its handles draped behind the group.
To one side, the personalised gift: a white mug printed with a child's colourful crayon drawing of
a sun and a little house, next to a small kraft gift box tied with a thin coral ribbon.
Lighting: soft natural window light from the left, a gentle shadow falling to the right, a faint
warm bounce. Lens: 50 mm at f/4, the front mugs and pens in sharp focus, the tote bag gently soft.
Mood: tidy, generous, ready to hand over to customers.`,
  },
  {
    slug: 'mplouzakia-rouxismos',
    file: 'rouxismos-01.jpg',
    prompt: `
Subject: finished printed garments ready for collection at a small print studio: team and event
T-shirts and staff workwear for a local café-bakery. Every garment carries the same fictional
logo: a bold, simple geometric mark of a half sun above three horizontal stripes.
On the left, a black metal clothes rail with five crew-neck T-shirts on wooden hangers, all in the
team colour, deep cobalt blue, each with the logo printed large and crisp across the chest in
white and warm yellow; the print sits flat in the fabric and the cotton weave shows faintly
through it.
In front, on a light wooden counter, a neat stack of folded white event T-shirts with the same
logo printed in full colour, the top one half unfolded to show the print.
On the right, the staff workwear with the logo printed small on the chest: a charcoal polo shirt
folded on the counter, a dark denim-blue bib apron hanging from a wall hook with the logo on its
bib, a navy baseball cap with the logo printed on the front panel, and a heather-grey hooded
sweatshirt draped over a wooden stool with a small chest print.
All logos are printed, never embroidered, with no stitching around them.
Setting: a bright, clean studio corner with a white-painted brick wall and a polished concrete
floor; a couple of plain kraft cardboard boxes and white tissue paper suggest the order is being
packed. Lighting: large soft daylight from a window on the right with gentle fill, accurate
fabric colours. Lens: 50 mm at f/3.5, at chest height looking slightly down, crisp detail on the
prints of the hanging shirts and on the cap.`,
  },
  {
    slug: '3d-ektyposeis',
    file: '3d-ektyposeis-01.jpg',
    prompt: `
Subject: a 3D printing workbench in a small, tidy print studio: a desktop FDM 3D printer mid-print
beside a group of finished 3D-printed objects made from customers' ideas and files.
In the background left, the printer: a generic, unbranded open-frame model with a black aluminium
frame and no logos, printing a small translucent orange part. The hot nozzle is laying a fine bead
of filament, and the horizontal layer lines are clearly visible on the half-finished part.
In the foreground, on a light birch workbench and in sharp focus, the finished pieces:
a matte grey functional prototype bracket with screw holes, lying next to a pencil sketch of the
same bracket with dimension lines on squared paper (the drawing has no legible numbers);
a replacement spare part, a black plastic appliance knob, beside the broken original it replaces;
a small white architectural maquette of a simple house with a pitched roof;
a small matte white owl figurine with fine visible layer texture;
a personalised gift, a terracotta-coloured desk ornament shaped like a stylised olive branch;
and two chunky glossy 3D-printed sign letters, a red capital Δ and a white capital Σ, standing
upright like letters for a shop counter.
A spool of filament rests at the right edge, out of focus.
Every printed object shows real FDM surface texture: fine layer lines, a tiny seam, a hint of
stringing; honest, not as smooth as injection moulding.
Lighting: soft daylight from a side window plus the gentle glow of the printer's own LED strip.
Lens: 85 mm at f/2.8 from a low three-quarter angle, the finished objects sharp, the printer
nozzle readable, the background softly blurred.`,
  },
  {
    slug: 'grafistikos-sxediasmos',
    file: 'grafistiko-01.jpg',
    prompt: `
Subject: the result of a logo and brand-identity project for a fictional small business, on a
designer's desk: the path from the first sketch to the finished identity. The fictional logo is
a clean geometric mark of two interlocking arcs forming a leaf-like shape, in deep forest green
with a warm ochre accent.
Left third: an open sketchbook with pencil thumbnail sketches exploring that same mark, rough
circles and arcs, some crossed out, a pencil and an eraser beside it.
Centre back: a slim laptop whose screen shows the finished logo large on a clean white artboard,
with a row of four flat colour swatches beneath it, in a plain generic design interface reduced to
simple grey panels.
Right and foreground, in sharp focus, the printed identity applications laid out neatly: a fan of
business cards (green back with the mark, white front with soft unreadable grey lines), an A4
letterhead with a matching envelope, a kraft paper shopping bag with the mark printed on it, a
small product box with a printed sleeve, a sheet of round sticker labels with the mark, and a few
printed colour swatch chips with no lettering.
Setting: a light ash-wood desk by a window, white wall behind. Lighting: soft overcast window
light from the left. Lens: 50 mm at f/4, about 40 degrees above the desk, sharp on the printed
applications, the sketchbook slightly softer. Mood: considered, calm, professional.`,
  },
  {
    slug: 'banners-afises-mousamades',
    file: 'banners-01.jpg',
    prompt: `
Subject: large-format prints in real use on a small shop front in a sunny side street of
Heraklion, Crete, on its grand-opening day.
Across the upper facade, above the doorway, a wide printed PVC banner stretched taut and neatly
fixed at its corners, carrying a bold graphic: large flat colour shapes in magenta, cyan and
yellow on white and the shop's fictional logo, a simple geometric mark of three stacked rounded
bars; no lettering.
At the entrance, a roll-up banner standing on its silver aluminium base, its tall printed graphic
in the same colours with a large photographic image of fresh flowers and the same logo.
In the shop window, a large poster in the same design, mounted flat behind the glass.
Facade: warm pale limestone, a dark green wooden door, terracotta pots with basil, bright
Mediterranean daylight with soft shade from the building opposite.
Real print details: the subtle sheen of the vinyl, slight tension ripples at the banner corners,
the base and pole of the roll-up, faint reflections on the window glass.
Camera: 35 mm at f/5.6, from across the narrow street at eye level, the whole storefront framed
with a strip of sky above and pavement below; no passers-by. The prints are the hero and the
clearest, most colourful part of the picture.`,
  },
  {
    slug: 'epigrafes-aftokollita-vitrines',
    file: 'epigrafes-01.jpg',
    prompt: `
Subject: the finished signage and vinyl work of one small business, a deli of local Cretan
products, seen by day on a street in Heraklion, Crete. Everything carries the same fictional
logo: an abstract olive-leaf mark inside a circle, in olive green and warm white.
Above the shop window, a non-illuminated shop sign: a matte charcoal fascia panel with the logo
as raised, dimensional cut shapes in warm white and olive green, casting small crisp shadows.
On the shop window glass, crisp window vinyl: a frosted band across the lower part of the glass,
the logo cut in white vinyl at eye level, and a few simple pictogram stickers on the glass door
(a clock icon, a card icon) without any text.
Through the window, a wooden shelf of honey jars and olive-oil bottles wearing matching printed
product labels in charcoal and olive green.
At the kerb on the right edge, the front half of a small white delivery van with the logo applied
as a cut-vinyl decal on its front door: a partial decal only, not a full wrap.
Facade: whitewashed wall, a stone threshold, bougainvillea at the corner, soft daylight with
gentle shadows. Real details: the fine cut edges of the vinyl, faint reflections of the street in
the glass. No people.
Camera: 35 mm at f/5.6, from across the street at a slight angle, sharp throughout.`,
  },
  {
    slug: 'social-media',
    file: 'social-01.jpg',
    prompt: `
Subject: a cohesive set of social media designs for a fictional neighbourhood café, shown on
devices together with the matching printed material on a studio desk; the point is that screen
and paper share one look. The café's identity: a simple coffee-bean-like geometric mark and a
palette of terracotta, cream and deep teal, with generous flat shapes and warm food photography.
Centre: a laptop showing a 3 × 3 grid of square post designs in that palette (photos of coffee and
pastries, bold colour blocks, the mark in a corner), in a plain generic interface with no real
platform logos, icons or names.
In front, a hand holds a smartphone upright showing a full-screen vertical story design in the
same style; a tablet lying flat to the side shows a wide cover image in the same style.
Beside them on the desk, in sharp focus, the printed counterparts: an A5 flyer and a small stack
of business cards in exactly the same colours and layout as the posts, next to a small cup of
coffee. Any text on the screens and prints appears only as short abstract bars and blocks.
Setting: light wood desk, white wall, the edge of a green plant leaf. Lighting: soft daylight,
screens bright but not blown out, natural reflections on the glass. Lens: 50 mm at f/3.5, a
three-quarter view from slightly above, sharp on the phone screen and the printed flyer.`,
  },
  {
    slug: 'psifiakes-offset-ektyposeis',
    file: 'ektyposeis-01.jpg',
    prompt: `
Subject: fresh press output in a working print shop, showing finished offset and digital print and
the care for colour and paper.
Centre and foreground: the delivery end of a sheet-fed offset press (unbranded, industrial grey
and green paint, no logos or labels) with a neat pile of freshly printed large sheets. The top
sheet shows a vibrant brochure layout imposed several times: full-colour photographs of Cretan
landscapes and food, flat colour panels, crop marks, and a thin CMYK colour control strip along
the edge; any text only as soft grey lines. A folding loupe (linen tester) rests on the sheet over
the colour strip.
To the right, on a steel bench: a short stack of trimmed and folded brochures and postcards from
the digital press, a fan of unprinted paper samples in different whites and finishes (matte,
gloss, uncoated), an ink knife with a little magenta ink on its blade, and a colour swatch fan
with blank chips.
Setting: a clean, organised pressroom, the machinery behind softly out of focus. Lighting:
neutral daylight-balanced overhead light like a colour viewing booth, plus a soft side light
raking across the paper to show its texture and sheen. Lens: 50 mm at f/4, about 45 degrees
above the sheets, sharp on the top sheet and the loupe. Details: slight paper curl, the faint
sheen of fresh ink, real paper texture.`,
  },
  {
    slug: 'kartes-fylladia-entypa',
    file: 'kartes-01.jpg',
    prompt: `
Subject: a full set of printed stationery and marketing print for one fictional small business,
a boutique guesthouse, flat-laid and slightly overlapping on a textured warm-grey linen surface,
all in one consistent design: a palette of ink navy, sand and a coral accent, and a fictional
logo that is a minimal geometric arch.
In sharp focus at the centre: a stack of premium thick business cards with a coral-painted edge,
two loose cards on top, one showing the arch mark on navy, the other the white side with soft
unreadable grey lines.
Around them: an A5 flyer with a bold photograph of a sunny whitewashed courtyard and colour
blocks; a tri-fold brochure standing partly open; a menu card on thick uncoated stock; an A4
letterhead, a long envelope and a notepad, each with the logo.
Textures clearly visible: the tooth of uncoated paper, soft-touch matte beside a glossy flyer,
crisp trimmed edges. Any text appears only as fine grey lines or tiny out-of-focus type.
Lighting: soft natural window light from the top left with gentle long shadows that show the
thickness of the cards. Lens: 85 mm at f/4, looking down at about 70 degrees, the central stack
sharp and the edges falling softly out of focus.`,
  },
  {
    slug: 'prosklitiria-kartes',
    file: 'prosklitiria-01.jpg',
    prompt: `
Subject: a complete, elegant Greek wedding stationery suite with a matching baptism invitation,
photographed as a styled flat-lay on a soft ivory linen cloth.
In sharp focus at the centre: a wedding invitation card on thick cotton paper with a delicate
hand-drawn olive-branch illustration in sage green and a fine gold ornamental flourish (abstract,
no letters); its matching sage-green envelope lies open beside it with a cream liner, tied with a
thin dusty-sage silk ribbon.
Around it, in the same design: a tall menu card for the wedding table, three small tent-folded
place cards, a folded greeting card, and, slightly apart, a baptism invitation in a softer
palette of pale blue and cream with a small olive sprig.
A few real olive leaves, a sprig of dried wheat and a loose curl of ribbon complete the scene.
Any text appears only as fine, elegant, tiny lines that read as calligraphy from a distance but
are not legible words.
Lighting: soft, diffused morning window light from the right, gentle shadows showing the thickness
of the paper and its deckled edges. Lens: 85 mm at f/4, top-down with a slight tilt, shallow
depth of field toward the edges. Mood: timeless, romantic, Greek and Mediterranean, keepsake
quality.`,
  },
];

const clean = (text) => text.replace(/\s+/g, ' ').trim();
const fullPrompt = (service) => `${clean(service.prompt)}\n\n${clean(STYLE)}`;

// ---------------------------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------------------------

const usage = (message) => {
  console.error(`service-images: ${message}`);
  console.error('Usage: OPENROUTER_API_KEY=… node scripts/service-images.mjs [--only slug1,slug2]');
  console.error('       [--quality high|xhigh|max] [--resolution 2K|4K] [--raw <dir>] [--dry-run]');
  process.exit(2);
};

let args;
try {
  args = parseArgs({
    options: {
      only: { type: 'string' },
      quality: { type: 'string', default: 'max' },
      resolution: { type: 'string' },
      raw: { type: 'string', default: join(tmpdir(), 'service-images-raw') },
      'dry-run': { type: 'boolean', default: false },
    },
    strict: true,
  }).values;
} catch (error) {
  usage(error.message);
}

if (!QUALITIES.includes(args.quality)) {
  usage(`--quality must be one of ${QUALITIES.join(', ')}`);
}

let selected = SERVICES;
if (args.only !== undefined) {
  const slugs = args.only
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const unknown = slugs.filter((slug) => !SERVICES.some((s) => s.slug === slug));
  if (slugs.length === 0 || unknown.length > 0) {
    usage(
      `unknown slug(s) in --only: ${unknown.join(', ') || '(none given)'}\n` +
        `Known slugs: ${SERVICES.map((s) => s.slug).join(', ')}`,
    );
  }
  selected = SERVICES.filter((s) => slugs.includes(s.slug));
}

const rawDir = resolve(args.raw);

/** Request settings shared by all workers, so a refused value is not sent again. */
const settings = { quality: args.quality, aspect: ASPECT };

const requestBody = (prompt) => ({
  model: MODEL,
  prompt,
  aspect_ratio: settings.aspect,
  quality: settings.quality,
  output_format: 'png',
  background: 'opaque',
  n: 1,
  ...(args.resolution ? { resolution: args.resolution } : {}),
});

if (args['dry-run']) {
  console.log(`Dry run: ${selected.length} prompt(s), no requests sent, no files written.\n`);
  for (const service of selected) {
    const { prompt, ...rest } = requestBody(fullPrompt(service));
    console.log(`=== ${service.slug} → src/assets/portfolio/${service.file}`);
    console.log(`request: ${JSON.stringify(rest)}`);
    console.log(`prompt (${prompt.length} chars):\n${prompt}\n`);
  }
  process.exit(0);
}

const apiKey = process.env.OPENROUTER_API_KEY?.trim();
if (!apiKey) {
  console.error(
    'service-images: OPENROUTER_API_KEY is not set. Run it as\n' +
      '  OPENROUTER_API_KEY=… node scripts/service-images.mjs [--only slug1,slug2]\n' +
      'or use --dry-run to print the prompts without calling the API.',
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isRetryable = (status) => status === 429 || status >= 500;

/** Set when the account cannot go on (bad key, no credit): images not yet started are skipped. */
let fatal = null;

const errorMessage = (json, text) =>
  (json && typeof json.error?.message === 'string' && json.error.message) ||
  text.slice(0, 300) ||
  '(empty response body)';

/** POSTs one generation request, retrying 429/5xx and network failures. */
const post = async (body, log) => {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // A timed-out generation may still be billed, so it is not repeated automatically.
      if (error?.name === 'TimeoutError') {
        throw new Error(`no answer within ${REQUEST_TIMEOUT_MS / 60000} min (not retried)`, {
          cause: error,
        });
      }
      if (attempt >= MAX_ATTEMPTS) {
        throw new Error(`network error: ${error?.message ?? error}`, { cause: error });
      }
      const wait = 5000 * attempt;
      log(`network error (${error?.message ?? error}); retrying in ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // Not JSON: reported through `text` below.
    }
    if (res.ok) {
      if (!json) throw new Error('the API answered 200 with a body that is not JSON');
      return { ok: true, json };
    }
    const message = errorMessage(json, text);
    if (isRetryable(res.status) && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const wait =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter, 120) * 1000
          : 5000 * 2 ** (attempt - 1) + Math.round(Math.random() * 1000);
      log(`HTTP ${res.status}: ${message}; retrying in ${Math.round(wait / 1000)}s`);
      await sleep(wait);
      continue;
    }
    return { ok: false, status: res.status, message };
  }
};

/**
 * Generates one image. Falls back once from quality 'max' to 'xhigh' and once from aspect 4:3 to
 * 3:2 when the API refuses the value, and keeps the fallback for the images that follow.
 */
const generate = async (service, log) => {
  const prompt = fullPrompt(service);
  let qualityFallbackUsed = false;
  let aspectFallbackUsed = false;
  for (;;) {
    const body = requestBody(prompt);
    log(`requesting (quality ${body.quality}, aspect ${body.aspect_ratio})`);
    const result = await post(body, log);
    if (result.ok) return { json: result.json, quality: body.quality, aspect: body.aspect_ratio };

    const { status, message } = result;
    if (status === 401 || status === 402 || status === 403) {
      fatal = `HTTP ${status}: ${message}`;
      throw new Error(fatal);
    }
    if (
      status === 400 &&
      /quality/i.test(message) &&
      body.quality === 'max' &&
      !qualityFallbackUsed
    ) {
      qualityFallbackUsed = true;
      if (settings.quality === 'max') settings.quality = 'xhigh';
      log(`the API refused quality 'max' (${message}); retrying once with 'xhigh'`);
      continue;
    }
    if (
      status === 400 &&
      /aspect/i.test(message) &&
      body.aspect_ratio === ASPECT &&
      !aspectFallbackUsed
    ) {
      aspectFallbackUsed = true;
      if (settings.aspect === ASPECT) settings.aspect = FALLBACK_ASPECT;
      log(
        `the API refused aspect ${ASPECT} (${message}); ` +
          `retrying with ${FALLBACK_ASPECT}, centre-cropped to 4:3`,
      );
      continue;
    }
    throw new Error(`HTTP ${status}: ${message}`);
  }
};

/** Returns the image bytes from `data[0]`: inline base64, or a signed download URL. */
const imageBytes = async (json) => {
  const item = Array.isArray(json.data) ? json.data[0] : undefined;
  if (item && typeof item.b64_json === 'string' && item.b64_json.length > 0) {
    return Buffer.from(item.b64_json, 'base64');
  }
  if (item && typeof item.url === 'string' && item.url.startsWith('https://')) {
    // A signed URL: fetched without the API key, which must never go to another host.
    const res = await fetch(item.url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`downloading the image URL failed: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error('the response has no data[0].b64_json or data[0].url');
};

// ---------------------------------------------------------------------------------------------
// Image processing
// ---------------------------------------------------------------------------------------------

/** Saves the untouched image, then writes the 2000 × 1500 JPEG into src/assets/portfolio/. */
const save = async (service, bytes, log) => {
  const meta = await sharp(bytes).metadata();
  if (!meta.width || !meta.height) throw new Error('the returned image could not be read');
  const base = service.file.replace(/\.jpe?g$/i, '');
  const rawPath = join(rawDir, `${base}.${meta.format === 'jpeg' ? 'jpg' : meta.format}`);
  await writeFile(rawPath, bytes);

  // Centre crop to exactly 4:3.
  let width = meta.width;
  let height = Math.round((width * 3) / 4);
  if (height > meta.height) {
    height = meta.height;
    width = Math.round((height * 4) / 3);
  }
  const left = Math.floor((meta.width - width) / 2);
  const top = Math.floor((meta.height - height) / 2);
  if (width < OUT_WIDTH) {
    log(`warning: the 4:3 crop is ${width} × ${height}, upscaled to ${OUT_WIDTH} × ${OUT_HEIGHT}`);
  }

  // sharp writes no metadata unless asked to (keepMetadata/withMetadata), so EXIF/XMP/ICC
  // chunks are dropped; the pixels are converted to sRGB first.
  const jpeg = await sharp(bytes)
    .extract({ left, top, width, height })
    .resize(OUT_WIDTH, OUT_HEIGHT, { fit: 'fill', kernel: 'lanczos3' })
    .flatten({ background: '#ffffff' })
    .toColorspace('srgb')
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
  const outPath = join(portfolioDir, service.file);
  await writeFile(outPath, jpeg);
  return { rawPath, source: `${meta.width} × ${meta.height}`, kb: Math.round(jpeg.length / 1024) };
};

// ---------------------------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------------------------

await mkdir(rawDir, { recursive: true });

const total = selected.length;
const results = [];
let next = 0;

const formatCost = (cost) => (typeof cost === 'number' ? `$${cost.toFixed(4)}` : 'n/a');

const run = async (service, index) => {
  const label = `[${index + 1}/${total}] ${service.slug} → ${service.file}`;
  const log = (line) => console.log(`${label}: ${line}`);
  if (fatal) {
    log(`skipped (${fatal})`);
    return { service, ok: false, error: `skipped: ${fatal}` };
  }
  const started = Date.now();
  try {
    const { json, quality, aspect } = await generate(service, log);
    const cost = typeof json.usage?.cost === 'number' ? json.usage.cost : null;
    const bytes = await imageBytes(json);
    const saved = await save(service, bytes, log);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    log(
      `ok in ${seconds}s, quality ${quality}, aspect ${aspect}, source ${saved.source} → ` +
        `${OUT_WIDTH} × ${OUT_HEIGHT}, ${saved.kb} KB, cost ${formatCost(cost)}; ` +
        `raw: ${saved.rawPath}`,
    );
    return { service, ok: true, cost };
  } catch (error) {
    log(`FAILED: ${error?.message ?? error}`);
    return { service, ok: false, error: error?.message ?? String(error) };
  }
};

console.log(
  `Generating ${total} image(s) with ${MODEL}, ${CONCURRENCY} at a time. Raw images: ${rawDir}`,
);

await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, total) }, async () => {
    while (next < total) {
      const index = next++;
      results[index] = await run(selected[index], index);
    }
  }),
);

const failed = results.filter((r) => !r.ok);
const costs = results.filter((r) => r.ok).map((r) => r.cost);
const known = costs.filter((c) => typeof c === 'number');
const totalCost = known.reduce((sum, c) => sum + c, 0);
const unknownCosts = costs.length - known.length;

console.log('');
console.log(
  `Done: ${total - failed.length} of ${total} written to src/assets/portfolio/. ` +
    `Total cost ${formatCost(totalCost)}` +
    (unknownCosts > 0 ? ` (cost not reported for ${unknownCosts} image(s))` : '') +
    '.',
);
if (settings.quality !== args.quality) {
  console.log(`Note: quality '${args.quality}' was refused; images used '${settings.quality}'.`);
}
if (settings.aspect !== ASPECT) {
  console.log(
    `Note: aspect ${ASPECT} was refused; images were requested at ${settings.aspect} ` +
      'and centre-cropped.',
  );
}
if (failed.length > 0) {
  console.error(`Failed (${failed.length}):`);
  for (const r of failed) console.error(`  ${r.service.slug} (${r.service.file}): ${r.error}`);
  process.exit(1);
}
