import { describe, expect, it } from 'vitest';
import { ARCH } from '../src/components/logo-paths';
import {
  ACCENTS,
  ACCENT_MIX,
  BALANCED,
  MAX_TINT,
  blendMix,
  bufferDpr,
  cellHash,
  contrastRatio,
  dampMix,
  dollyShift,
  glyphShape,
  gridFor,
  hexToRgb,
  inkThresholds,
  maxInkAlpha,
  mixFor,
  mixRgb,
  mixSettled,
  parseAccent,
  parseCssColor,
  pickAccent,
  pitchFor,
  printOn,
  relativeLuminance,
  sheetFrame,
  shouldDraw,
  tintColor,
  toNdc,
  vignette,
  waveAt,
  wrapRow,
  type GridOptions,
  type InkMix,
} from '../src/scripts/living-background/math';

const FOV = 38;
const TILT = -0.62;
const GRID: GridOptions = {
  pitchSmall: 40,
  pitchLarge: 34,
  smallWidth: 480,
  largeWidth: 1440,
  maxInstances: 6000,
  margin: 0.18,
  extraRows: 3,
};

const PAPER = hexToRgb('#FAFAF7');
const KEY = hexToRgb('#221F20');
const RED = hexToRgb('#C03529');
const MUTED = hexToRgb('#5A5650');
const CYAN = hexToRgb('#00AEEF');
const MAGENTA = hexToRgb('#ED008C');
const YELLOW = hexToRgb('#FFF100');
const TEXTS = [RED, MUTED, KEY];
const MIN_CONTRAST = 4.6;

/** Screen y (px from the centre, up) of the sheet point at `v`, by direct projection. */
const projectY = (v: number, height: number, fovDeg: number, tilt: number): number => {
  const distance = height / 2 / Math.tan((fovDeg * Math.PI) / 360);
  const y = v * Math.cos(tilt);
  const depth = distance - v * Math.sin(tilt);
  return (y * distance) / depth;
};

describe('the sheet in perspective', () => {
  it('sees more of the sheet above the centre than below it (the top recedes)', () => {
    const frame = sheetFrame(1440, 900, FOV, TILT);
    expect(frame.vTop).toBeGreaterThan(0);
    expect(frame.vBottom).toBeLessThan(0);
    expect(frame.vTop).toBeGreaterThan(-frame.vBottom);
    expect(frame.halfWidthTop).toBeGreaterThan(720);
    expect(frame.halfWidthBottom).toBeLessThan(720);
  });

  it('meets the sheet exactly at the top and bottom edges of the viewport', () => {
    const frame = sheetFrame(1440, 900, FOV, TILT);
    expect(projectY(frame.vTop, 900, FOV, TILT)).toBeCloseTo(450, 6);
    expect(projectY(frame.vBottom, 900, FOV, TILT)).toBeCloseTo(-450, 6);
  });

  it('reduces to the viewport itself for an untilted sheet', () => {
    const frame = sheetFrame(1200, 800, FOV, 0);
    expect(frame.vTop).toBeCloseTo(400, 6);
    expect(frame.vBottom).toBeCloseTo(-400, 6);
    expect(frame.halfWidthTop).toBeCloseTo(600, 6);
    expect(frame.halfWidthBottom).toBeCloseTo(600, 6);
  });
});

