/**
 * Generates the service photographs (src/assets/portfolio/<file>) with ByteDance Seedream 5.5
 * through OpenRouter. The pictures are AI-generated illustrations of what each service delivers,
 * not work made by ΔΙΑΤΥΠΩΣΗ (see CREDITS.md). Every call costs money (about $0.035 an image).
 *
 *   OPENROUTER_API_KEY=… node scripts/service-images.mjs [--only dora-01,dora-02]
 *
 * Flags:
 *   --only <files>   comma-separated file names, with or without .jpg (default: all)
 *   --raw <dir>      folder for the untouched API images (default: <os tmp>/service-images-raw)
 *   --dry-run        print the prompts and request settings only; no key, no network, no files
 *
 * Each image is requested at 4:3 and Seedream's highest tier (2K, 2048 × 1536), saved raw to
 * --raw, then centre-cropped to exactly 4:3, resized to 2000 × 1500 and written as a
 * metadata-free sRGB JPEG (mozjpeg, quality 86). Four images are generated at a time; a request
 * that fails with 429 or 5xx is tried once more after a pause. The exit code is 1 if any failed.
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
const MODEL = 'bytedance-seed/seedream-5-5';
const ASPECT = '4:3';
const RESOLUTION = '2K';
const OUT_WIDTH = 2000;
const OUT_HEIGHT = 1500;
const JPEG_QUALITY = 86;
const CONCURRENCY = 4;
/** Attempts per request when the API answers 429 or 5xx, or the network fails. */
const MAX_ATTEMPTS = 2;
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

const root = resolve(import.meta.dirname, '..');
const portfolioDir = join(root, 'src', 'assets', 'portfolio');

// ---------------------------------------------------------------------------------------------
// Prompts. Two photographs per service, each in a different real place, light and moment: the
// `-01` image is the service as customers meet it (home page, /ypiresies/), the second is the
// service page's own photo. Three more feed the portfolio. Bright, vivid and product-focused, in
// everyday Greek settings, with no people and no invented rooms. Only what the owner has confirmed is
// shown (src/data/site.ts): no embroidery, no lit signs, no full vehicle wraps, no engraving, no
// named textile printing method.
// ---------------------------------------------------------------------------------------------

const STYLE = `
Professional commercial product photograph for a Greek print and advertising studio, shot by a
top advertising photographer. Product-focused: the finished printed product fills most of the
frame and is the clear hero; the surroundings are only a surface and a softly blurred hint of an
everyday Greek setting, never a full room, shop interior, office or workshop. The overall look is
bright, airy and vivid: abundant clean daylight, luminous highlights, open shadows, rich
saturated colours that pop, crisp sharp detail, polished magazine-quality colour grading. Never
dark, moody, grey, dim or gritty.
The realism is in the storytelling: the product shown where it belongs and in use, with a few
props that make sense for that customer, arranged naturally rather than lined up for a catalogue.
Real materials rendered faithfully: paper texture, printed ink, cotton weave, ceramic glaze,
vinyl, glass.
No people anywhere in the frame: no faces, no hands, no arms, no bodies, no silhouettes.
Text: apart from the one word a brief names (spelled exactly as given, in large simple Greek
capitals), there is no text of any kind anywhere in the picture: no letters, words, numbers,
taglines, small print, captions, labels or writing on papers, packaging, screens, signs, walls,
clothing, machines, mugs or in the corners. Where a brief names no word, the picture contains no
lettering at all. Every logo is a simple fictional pictorial mark of a local Greek business, made
of shapes only, never of letters.
No watermarks, signatures or logos in the corners of the frame. Not a mock-up on a seamless
background, not a 3D render or illustration. Landscape frame; keep
the subject inside the central 85 percent so a slight crop loses nothing.
`;

