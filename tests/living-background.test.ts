import { describe, expect, it } from 'vitest';
import { ARCH, ARCH_PLATES } from '../src/components/logo-paths';
import { ART } from '../src/scripts/hero-scene/choreography';
import { boundsOf, sampleOutline } from '../src/scripts/hero-scene/geometry';
import { PARALLAX_GAIN, PARALLAX_MAX } from '../src/scripts/motion';
import {
  ACCENTS,
  ACCENT_MIX,
  BALANCED,
  MAX_TINT,
  blendFor,
  blendMix,
  bufferDpr,
  cellHash,
  contrastRatio,
  dampMix,
  densityFactor,
  dollyShift,
  glyphShape,
  gridFor,
  hexToRgb,
  inkCaps,
  inkThresholds,
  isDarkBlend,
  maxRgb,
  minRgb,
  LOW_END_DENSITY,
  maxInkAlpha,
  mixFor,
  mixRgb,
  mixSettled,
  parseAccent,
  parseCssColor,
  parseTheme,
  perspectiveMatrix,
  pickAccent,
  pitchFor,
  plateColours,
  printLight,
  printMin,
  printOn,
  printPair,
  printScreen,
  printWith,
  relativeLuminance,
  sheetFrame,
  sheetMatrix,
  shouldDraw,
  tintColor,
  toNdc,
  vignette,
  waveAt,
  wrapRow,
  type GlyphBlend,
  type GridOptions,
  type Plate,
  type InkMix,
  type Rgb,
  type VignetteOptions,
} from '../src/scripts/living-background/math';
import {
  HERO_ART_WIDTH,
  HERO_MARK_CENTRE,
  INK_INDEX,
  apparentWidth,
  blendPose,
  depthFade,
  freePose,
  loopBand,
  markFromArt,
  markSlots,
  parallaxRate,
  pickRegisterGroup,
  plateCycle,
  plateRows,
  plateSpecs,
  pointerInfluence,
  poolSize,
  registerEnvelope,
  registerTarget,
  springStep,
  toWorld,
  travellerPose,
  viewUnit,
  visiblePlates,
  wrapAngle,
  type PlateBudget,
  type PlatePose,
  type PlateTuning,
  type PlateView,
  type RegisterCandidate,
} from '../src/scripts/living-background/plates';
import {
  PARALLAX_MIRROR,
  containsRect,
  fitRects,
  inkAlpha,
  mergeRects,
  parallaxReach,
  textMaskAt,
  textSlots,
  toBufferRects,
  visibleRects,
  type Rect,
} from '../src/scripts/living-background/text-rects';
import { yieldToMain } from '../src/scripts/living-background/tasks';

// The scene's tuning (scene.ts), so the properties below hold for what ships.
const FOV = 46;
const TILT = -0.9;
const GRID: GridOptions = {
  pitchSmall: 46,
  pitchLarge: 42,
  smallWidth: 480,
  largeWidth: 1440,
  maxInstances: 9000,
  margin: 0.18,
  extraRows: 3,
};
const VIGNETTE: VignetteOptions = { inner: 0.8, outer: 1.6, calm: 0.7, calmRadius: 0.6 };
const ALPHA_MAX = { k: 0.12, c: 0.2, m: 0.15, y: 0.42 };

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
      expect(mix.share).toBeLessThan(1);
      expect(mix.tint).toBeGreaterThanOrEqual(0);
      expect(mix.tint).toBeLessThanOrEqual(MAX_TINT);
    });
  });

  it('lets the C/M/Y inks carry the default mix, key a minority', () => {
    expect(BALANCED.share).toBeGreaterThan(0.5);
    // Cyan and yellow have the highest contrast caps, so they lead; magenta follows.
    expect(BALANCED.c).toBeGreaterThan(BALANCED.m);
    expect(BALANCED.y).toBeGreaterThan(BALANCED.m);
    expect(BALANCED.tint).toBe(0);
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
    const [c, cm] = inkThresholds({ c: 1, m: 1, y: 1, share: 0.5, tint: 0 });
    expect(c).toBeCloseTo(1 / 3);
    expect(cm).toBeCloseTo(2 / 3);
    const [bc, bcm] = inkThresholds(BALANCED);
    expect(bc).toBeCloseTo(BALANCED.c);
    expect(bcm - bc).toBeCloseTo(BALANCED.m);
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

  it('caps every plate under its ceiling and keeps one glyph of it readable', () => {
    const inks = { k: KEY, c: CYAN, m: MAGENTA, y: YELLOW };
    const caps = inkCaps(PAPER, inks, TEXTS, ALPHA_MAX, MIN_CONTRAST, MAX_TINT);
    (['k', 'c', 'm', 'y'] as const).forEach((plate) => {
      expect(caps[plate]).toBeGreaterThan(0);
      expect(caps[plate]).toBeLessThanOrEqual(ALPHA_MAX[plate]);
      TEXTS.forEach((text) => {
        const glyph = printOn(PAPER, inks[plate], caps[plate]);
        expect(contrastRatio(text, glyph)).toBeGreaterThanOrEqual(MIN_CONTRAST);
      });
    });
    // Tinted key glyphs stay readable under the key cap.
    [CYAN, MAGENTA, YELLOW].forEach((ink) => {
      const glyph = printOn(PAPER, mixRgb(KEY, ink, MAX_TINT), caps.k);
      TEXTS.forEach((text) => {
        expect(contrastRatio(text, glyph)).toBeGreaterThanOrEqual(MIN_CONTRAST);
      });
    });
    // Yellow and cyan may print stronger than key: they carry the presence.
    expect(caps.y).toBeGreaterThan(caps.c);
    expect(caps.c).toBeGreaterThan(caps.k);
  });

  describe('where glyphs overlap', () => {
    const inks: Record<Plate, readonly [number, number, number]> = {
      k: KEY,
      c: CYAN,
      m: MAGENTA,
      y: YELLOW,
    };
    const plates: Plate[] = ['k', 'c', 'm', 'y'];
    /** Every ink a plate can print with: key also tinted, finely sampled. */
    const shades = (plate: Plate): (readonly [number, number, number])[] =>
      plate === 'k'
        ? [0, 0.25, 0.5, 0.75, 1].flatMap((f) =>
            [CYAN, MAGENTA, YELLOW].map((ink) => mixRgb(KEY, ink, MAX_TINT * f)),
          )
        : [inks[plate]];

    it('combines per channel under MIN, never darker than the darker of the two', () => {
      expect(minRgb([0.2, 0.9, 0.5], [0.6, 0.3, 0.5])).toEqual([0.2, 0.3, 0.5]);
      // The same ink over itself looks like one glyph.
      expect(printMin(PAPER, CYAN, 0.1, CYAN, 0.1)).toEqual(printOn(PAPER, CYAN, 0.1));
      // Cyan with yellow: cyan's red, yellow's blue (reads green), each no darker than alone.
      const green = printMin(PAPER, CYAN, 0.1, YELLOW, 0.4);
      expect(green[0]).toBe(printOn(PAPER, CYAN, 0.1)[0]);
      expect(green[2]).toBe(printOn(PAPER, YELLOW, 0.4)[2]);
      // Never brighter than the paper.
      green.forEach((channel, i) => expect(channel).toBeLessThanOrEqual(PAPER[i] ?? 0));
    });

    it('multiplies in the fallback, darker than either glyph', () => {
      const both = printPair(PAPER, CYAN, 0.1, MAGENTA, 0.1, 'multiply');
      expect(relativeLuminance(both)).toBeLessThan(
        relativeLuminance(printMin(PAPER, CYAN, 0.1, MAGENTA, 0.1)),
      );
    });

    (['min', 'multiply'] as GlyphBlend[]).forEach((blend) => {
      it(`keeps every text readable on every pair of glyphs at their caps (${blend})`, () => {
        const caps = inkCaps(PAPER, inks, TEXTS, ALPHA_MAX, MIN_CONTRAST, MAX_TINT, blend);
        plates.forEach((p) => {
          plates.forEach((q) => {
            shades(p).forEach((a) => {
              shades(q).forEach((b) => {
                const pair = printPair(PAPER, a, caps[p], b, caps[q], blend);
                TEXTS.forEach((text) => {
                  expect(contrastRatio(text, pair)).toBeGreaterThanOrEqual(MIN_CONTRAST);
                });
              });
            });
          });
        });
      });
    });

    it('keeps more ink under MIN than under the multiply fallback', () => {
      const min = inkCaps(PAPER, inks, TEXTS, ALPHA_MAX, MIN_CONTRAST, MAX_TINT, 'min');
      const multiply = inkCaps(PAPER, inks, TEXTS, ALPHA_MAX, MIN_CONTRAST, MAX_TINT, 'multiply');
      plates.forEach((plate) => {
        expect(min[plate]).toBeGreaterThanOrEqual(multiply[plate]);
        expect(multiply[plate]).toBeGreaterThan(0);
      });
    });

    it('lists the key tints among the colours the caps are checked against', () => {
      const colours = plateColours(inks, MAX_TINT);
      expect(colours.k).toContainEqual(KEY);
      expect(colours.k).toContainEqual(mixRgb(KEY, CYAN, MAX_TINT));
      expect(colours.c).toEqual([CYAN]);
    });
  });

  it('is 0 when the bare paper already fails', () => {
    expect(maxInkAlpha(PAPER, KEY, hexToRgb('#E0E0E0'), 4.5)).toBe(0);
  });

  it('reads the computed paper colour', () => {
    expect(parseCssColor('rgb(250, 250, 247)')).toEqual(PAPER);
    expect(parseCssColor('rgb(250 250 247)')).toEqual(PAPER);
    expect(parseCssColor('rgba(250, 250, 247, 1)')).toEqual(PAPER);
    expect(parseCssColor('#fafaf7')).toEqual(PAPER);
    expect(parseCssColor(' #FFF ')).toEqual([1, 1, 1]);
    expect(parseCssColor('transparent')).toBeNull();
    expect(parseCssColor('rgb(300, 0, 0)')).toBeNull();
  });
});

