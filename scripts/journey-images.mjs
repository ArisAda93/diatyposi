/**
 * Regenerates the journey product photographs (src/assets/journey/<step>.jpg, home section 02,
 * “Μία ιδέα. Παντού.”) with ByteDance Seedream 5.5 through OpenRouter, at its highest resolution
 * (2K: 2048 × 2048 at 1:1). Every call costs money.
 *
 *   OPENROUTER_API_KEY=… node scripts/journey-images.mjs [--only idea,mark] [--ref <dir>]
 *
 * Each photograph prints over its step's line drawing, so it must keep the drawing's composition.
 * The request therefore sends the step's current photograph (--ref, default src/assets/journey/)
 * as the reference image: Seedream re-shoots the same object, in the same place and size on the
 * same light backdrop, as a hyper-realistic studio photograph.
 *
 * Flags:
 *   --only <ids>   comma-separated step ids (idea, mark, card, shirt, sign, gift, social)
 *   --ref <dir>    folder holding the reference <step>.jpg files (default: src/assets/journey/)
 *   --raw <dir>    folder for the untouched API images (default: <os tmp>/journey-images-raw)
 *   --dry-run      print the prompts only; no key, no network, no files
 *
 * The result is centre-cropped to a square, kept at 2048 × 2048 and written as a metadata-free
 * sRGB JPEG (mozjpeg, quality 90). The key is read only from OPENROUTER_API_KEY and is never
 * printed, logged or written anywhere.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';

const ENDPOINT = 'https://openrouter.ai/api/v1/images';
const MODEL = 'bytedance-seed/seedream-5-5';
const ASPECT = '1:1';
const RESOLUTION = '2K';
const OUT_SIZE = 2048;
const JPEG_QUALITY = 90;
/** One at a time: OpenRouter refuses parallel requests with 402 when the balance runs low. */
const CONCURRENCY = 1;
const MAX_ATTEMPTS = 2;
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

const root = resolve(import.meta.dirname, '..');
const journeyDir = join(root, 'src', 'assets', 'journey');

// ---------------------------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------------------------

const STYLE = `
Re-shoot the reference image as a real photograph: hyper-realistic, indistinguishable from a
high-end commercial studio product photograph taken with a full-frame camera and a sharp macro
lens at f/8, every detail tack sharp, ultra high resolution, true-to-life materials and micro
texture (paper fibres and tooth, ink sitting in the paper, cotton weave, glaze reflections, real
glass and metal), physically correct soft daylight from the upper left, gentle natural contact
shadows under the object, subtle real-world imperfections. Not a 3D render, not CGI, not an
illustration, not a flat mock-up template.
Keep the composition of the reference exactly: the same single object, in the same position,
size, angle and framing, centred on the same plain, very light warm off-white backdrop (#FAFAF7)
filling the whole frame edge to edge, with nothing else in the picture. Keep the logo exactly as
in the reference: a yellow circle, a green square overlapping a cyan square, and a magenta arch
below, in flat bright process colours, printed or applied realistically for the material.
The only text allowed is the Greek wordmark «Η επωνυμία σας» exactly as spelled in the
reference, where the reference shows it. No other letters, numbers, small print, labels, brand
names or watermarks anywhere.
No people anywhere: no faces, hands, arms, bodies or silhouettes, also not inside pictures or
screens.
`;