const IMAGES = [
  // Διαφημιστικά δώρα & προσωποποιημένα προϊόντα
  {
    file: 'dora-01.jpg',
    prompt: `
A finished promotional order for a neighbourhood bakery on a sunlit wooden table: three white
ceramic mugs printed with a dark red round mark of a wheat ear and the single word "ΦΟΥΡΝΟΣ", one
still half in crumpled packing paper in an open cardboard box; a natural cotton tote bag with the
same mark lying folded in front; a few red pens with the small wheat mark. Morning sun from the
side, crisp shadows, a bright window softly blurred behind. Three-quarter view, close-medium.`,
  },
  {
    file: 'dora-02.jpg',
    prompt: `
A personalised name-day gift on a sunny courtyard table: a white mug printed with a colourful
child's crayon drawing of a little white house, a big yellow sun and a blue sea with a boat (no
figures or people in the drawing), standing on freshly torn floral gift paper with a loose red
ribbon, beside a small folded card with the handwritten words "ΧΡΟΝΙΑ ΠΟΛΛΑ", a plate of
koulourakia and a Greek coffee cup. Blurred behind: red geraniums in an old olive-oil tin against
a whitewashed wall. Close shot at table height, warm bright light.`,
  },
  // Μπλουζάκια & ρουχισμός
  {
    file: 'rouxismos-01.jpg',
    prompt: `
Printed staff T-shirts for a seaside fish taverna: a navy cotton T-shirt printed on the chest with
one large white fish mark and no lettering, on a wooden hanger hooked on a blue-painted door frame,
with two more folded on a blue wooden chair and a navy apron with the same mark draped over the
backrest. Bright sun, the harbour and fishing boats softly blurred behind. Medium-close shot, the
print and cotton weave crisp.`,
  },
  {
    file: 'rouxismos-02.jpg',
    prompt: `
New printed kit for a local youth football team laid out on a wooden pitch-side bench in the late
afternoon sun: bright green cotton T-shirts printed on the chest with a simple white football
icon above two thin white horizontal stripes, no shield, no crest, no letters or words anywhere on
the shirts; a neat folded stack and two shirts spread flat, a football resting against the bench
leg. Green grass and a goal net softly blurred behind. Low three-quarter angle, close-medium.`,
  },
  // 3D εκτυπώσεις
  {
    file: '3d-ektyposeis-01.jpg',
    prompt: `
Close-up of a desktop 3D printer at work: the hot nozzle sits directly on top of a half-finished
bright orange replacement handle and lays the next thin layer flat across its top surface; the
part grows straight up from the textured print bed, fine horizontal layer lines visible on its
sides. Out of focus behind: spools of orange and white filament. Nothing else on the table: no
papers, booklets, cards or cups. Bright clean daylight, vivid colour, shallow depth of field. No
brand names or labels.`,
  },
  {
    file: '3d-ektyposeis-02.jpg',
    prompt: `
A collection of finished 3D-printed objects on a light wooden table in bright daylight: a white
scale model of a typical Greek apartment building with balconies, a black replacement knob next to
the broken original, a small orange gear, a turquoise figurine of a fishing boat, and a red cookie
cutter shaped like an octopus. Fine layer texture visible on each piece. Nothing else on the table:
no mugs, cups or papers. Soft bright window light, a plain warm wall with nothing on it softly
blurred behind. Three-quarter view, close-medium.`,
  },
  // Γραφιστικός σχεδιασμός
  {
    file: 'grafistiko-01.jpg',
    prompt: `
Label design for a local tsipouro distillery: three small clear glass bottles with printed label
proofs wrapped around them, each a different version of a simple copper-still mark with no words or letters at all on the labels,
standing on a sheet of pencil sketches of the same mark, a colour fan with no labels, scissors and
a pencil. Bright daylight from the side makes the glass sparkle. Close-medium shot at table height,
vivid clean colours.`,
  },
  {
    file: 'grafistiko-02.jpg',
    prompt: `
Printed logo proposals for a honey shop on a round marble café table in bright morning sun: three
A4 sheets each showing a simple bee mark in a different version, no words, a row of paper colour
swatches in honey, amber and black, a pencil, an iced coffee with a straw at the edge of the frame.
Plane-tree shade and a square softly blurred behind. Angled top-down view, crisp paper texture.`,
  },
  // Banners, αφίσες & μουσαμάδες
  {
    file: 'banners-01.jpg',
    prompt: `
A freshly hung large vinyl banner on the front of an ordinary Greek concrete building above a shop
entrance, bright morning: bright yellow with a bold black dumbbell mark and the single word
"ΓΥΜΝΑΣΤΗΡΙΟ", tied at the corners with cable ties through metal eyelets, the vinyl slightly
rippled in the breeze. A balcony railing and a striped awning at the top edge, blue sky. Shot from
the pavement at a slight upward angle, the banner filling most of the frame.`,
  },
  {
    file: 'banners-02.jpg',
    prompt: `
A roll-up banner standing in a sunlit village square for a local wine festival: the banner shows a
vivid photo of vineyards and mountains and a simple grape mark, with no words or letters at all on the banner, on its aluminium base on
the paving stones, next to a wooden crate of wine bottles. Plane trees and strings of bulbs softly
blurred behind. Eye-level shot, the banner filling most of the frame, bright late-afternoon light.`,
  },
  // Επιγραφές, αυτοκόλλητα & βιτρίνες
  {
    file: 'epigrafes-01.jpg',
    prompt: `
A new shop sign and window graphics for a traditional barber shop on a sunny old-town street: a
flat, non-illuminated fascia sign in deep green with the single word "ΚΟΥΡΕΙΟ" in cream capitals
and a simple scissors mark, above a shop window carrying the same mark as a white cut-vinyl
sticker. Ochre wall, a pot of basil by the door. Shot from across the street at a slight angle, the
sign and window filling most of the frame, bright morning light, blue sky at the top edge.`,
  },
  {
    file: 'epigrafes-02.jpg',
    prompt: `
Close view of fresh cut-vinyl lettering on the side door of a white van in bright midday sun: the
dark blue word "ΥΔΡΑΥΛΙΚΟΣ" next to a simple water-drop mark, the transfer tape still half peeled
back at one corner, a felt-edged squeegee resting on the door step. Olive trees softly blurred in
the background reflections. Three-quarter close-medium shot, crisp vinyl edges.`,
  },
  {
    file: 'aftokollita-01.jpg',
    prompt: `
Jars of thyme honey with fresh printed labels on a sunny outdoor table: round cream labels with a
simple brown bee mark and the single word "ΜΕΛΙ", the honey glowing amber in the light; a roll of
the same labels on its backing paper, a wooden honey dipper, a sprig of wild thyme. Colourful
beehives on a hillside softly blurred behind. Close-medium shot at table height, vivid golden
light.`,
  },
  // Social media
  {
    file: 'social-01.jpg',
    prompt: `
Social media content for a bougatsa shop: a smartphone on a small stand shows a bright square
photo of a freshly cut bougatsa dusted with sugar and cinnamon, no interface text, right next to
the real plate of bougatsa and a cup of coffee on a white marble counter; a small printed card in
the same warm colours with a simple pie-slice mark and no words leans against the phone. Bright
morning sun, a tiled wall softly blurred behind. Close-medium shot.`,
  },
  {
    file: 'social-02.jpg',
    prompt: `
A set of social media designs for a neighbourhood bakery on a sunny marble table: a laptop screen
shows a grid of nine colourful square posts and a phone beside it shows one tall story; every
design is only a close food photo (koulouria, a spinach pie, a loaf of bread) on bold flat colour
shapes, with no logo, badge, caption, word or letter anywhere on it. The same nine designs printed
as small square cards are fanned out in front, also without any logo or text. A koulouri on a
napkin at the edge. Bright daylight, close-medium angled view focused on the cards and screens.`,
  },
  // Ψηφιακές & offset εκτυπώσεις
  {
    file: 'ektyposeis-01.jpg',
    prompt: `
Close view of freshly printed offset sheets stacked on the delivery of a printing press: each
large sheet carries eight postcards of empty Greek landscapes (a deserted blue bay, a white
chapel, an olive grove, a quiet harbour with moored boats), photos only, with no people, swimmers
or figures anywhere in them, separated by thin white gutters and corner crop marks, with a CMYK
colour bar along the edge and no text anywhere; a small loupe rests on the top sheet, ink rollers
glinting out of focus behind. Bright clean light, saturated ink colours. No brand names.`,
  },
  {
    file: 'ektyposeis-02.jpg',
    prompt: `
Close view of a large poster emerging from a wide-format inkjet printer: a vivid photo of a Greek
harbour with fishing boats and blue sea, no text, sliding over the front platen with a slight
sheen and curling down, the print carriage blurred mid-pass at the top of the frame. Bright clean
light, rich colour. No brand names, labels, logos or stickers on the machine or anywhere else.`,
  },
  {
    file: 'ektyposeis-03.jpg',
    prompt: `
Freshly printed and trimmed A5 flyers for a summer concert, a neat stack and a few fanned out, the
flyers showing a photo of a bouzouki on a stage and a plain red colour block, with no letters or text, next
to a fan of paper samples in different weights and finishes (matte, gloss, textured cream) and a
printed colour test strip with swatches. Bright daylight on a white worktop. Angled close-medium
shot.`,
  },
  // Κάρτες, φυλλάδια & έντυπα
  {
    file: 'kartes-01.jpg',
    prompt: `
Business cards for a car repair garage: a neat stack and two loose cards on a worn metal desk, white
with a bold red spanner mark and the single word "ΣΥΝΕΡΓΕΙΟ" and nothing else printed on them,
next to a set of car keys with a paper tag and a ballpoint pen. Bright light from an open garage
door softly blurred behind. Close shot at a low angle, crisp card edges and paper texture.`,
  },
  {
    file: 'kartes-02.jpg',
    prompt: `
Freshly printed folded menus on a village taverna table in bright late-morning shade: cream card
covers with a simple dark blue goat mark and the single word "ΜΕΝΟΥ", one menu open showing
colour photos of dishes only, with no letters or text of any kind, on a paper tablecloth clipped to the table, with a
basket of bread and a carafe of water. Vine leaves and sunny olive groves softly blurred behind.
Close-medium shot.`,
  },
  {
    file: 'entypa-01.jpg',
    prompt: `
A neat stack of freshly printed A5 flyers for a dance school on a marble café table in bright sun,
the top flyer fully visible and straight: a photo of an empty pair of red traditional Greek dance
shoes with black pompoms standing alone on a wooden stage floor, no feet, legs or people, and a
solid red band at the bottom with only the word "ΧΟΡΟΣ" in large white capitals, the rest of the band plain empty red with no fine print, address line or tiny text along its
edges; no other text, small print or logos anywhere on the flyer. A cold coffee with a straw and a few
coins beside the stack, a sunny street softly blurred behind. Angled close-medium shot.`,
  },
  // Προσκλητήρια & κάρτες
  {
    file: 'prosklitiria-01.jpg',
    prompt: `
A wedding invitation suite on a linen tablecloth in bright sun: cream invitation cards with a
simple pressed floral mark and no words, matching envelopes, two finished sets tied with thin
ribbon, a spool of ribbon and small scissors, a few loose white flowers. Blue sea and a balcony
railing softly blurred behind. Angled close-medium shot, crisp paper texture, airy colours.`,
  },
  {
    file: 'prosklitiria-02.jpg',
    prompt: `
A place setting for a baptism reception on a wooden table in late-afternoon sun: a small printed
place card with a simple light-blue sailing boat mark and the single word "ΒΑΠΤΙΣΗ", a folded menu
card with the same boat, a small tulle bag of koufeta tied with blue ribbon, a white plate and a
glass of wine. A stone courtyard and string lights softly blurred behind. Close shot at table
height.`,
  },
];