describe('edges and pointer', () => {
  it('keeps the centre calm but not empty, and fades the field towards the corners', () => {
    const centre = vignette(0, 0, VIGNETTE);
    expect(centre).toBeCloseTo(VIGNETTE.calm);
    expect(centre).toBeGreaterThan(0.5);
    expect(vignette(0.7, 0, VIGNETTE)).toBe(1);
    expect(vignette(1, 1, VIGNETTE)).toBeLessThan(0.2);
    expect(vignette(1, 1, VIGNETTE)).toBeLessThan(centre);
    // Past the calm centre it only falls towards the corners.
    let previous = 1;
    for (let r = 0.6; r <= 1.0; r += 0.05) {
      const value = vignette(r, r, VIGNETTE);
      expect(value).toBeLessThanOrEqual(previous + 1e-12);
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

describe('low-end density', () => {
  const capable = { cores: 8, memory: 8, coarse: false, width: 1440 };

  it('keeps the full grid on capable devices and when the browser says nothing', () => {
    expect(densityFactor(capable)).toBe(1);
    expect(densityFactor({ cores: undefined, memory: undefined, coarse: false, width: 1440 })).toBe(
      1,
    );
    // A large touch screen (tablet) with plenty of cores and memory.
    expect(densityFactor({ ...capable, coarse: true, width: 1024 })).toBe(1);
  });

  it('thins the grid on any low-end hint', () => {
    expect(densityFactor({ ...capable, cores: 4 })).toBe(LOW_END_DENSITY);
    expect(densityFactor({ ...capable, memory: 2 })).toBe(LOW_END_DENSITY);
    expect(densityFactor({ ...capable, coarse: true, width: 390 })).toBe(LOW_END_DENSITY);
    expect(LOW_END_DENSITY).toBeGreaterThan(0.5);
    expect(LOW_END_DENSITY).toBeLessThan(0.7);
  });

  it('draws about that share of the glyphs, still covering the sheet', () => {
    [
      [390, 844],
      [1440, 900],
      [2560, 1440],
    ].forEach(([w = 0, h = 0]) => {
      const frame = sheetFrame(w, h, FOV, TILT);
      const full = gridFor(frame, w, GRID);
      const thin = gridFor(frame, w, GRID, LOW_END_DENSITY);
      expect(thin.count).toBeLessThan(full.count * 0.75);
      expect(thin.count).toBeGreaterThan(full.count * 0.45);
      expect(thin.count).toBeLessThanOrEqual(GRID.maxInstances * LOW_END_DENSITY);
      expect(thin.rowStart * thin.pitch).toBeLessThanOrEqual(frame.vBottom);
      expect((thin.rowStart + thin.rows) * thin.pitch).toBeGreaterThanOrEqual(frame.vTop);
    });
  });
});

describe('matrices', () => {
  /** Column-major 4×4 times (x, y, z, 1). */
  const apply = (m: Float32Array, x: number, y: number, z: number): number[] =>
    [0, 1, 2, 3].map(
      (r) => (m[r] ?? 0) * x + (m[r + 4] ?? 0) * y + (m[r + 8] ?? 0) * z + (m[r + 12] ?? 0),
    );

  it('projects the viewport edges at the camera distance onto NDC ±1', () => {
    const [w, h] = [1440, 900];
    const d = h / 2 / Math.tan((FOV * Math.PI) / 360);
    const p = perspectiveMatrix(new Float32Array(16), FOV, w / h, d * 0.05, d * 8);
    const top = apply(p, 0, h / 2, -d);
    const right = apply(p, w / 2, 0, -d);
    expect((top[1] ?? 0) / (top[3] ?? 1)).toBeCloseTo(1, 5);
    expect((right[0] ?? 0) / (right[3] ?? 1)).toBeCloseTo(1, 5);
    const near = apply(p, 0, 0, -d * 0.05);
    const far = apply(p, 0, 0, -d * 8);
    expect((near[2] ?? 0) / (near[3] ?? 1)).toBeCloseTo(-1, 4);
    expect((far[2] ?? 0) / (far[3] ?? 1)).toBeCloseTo(1, 4);
  });

  it('tilts the top of the sheet away and turns its right side back', () => {
    const tilted = sheetMatrix(new Float32Array(16), TILT, 0, -1000);
    const up = apply(tilted, 0, 100, 0);
    expect(up[1]).toBeCloseTo(100 * Math.cos(TILT), 3);
    expect(up[2]).toBeLessThan(-1000);
    const turned = sheetMatrix(new Float32Array(16), 0, 0.1, 0);
    const right = apply(turned, 100, 0, 0);
    expect(right[0]).toBeCloseTo(100 * Math.cos(0.1), 3);
    expect(right[2]).toBeLessThan(0);
  });

  it('keeps the rotation rigid (no scaling or shear)', () => {
    const m = sheetMatrix(new Float32Array(16), -0.9, 0.06, -500);
    [0, 4, 8].forEach((c) => {
      const length = Math.hypot(m[c] ?? 0, m[c + 1] ?? 0, m[c + 2] ?? 0);
      expect(length).toBeCloseTo(1, 5);
    });
    const dot = (m[0] ?? 0) * (m[4] ?? 0) + (m[1] ?? 0) * (m[5] ?? 0) + (m[2] ?? 0) * (m[6] ?? 0);
    expect(dot).toBeCloseTo(0, 5);
  });

  it('agrees with the sheet frame: the top row it reports lands on the top edge', () => {
    const [w, h] = [1440, 900];
    const frame = sheetFrame(w, h, FOV, TILT);
    const p = perspectiveMatrix(new Float32Array(16), FOV, w / h, 1, frame.distance * 8);
    const mv = sheetMatrix(new Float32Array(16), TILT, 0, -frame.distance);
    const eye = apply(mv, 0, frame.vTop, 0);
    const clip = apply(p, eye[0] ?? 0, eye[1] ?? 0, eye[2] ?? 0);
    expect((clip[1] ?? 0) / (clip[3] ?? 1)).toBeCloseTo(1, 5);
  });
});

describe('start-up scheduling', () => {
  it('continues in a later task', async () => {
    let later = false;
    const pending = yieldToMain().then(() => later);
    later = true;
    await expect(pending).resolves.toBe(true);
  });
});

// ------------------------------------------------------------------------------------------------
// Dark theme: light ink on dark paper
// ------------------------------------------------------------------------------------------------

// The scene's dark ceilings (scene.ts INK_CEILINGS.dark.caps) and theme.ts PALETTE.dark.
const DARK_CAPS_CEILING = { k: 0.08, c: 0.15, m: 0.14, y: 0.12 };
const DARK_PAPER = hexToRgb('#141311');
const DARK_KEY = hexToRgb('#F2EFE8');
const DARK_TEXTS = [hexToRgb('#F26A5B'), hexToRgb('#ADA89F'), DARK_KEY];
const DARK_INKS: Record<Plate, Rgb> = { k: DARK_KEY, c: CYAN, m: MAGENTA, y: YELLOW };

describe('MIN and MAX', () => {
  it('keeps the lighter value per channel under MAX, the darker under MIN', () => {
    expect(maxRgb([0.2, 0.9, 0.5], [0.6, 0.3, 0.5])).toEqual([0.6, 0.9, 0.5]);
    expect(minRgb([0.2, 0.9, 0.5], [0.6, 0.3, 0.5])).toEqual([0.2, 0.3, 0.5]);
  });

  it('prints light ink on dark paper as a mix towards the ink', () => {
    expect(printLight(DARK_PAPER, CYAN, 0)).toEqual(DARK_PAPER);
    printLight(DARK_PAPER, CYAN, 1).forEach((c, i) => expect(c).toBeCloseTo(CYAN[i] ?? NaN));
    let previous = relativeLuminance(DARK_PAPER);
    for (let a = 0.05; a <= 1; a += 0.05) {
      const l = relativeLuminance(printLight(DARK_PAPER, DARK_KEY, a));
      expect(l).toBeGreaterThan(previous);
      previous = l;
    }
  });

  it('looks like one print where the same ink overlaps itself under MAX', () => {
    expect(printPair(DARK_PAPER, CYAN, 0.1, CYAN, 0.1, 'max')).toEqual(
      printLight(DARK_PAPER, CYAN, 0.1),
    );
    // Cyan with yellow: each channel the lighter of the two, never lighter than that.
    const both = printPair(DARK_PAPER, CYAN, 0.1, YELLOW, 0.1, 'max');
    expect(both[2]).toBe(printLight(DARK_PAPER, CYAN, 0.1)[2]);
    expect(both[0]).toBe(printLight(DARK_PAPER, YELLOW, 0.1)[0]);
  });

  it('only lightens the paper in the screen fallback, more than MAX', () => {
    expect(printScreen(DARK_PAPER, CYAN, 0)).toEqual(DARK_PAPER);
    const one = printScreen(DARK_PAPER, MAGENTA, 0.2);
    one.forEach((c, i) => expect(c).toBeGreaterThanOrEqual(DARK_PAPER[i] ?? 1));
    const screened = printPair(DARK_PAPER, CYAN, 0.1, MAGENTA, 0.1, 'screen');
    const maxed = printPair(DARK_PAPER, CYAN, 0.1, MAGENTA, 0.1, 'max');
    expect(relativeLuminance(screened)).toBeGreaterThan(relativeLuminance(maxed));
  });

  it('prints with the blend of the theme', () => {
    expect(blendFor('light', true)).toBe('min');
    expect(blendFor('light', false)).toBe('multiply');
    expect(blendFor('dark', true)).toBe('max');
    expect(blendFor('dark', false)).toBe('screen');
    expect(isDarkBlend('max')).toBe(true);
    expect(isDarkBlend('screen')).toBe(true);
    expect(isDarkBlend('min')).toBe(false);
    expect(printWith(PAPER, CYAN, 0.2, 'min')).toEqual(printOn(PAPER, CYAN, 0.2));
    expect(printWith(DARK_PAPER, CYAN, 0.2, 'max')).toEqual(printLight(DARK_PAPER, CYAN, 0.2));
  });

  it('reads the theme from html[data-theme], light unless it says dark', () => {
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme(undefined)).toBe('light');
    expect(parseTheme('sepia')).toBe('light');
  });
});

describe('dark-mode contrast caps (light text on the dark paper stays AA)', () => {
  const plates: Plate[] = ['k', 'c', 'm', 'y'];
  const shades = (plate: Plate): Rgb[] =>
    plate === 'k'
      ? [0, 0.25, 0.5, 0.75, 1].flatMap((f) =>
          [CYAN, MAGENTA, YELLOW].map((ink) => mixRgb(DARK_KEY, ink, MAX_TINT * f)),
        )
      : [DARK_INKS[plate]];

  it('starts from readable text on the bare dark paper', () => {
    DARK_TEXTS.forEach((text) => {
      expect(contrastRatio(text, DARK_PAPER)).toBeGreaterThan(MIN_CONTRAST);
    });
  });

  (['max', 'screen'] as GlyphBlend[]).forEach((blend) => {
    it(`keeps every dark text colour ≥ ${MIN_CONTRAST} on every pair at the caps (${blend})`, () => {
      const caps = inkCaps(
        DARK_PAPER,
        DARK_INKS,
        DARK_TEXTS,
        DARK_CAPS_CEILING,
        MIN_CONTRAST,
        MAX_TINT,
        blend,
      );
      plates.forEach((p) => {
        expect(caps[p]).toBeGreaterThan(0);
        expect(caps[p]).toBeLessThanOrEqual(DARK_CAPS_CEILING[p]);
        plates.forEach((q) => {
          shades(p).forEach((a) => {
            shades(q).forEach((b) => {
              const pair = printPair(DARK_PAPER, a, caps[p], b, caps[q], blend);
              DARK_TEXTS.forEach((text) => {
                expect(contrastRatio(text, pair)).toBeGreaterThanOrEqual(MIN_CONTRAST);
              });
            });
          });
        });
      });
    });
  });

  it('binds on the darkest text (the least contrast against the dark paper)', () => {
    const muted = hexToRgb('#ADA89F');
    const red = hexToRgb('#F26A5B');
    const weakest = contrastRatio(red, DARK_PAPER) < contrastRatio(muted, DARK_PAPER) ? red : muted;
    const caps = inkCaps(
      DARK_PAPER,
      DARK_INKS,
      DARK_TEXTS,
      DARK_CAPS_CEILING,
      MIN_CONTRAST,
      0,
      'max',
    );
    const alone = inkCaps(
      DARK_PAPER,
      DARK_INKS,
      [weakest],
      DARK_CAPS_CEILING,
      MIN_CONTRAST,
      0,
      'max',
    );
    expect(caps).toEqual(alone);
  });

  it('keeps the light-paper caps as they were (the lightest text still binds there)', () => {
    const inks = { k: KEY, c: CYAN, m: MAGENTA, y: YELLOW };
    const all = inkCaps(PAPER, inks, TEXTS, ALPHA_MAX, MIN_CONTRAST, MAX_TINT);
    const red = inkCaps(PAPER, inks, [RED], ALPHA_MAX, MIN_CONTRAST, MAX_TINT);
    expect(all).toEqual(red);
  });
});

// ------------------------------------------------------------------------------------------------
// Text-aware ink
// ------------------------------------------------------------------------------------------------

const box = (left: number, top: number, right: number, bottom: number): Rect => ({
  left,
  top,
  right,
  bottom,
});

describe('text rectangles', () => {
  it('merges overlapping and nearby boxes, and keeps distant ones apart', () => {
    const merged = mergeRects([box(0, 0, 100, 20), box(0, 30, 100, 50), box(0, 400, 50, 420)], 24);
    expect(merged).toEqual([box(0, 0, 100, 50), box(0, 400, 50, 420)]);
    // A chain: a near b, b near c, so all three become one block.
    const chain = mergeRects([box(0, 0, 10, 10), box(0, 100, 10, 110), box(0, 50, 10, 60)], 40);
    expect(chain).toEqual([box(0, 0, 10, 110)]);
    // Empty boxes are dropped.
    expect(mergeRects([box(5, 5, 5, 40)], 10)).toEqual([]);
  });

  it('always covers every input box', () => {
    const inputs = Array.from({ length: 60 }, (_, i) =>
      box((i * 37) % 900, i * 53, ((i * 37) % 900) + 40 + (i % 7) * 30, i * 53 + 18),
    );
    const merged = mergeRects(inputs, 24);
    inputs.forEach((r) => expect(merged.some((m) => containsRect(m, r))).toBe(true));
    for (let i = 1; i < merged.length; i++) {
      expect(merged[i]?.top ?? 0).toBeGreaterThanOrEqual(merged[i - 1]?.top ?? 0);
    }
  });

  it('fits any number of boxes into the shader slots without uncovering any', () => {
    const inputs = Array.from({ length: 50 }, (_, i) =>
      box(i * 7, i * 40, i * 7 + 120, i * 40 + 20),
    );
    [1, 4, 32].forEach((max) => {
      const fitted = fitRects(inputs, max);
      expect(fitted.length).toBeLessThanOrEqual(max);
      inputs.forEach((r) => expect(fitted.some((f) => containsRect(f, r))).toBe(true));
    });
    expect(fitRects(inputs, 0)).toEqual([]);
    expect(fitRects(inputs.slice(0, 3), 8)).toEqual(inputs.slice(0, 3));
  });

  it('culls to the boxes in view, moves document boxes with the scroll, not fixed ones', () => {
    const doc = [box(0, 100, 200, 140), box(0, 1500, 200, 1540), box(0, 3000, 200, 3040)];
    const fixed = [box(0, 0, 1440, 64)];
    const seen = visibleRects(doc, fixed, 1200, 900, 12, 0);
    expect(seen).toEqual([box(0, 300, 200, 340), box(0, 0, 1440, 64)]);
    // Just outside the margin: culled; inside it: kept.
    expect(visibleRects([box(0, 0, 10, 10)], [], 23, 900, 12, 0)).toEqual([]);
    expect(visibleRects([box(0, 0, 10, 10)], [], 21, 900, 12, 0)).toHaveLength(1);
    // The scroll lead grows every box above and below.
    expect(visibleRects(doc, [], 1200, 900, 12, 30)[0]).toEqual(box(0, 270, 200, 370));
  });

  it('writes the boxes in drawing-buffer px with y up', () => {
    const out = new Float32Array(8);
    const n = toBufferRects([box(10, 20, 110, 70), box(0, 0, 1, 1)], out, 1000, 800, 1500, 1200);
    expect(n).toBe(2);
    expect(Array.from(out.slice(0, 4))).toEqual([15, 1095, 165, 1170]);
    expect(
      toBufferRects([box(0, 0, 1, 1), box(0, 0, 1, 1), box(0, 0, 1, 1)], out, 10, 10, 10, 10),
    ).toBe(2);
  });

  it('sizes the rectangle arrays to the uniform limits, or drops them', () => {
    const o = { max: 32, min: 8, vertexReserve: 48, fragmentReserve: 16 };
    expect(textSlots(256, 221, o)).toBe(32);
    expect(textSlots(128, 64, o)).toBe(32);
    expect(textSlots(128, 40, o)).toBe(24);
    expect(textSlots(60, 221, o)).toBe(12);
    expect(textSlots(128, 20, o)).toBe(0);
    expect(textSlots(128, 16, o)).toBe(0);
  });

  it('knows how far a parallax layer can carry its text (as motion.ts moves it)', () => {
    expect(PARALLAX_MIRROR.gain).toBe(PARALLAX_GAIN);
    expect(PARALLAX_MIRROR.max).toBe(PARALLAX_MAX);
    expect(parallaxReach(0, 100, 900)).toBe(0);
    expect(parallaxReach(0.1, 100, 900)).toBeCloseTo(0.1 * 1.6 * 500);
    expect(parallaxReach(0.4, 4000, 900)).toBeCloseTo(PARALLAX_MAX * 900);
    expect(parallaxReach(-0.2, 100, 900)).toBe(parallaxReach(0.2, 100, 900));
  });
});

describe('text-aware ceiling', () => {
  const rects = [box(100, 100, 300, 160)];
  const feather = 12;

  it('is 1 inside text, 0 beyond the feather, and falls in between', () => {
    expect(textMaskAt(200, 130, rects, feather)).toBe(1);
    expect(textMaskAt(100, 100, rects, feather)).toBe(1);
    expect(textMaskAt(300 + feather, 130, rects, feather)).toBe(0);
    expect(textMaskAt(800, 800, rects, feather)).toBe(0);
    const half = textMaskAt(306, 130, rects, feather);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(1);
    // Grown by a glyph's reach: a glyph centred just outside still counts as on the text.
    expect(textMaskAt(310, 130, rects, feather, 10)).toBe(1);
    // All: the caps everywhere (reduced motion, no slots).
    expect(textMaskAt(800, 800, [], feather, 0, true)).toBe(1);
  });

  it('prints exactly at the cap on text and at the design ceiling away from it', () => {
    const open = 0.55;
    const cap = 0.095;
    expect(inkAlpha(open, cap, textMaskAt(200, 130, rects, feather))).toBe(cap);
    expect(inkAlpha(open, cap, textMaskAt(900, 130, rects, feather))).toBe(open);
    let previous = cap;
    for (let x = 300; x <= 300 + feather; x += 1) {
      const a = inkAlpha(open, cap, textMaskAt(x, 130, rects, feather));
      expect(a).toBeGreaterThanOrEqual(previous - 1e-12);
      expect(a).toBeLessThanOrEqual(open);
      previous = a;
    }
  });

  it('never prints above the caps anywhere on text, for any ceiling', () => {
    const inks = { k: KEY, c: CYAN, m: MAGENTA, y: YELLOW };
    const caps = inkCaps(PAPER, inks, TEXTS, ALPHA_MAX, MIN_CONTRAST, MAX_TINT);
    const plateCeiling = { k: 0.35, c: 0.55, m: 0.55, y: 0.55 };
    (['k', 'c', 'm', 'y'] as const).forEach((p) => {
      for (let x = 100; x <= 300; x += 25) {
        for (let y = 100; y <= 160; y += 15) {
          const a = inkAlpha(plateCeiling[p], caps[p], textMaskAt(x, y, rects, feather));
          expect(a).toBeLessThanOrEqual(caps[p]);
        }
      }
      expect(plateCeiling[p]).toBeGreaterThan(caps[p]);
    });
  });
});

// ------------------------------------------------------------------------------------------------
// Floating plates
// ------------------------------------------------------------------------------------------------

// The scene's tuning (scene.ts PLATES, PLATE_BUDGET, PLATE_FOG).
const PLATE_TUNING: PlateTuning = {
  depth: { near: 0.55, far: 2.6 },
  size: { min: 0.07, max: 0.2 },
  unit: { heightRatio: 1.3, min: 520 },
  bleed: 0.04,
  slack: 32,
  drift: { x: 0.03, y: 0.02, speedMin: 0.07, speedMax: 0.19 },
  spin: { min: 0.04, max: 0.15, tilt: 0.5 },
};
const PLATE_BUDGET: PlateBudget = {
  desktop: 10,
  tablet: 7,
  phone: 5,
  phoneWidth: 600,
  tabletWidth: 1024,
  lowEnd: 0.6,
  spare: 1.2,
};
const PLATE_FOG = { from: 1.3, to: 2.6, floor: 0.55 };

const viewFor = (width: number, height: number): PlateView => ({
  width,
  height,
  unit: viewUnit(width, height, PLATE_TUNING),
});

describe('plate pool', () => {
  it('spreads the depths over the whole range, one slice per plate', () => {
    const n = 12;
    const specs = plateSpecs(n, PLATE_TUNING);
    expect(specs).toHaveLength(n);
    const { near, far } = PLATE_TUNING.depth;
    const depths = specs.map((s) => s.depth).sort((a, b) => a - b);
    depths.forEach((d, i) => {
      expect(d).toBeGreaterThanOrEqual(near + ((far - near) * i) / n);
      expect(d).toBeLessThanOrEqual(near + ((far - near) * (i + 1)) / n);
    });
    // Some pass in front of the page, some lie far behind it.
    expect(depths[0]).toBeLessThan(1);
    expect(depths[n - 1]).toBeGreaterThan(2);
  });

  it('prints in all four inks, small to large, the same on every visit', () => {
    const specs = plateSpecs(12, PLATE_TUNING);
    (['c', 'm', 'y', 'k'] as const).forEach((ink) => {
      expect(specs.filter((s) => s.ink === ink)).toHaveLength(3);
    });
    specs.forEach((s) => {
      expect(s.size).toBeGreaterThanOrEqual(PLATE_TUNING.size.min);
      expect(s.size).toBeLessThanOrEqual(PLATE_TUNING.size.max);
      expect(s.phase).toBeGreaterThanOrEqual(0);
      expect(s.phase).toBeLessThan(1);
    });
    // The same plate looks over four times larger in front of the page than far behind it.
    const [first] = specs;
    if (!first) throw new Error('no plates');
    const nearest = apparentWidth({ ...first, depth: PLATE_TUNING.depth.near }, 1170);
    const farthest = apparentWidth({ ...first, depth: PLATE_TUNING.depth.far }, 1170);
    expect(nearest / farthest).toBeGreaterThan(4);
    expect(plateSpecs(12, PLATE_TUNING)).toEqual(specs);
    expect(INK_INDEX).toEqual({ k: 0, c: 1, m: 2, y: 3 });
  });

  it('keeps about 8–12 plates in view on desktop, 4–6 on phones, fewer on low-end', () => {
    const capable = { cores: 8, memory: 8 };
    const desktop = visiblePlates({ ...capable, coarse: false, width: 1440 }, PLATE_BUDGET);
    const phone = visiblePlates({ ...capable, coarse: true, width: 390 }, PLATE_BUDGET);
    const lowEnd = visiblePlates({ cores: 4, memory: 8, coarse: false, width: 1440 }, PLATE_BUDGET);
    const lowPhone = visiblePlates({ cores: 4, memory: 2, coarse: true, width: 390 }, PLATE_BUDGET);
    expect(desktop).toBe(10);
    expect(phone).toBe(5);
    expect(lowEnd).toBeLessThan(desktop);
    expect(lowPhone).toBeLessThan(phone);
    expect(lowPhone).toBeGreaterThanOrEqual(2);

    /** Average plates in view while scrolling through a long page. */
    const averageInView = (width: number, height: number, visible: number): number => {
      const view = viewFor(width, height);
      const specs = plateSpecs(poolSize(visible, PLATE_BUDGET), PLATE_TUNING);
      let total = 0;
      let samples = 0;
      for (let scroll = 0; scroll < 24_000; scroll += 37) {
        specs.forEach((spec) => {
          const pose = freePose(spec, scroll, scroll / 400, view, PLATE_TUNING);
          if (Math.abs(pose.y - height / 2) <= height / 2 + pose.width * 0.25) total++;
        });
        samples++;
      }
      return total / samples;
    };
    const onDesktop = averageInView(1440, 900, desktop);
    expect(onDesktop).toBeGreaterThanOrEqual(7.5);
    expect(onDesktop).toBeLessThanOrEqual(12.5);
    const onPhone = averageInView(390, 844, phone);
    expect(onPhone).toBeGreaterThanOrEqual(3.5);
    expect(onPhone).toBeLessThanOrEqual(6.5);
    expect(averageInView(1440, 900, lowEnd)).toBeLessThan(onDesktop);
  });
});

describe('plate parallax', () => {
  const view = viewFor(1440, 900);
  const specs = plateSpecs(12, PLATE_TUNING);

  it('maps depth to parallax: near plates faster than the page, far ones slower', () => {
    expect(parallaxRate(1)).toBe(1);
    expect(parallaxRate(0.55)).toBeGreaterThan(1.75);
    expect(parallaxRate(2.6)).toBeLessThan(0.4);
    for (let d = 0.6; d < 2.6; d += 0.1) {
      expect(parallaxRate(d + 0.1)).toBeLessThan(parallaxRate(d));
    }
  });

  it('moves every plate up by its own rate as the page scrolls down (reversibly)', () => {
    specs.forEach((spec) => {
      const scroll = 5000;
      const cycle = plateCycle(spec, scroll, view, PLATE_TUNING);
      const before = freePose(spec, scroll, 3, view, PLATE_TUNING, cycle);
      const after = freePose(spec, scroll + 10, 3, view, PLATE_TUNING, cycle);
      expect(before.y - after.y).toBeCloseTo(10 * parallaxRate(spec.depth), 6);
      expect(after.x).toBe(before.x);
      // Scrolling back gives back the same pose.
      expect(freePose(spec, scroll, 3, view, PLATE_TUNING)).toEqual(
        freePose(spec, scroll, 3, view, PLATE_TUNING),
      );
    });
  });

  it('places plates through the whole page height, looping out of sight', () => {
    specs.forEach((spec) => {
      const { margin } = loopBand(spec, view, PLATE_TUNING);
      const bob = spec.drift.ay * view.unit;
      const reach = apparentWidth(spec, view.unit) * 0.6;
      let previous = plateCycle(spec, 0, view, PLATE_TUNING);
      const cycles = new Set<number>([previous]);
      for (let scroll = 1; scroll < 12_000; scroll++) {
        const cycle = plateCycle(spec, scroll, view, PLATE_TUNING);
        const pose = freePose(spec, scroll, 7, view, PLATE_TUNING);
        expect(pose.y).toBeGreaterThanOrEqual(-margin - bob - 1e-6);
        expect(pose.y).toBeLessThanOrEqual(view.height + margin + bob + 1e-6);
        if (cycle !== previous) {
          // It leaves at the top and comes back at the bottom, both out of view.
          const out = freePose(spec, scroll - 1, 7, view, PLATE_TUNING);
          expect(out.y + reach).toBeLessThan(0);
          expect(pose.y - reach).toBeGreaterThan(view.height);
          cycles.add(cycle);
          previous = cycle;
        }
      }
      // Many passes over a long page, each at its own place across it.
      expect(cycles.size).toBeGreaterThan(3);
    });
  });

  it('prints far plates lighter', () => {
    expect(depthFade(0.6, PLATE_FOG)).toBe(1);
    expect(depthFade(2.6, PLATE_FOG)).toBeCloseTo(PLATE_FOG.floor);
    expect(depthFade(2, PLATE_FOG)).toBeLessThan(1);
    expect(depthFade(2, PLATE_FOG)).toBeGreaterThan(PLATE_FOG.floor);
  });
});

describe('plates in the world', () => {
  /** Column-major 4×4 times (x, y, z, 1). */
  const apply = (m: Float32Array, x: number, y: number, z: number): number[] =>
    [0, 1, 2, 3].map(
      (r) => (m[r] ?? 0) * x + (m[r + 4] ?? 0) * y + (m[r + 8] ?? 0) * z + (m[r + 12] ?? 0),
    );

  it('puts every pose where the camera sees it at that screen place, at any depth', () => {
    const [w, h] = [1440, 900];
    const d = h / 2 / Math.tan((FOV * Math.PI) / 360);
    const p = perspectiveMatrix(new Float32Array(16), FOV, w / h, d * 0.05, d * 8);
    [0.55, 1, 1.7, 2.6].forEach((depth) => {
      [
        [100, 80],
        [720, 450],
        [1300, 860],
      ].forEach(([sx = 0, sy = 0]) => {
        const [x, y, z] = toWorld(sx, sy, depth, w, h, d);
        const clip = apply(p, x, y, z);
        const ndcX = (clip[0] ?? 0) / (clip[3] ?? 1);
        const ndcY = (clip[1] ?? 0) / (clip[3] ?? 1);
        expect((ndcX * 0.5 + 0.5) * w).toBeCloseTo(sx, 6);
        expect((0.5 - ndcY * 0.5) * h).toBeCloseTo(sy, 6);
      });
    });
  });

  it('writes a rigid turn, scaled, and the position', () => {
    const out = new Float32Array(16);
    plateRows(out, 0, 0, 0, 0, 120, 5, 6, -7);
    // (+ 0 folds −0 into 0.)
    expect(Array.from(out.slice(0, 12), (v) => v + 0)).toEqual([
      120, 0, 0, 5, 0, 120, 0, 6, 0, 0, 120, -7,
    ]);

    plateRows(out, 4, 0.7, -1.2, 2.5, 3, 1, 2, 3);
    const row = (r: number): number[] => [0, 1, 2].map((c) => (out[4 + r * 4 + c] ?? 0) / 3);
    const dot = (a: number[], b: number[]): number =>
      a.reduce((sum, v, i) => sum + v * (b[i] ?? 0), 0);
    [0, 1, 2].forEach((r) => expect(dot(row(r), row(r))).toBeCloseTo(1, 5));
    expect(dot(row(0), row(1))).toBeCloseTo(0, 5);
    expect(dot(row(1), row(2))).toBeCloseTo(0, 5);
    const [a = [], b = [], c = []] = [row(0), row(1), row(2)];
    const det =
      (a[0] ?? 0) * ((b[1] ?? 0) * (c[2] ?? 0) - (b[2] ?? 0) * (c[1] ?? 0)) -
      (a[1] ?? 0) * ((b[0] ?? 0) * (c[2] ?? 0) - (b[2] ?? 0) * (c[0] ?? 0)) +
      (a[2] ?? 0) * ((b[0] ?? 0) * (c[1] ?? 0) - (b[1] ?? 0) * (c[0] ?? 0));
    expect(det).toBeCloseTo(1, 5);
    expect([out[7], out[11], out[15]]).toEqual([1, 2, 3]);
  });
});

describe('from the hero: the four plates of the mark', () => {
  const b = boundsOf(sampleOutline(ARCH, 6));
  const arch = { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, width: b.maxX - b.minX };
  const mark = { x: 600, y: 320, scale: 0.55 };
  const view = viewFor(1440, 900);

  it('uses the hero art box and the mark viewBox of the hero', () => {
    expect(HERO_ART_WIDTH).toBe(ART.width);
    // Logo.astro `mark` viewBox: 690 50 840 205.
    expect(HERO_MARK_CENTRE).toEqual({ x: 690 + 840 / 2, y: 50 + 205 / 2 });
    const placed = markFromArt({ left: 100, top: 50, width: 900, height: 620 });
    expect(placed).toEqual({ x: 550, y: 360, scale: 1 });
  });

  it('starts every plate at its ARCH_PLATES offset in the mark, one arch wide', () => {
    const slots = markSlots(arch, ARCH_PLATES, mark);
    expect(slots.map((s) => s.id)).toEqual(ARCH_PLATES.map((p) => p.id));
    slots.forEach((slot, i) => {
      const plate = ARCH_PLATES[i];
      expect(slot.width).toBeCloseTo(arch.width * mark.scale, 9);
      expect(slot.y).toBeCloseTo(mark.y + (arch.cy - HERO_MARK_CENTRE.y) * mark.scale, 9);
      expect(slot.x).toBeCloseTo(
        mark.x + (arch.cx + (plate?.x ?? NaN) - HERO_MARK_CENTRE.x) * mark.scale,
        9,
      );
      const next = slots[i + 1];
      const nextPlate = ARCH_PLATES[i + 1];
      if (next && nextPlate && plate) {
        expect(next.x - slot.x).toBeCloseTo((nextPlate.x - plate.x) * mark.scale, 9);
      }
    });
    // The ARCH outline sits where the path says: its box, shifted by the plate offset.
    expect(arch.width).toBeCloseTo(1163 - 701, 6);
    expect(b.maxY).toBeCloseTo(248, 6);
  });

  it('is exactly the flat mark before it scatters, then takes its own depth and size', () => {
    const [slot] = markSlots(arch, ARCH_PLATES, mark);
    const spec = plateSpecs(4, PLATE_TUNING, 8)[0];
    if (!slot || !spec) throw new Error('missing plate');
    const travel = { x: -0.3, y: -0.12, depth: 0.72, grow: 1.35 };
    [0, 250].forEach((since) => {
      const pose = travellerPose(slot, spec, travel, 0, since, 9.5, view);
      expect(pose.x).toBeCloseTo(slot.x, 9);
      expect(pose.y).toBeCloseTo(slot.y, 9);
      expect(pose.width).toBeCloseTo(slot.width, 9);
      expect(pose.depth).toBe(1);
      [pose.rx, pose.ry, pose.rz].forEach((r) => expect(r).toBeCloseTo(0, 12));
    });
    const out = travellerPose(slot, spec, travel, 1, 400, 9.5, view);
    expect(out.depth).toBeCloseTo(travel.depth, 9);
    expect(out.width).toBeCloseTo(slot.width * travel.grow, 9);
    // Nearer than the page: it moves faster than the page (the slot scrolls with the page).
    expect(out.y).toBeLessThan(slot.y + travel.y * view.height + spec.drift.ay * view.unit);
    // Halfway, it is between the two.
    const half = travellerPose(slot, spec, travel, 0.5, 0, 9.5, view);
    expect(half.depth).toBeGreaterThan(travel.depth);
    expect(half.depth).toBeLessThan(1);
  });
});

describe('plates drifting into register', () => {
  const timing = { in: 2.8, hold: 2.4, out: 2.8 };

  it('drifts in, holds and parts again', () => {
    expect(registerEnvelope(-1, timing)).toBe(0);
    expect(registerEnvelope(0, timing)).toBe(0);
    expect(registerEnvelope(1.4, timing)).toBeGreaterThan(0);
    expect(registerEnvelope(1.4, timing)).toBeLessThan(1);
    expect(registerEnvelope(3, timing)).toBe(1);
    expect(registerEnvelope(5, timing)).toBe(1);
    expect(registerEnvelope(8, timing)).toBe(0);
    expect(registerEnvelope(20, timing)).toBe(0);
  });

  it('picks nearby plates of different inks at a similar depth', () => {
    const candidates: RegisterCandidate[] = [
      { index: 0, ink: 'c', x: 700, y: 440, depth: 1.2 },
      { index: 1, ink: 'c', x: 720, y: 450, depth: 1.2 },
      { index: 2, ink: 'm', x: 800, y: 500, depth: 1.4 },
      { index: 3, ink: 'y', x: 650, y: 400, depth: 2.5 },
      { index: 4, ink: 'k', x: 900, y: 300, depth: 1.1 },
      { index: 5, ink: 'y', x: 1400, y: 800, depth: 1.2 },
    ];
    const group = pickRegisterGroup(candidates, { x: 720, y: 450 }, 3, 0.7, 380);
    expect(group).toEqual([1, 2, 4]);
    expect(pickRegisterGroup(candidates, { x: 720, y: 450 }, 2, 0.7, 380)).toEqual([1, 2]);
    expect(pickRegisterGroup(candidates.slice(0, 2), { x: 720, y: 450 }, 3, 0.7, 380)).toBeNull();
    expect(pickRegisterGroup([], { x: 0, y: 0 }, 3, 0.7, 380)).toBeNull();
  });

  it('lays the group exactly on top of itself at full weight (overprint), unchanged at 0', () => {
    const poses: PlatePose[] = [
      { x: 600, y: 400, width: 140, depth: 1.1, rx: 0.3, ry: 12.4, rz: -3 },
      { x: 720, y: 480, width: 110, depth: 1.5, rx: -2, ry: 0.1, rz: 7 },
      { x: 660, y: 350, width: 160, depth: 1.3, rx: 1, ry: -5, rz: 0.5 },
    ];
    const target = registerTarget(poses);
    if (!target) throw new Error('no target');
    expect(target.x).toBeCloseTo(660);
    expect(target.depth).toBeCloseTo(1.3);
    const met = poses.map((p) => blendPose(p, target, 1));
    met.forEach((p) => {
      expect(p.x).toBeCloseTo(target.x, 9);
      expect(p.y).toBeCloseTo(target.y, 9);
      expect(p.width).toBeCloseTo(target.width, 9);
      expect(p.depth).toBeCloseTo(target.depth, 9);
      [
        [p.rx, target.rx],
        [p.ry, target.ry],
        [p.rz, target.rz],
      ].forEach(([a = 0, t = 0]) => expect(wrapAngle(a - t)).toBeCloseTo(0, 9));
    });
    poses.forEach((p) => expect(blendPose(p, target, 0)).toEqual(p));
    // Turning the short way: never more than half a turn per axis.
    const second = poses[1];
    if (!second) throw new Error('missing pose');
    const halfway = blendPose(second, target, 0.5);
    expect(Math.abs(halfway.rz - second.rz)).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
    expect(registerTarget([])).toBeNull();
  });

  it('folds angles into (−π, π]', () => {
    [-10, -Math.PI, -1, 0, 1, Math.PI, 4, 25].forEach((a) => {
      const w = wrapAngle(a);
      expect(w).toBeGreaterThan(-Math.PI - 1e-12);
      expect(w).toBeLessThanOrEqual(Math.PI + 1e-12);
      expect(Math.cos(w)).toBeCloseTo(Math.cos(a), 9);
      expect(Math.sin(w)).toBeCloseTo(Math.sin(a), 9);
    });
  });
});

describe('plates and the pointer', () => {
  it('moves plates near the pointer most', () => {
    expect(pointerInfluence(0, 0, 300)).toBe(1);
    expect(pointerInfluence(300, 0, 300)).toBeCloseTo(Math.exp(-1));
    expect(pointerInfluence(100, 0, 300)).toBeGreaterThan(pointerInfluence(200, 0, 300));
    expect(pointerInfluence(100, 0, 0)).toBe(0);
  });

  it('settles on its springs at any frame rate', () => {
    [1 / 30, 1 / 60, 1 / 144].forEach((dt) => {
      let [x, v] = [0, 0];
      for (let t = 0; t < 3; t += dt) [x, v] = springStep(x, v, 0.4, 36, 7.5, dt);
      expect(x).toBeCloseTo(0.4, 3);
      expect(Math.abs(v)).toBeLessThan(1e-2);
    });
    // A long frame stays stable.
    const [x] = springStep(0, 0, 1, 36, 7.5, 5);
    expect(Number.isFinite(x)).toBe(true);
    expect(Math.abs(x)).toBeLessThan(2);
  });
});