const IMAGES = [
  {
    id: 'idea',
    prompt: `A real spiral-bound sketch pad lying flat, its top page showing the hand-drawn pencil
sketch of the logo (circle, square, arch, with faint construction lines) and the pencilled words
«Η επωνυμία σας» underlined, real graphite strokes with grain and light smudges on textured
drawing paper. The logo here is ONLY grey graphite pencil outlines, exactly as in the reference:
no colour, no fill, no paint, no ink, still an unfinished idea; a real wooden pencil with a sharpened graphite tip resting at the lower right, as in
the reference. Metal spiral wire catching the light.`,
  },
  {
    id: 'mark',
    prompt: `A real thick press proof sheet of heavy uncoated paper lying flat, printed with the
full-colour logo and the bold black wordmark «Η επωνυμία σας», with a thin black frame line,
thin black crop marks at the corners and a small CMYK colour bar at the lower left, as in the
reference, but with NO registration targets: remove the two small circle-and-cross marks above
and below the sheet entirely (plain backdrop there). Visible paper tooth, ink with slight
overprint where the shapes overlap, deep crisp black.`,
  },
  {
    id: 'card',
    prompt: `Two real luxury business cards on thick cotton card stock, one lying slightly askew on
another grey one, exactly as in the reference: the front card shows the small logo and the
wordmark «Η επωνυμία σας» on the left, a thin vertical divider and plain black rules on the right
(no other text). Visible card edges and thickness, fine paper texture, crisp offset print.`,
  },
  {
    id: 'shirt',
    prompt: `A real white cotton crew-neck T-shirt laid flat, neatly smoothed with a few natural
soft folds, exactly as in the reference, with the logo and the wordmark «Η επωνυμία σας» printed
on the chest in screen-printed ink that follows the knit. Visible jersey weave, stitched collar
rib and hems.`,
  },
  {
    id: 'sign',
    prompt: `A real small shop front seen straight on, exactly as in the reference: light grey
rendered facade, a white fascia sign with the logo and the wordmark «Η επωνυμία σας», a striped
grey and white fabric awning, a glass shop window and a glazed door. Real painted render, aluminium
frames, glass reflections. Behind the glass, only soft out-of-focus shelves with plain objects,
no people and no signs. The facade stands on a low pavement step on the plain light backdrop.`,
  },
  {
    id: 'gift',
    prompt: `A real glossy white ceramic coffee mug full of black coffee with a few wisps of steam,
standing on a plain surface, exactly as in the reference, with the logo and the wordmark
«Η επωνυμία σας» printed on its side as a sublimation print that follows the curve. Real glaze
highlights, crema on the coffee, soft reflection at the base. High-key studio lighting from
straight above with large diffusers: the seamless backdrop is one flat, uniform very light warm
off-white (#FAFAF7) at the same brightness in every corner, with no light falloff, vignette,
grey gradient or horizon line; the only shadow is a small soft contact shadow directly under the
mug.`,
  },
  {
    id: 'social',
    prompt: `A real modern smartphone with thin titanium frame lying flat, screen on, exactly as in
the reference: the screen shows a social media feed post whose picture is the logo with the
wordmark «Η επωνυμία σας» on a light grey square, with plain simple interface icons above and
below. Keep the interface minimal and generic: replace every other word, username, number and
caption in the reference with plain grey bars, so «Η επωνυμία σας» is the only readable text.
Real glass reflections, crisp pixels, true device proportions.`,
  },
];

const clean = (text) => text.trim().replace(/\s*\n\s*/g, ' ');
const fullPrompt = (image) => `${clean(image.prompt)}\n\n${clean(STYLE)}`;

// ---------------------------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------------------------

const usage = (message) => {
  console.error(`journey-images: ${message}`);
  console.error('Usage: OPENROUTER_API_KEY=… node scripts/journey-images.mjs [--only a,b]');
  console.error('       [--ref <dir>] [--raw <dir>] [--dry-run]');
  process.exit(2);
};

let args;
try {
  args = parseArgs({
    options: {
      only: { type: 'string' },
      ref: { type: 'string', default: journeyDir },
      raw: { type: 'string', default: join(tmpdir(), 'journey-images-raw') },
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
    .map((s) => s.trim())
    .filter(Boolean);
  const unknown = names.filter((name) => !IMAGES.some((i) => i.id === name));
  if (names.length === 0 || unknown.length > 0) {
    usage(
      `unknown step(s) in --only: ${unknown.join(', ') || '(none given)'}\n` +
        `Known: ${IMAGES.map((i) => i.id).join(', ')}`,
    );
  }
  selected = IMAGES.filter((i) => names.includes(i.id));
}

const refDir = resolve(args.ref);
const rawDir = resolve(args.raw);

const reference = async (image) => {
  const bytes = await readFile(join(refDir, `${image.id}.jpg`));
  return {
    type: 'image_url',
    image_url: { url: `data:image/jpeg;base64,${bytes.toString('base64')}` },
  };
};

const requestBody = async (image) => ({
  model: MODEL,
  prompt: fullPrompt(image),
  aspect_ratio: ASPECT,
  resolution: RESOLUTION,
  output_format: 'png',
  n: 1,
  input_references: [await reference(image)],
});

if (args['dry-run']) {
  console.log(`Dry run: ${selected.length} prompt(s), no requests sent, no files written.\n`);
  for (const image of selected) {
    const { prompt, input_references: refs, ...rest } = await requestBody(image);
    console.log(`=== src/assets/journey/${image.id}.jpg (reference: ${refs.length} image)`);
    console.log(`request: ${JSON.stringify(rest)}`);
    console.log(`prompt (${prompt.length} chars):\n${prompt}\n`);
  }
  process.exit(0);
}

const apiKey = process.env.OPENROUTER_API_KEY?.trim();
if (!apiKey) usage('OPENROUTER_API_KEY is not set (or use --dry-run).');

// ---------------------------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isRetryable = (status) => status === 429 || status >= 500;
let fatal = null;

const errorMessage = (json, text) =>
  (json && typeof json.error?.message === 'string' && json.error.message) ||
  text.slice(0, 300) ||
  '(empty response body)';

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
      // Reported through `text` below.
    }
    if (res.ok) {
      if (!json) throw new Error('the API answered 200 with a body that is not JSON');
      return json;
    }
    const message = errorMessage(json, text);
    if (res.status === 401 || res.status === 402) fatal = `HTTP ${res.status}: ${message}`;
    if (isRetryable(res.status) && attempt < MAX_ATTEMPTS) {
      log(`HTTP ${res.status}: ${message}; retrying in 8s`);
      await sleep(8000);
      continue;
    }
    throw new Error(`HTTP ${res.status}: ${message}`);
  }
};

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
// Image processing and run
// ---------------------------------------------------------------------------------------------