const clean = (text) => text.trim().replace(/\s*\n\s*/g, ' ');
const fullPrompt = (image) => `${clean(image.prompt)}\n\n${clean(STYLE)}`;

// ---------------------------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------------------------

const usage = (message) => {
  console.error(`service-images: ${message}`);
  console.error('Usage: OPENROUTER_API_KEY=… node scripts/service-images.mjs [--only a,b]');
  console.error('       [--raw <dir>] [--dry-run]');
  process.exit(2);
};

let args;
try {
  args = parseArgs({
    options: {
      only: { type: 'string' },
      raw: { type: 'string', default: join(tmpdir(), 'service-images-raw') },
      'dry-run': { type: 'boolean', default: false },
    },
    strict: true,
  }).values;
} catch (error) {
  usage(error.message);
}

let selected = IMAGES;
if (args.only !== undefined) {
  const names = args.only
    .split(',')
    .map((s) => s.trim().replace(/\.jpe?g$/i, ''))
    .filter(Boolean);
  const unknown = names.filter((name) => !IMAGES.some((i) => i.file === `${name}.jpg`));
  if (names.length === 0 || unknown.length > 0) {
    usage(
      `unknown file(s) in --only: ${unknown.join(', ') || '(none given)'}\n` +
        `Known: ${IMAGES.map((i) => i.file.replace('.jpg', '')).join(', ')}`,
    );
  }
  selected = IMAGES.filter((i) => names.includes(i.file.replace('.jpg', '')));
}

