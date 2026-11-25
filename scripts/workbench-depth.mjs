/**
 * Builds the depth map of the /etaireia/ work-table photograph (src/assets/about/workbench.jpg)
 * for its depth parallax (src/scripts/workbench/): src/assets/about/workbench-depth.png, a small
 * grayscale image in the photo's 4:3 frame where white is near the camera and black is far.
 *
 *   node scripts/workbench-depth.mjs
 *
 * The photo looks down on a table at about 45 degrees, so its depth is mostly a perspective ramp:
 * the near edge of the table (bottom) close, the far end and the wall (top) away. On top of it sit
 * soft raised shapes for the objects standing up from the table, and one flat depth for the iMac
 * standing upright on the left, all placed by hand on the photo. A new photograph needs new shapes. Free, no network: it only computes pixels.
 */
import { resolve, join } from 'node:path';
import sharp from 'sharp';

const W = 512;
const H = 384;
const out = join(
  resolve(import.meta.dirname, '..'),
  'src',
  'assets',
  'about',
  'workbench-depth.png',
);

/** Objects standing up from the table: centre and radii as shares of the frame, height 0–1. */
const BUMPS = [
  { name: 'folded T-shirt', x: 0.34, y: 0.32, rx: 0.13, ry: 0.09, h: 0.1 },
  { name: 'rolled banner', x: 0.79, y: 0.2, rx: 0.22, ry: 0.11, h: 0.13 },
  { name: 'mug', x: 0.49, y: 0.26, rx: 0.05, ry: 0.06, h: 0.13 },
  { name: '3D-printed house', x: 0.9, y: 0.7, rx: 0.09, ry: 0.1, h: 0.15 },
  { name: 'key ring', x: 0.73, y: 0.68, rx: 0.05, ry: 0.05, h: 0.05 },
  { name: 'phone', x: 0.72, y: 0.87, rx: 0.09, ry: 0.12, h: 0.04 },
  { name: 'tape roll', x: 0.38, y: 0.84, rx: 0.05, ry: 0.05, h: 0.07 },
  { name: 'keyboard', x: 0.18, y: 0.65, rx: 0.1, ry: 0.05, h: 0.03 },
  { name: 'business card stack', x: 0.08, y: 0.68, rx: 0.06, ry: 0.04, h: 0.04 },
  { name: 'mouse', x: 0.29, y: 0.57, rx: 0.03, ry: 0.025, h: 0.04 },
];

/**
 * Upright surfaces facing the camera: one depth across the whole box (that of where they stand on
 * the table), soft at the edges. Box as shares of the frame.
 */
const PLANES = [{ name: 'iMac screen and stand', x0: 0, x1: 0.3, y0: 0.11, y1: 0.6, d: 0.6 }];

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const pixels = Buffer.alloc(W * H);
for (let j = 0; j < H; j++) {
  const y = (j + 0.5) / H;
  for (let i = 0; i < W; i++) {
    const x = (i + 0.5) / W;
    // The table plane: far (top) to near (bottom), a little steeper towards the camera.
    let d = 0.18 + 0.82 * Math.pow(smoothstep(0, 1, y), 1.15);
    // The wall and window behind the table, top left.
    d *= 1 - 0.75 * (1 - smoothstep(0.08, 0.2, x)) * (1 - smoothstep(0.1, 0.2, y));
    for (const b of BUMPS) {
      const r = Math.hypot((x - b.x) / b.rx, (y - b.y) / b.ry);
      d += b.h * (1 - smoothstep(0.55, 1, r));
    }
    for (const p of PLANES) {
      const edge = 0.025;
      const inside =
        smoothstep(p.x0 - edge, p.x0 + edge, x) *
        (1 - smoothstep(p.x1 - edge, p.x1 + edge, x)) *
        smoothstep(p.y0 - edge, p.y0 + edge, y) *
        (1 - smoothstep(p.y1 - edge, p.y1 + edge, y));
      d = d + (Math.max(d, p.d) - d) * inside;
    }
    pixels[j * W + i] = Math.round(255 * Math.min(1, Math.max(0, d)));
  }
}

await sharp(pixels, { raw: { width: W, height: H, channels: 1 } })
  .blur(4)
  .png({ compressionLevel: 9 })
  .toFile(out);
console.log(`workbench-depth: wrote ${out} (${W} × ${H})`);
