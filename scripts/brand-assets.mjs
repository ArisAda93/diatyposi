/**
 * Regenerates the favicon set and the Open Graph share image from the logo geometry in
 * src/components/logo-paths.ts. Run after changing the logo:
 *
 *   npx playwright install chromium   # once
 *   node scripts/brand-assets.mjs
 *
 * Set CHROME_PATH to use an existing Chromium/Chrome binary instead.
 * Outputs to public/: favicon.svg, favicon.ico, favicon-32.png, apple-touch-icon.png,
 * icon-192.png, icon-512.png, og.jpg (1200×630).
 */
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { ARCH, ARCH_PLATES, WORDMARK, SUBTITLE } from '../src/components/logo-paths.ts';

const root = resolve(import.meta.dirname, '..');
const pub = join(root, 'public');

const PAPER = '#FAFAF7';
const KEY = '#221F20';
const RED = '#C03529';

const arches = (bg) =>
  [...ARCH_PLATES]
    .reverse()
    .map(
      (p) =>
        `<path d="${ARCH}" transform="translate(${p.x} 0)" fill="${p.hex}" stroke="${bg}" stroke-width="9" stroke-linejoin="round" paint-order="stroke"/>`,
    )
    .join('');

// Favicon: the arches on a paper square (readable on light and dark tab bars).
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${PAPER}"/><g transform="translate(3.5 17) scale(0.0686)"><g transform="translate(-697 -58)">${arches(PAPER)}</g></g></svg>`;

const fullLogo = (w) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="40 50 1505 445" width="${w}">${arches(PAPER)}<path fill="${KEY}" d="${WORDMARK}"/><path fill="${RED}" d="${SUBTITLE}"/></svg>`;

const cropMarks = `<div class="cm tl"></div><div class="cm tr"></div><div class="cm bl"></div><div class="cm br"></div>`;

const ogHtml = `<!doctype html><html lang="el"><head><meta charset="utf-8"><style>
@font-face{font-family:Comfortaa;src:url(/fonts/comfortaa-greek-wght-normal.woff2) format('woff2');font-weight:300 700;unicode-range:U+0370-03FF}
@font-face{font-family:Comfortaa;src:url(/fonts/comfortaa-latin-wght-normal.woff2) format('woff2');font-weight:300 700;unicode-range:U+0000-00FF,U+2000-206F}
html,body{margin:0}
body{width:1200px;height:630px;background:${PAPER};position:relative;overflow:hidden;font-family:Comfortaa,sans-serif;color:${KEY}}
.logo{position:absolute;left:96px;top:118px}
.tag{position:absolute;left:100px;top:452px;font-size:35px;font-weight:330;letter-spacing:-.005em}
.bar{position:absolute;left:100px;bottom:64px;display:flex;gap:3px;height:14px}
.bar span{width:44px}.bar .t{width:24px}
.cm{position:absolute;width:28px;height:28px;border-color:${KEY};border-style:solid;border-width:0}
.tl{left:28px;top:28px;border-right-width:1.5px;border-bottom-width:1.5px}
.tr{right:28px;top:28px;border-left-width:1.5px;border-bottom-width:1.5px}
.bl{left:28px;bottom:28px;border-right-width:1.5px;border-top-width:1.5px}
.br{right:28px;bottom:28px;border-left-width:1.5px;border-top-width:1.5px}
</style></head><body>
${cropMarks}
<div class="logo">${fullLogo(1000)}</div>
<div class="tag">Πάνω από προϊόντα, χτίζουμε σχέσεις εμπιστοσύνης.</div>
<div class="bar"><span style="background:#00AEEF"></span><span style="background:#ED008C"></span><span style="background:#FFF100"></span><span style="background:${KEY}"></span><span class="t" style="background:${KEY}cc"></span><span class="t" style="background:${KEY}99"></span><span class="t" style="background:${KEY}66"></span><span class="t" style="background:${KEY}33"></span></div>
<script>document.fonts.ready.then(()=>document.body.dataset.ready='1')</script>
</body></html>`;

const iconHtml = (size, pad) =>
  `<!doctype html><html><head><style>html,body{margin:0;background:${PAPER}}body{width:${size}px;height:${size}px;display:grid;place-items:center}</style></head><body><svg xmlns="http://www.w3.org/2000/svg" viewBox="690 50 840 205" width="${size - pad * 2}">${arches(PAPER)}</svg></body></html>`;

// Serve /public so the page can load the self-hosted fonts.
const types = { '.woff2': 'font/woff2', '.html': 'text/html; charset=utf-8' };
const pages = new Map();
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (pages.has(url.pathname)) {
    res.writeHead(200, { 'content-type': types['.html'] });
    res.end(pages.get(url.pathname));
    return;
  }
  try {
    const file = await readFile(join(pub, url.pathname));
    res.writeHead(200, {
      'content-type': types[extname(url.pathname)] ?? 'application/octet-stream',
    });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
);

const shoot = async (name, html, w, h, type = 'png') => {
  pages.set(`/${name}.html`, html);
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(`${base}/${name}.html`);
  if (name === 'og') await page.waitForSelector('body[data-ready]');
  const buf = await page.screenshot({ type, quality: type === 'jpeg' ? 88 : undefined });
  await page.close();
  return buf;
};

await writeFile(join(pub, 'favicon.svg'), favicon);
await writeFile(join(pub, 'og.jpg'), await shoot('og', ogHtml, 1200, 630, 'jpeg'));
await writeFile(
  join(pub, 'apple-touch-icon.png'),
  await shoot('apple', iconHtml(180, 12), 180, 180),
);
await writeFile(join(pub, 'icon-192.png'), await shoot('i192', iconHtml(192, 16), 192, 192));
await writeFile(join(pub, 'icon-512.png'), await shoot('i512', iconHtml(512, 44), 512, 512));
const png32 = await shoot('i32', iconHtml(32, 1), 32, 32);
await writeFile(join(pub, 'favicon-32.png'), png32);

// favicon.ico: a single 32×32 PNG wrapped in an ICO container.
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header.writeUInt8(32, 6);
header.writeUInt8(32, 7);
header.writeUInt8(0, 8);
header.writeUInt8(0, 9);
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png32.length, 14);
header.writeUInt32LE(22, 18);
await writeFile(join(pub, 'favicon.ico'), Buffer.concat([header, png32]));

await browser.close();
server.close();
console.log('brand assets written to public/');