const rawDir = resolve(args.raw);

const requestBody = (prompt) => ({
  model: MODEL,
  prompt,
  aspect_ratio: ASPECT,
  resolution: RESOLUTION,
  output_format: 'png',
  n: 1,
});

if (args['dry-run']) {
  console.log(`Dry run: ${selected.length} prompt(s), no requests sent, no files written.\n`);
  for (const image of selected) {
    const { prompt, ...rest } = requestBody(fullPrompt(image));
    console.log(`=== src/assets/portfolio/${image.file}`);
    console.log(`request: ${JSON.stringify(rest)}`);
    console.log(`prompt (${prompt.length} chars):\n${prompt}\n`);
  }
  process.exit(0);
}

const apiKey = process.env.OPENROUTER_API_KEY?.trim();
if (!apiKey) {
  console.error(
    'service-images: OPENROUTER_API_KEY is not set. Run it as\n' +
      '  OPENROUTER_API_KEY=… node scripts/service-images.mjs [--only a,b]\n' +
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
      log(`network error (${error?.message ?? error}); retrying in 5s`);
      await sleep(5000);
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
      return json;
    }
    const message = errorMessage(json, text);
    if (res.status === 401 || res.status === 402) fatal = `HTTP ${res.status}: ${message}`;
    if (isRetryable(res.status) && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const wait =
        Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 120) * 1000 : 8000;
      log(`HTTP ${res.status}: ${message}; retrying in ${Math.round(wait / 1000)}s`);
      await sleep(wait);
      continue;
    }
    throw new Error(`HTTP ${res.status}: ${message}`);
  }
};