const save = async (image, bytes, log) => {
  const meta = await sharp(bytes).metadata();
  if (!meta.width || !meta.height) throw new Error('the returned image could not be read');
  const rawPath = join(rawDir, `${image.id}.${meta.format === 'jpeg' ? 'jpg' : meta.format}`);
  await writeFile(rawPath, bytes);
  const side = Math.min(meta.width, meta.height);
  if (side < OUT_SIZE) log(`warning: the square is ${side} px, upscaled to ${OUT_SIZE}`);
  const jpeg = await sharp(bytes)
    .extract({
      left: Math.floor((meta.width - side) / 2),
      top: Math.floor((meta.height - side) / 2),
      width: side,
      height: side,
    })
    .resize(OUT_SIZE, OUT_SIZE, { fit: 'fill', kernel: 'lanczos3' })
    .flatten({ background: '#ffffff' })
    .toColorspace('srgb')
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
  await writeFile(join(journeyDir, `${image.id}.jpg`), jpeg);
  return { rawPath, source: `${meta.width} × ${meta.height}`, kb: Math.round(jpeg.length / 1024) };
};

await mkdir(rawDir, { recursive: true });
const total = selected.length;
const results = [];
let next = 0;
const formatCost = (cost) => (typeof cost === 'number' ? `$${cost.toFixed(4)}` : 'n/a');

const run = async (image, index) => {
  const log = (line) => console.log(`[${index + 1}/${total}] ${image.id}: ${line}`);
  if (fatal) {
    log(`skipped (${fatal})`);
    return { image, ok: false, error: `skipped: ${fatal}` };
  }
  const started = Date.now();
  try {
    const json = await post(await requestBody(image), log);
    const cost = typeof json.usage?.cost === 'number' ? json.usage.cost : null;
    const saved = await save(image, await imageBytes(json), log);
    log(
      `ok in ${((Date.now() - started) / 1000).toFixed(1)}s, source ${saved.source} → ` +
        `${OUT_SIZE} × ${OUT_SIZE}, ${saved.kb} KB, cost ${formatCost(cost)}; raw: ${saved.rawPath}`,
    );
    return { image, ok: true, cost };
  } catch (error) {
    log(`FAILED: ${error?.message ?? error}`);
    return { image, ok: false, error: error?.message ?? String(error) };
  }
};

console.log(`Generating ${total} image(s) with ${MODEL} at ${RESOLUTION}. Raw: ${rawDir}`);
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, total) }, async () => {
    while (next < total) {
      const index = next++;
      results[index] = await run(selected[index], index);
    }
  }),
);

const failed = results.filter((r) => !r.ok);
const totalCost = results.filter((r) => r.ok && r.cost).reduce((s, r) => s + r.cost, 0);
console.log(
  `\nDone: ${total - failed.length} of ${total} written. Total cost ${formatCost(totalCost)}.`,
);
if (failed.length > 0) {
  for (const r of failed) console.error(`  ${r.image.id}: ${r.error}`);
  process.exit(1);
}