describe('halftone grid', () => {
  const viewports: [number, number][] = [
    [360, 740],
    [390, 844],
    [768, 1024],
    [1280, 720],
    [1440, 900],
    [1920, 1080],
    [2560, 1440],
    [5120, 2880],
  ];

  it('covers the whole visible sheet, with margins', () => {
    viewports.forEach(([w, h]) => {
      const frame = sheetFrame(w, h, FOV, TILT);
      const grid = gridFor(frame, w, GRID);
      expect(grid.rowStart * grid.pitch).toBeLessThanOrEqual(frame.vBottom);
      expect((grid.rowStart + grid.rows) * grid.pitch).toBeGreaterThanOrEqual(frame.vTop);
      const widest = 2 * Math.max(frame.halfWidthTop, frame.halfWidthBottom);
      expect(grid.cols * grid.pitch).toBeGreaterThanOrEqual(widest);
      expect(grid.count).toBe(grid.cols * grid.rows);
    });
  });

  it('never exceeds the instance cap, even on very large screens', () => {
    viewports.forEach(([w, h]) => {
      const grid = gridFor(sheetFrame(w, h, FOV, TILT), w, GRID);
      expect(grid.count).toBeLessThanOrEqual(GRID.maxInstances);
      expect(grid.pitch).toBeGreaterThanOrEqual(GRID.pitchLarge);
    });
  });

  it('is coarser and sparser on small screens', () => {
    expect(pitchFor(390, GRID)).toBe(GRID.pitchSmall);
    expect(pitchFor(1920, GRID)).toBe(GRID.pitchLarge);
    expect(pitchFor(390, GRID)).toBeGreaterThan(pitchFor(1440, GRID));
    const phone = gridFor(sheetFrame(390, 844, FOV, TILT), 390, GRID);
    const desktop = gridFor(sheetFrame(1440, 900, FOV, TILT), 1440, GRID);
    expect(phone.count).toBeLessThan(desktop.count);
    // Fewer glyphs per px² of screen.
    expect(phone.count / (390 * 844)).toBeLessThan(desktop.count / (1440 * 900));
  });
});

describe('rows wrapping around the travelling window', () => {
  it('puts every row inside the window, on its own residue', () => {
    [
      [0, 10, 0],
      [3, 10, 3.4],
      [7, 12, -25.5],
      [0, 37, 812.2],
      [36, 37, -0.01],
    ].forEach(([index = 0, count = 1, start = 0]) => {
      const row = wrapRow(index, count, start);
      expect(row).toBeGreaterThanOrEqual(start);
      expect(row).toBeLessThan(start + count);
      expect(Math.abs((row - index) % count)).toBe(0);
    });
  });

  it('covers each row of the window exactly once', () => {
    const count = 11;
    const start = -4.3;
    const rows = Array.from({ length: count }, (_, j) => wrapRow(j, count, start));
    expect(new Set(rows).size).toBe(count);
    expect(Math.min(...rows)).toBe(Math.ceil(start));
    expect(Math.max(...rows)).toBe(Math.ceil(start) + count - 1);
  });
});

describe('scroll dolly', () => {
  it('starts at 0 and travels in proportion to the scroll', () => {
    expect(dollyShift(0, 0.32, 34)).toBe(0);
    expect(dollyShift(2000, 0.32, 34)).toBeCloseTo(2 * dollyShift(1000, 0.32, 34));
    expect(dollyShift(1000, 0.32, 34)).toBeGreaterThan(0);
  });

  it('moves the sheet less than the content (depth)', () => {
    const pitch = 34;
    expect(dollyShift(1000, 0.32, pitch) * pitch).toBeLessThan(1000);
  });

  it('is 0 without a pitch', () => {
    expect(dollyShift(500, 0.32, 0)).toBe(0);
  });
});

