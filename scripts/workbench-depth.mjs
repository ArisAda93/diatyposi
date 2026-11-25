/**
 * Builds the depth map of the /etaireia/ work-table photograph (src/assets/about/workbench.jpg)
 * for its depth parallax (src/scripts/workbench/): src/assets/about/workbench-depth.png, a small
 * grayscale image in the photo's 4:3 frame where white is near the camera and black is far.
 *
 *   node scripts/workbench-depth.mjs
 *
 * The photo looks down on a table at about 45 degrees, so its depth is mostly a perspective ramp:
 * the near edge of the table (bottom) close, the far end and the wall (top) away. On top of it sit
 * soft raised shapes for the objects standing up from the table, placed by hand on the photo. A
 * new photograph needs new shapes. Free, no network: it only computes pixels.
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
  { name: 'card stack', x: 0.13, y: 0.31, rx: 0.07, ry: 0.07, h: 0.08 },
  { name: 'notebook', x: 0.14, y: 0.58, rx: 0.14, ry: 0.11, h: 0.04 },
];

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
    pixels[j * W + i] = Math.round(255 * Math.min(1, Math.max(0, d)));
  }
}

await sharp(pixels, { raw: { width: W, height: H, channels: 1 } })
  .blur(4)
  .png({ compressionLevel: 9 })
  .toFile(out);
console.log(`workbench-depth: wrote ${out} (${W} × ${H})`);