/** Returns the image bytes from `data[0]`: inline base64, or a signed download URL. */
const imageBytes = async (json) => {
  const item = Array.isArray(json.data) ? json.data[0] : undefined;
  if (item && typeof item.b64_json === 'string' && item.b64_json.length > 0) {
    return Buffer.from(item.b64_json, 'base64');
  }
  if (item && typeof item.url === 'string') {
    // A signed URL: fetched without the API key, which must never go to another host.
    const res = await fetch(item.url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`downloading the image failed: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error('the response has no data[0].b64_json or data[0].url');
};

// ---------------------------------------------------------------------------------------------
// Image processing
// ---------------------------------------------------------------------------------------------

/** Saves the untouched image, then writes the 2000 × 1500 JPEG into src/assets/portfolio/. */
const save = async (image, bytes, log) => {
  const meta = await sharp(bytes).metadata();
  if (!meta.width || !meta.height) throw new Error('the returned image could not be read');
  const base = image.file.replace(/\.jpe?g$/i, '');
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

  // sharp writes no metadata unless asked to, so EXIF/XMP/ICC chunks are dropped; the pixels are
  // converted to sRGB first.
  const jpeg = await sharp(bytes)
    .extract({ left, top, width, height })
    .resize(OUT_WIDTH, OUT_HEIGHT, { fit: 'fill', kernel: 'lanczos3' })
    .flatten({ background: '#ffffff' })
    .toColorspace('srgb')
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
  await writeFile(join(portfolioDir, image.file), jpeg);
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

const run = async (image, index) => {
  const label = `[${index + 1}/${total}] ${image.file}`;
  const log = (line) => console.log(`${label}: ${line}`);
  if (fatal) {
    log(`skipped (${fatal})`);
    return { image, ok: false, error: `skipped: ${fatal}` };
  }
  const started = Date.now();
  try {
    const json = await post(requestBody(fullPrompt(image)), log);
    const cost = typeof json.usage?.cost === 'number' ? json.usage.cost : null;
    const saved = await save(image, await imageBytes(json), log);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    log(
      `ok in ${seconds}s, source ${saved.source} → ${OUT_WIDTH} × ${OUT_HEIGHT}, ` +
        `${saved.kb} KB, cost ${formatCost(cost)}; raw: ${saved.rawPath}`,
    );
    return { image, ok: true, cost };
  } catch (error) {
    log(`FAILED: ${error?.message ?? error}`);
    return { image, ok: false, error: error?.message ?? String(error) };
  }
};

console.log(`Generating ${total} image(s) with ${MODEL}, ${CONCURRENCY} at a time. Raw: ${rawDir}`);

await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, total) }, async () => {
    while (next < total) {
      const index = next++;
      results[index] = await run(selected[index], index);
    }
  }),
);

const failed = results.filter((r) => !r.ok);
const known = results.filter((r) => r.ok && typeof r.cost === 'number').map((r) => r.cost);
const totalCost = known.reduce((sum, c) => sum + c, 0);

console.log('');
console.log(
  `Done: ${total - failed.length} of ${total} written to src/assets/portfolio/. ` +
    `Total cost ${formatCost(totalCost)}.`,
);
if (failed.length > 0) {
  console.error(`Failed (${failed.length}):`);
  for (const r of failed) console.error(`  ${r.image.file}: ${r.error}`);
  process.exit(1);
}