describe('breathing waves', () => {
  it('stays within 0–1 everywhere and at all times', () => {
    for (let u = -40; u <= 40; u += 3.5) {
      for (let v = -60; v <= 60; v += 4) {
        for (let t = 0; t < 60; t += 7.3) {
          const w = waveAt(u, v, t);
          expect(w).toBeGreaterThanOrEqual(0);
          expect(w).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('breathes over time at a given glyph', () => {
    const samples = Array.from({ length: 120 }, (_, i) => waveAt(5, -3, i * 0.5));
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.3);
  });

  it('is not in step across the sheet', () => {
    const row = Array.from({ length: 40 }, (_, u) => waveAt(u, 0, 10));
    expect(Math.max(...row) - Math.min(...row)).toBeGreaterThan(0.3);
  });
});

describe('cell hash', () => {
  it('is stable and within [0, 1)', () => {
    for (let u = -20; u < 20; u += 0.5) {
      for (let v = -20; v < 20; v++) {
        const h = cellHash(u, v);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(1);
        expect(cellHash(u, v)).toBe(h);
      }
    }
  });

  it('gives roughly the requested accent share across the sheet', () => {
    let accents = 0;
    const n = 120;
    for (let u = 0; u < n; u++) {
      for (let v = 0; v < n; v++) if (cellHash(u + 0.5 * (v % 2), v) < 0.1) accents++;
    }
    expect(accents / (n * n)).toBeGreaterThan(0.07);
    expect(accents / (n * n)).toBeLessThan(0.13);
  });
});

describe('section accents', () => {
  it('reads data-bg-accent values', () => {
    ACCENTS.forEach((accent) => expect(parseAccent(accent)).toBe(accent));
    expect(parseAccent(' Cyan ')).toBe('cyan');
    expect(parseAccent('black')).toBeNull();
    expect(parseAccent('')).toBeNull();
    expect(parseAccent(null)).toBeNull();
    expect(parseAccent(undefined)).toBeNull();
  });

  it('lets the innermost (last) valid section at the centre win', () => {
    expect(pickAccent(['cyan', 'magenta'])).toBe('magenta');
    expect(pickAccent(['yellow', 'nonsense', null])).toBe('yellow');
    expect(pickAccent([])).toBeNull();
    expect(pickAccent([null, ''])).toBeNull();
    expect(mixFor(null)).toBe(BALANCED);
  });

  it('keeps every mix a proper split of the accent inks', () => {
    [BALANCED, ...Object.values(ACCENT_MIX)].forEach((mix) => {
      expect(mix.c + mix.m + mix.y).toBeCloseTo(1, 6);
      expect(mix.share).toBeGreaterThan(0);
      expect(mix.share).toBeLessThan(0.5);
      expect(mix.tint).toBeGreaterThanOrEqual(0);
      expect(mix.tint).toBeLessThanOrEqual(MAX_TINT);
    });
  });

  it('leans towards the section ink', () => {
    const { cyan, magenta, yellow, key } = ACCENT_MIX;
    expect(cyan.c).toBeGreaterThan(Math.max(cyan.m, cyan.y));
    expect(magenta.m).toBeGreaterThan(Math.max(magenta.c, magenta.y));
    expect(yellow.y).toBeGreaterThan(Math.max(yellow.c, yellow.m));
    [cyan, magenta, yellow].forEach((mix) => {
      expect(mix.share).toBeGreaterThan(BALANCED.share);
      expect(mix.tint).toBeGreaterThan(0);
    });
    // Key: mostly key ink, untinted.
    expect(key.share).toBeLessThan(BALANCED.share);
    expect(key.tint).toBe(0);
  });

  it('blends smoothly between mixes', () => {
    const a = BALANCED;
    const b = ACCENT_MIX.magenta;
    expect(blendMix(a, b, 0)).toEqual(a);
    expect(blendMix(a, b, 1)).toEqual(b);
    const half = blendMix(a, b, 0.5);
    expect(half.m).toBeGreaterThan(a.m);
    expect(half.m).toBeLessThan(b.m);
  });

  it('settles on the target without overshooting, at any frame rate', () => {
    const target = ACCENT_MIX.cyan;
    let mix: InkMix = BALANCED;
    let previous = mix.c;
    for (let i = 0; i < 400; i++) {
      mix = dampMix(mix, target, 1.8, 1 / 60);
      expect(mix.c).toBeGreaterThanOrEqual(previous);
      expect(mix.c).toBeLessThanOrEqual(target.c + 1e-9);
      previous = mix.c;
    }
    expect(mixSettled(mix, target)).toBe(true);
    const twoShort = dampMix(dampMix(BALANCED, target, 1.8, 0.008), target, 1.8, 0.008);
    expect(twoShort.share).toBeCloseTo(dampMix(BALANCED, target, 1.8, 0.016).share, 10);
  });

  it('turns weights into increasing hash thresholds', () => {
    const [c, cm] = inkThresholds(BALANCED);
    expect(c).toBeCloseTo(1 / 3);
    expect(cm).toBeCloseTo(2 / 3);
    Object.values(ACCENT_MIX).forEach((mix) => {
      const [t1, t2] = inkThresholds(mix);
      expect(t1).toBeGreaterThanOrEqual(0);
      expect(t2).toBeGreaterThanOrEqual(t1);
      expect(t2).toBeLessThanOrEqual(1);
    });
  });

  it('tints towards the weighted accent inks', () => {
    const pure = tintColor({ c: 1, m: 0, y: 0, share: 0.2, tint: 0.2 }, CYAN, MAGENTA, YELLOW);
    pure.forEach((channel, i) => expect(channel).toBeCloseTo(CYAN[i] ?? NaN));
  });
});

describe('contrast caps (text on the paper stays AA)', () => {
  it('measures contrast like WCAG', () => {
    expect(contrastRatio([0, 0, 0], [1, 1, 1])).toBeCloseTo(21);
    expect(contrastRatio(KEY, PAPER)).toBeCloseTo(15.6, 0);
    expect(contrastRatio(RED, PAPER)).toBeGreaterThan(5);
    expect(relativeLuminance([1, 1, 1])).toBeCloseTo(1);
  });

  it('only darkens the paper as ink is added', () => {
    expect(printOn(PAPER, KEY, 0)).toEqual(PAPER);
    let previous = relativeLuminance(PAPER);
    for (let a = 0.05; a <= 1; a += 0.05) {
      const l = relativeLuminance(printOn(PAPER, MAGENTA, a));
      expect(l).toBeLessThan(previous);
      previous = l;
    }
  });

  it('finds the largest alpha that keeps every text colour readable', () => {
    [KEY, CYAN, MAGENTA, YELLOW].forEach((ink) => {
      const cap = Math.min(...TEXTS.map((text) => maxInkAlpha(PAPER, ink, text, MIN_CONTRAST)));
      expect(cap).toBeGreaterThan(0);
      expect(cap).toBeLessThanOrEqual(1);
      TEXTS.forEach((text) => {
        expect(contrastRatio(text, printOn(PAPER, ink, cap))).toBeGreaterThanOrEqual(MIN_CONTRAST);
      });
      if (cap < 1) {
        const over = Math.min(1, cap + 0.01);
        const worst = Math.min(...TEXTS.map((t) => contrastRatio(t, printOn(PAPER, ink, over))));
        expect(worst).toBeLessThan(MIN_CONTRAST);
      }
    });
  });

  it('keeps the key cap safe for key glyphs tinted towards any accent', () => {
    const keyCap = (ink: readonly [number, number, number]): number =>
      Math.min(...TEXTS.map((text) => maxInkAlpha(PAPER, ink, text, MIN_CONTRAST)));
    const cap = Math.min(
      keyCap(KEY),
      ...[CYAN, MAGENTA, YELLOW].map((ink) => keyCap(mixRgb(KEY, ink, MAX_TINT))),
    );
    [CYAN, MAGENTA, YELLOW].forEach((ink) => {
      for (let t = 0; t <= MAX_TINT; t += MAX_TINT / 4) {
        const glyph = printOn(PAPER, mixRgb(KEY, ink, t), cap);
        TEXTS.forEach((text) => {
          expect(contrastRatio(text, glyph)).toBeGreaterThanOrEqual(MIN_CONTRAST);
        });
      }
    });
    // Key ink stays a light touch on the paper.
    expect(cap).toBeLessThan(0.15);
  });

  it('is 0 when the bare paper already fails', () => {
    expect(maxInkAlpha(PAPER, KEY, hexToRgb('#E0E0E0'), 4.5)).toBe(0);
  });

  it('reads the computed paper colour', () => {
    expect(parseCssColor('rgb(250, 250, 247)')).toEqual(PAPER);
    expect(parseCssColor('rgb(250 250 247)')).toEqual(PAPER);
    expect(parseCssColor('rgba(250, 250, 247, 1)')).toEqual(PAPER);
    expect(parseCssColor('#fafaf7')).toEqual(PAPER);
    expect(parseCssColor('transparent')).toBeNull();
    expect(parseCssColor('rgb(300, 0, 0)')).toBeNull();
  });
});

describe('edges and pointer', () => {
  it('fades the field towards the corners', () => {
    expect(vignette(0, 0, 0.5, 1.5)).toBe(1);
    expect(vignette(1, 1, 0.5, 1.5)).toBeLessThan(0.05);
    let previous = 1;
    for (let r = 0; r <= 1; r += 0.1) {
      const value = vignette(r, r, 0.5, 1.5);
      expect(value).toBeLessThanOrEqual(previous);
      expect(value).toBeGreaterThanOrEqual(0);
      previous = value;
    }
  });

  it('maps the pointer to NDC with y up', () => {
    expect(toNdc(500, 300, 1000, 600)).toEqual([0, 0]);
    expect(toNdc(0, 0, 1000, 600)).toEqual([-1, 1]);
    expect(toNdc(1000, 600, 1000, 600)).toEqual([1, -1]);
    expect(toNdc(-50, 900, 1000, 600)).toEqual([-1, -1]);
    expect(toNdc(10, 10, 0, 0)).toEqual([0, 0]);
  });
});

describe('drawing budget', () => {
  it('caps the device pixel ratio and the buffer size', () => {
    expect(bufferDpr(390, 844, 3, 1.5, 2_400_000)).toBe(1.5);
    expect(bufferDpr(1280, 720, 1, 1.5, 2_400_000)).toBe(1);
    const dpr = bufferDpr(2560, 1440, 2, 1.5, 2_400_000);
    expect(dpr).toBeLessThanOrEqual(1.5);
    expect(2560 * 1440 * dpr * dpr).toBeLessThanOrEqual(2_400_000 + 1);
    expect(bufferDpr(800, 600, 0, 1.5, 2_400_000)).toBe(1);
  });

  it('draws every frame while following the visitor, else at the ambient rate', () => {
    expect(shouldDraw(1000, 995, true, 30)).toBe(true);
    expect(shouldDraw(1000, 990, false, 30)).toBe(false);
    expect(shouldDraw(1000, 966, false, 30)).toBe(true);
    expect(shouldDraw(0, -Infinity, false, 30)).toBe(true);
  });
});

describe('arch glyph', () => {
  it('is one unit wide, centred, and fully triangulated', () => {
    const glyph = glyphShape(ARCH, 3);
    const xs: number[] = [];
    const ys: number[] = [];
    glyph.position.forEach((value, i) => (i % 2 === 0 ? xs : ys).push(value));
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1, 6);
    expect(Math.max(...xs) + Math.min(...xs)).toBeCloseTo(0, 6);
    expect(Math.max(...ys) + Math.min(...ys)).toBeCloseTo(0, 6);

    const x = (i: number): number => xs[i] ?? NaN;
    const y = (i: number): number => ys[i] ?? NaN;
    // Outline area (shoelace) equals the area of the triangles: they tile it exactly.
    let outline = 0;
    for (let i = 0; i < xs.length; i++) {
      const j = (i + 1) % xs.length;
      outline += x(i) * y(j) - x(j) * y(i);
    }
    expect(glyph.index.length % 3).toBe(0);
    let triangles = 0;
    for (let t = 0; t < glyph.index.length; t += 3) {
      const [a = 0, b = 0, c = 0] = glyph.index.slice(t, t + 3);
      const area = (x(b) - x(a)) * (y(c) - y(a)) - (y(b) - y(a)) * (x(c) - x(a));
      // Every triangle faces the viewer (counter-clockwise).
      expect(area).toBeGreaterThanOrEqual(0);
      triangles += area;
    }
    expect(outline).toBeGreaterThan(0);
    expect(triangles).toBeCloseTo(outline, 6);
  });
});
