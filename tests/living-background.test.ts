import { describe, expect, it } from 'vitest';
import { PARALLAX_GAIN, PARALLAX_MAX } from '../src/scripts/motion';
import {
  ACCENTS,
  ACCENT_WEIGHTS,
  BALANCED,
  LOW_END_DENSITY,
  PLATES,
  blendFor,
  bufferDpr,
  contrastRatio,
  dampWeights,
  densityFactor,
  hexToRgb,
  inkCaps,
  isDarkBlend,
  maxInkAlpha,
  maxRgb,
  minRgb,
  modulo,
  parseAccent,
  parseCssColor,
  parseTheme,
  pickAccent,
  printAll,
  printLight,
  printMin,
  printOn,
  printPair,
  printScreen,
  printWith,
  relativeLuminance,
  shouldDraw,
  weightsFor,
  weightsSettled,
  type Accent,
  type InkBlend,
  type InkCaps,
  type InkWeights,
  type Plate,
  type Rgb,
} from '../src/scripts/living-background/math';
import {
  BRAID_INKS,
  INK_INDEX,
  LINE_STRIDE,
  braidCount,
  braidY,
  lineAt,
  lineInk,
  lineSpecs,
  loopMargin,
  pointerPush,
  random,
  stripVertices,
  writeLines,
  type BraidBudget,
  type LinePoint,
  type LineSpec,
  type LineTuning,
  type LineView,
} from '../src/scripts/living-background/lines';
import {
  PARALLAX_MIRROR,
  containsRect,
  fitRects,
  inkAlpha,
  insideAlpha,
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
const LINES: LineTuning = {
  river: { amp: [0.05, 0.09], cycles: [0.45, 0.8], speed: [0.05, 0.09] },
  weave: { amp: [0.03, 0.05], cycles: [0.9, 1.5], speed: [0.08, 0.14] },
  nodes: { cycles: [0.7, 1.1], speed: [0.03, 0.06], floor: 0.08 },
  parallax: [0.18, 0.32],
  scrollPhase: { river: 0.6, weave: 0.9 },
  width: [1.1, 1.5],
  keyWidth: 0.85,
  openInk: 0.7,
};
const BRAIDS: BraidBudget = {
  desktop: 2,
  tablet: 2,
  phone: 1,
  phoneWidth: 600,
  tabletWidth: 1024,
  lowEnd: 0.6,
};
const LINE_SEED = 5;
const TEXT_INSIDE = 0.2;
/** The contrast-safe caps start from these ceilings (light paper). */
const ALPHA_MAX: InkCaps = { k: 0.12, c: 0.2, m: 0.15, y: 0.42 };
/** The lines' design ceilings away from text. */
const LINE_CEILING: Record<'light' | 'dark', InkCaps> = {
  light: { k: 0.22, c: 0.55, m: 0.42, y: 0.85 },
  dark: { k: 0.24, c: 0.55, m: 0.55, y: 0.5 },
};

const PAPER = hexToRgb('#FAFAF7');
const KEY = hexToRgb('#221F20');
const RED = hexToRgb('#C03529');
const MUTED = hexToRgb('#5A5650');
const CYAN = hexToRgb('#00AEEF');
const MAGENTA = hexToRgb('#ED008C');
const YELLOW = hexToRgb('#FFF100');
const INKS: Record<Plate, Rgb> = { k: KEY, c: CYAN, m: MAGENTA, y: YELLOW };
const TEXTS = [RED, MUTED, KEY];
const MIN_CONTRAST = 4.6;

// ------------------------------------------------------------------------------------------------
// Ink lines
// ------------------------------------------------------------------------------------------------

const TAU = Math.PI * 2;
const VIEW: LineView = { width: 1440, height: 900 };
const PHONE: LineView = { width: 390, height: 844 };
const SPECS = lineSpecs(BRAIDS.desktop, LINES, LINE_SEED);

/** The lines of each braid, in braid order. */
const braidsOf = (specs: readonly LineSpec[]): LineSpec[][] => {
  const out: LineSpec[][] = [];
  specs.forEach((spec) => {
    (out[spec.braid] ??= []).push(spec);
  });
  return out;
};

/** Where `spec` crosses column `x`, with the margin the scene loops in for that view. */
const at = (spec: LineSpec, x: number, time: number, scroll: number, view = VIEW): LinePoint =>
  lineAt(spec, x, time, scroll, view, LINES, loopMargin(LINES, view.height));

const within = (value: number, range: readonly [number, number]): void => {
  expect(value).toBeGreaterThanOrEqual(range[0] - 1e-12);
  expect(value).toBeLessThanOrEqual(range[1] + 1e-12);
};

/** Distance between two angles around the circle (rad, 0–π). */
const turnBetween = (a: number, b: number): number => {
  const d = modulo(a - b, TAU);
  return Math.min(d, TAU - d);
};

describe('line composition', () => {
  it('draws the four inks of the logo in every braid, in print order', () => {
    expect(BRAID_INKS).toEqual(['c', 'm', 'y', 'k']);
    [1, 2, 3].forEach((n) => {
      const specs = lineSpecs(n, LINES, LINE_SEED);
      expect(specs).toHaveLength(4 * n);
      const braids = braidsOf(specs);
      expect(braids).toHaveLength(n);
      braids.forEach((lines) => expect(lines.map((l) => l.ink)).toEqual(['c', 'm', 'y', 'k']));
    });
    expect(lineSpecs(0, LINES, LINE_SEED)).toEqual([]);
    expect(lineSpecs(-2, LINES, LINE_SEED)).toEqual([]);
  });

  it('keeps the lines of one braid together, each on its own weave phase', () => {
    braidsOf(lineSpecs(3, LINES, LINE_SEED)).forEach((lines) => {
      const [first] = lines;
      if (!first) throw new Error('empty braid');
      lines.forEach((line) => {
        expect(line.base).toBe(first.base);
        expect(line.parallax).toBe(first.parallax);
        expect(line.river).toEqual(first.river);
        expect(line.nodes).toEqual(first.nodes);
        expect(line.weave.amp).toBe(first.weave.amp);
        expect(line.weave.cycles).toBe(first.weave.cycles);
        expect(line.weave.speed).toBe(first.weave.speed);
      });
      // Spread around the circle, so the lines cross one another.
      lines.forEach((a, i) => {
        lines.slice(i + 1).forEach((b) => {
          expect(turnBetween(a.weave.phase, b.weave.phase)).toBeGreaterThan(TAU / 8);
        });
      });
    });
  });

  it('spreads the braids over the page height, one per slice of the band', () => {
    [1, 2, 3, 5].forEach((n) => {
      const bases = braidsOf(lineSpecs(n, LINES, LINE_SEED)).map((lines) => lines[0]?.base ?? NaN);
      bases.forEach((base, b) => {
        expect(base).toBeGreaterThanOrEqual(b / n);
        expect(base).toBeLessThan((b + 1) / n);
      });
    });
  });

  it('stays within the tuning, the key line a little finer', () => {
    lineSpecs(4, LINES, LINE_SEED).forEach((spec) => {
      within(spec.parallax, LINES.parallax);
      // Below 1: the lines lag the page (depth).
      expect(spec.parallax).toBeLessThan(1);
      within(spec.river.amp, LINES.river.amp);
      within(spec.river.cycles, LINES.river.cycles);
      within(Math.abs(spec.river.speed), LINES.river.speed);
      within(spec.weave.amp, LINES.weave.amp);
      within(spec.weave.cycles, LINES.weave.cycles);
      within(Math.abs(spec.weave.speed), LINES.weave.speed);
      within(spec.nodes.cycles, LINES.nodes.cycles);
      within(Math.abs(spec.nodes.speed), LINES.nodes.speed);
      [spec.river.phase, spec.weave.phase, spec.nodes.phase].forEach((phase) =>
        expect(Number.isFinite(phase)).toBe(true),
      );
      const [thin, wide] = LINES.width;
      within(
        spec.width,
        spec.ink === 'k' ? [thin * LINES.keyWidth, wide * LINES.keyWidth] : [thin, wide],
      );
    });
  });

  it('composes the same lines on every visit', () => {
    expect(lineSpecs(2, LINES, LINE_SEED)).toEqual(lineSpecs(2, LINES, LINE_SEED));
    expect(lineSpecs(2, LINES, LINE_SEED + 1)).not.toEqual(lineSpecs(2, LINES, LINE_SEED));
    const a = random(7);
    const b = random(7);
    for (let i = 0; i < 200; i++) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('braids looping through the page', () => {
  const margin = loopMargin(LINES, VIEW.height);

  it('keeps every braid centre inside the looping band', () => {
    SPECS.forEach((spec) => {
      for (let scroll = -5000; scroll < 30_000; scroll += 97.3) {
        const y = braidY(spec, scroll, VIEW, margin);
        expect(y).toBeGreaterThanOrEqual(-margin);
        expect(y).toBeLessThan(VIEW.height + margin);
      }
    });
  });

  it('moves each braid up by its parallax as the page scrolls down, and back again', () => {
    const band = VIEW.height + 2 * margin;
    SPECS.forEach((spec) => {
      let steady = 0;
      for (let scroll = 0; scroll < 9000; scroll += 113) {
        const before = braidY(spec, scroll, VIEW, margin);
        const after = braidY(spec, scroll + 10, VIEW, margin);
        if (after < before) {
          expect(before - after).toBeCloseTo(10 * spec.parallax, 6);
          steady++;
        } else {
          // It wrapped: out at the top, back in at the bottom.
          expect(after - before).toBeCloseTo(band - 10 * spec.parallax, 6);
        }
        // Scrolling back gives back the same place.
        expect(braidY(spec, scroll, VIEW, margin)).toBe(before);
      }
      expect(steady).toBeGreaterThan(70);
    });
  });

  it('reaches no farther from its braid than the loop margin allows', () => {
    [VIEW, PHONE].forEach((view) => {
      const room = loopMargin(LINES, view.height);
      lineSpecs(3, LINES, LINE_SEED).forEach((spec) => {
        const reach = (spec.river.amp + spec.weave.amp) * view.height;
        expect(reach).toBeLessThanOrEqual(room - spec.width);
        [0, 811, 4200].forEach((scroll) => {
          const centre = braidY(spec, scroll, view, room);
          [0, 7.3, 61].forEach((time) => {
            for (let x = 0; x <= view.width; x += 24) {
              const { y } = at(spec, x, time, scroll, view);
              expect(Math.abs(y - centre)).toBeLessThanOrEqual(reach + 1e-9);
            }
          });
        });
      });
    });
  });

  it('wraps only out of sight: leaves at the top and comes back at the bottom', () => {
    [VIEW, PHONE].forEach((view) => {
      const room = loopMargin(LINES, view.height);
      SPECS.forEach((spec) => {
        let previous = braidY(spec, 0, view, room);
        let wraps = 0;
        for (let scroll = 1; scroll < 20_000; scroll++) {
          const y = braidY(spec, scroll, view, room);
          if (y > previous) {
            wraps++;
            [0, 13.7].forEach((time) => {
              for (let x = 0; x <= view.width; x += 30) {
                const out = at(spec, x, time, scroll - 1, view);
                const back = at(spec, x, time, scroll, view);
                expect(out.y + spec.width).toBeLessThan(0);
                expect(back.y - spec.width).toBeGreaterThan(view.height);
              }
            });
          }
          previous = y;
        }
        // Many passes over a long page.
        expect(wraps).toBeGreaterThan(1);
      });
    });
  });

  it('keeps the braid clear of the band ends whenever one of its lines is in view', () => {
    SPECS.forEach((spec) => {
      for (let scroll = 0; scroll < 8000; scroll += 53) {
        const centre = braidY(spec, scroll, VIEW, margin);
        for (let x = 0; x <= VIEW.width; x += 60) {
          const { y } = at(spec, x, 4.4, scroll);
          if (y >= 0 && y <= VIEW.height) {
            expect(centre).toBeGreaterThan(-margin + spec.width);
            expect(centre).toBeLessThan(VIEW.height + margin - spec.width);
          }
        }
      }
    });
  });
});

describe('line shape', () => {
  it('is continuous across the screen (under a pixel per pixel)', () => {
    SPECS.forEach((spec) => {
      [0, 4.2, 33].forEach((time) => {
        [0, 1500].forEach((scroll) => {
          let previous = at(spec, -20, time, scroll).y;
          for (let x = -19; x <= VIEW.width + 20; x++) {
            const { y } = at(spec, x, time, scroll);
            expect(Math.abs(y - previous)).toBeLessThanOrEqual(1);
            previous = y;
          }
        });
      });
    });
  });

  it('meets where the braid narrows and parts between the nodes', () => {
    const time = 2.5;
    braidsOf(SPECS).forEach((lines) => {
      const [first] = lines;
      if (!first) throw new Error('empty braid');
      let node = 0;
      let open = 0;
      let least = Infinity;
      let most = -Infinity;
      for (let x = -VIEW.width; x <= 2 * VIEW.width; x += 0.5) {
        const { spread } = at(first, x, time, 0);
        expect(spread).toBeGreaterThanOrEqual(0);
        expect(spread).toBeLessThanOrEqual(1);
        if (spread < least) [least, node] = [spread, x];
        if (spread > most) [most, open] = [spread, x];
      }
      /** How far apart the braid's lines are at column x. */
      const gap = (x: number): number => {
        const points = lines.map((line) => at(line, x, time, 0));
        // One braid, one set of nodes.
        points.forEach((p) => expect(p.spread).toBe(points[0]?.spread));
        const ys = points.map((p) => p.y);
        return Math.max(...ys) - Math.min(...ys);
      };
      const meet = 2 * LINES.nodes.floor * first.weave.amp * VIEW.height;
      expect(least).toBeLessThan(1e-3);
      expect(most).toBeGreaterThan(0.999);
      expect(gap(node)).toBeLessThanOrEqual(meet + 0.01);
      expect(gap(open)).toBeGreaterThan(3 * meet);
    });
  });

  it('drifts slowly with time', () => {
    SPECS.forEach((spec) => {
      let moved = 0;
      for (let x = 0; x <= VIEW.width; x += 40) {
        const now = at(spec, x, 12, 600).y;
        // One frame at 30 fps: at most a couple of pixels.
        expect(Math.abs(at(spec, x, 12 + 1 / 30, 600).y - now)).toBeLessThanOrEqual(2);
        moved = Math.max(moved, Math.abs(at(spec, x, 22, 600).y - now));
      }
      expect(moved).toBeGreaterThan(2);
    });
  });

  it('follows the scroll, and the waves shift with it', () => {
    const margin = loopMargin(LINES, VIEW.height);
    SPECS.forEach((spec) => {
      expect(Math.abs(at(spec, 720, 3, 200).y - at(spec, 720, 3, 0).y)).toBeGreaterThan(1);
      // Relative to the braid's place, the shape itself changes with the scroll.
      const shape = (x: number, scroll: number): number =>
        at(spec, x, 3, scroll).y - braidY(spec, scroll, VIEW, margin);
      let shifted = 0;
      for (let x = 0; x <= VIEW.width; x += 40) {
        shifted = Math.max(shifted, Math.abs(shape(x, 450) - shape(x, 0)));
      }
      expect(shifted).toBeGreaterThan(1);
    });
  });
});

describe('ink along a line', () => {
  it('prints full where the lines meet and openInk of it at the widest spread', () => {
    expect(lineInk(0, LINES.openInk)).toBe(1);
    expect(lineInk(1, LINES.openInk)).toBeCloseTo(LINES.openInk, 12);
    let previous = Infinity;
    for (let spread = 0; spread <= 1; spread += 0.05) {
      const ink = lineInk(spread, LINES.openInk);
      expect(ink).toBeLessThanOrEqual(previous);
      within(ink, [LINES.openInk, 1]);
      previous = ink;
    }
  });

  it('clamps the spread to 0–1', () => {
    expect(lineInk(-1, LINES.openInk)).toBe(1);
    expect(lineInk(2, LINES.openInk)).toBeCloseTo(LINES.openInk, 12);
  });
});

describe('lines parting around the pointer', () => {
  // The scene's POINTER.
  const radius = 140;
  const strength = 26;
  const peak = (Math.exp(-0.5) / Math.SQRT2) * strength;

  it('does nothing without a radius', () => {
    expect(pointerPush(10, 20, 0, strength)).toBe(0);
    expect(pointerPush(10, 20, -5, strength)).toBe(0);
  });

  it('pushes points below the pointer down and points above it up', () => {
    [-150, -40, 0, 60, 200].forEach((dx) => {
      [5, 30, 85, 160].forEach((dy) => {
        const down = pointerPush(dx, dy, radius, strength);
        expect(down).toBeGreaterThan(0);
        expect(pointerPush(dx, -dy, radius, strength)).toBeCloseTo(-down, 12);
      });
      expect(Math.abs(pointerPush(dx, 0, radius, strength))).toBe(0);
    });
  });

  it('pushes hardest about 0.7 radius from the pointer, about 0.43 of the strength', () => {
    let best = 0;
    let where = 0;
    for (let dy = 0; dy <= 3 * radius; dy += 0.25) {
      const push = pointerPush(0, dy, radius, strength);
      if (push > best) [best, where] = [push, dy];
    }
    expect(best / strength).toBeCloseTo(Math.exp(-0.5) / Math.SQRT2, 4);
    expect(where / radius).toBeCloseTo(Math.SQRT1_2, 2);
    for (let dx = -3 * radius; dx <= 3 * radius; dx += 7) {
      for (let dy = -3 * radius; dy <= 3 * radius; dy += 7) {
        expect(Math.abs(pointerPush(dx, dy, radius, strength))).toBeLessThanOrEqual(peak + 1e-9);
      }
    }
  });

  it('fades out beyond three radii', () => {
    [3, 5].forEach((reach) => {
      for (let angle = 0; angle < TAU; angle += Math.PI / 12) {
        const dx = Math.cos(angle) * reach * radius;
        const dy = Math.sin(angle) * reach * radius;
        expect(Math.abs(pointerPush(dx, dy, radius, strength))).toBeLessThanOrEqual(
          1e-3 * strength,
        );
      }
    });
  });
});

describe('line instance data', () => {
  it('matches the shader ink order (k, c, m, y)', () => {
    expect(INK_INDEX).toEqual({ k: 0, c: 1, m: 2, y: 3 });
    PLATES.forEach((plate, i) => expect(INK_INDEX[plate]).toBe(i));
  });

  it('writes every line in the documented layout', () => {
    expect(LINE_STRIDE).toBe(16);
    const out = new Float32Array(SPECS.length * LINE_STRIDE);
    expect(writeLines(SPECS, out)).toBe(SPECS.length);
    SPECS.forEach((s, i) => {
      const row = Array.from(out.subarray(i * LINE_STRIDE, (i + 1) * LINE_STRIDE));
      const expected = [
        s.base,
        s.parallax,
        s.width,
        INK_INDEX[s.ink],
        s.river.amp,
        s.river.cycles,
        s.river.phase,
        s.river.speed,
        s.weave.amp,
        s.weave.cycles,
        s.weave.phase,
        s.weave.speed,
        s.nodes.cycles,
        s.nodes.phase,
        s.nodes.speed,
        0,
      ].map((v) => Math.fround(v));
      expect(row).toEqual(expected);
    });
  });

  it('stops at the buffer capacity, leaving the rest untouched', () => {
    const out = new Float32Array(LINE_STRIDE * 2 + 5).fill(-7);
    expect(writeLines(SPECS, out)).toBe(2);
    expect(Array.from(out.slice(LINE_STRIDE * 2))).toEqual([-7, -7, -7, -7, -7]);
    expect(writeLines(SPECS, new Float32Array(0))).toBe(0);
    expect(writeLines([], out)).toBe(0);
  });

  it('builds each line as a strip of stations from one end to the other', () => {
    [1, 8, 96].forEach((segments) => {
      const strip = stripVertices(segments);
      const vertices = strip.length / 2;
      expect(vertices).toBe((segments + 1) * 2);
      let previous = 0;
      for (let i = 0; i < vertices; i++) {
        const t = strip[i * 2] ?? NaN;
        const side = strip[i * 2 + 1];
        expect(side).toBe(i % 2 === 0 ? -1 : 1);
        expect(t).toBeGreaterThanOrEqual(previous);
        previous = t;
      }
      expect(strip[0]).toBe(0);
      expect(strip[strip.length - 2]).toBe(1);
    });
    // At least one segment.
    expect(stripVertices(0).length).toBe(stripVertices(1).length);
  });
});

// ------------------------------------------------------------------------------------------------
// Section accents
// ------------------------------------------------------------------------------------------------

describe('section accents', () => {
  const own: Record<Accent, Plate> = { cyan: 'c', magenta: 'm', yellow: 'y', key: 'k' };

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
  });

  it('prints every ink at full strength by default', () => {
    expect(weightsFor(null)).toEqual(BALANCED);
    PLATES.forEach((plate) => expect(BALANCED[plate]).toBe(1));
  });

  it('leads with the section ink and quietens the others', () => {
    ACCENTS.forEach((accent) => {
      const weights = weightsFor(accent);
      expect(weights).toEqual(ACCENT_WEIGHTS[accent]);
      expect(weights[own[accent]]).toBe(1);
      PLATES.filter((plate) => plate !== own[accent]).forEach((plate) => {
        expect(weights[plate]).toBeLessThan(1);
        expect(weights[plate]).toBeGreaterThan(0);
      });
    });
  });

  it('never prints a line above its own alpha (every weight within 0–1)', () => {
    [BALANCED, ...Object.values(ACCENT_WEIGHTS)].forEach((weights) => {
      PLATES.forEach((plate) => within(weights[plate], [0, 1]));
    });
  });

  it('hands out copies, so damping never changes the tables', () => {
    const cyan = weightsFor('cyan');
    cyan.c = 0;
    expect(ACCENT_WEIGHTS.cyan.c).toBe(1);
    const balanced = weightsFor(null);
    balanced.k = 0;
    expect(BALANCED.k).toBe(1);
  });

  it('settles on the target without overshooting, at any frame rate', () => {
    const target = weightsFor('cyan');
    let weights: InkWeights = weightsFor(null);
    expect(weightsSettled(weights, target)).toBe(false);
    let previous = weights.k;
    for (let i = 0; i < 400; i++) {
      weights = dampWeights(weights, target, 1.8, 1 / 60);
      expect(weights.k).toBeLessThanOrEqual(previous);
      expect(weights.k).toBeGreaterThanOrEqual(target.k - 1e-9);
      expect(weights.c).toBeCloseTo(1, 12);
      previous = weights.k;
    }
    expect(weightsSettled(weights, target)).toBe(true);
    const start = weightsFor(null);
    const twoShort = dampWeights(dampWeights(start, target, 1.8, 0.008), target, 1.8, 0.008);
    const oneLong = dampWeights(start, target, 1.8, 0.016);
    PLATES.forEach((plate) => expect(twoShort[plate]).toBeCloseTo(oneLong[plate], 10));
  });
});

// ------------------------------------------------------------------------------------------------
// Contrast caps
// ------------------------------------------------------------------------------------------------

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

  it('caps every ink under its ceiling and keeps one line of it readable', () => {
    const caps = inkCaps(PAPER, INKS, TEXTS, ALPHA_MAX, MIN_CONTRAST);
    PLATES.forEach((plate) => {
      expect(caps[plate]).toBeGreaterThan(0);
      expect(caps[plate]).toBeLessThanOrEqual(ALPHA_MAX[plate]);
      TEXTS.forEach((text) => {
        const line = printOn(PAPER, INKS[plate], caps[plate]);
        expect(contrastRatio(text, line)).toBeGreaterThanOrEqual(MIN_CONTRAST);
      });
    });
    // Yellow may print strongest: it barely moves the luminance.
    expect(caps.y).toBeGreaterThan(caps.c);
    expect(caps.y).toBeGreaterThan(caps.m);
    expect(caps.y).toBeGreaterThan(caps.k);
  });

  describe('where lines overlap', () => {
    it('combines per channel under MIN, never darker than the darker of the two', () => {
      expect(minRgb([0.2, 0.9, 0.5], [0.6, 0.3, 0.5])).toEqual([0.2, 0.3, 0.5]);
      // The same ink over itself looks like one line.
      expect(printMin(PAPER, CYAN, 0.1, CYAN, 0.1)).toEqual(printOn(PAPER, CYAN, 0.1));
      // Cyan with yellow: cyan's red, yellow's blue (reads green), each no darker than alone.
      const green = printMin(PAPER, CYAN, 0.1, YELLOW, 0.4);
      expect(green[0]).toBe(printOn(PAPER, CYAN, 0.1)[0]);
      expect(green[2]).toBe(printOn(PAPER, YELLOW, 0.4)[2]);
      // Never brighter than the paper.
      green.forEach((channel, i) => expect(channel).toBeLessThanOrEqual(PAPER[i] ?? 0));
    });

    it('multiplies in the fallback, darker than either line', () => {
      const both = printPair(PAPER, CYAN, 0.1, MAGENTA, 0.1, 'multiply');
      expect(relativeLuminance(both)).toBeLessThan(
        relativeLuminance(printMin(PAPER, CYAN, 0.1, MAGENTA, 0.1)),
      );
    });

    (['min', 'multiply'] as InkBlend[]).forEach((blend) => {
      it(`keeps every text readable on every pair of lines at their caps (${blend})`, () => {
        const caps = inkCaps(PAPER, INKS, TEXTS, ALPHA_MAX, MIN_CONTRAST, blend);
        PLATES.forEach((p) => {
          PLATES.forEach((q) => {
            const pair = printPair(PAPER, INKS[p], caps[p], INKS[q], caps[q], blend);
            TEXTS.forEach((text) => {
              expect(contrastRatio(text, pair)).toBeGreaterThanOrEqual(MIN_CONTRAST);
            });
          });
        });
      });
    });

    it('keeps some ink under MIN and under the multiply fallback, within the ceilings', () => {
      const min = inkCaps(PAPER, INKS, TEXTS, ALPHA_MAX, MIN_CONTRAST, 'min');
      const multiply = inkCaps(PAPER, INKS, TEXTS, ALPHA_MAX, MIN_CONTRAST, 'multiply');
      PLATES.forEach((plate) => {
        expect(min[plate]).toBeGreaterThan(0);
        expect(multiply[plate]).toBeGreaterThan(0);
        expect(min[plate]).toBeLessThanOrEqual(ALPHA_MAX[plate]);
        expect(multiply[plate]).toBeLessThanOrEqual(ALPHA_MAX[plate]);
      });
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

describe('low-end density', () => {
  const capable = { cores: 8, memory: 8, coarse: false, width: 1440 };

  it('keeps every braid on capable devices and when the browser says nothing', () => {
    expect(densityFactor(capable)).toBe(1);
    expect(densityFactor({ cores: undefined, memory: undefined, coarse: false, width: 1440 })).toBe(
      1,
    );
    // A large touch screen (tablet) with plenty of cores and memory.
    expect(densityFactor({ ...capable, coarse: true, width: 1024 })).toBe(1);
  });

  it('thins the lines on any low-end hint', () => {
    expect(densityFactor({ ...capable, cores: 4 })).toBe(LOW_END_DENSITY);
    expect(densityFactor({ ...capable, memory: 2 })).toBe(LOW_END_DENSITY);
    expect(densityFactor({ ...capable, coarse: true, width: 390 })).toBe(LOW_END_DENSITY);
    expect(LOW_END_DENSITY).toBeGreaterThan(0.5);
    expect(LOW_END_DENSITY).toBeLessThan(0.7);
  });
});

describe('braids per screen', () => {
  const capable = { cores: 8, memory: 8, coarse: false };

  it('draws two braids on desktops and tablets, one on phones', () => {
    expect(braidCount({ ...capable, width: 1440 }, BRAIDS)).toBe(2);
    expect(braidCount({ ...capable, coarse: true, width: 820 }, BRAIDS)).toBe(2);
    expect(braidCount({ ...capable, coarse: true, width: 390 }, BRAIDS)).toBe(1);
    expect(braidCount({ ...capable, width: 599 }, BRAIDS)).toBe(1);
    expect(braidCount({ ...capable, width: 600 }, BRAIDS)).toBe(2);
    expect(braidCount({ ...capable, width: 1023 }, BRAIDS)).toBe(2);
    expect(braidCount({ ...capable, width: 1024 }, BRAIDS)).toBe(2);
  });

  it('draws fewer or as many on low-end devices, and never none', () => {
    [1440, 820, 390].forEach((width) => {
      const full = braidCount({ ...capable, width }, BRAIDS);
      const low = { cores: 4, memory: 2, coarse: true, width };
      const density = densityFactor(low);
      expect(density).toBeLessThan(1);
      const thin = braidCount(low, BRAIDS, density);
      expect(thin).toBeGreaterThanOrEqual(1);
      expect(thin).toBeLessThanOrEqual(full);
    });
    expect(braidCount({ ...capable, width: 1440 }, BRAIDS, 0)).toBe(1);
    expect(braidCount({ ...capable, width: 390 }, { ...BRAIDS, phone: 0 })).toBe(1);
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

// The scene's dark caps ceilings and theme.ts PALETTE.dark.
const DARK_CAPS_CEILING: InkCaps = { k: 0.08, c: 0.15, m: 0.14, y: 0.12 };
const DARK_PAPER = hexToRgb('#141311');
const DARK_KEY = hexToRgb('#F2EFE8');
const DARK_TEXTS = [hexToRgb('#F26A5B'), hexToRgb('#ADA89F'), DARK_KEY];
/** Dark mode prints yellow paler (scene.ts DARK_YELLOW). */
const DARK_YELLOW_INK = hexToRgb('#FFF59A');
const DARK_INKS: Record<Plate, Rgb> = { k: DARK_KEY, c: CYAN, m: MAGENTA, y: DARK_YELLOW_INK };

/** Both themes as the scene prints them: paper, inks, texts, caps ceilings, line ceilings. */
const THEMES = [
  {
    name: 'light',
    paper: PAPER,
    inks: INKS,
    texts: TEXTS,
    ceilings: ALPHA_MAX,
    lines: LINE_CEILING.light,
    blends: ['min', 'multiply'] as InkBlend[],
  },
  {
    name: 'dark',
    paper: DARK_PAPER,
    inks: DARK_INKS,
    texts: DARK_TEXTS,
    ceilings: DARK_CAPS_CEILING,
    lines: LINE_CEILING.dark,
    blends: ['max', 'screen'] as InkBlend[],
  },
];

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
  it('starts from readable text on the bare dark paper', () => {
    DARK_TEXTS.forEach((text) => {
      expect(contrastRatio(text, DARK_PAPER)).toBeGreaterThan(MIN_CONTRAST);
    });
  });

  (['max', 'screen'] as InkBlend[]).forEach((blend) => {
    it(`keeps every dark text colour ≥ ${MIN_CONTRAST} on every pair at the caps (${blend})`, () => {
      const caps = inkCaps(
        DARK_PAPER,
        DARK_INKS,
        DARK_TEXTS,
        DARK_CAPS_CEILING,
        MIN_CONTRAST,
        blend,
      );
      PLATES.forEach((p) => {
        expect(caps[p]).toBeGreaterThan(0);
        expect(caps[p]).toBeLessThanOrEqual(DARK_CAPS_CEILING[p]);
        PLATES.forEach((q) => {
          const pair = printPair(DARK_PAPER, DARK_INKS[p], caps[p], DARK_INKS[q], caps[q], blend);
          DARK_TEXTS.forEach((text) => {
            expect(contrastRatio(text, pair)).toBeGreaterThanOrEqual(MIN_CONTRAST);
          });
        });
      });
    });
  });

  it('binds on the darkest text (the least contrast against the dark paper)', () => {
    const muted = hexToRgb('#ADA89F');
    const red = hexToRgb('#F26A5B');
    const weakest = contrastRatio(red, DARK_PAPER) < contrastRatio(muted, DARK_PAPER) ? red : muted;
    const caps = inkCaps(DARK_PAPER, DARK_INKS, DARK_TEXTS, DARK_CAPS_CEILING, MIN_CONTRAST, 'max');
    const alone = inkCaps(DARK_PAPER, DARK_INKS, [weakest], DARK_CAPS_CEILING, MIN_CONTRAST, 'max');
    expect(caps).toEqual(alone);
  });

  it('prints yellow paler in dark mode, and caps it for that colour', () => {
    expect(relativeLuminance(DARK_YELLOW_INK)).toBeGreaterThan(relativeLuminance(YELLOW));
    const caps = inkCaps(DARK_PAPER, DARK_INKS, DARK_TEXTS, DARK_CAPS_CEILING, MIN_CONTRAST, 'max');
    DARK_TEXTS.forEach((text) => {
      const printed = printLight(DARK_PAPER, DARK_YELLOW_INK, caps.y);
      expect(contrastRatio(text, printed)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    });
  });

  it('keeps the light-paper caps as they were (the lightest text still binds there)', () => {
    const all = inkCaps(PAPER, INKS, TEXTS, ALPHA_MAX, MIN_CONTRAST);
    const red = inkCaps(PAPER, INKS, [RED], ALPHA_MAX, MIN_CONTRAST);
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
    // Grown by a line's reach: a line just outside still counts as on the text.
    expect(textMaskAt(310, 130, rects, feather, 10)).toBe(1);
    // All: the caps everywhere (reduced motion, no slots).
    expect(textMaskAt(800, 800, [], feather, 0, true)).toBe(1);
  });

  it('prints exactly its inside alpha on text and the design ceiling away from it', () => {
    const open = 0.55;
    const inside = 0.095;
    expect(inkAlpha(open, inside, 1)).toBe(inside);
    expect(inkAlpha(open, inside, 0)).toBe(open);
    expect(inkAlpha(open, inside, textMaskAt(200, 130, rects, feather))).toBe(inside);
    expect(inkAlpha(open, inside, textMaskAt(900, 130, rects, feather))).toBe(open);
    let previous = inside;
    for (let x = 300; x <= 300 + feather; x += 1) {
      const a = inkAlpha(open, inside, textMaskAt(x, 130, rects, feather));
      expect(a).toBeGreaterThanOrEqual(previous - 1e-12);
      expect(a).toBeLessThanOrEqual(open);
      previous = a;
    }
  });

  it('whispers on measured text: a share of the open ink, never above the cap', () => {
    expect(insideAlpha(0.5, 0.2, TEXT_INSIDE, false)).toBeCloseTo(0.5 * TEXT_INSIDE, 12);
    expect(insideAlpha(0.5, 0.05, TEXT_INSIDE, false)).toBe(0.05);
    [0.01, 0.2, 0.55, 0.85].forEach((open) => {
      [0.03, 0.09, 0.3].forEach((cap) => {
        const inside = insideAlpha(open, cap, TEXT_INSIDE, false);
        expect(inside).toBeLessThanOrEqual(cap);
        expect(inside).toBeLessThanOrEqual(open * TEXT_INSIDE + 1e-12);
      });
    });
  });

  it('prints exactly the cap everywhere when the text is not measured (all)', () => {
    [0.01, 0.2, 0.85].forEach((open) => {
      expect(insideAlpha(open, 0.07, TEXT_INSIDE, true)).toBe(0.07);
      const everywhere = textMaskAt(800, 800, [], feather, 0, true);
      expect(inkAlpha(open, insideAlpha(open, 0.07, TEXT_INSIDE, true), everywhere)).toBe(0.07);
    });
  });

  THEMES.forEach((theme) => {
    theme.blends.forEach((blend) => {
      it(`keeps every line under the caps on text (${theme.name}, ${blend})`, () => {
        const caps = inkCaps(
          theme.paper,
          theme.inks,
          theme.texts,
          theme.ceilings,
          MIN_CONTRAST,
          blend,
        );
        PLATES.forEach((plate) => {
          const open = theme.lines[plate];
          const cap = caps[plate];
          // Away from text the lines print stronger than they ever may on it.
          expect(open).toBeGreaterThan(cap);
          const inside = insideAlpha(open, cap, TEXT_INSIDE, false);
          expect(inside).toBeGreaterThan(0);
          expect(inside).toBeLessThanOrEqual(cap);
          expect(inside).toBeLessThanOrEqual(open * TEXT_INSIDE + 1e-12);
          for (let x = 100; x <= 300; x += 25) {
            for (let y = 100; y <= 160; y += 15) {
              const a = inkAlpha(open, inside, textMaskAt(x, y, rects, feather));
              expect(a).toBeLessThanOrEqual(cap);
              // Accent weights and the spread along the line only ever lower it.
              [BALANCED, ...Object.values(ACCENT_WEIGHTS)].forEach((weights) => {
                [0, 0.5, 1].forEach((spread) => {
                  expect(weights[plate] * lineInk(spread, LINES.openInk) * a).toBeLessThanOrEqual(
                    cap,
                  );
                });
              });
            }
          }
        });
      });
    });
  });
});

// ------------------------------------------------------------------------------------------------
// Where a braid's lines meet
// ------------------------------------------------------------------------------------------------

describe("three and four inks on one pixel (where a braid's lines meet)", () => {
  /** Every set of three or four different inks. */
  const groups: Plate[][] = [
    ['k', 'c', 'm', 'y'],
    ['c', 'm', 'y'],
    ['k', 'c', 'm'],
    ['k', 'c', 'y'],
    ['k', 'm', 'y'],
  ];

  THEMES.forEach((theme) => {
    theme.blends.forEach((blend) => {
      it(`keeps every text readable where three or four inks meet (${theme.name}, ${blend})`, () => {
        const caps = inkCaps(
          theme.paper,
          theme.inks,
          theme.texts,
          theme.ceilings,
          MIN_CONTRAST,
          blend,
        );
        PLATES.forEach((p) => expect(caps[p]).toBeGreaterThan(0));
        groups.forEach((group) => {
          const printed = printAll(
            theme.paper,
            group.map((p) => ({ ink: theme.inks[p], alpha: caps[p] })),
            blend,
          );
          theme.texts.forEach((text) => {
            expect(contrastRatio(text, printed)).toBeGreaterThanOrEqual(MIN_CONTRAST);
          });
        });
      });
    });

    it(`keeps the label red readable on C + M + Y at the caps (${theme.name})`, () => {
      const blend = theme.blends[0] ?? 'min';
      const caps = inkCaps(
        theme.paper,
        theme.inks,
        theme.texts,
        theme.ceilings,
        MIN_CONTRAST,
        blend,
      );
      const red = theme.texts[0] ?? RED;
      const printed = printAll(
        theme.paper,
        [
          { ink: theme.inks.c, alpha: caps.c },
          { ink: theme.inks.m, alpha: caps.m },
          { ink: theme.inks.y, alpha: caps.y },
        ],
        blend,
      );
      expect(contrastRatio(red, printed)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    });
  });

  it('combines every print one way: never back towards the paper as prints are added', () => {
    const prints = [
      { ink: CYAN, alpha: 0.1 },
      { ink: MAGENTA, alpha: 0.08 },
      { ink: YELLOW, alpha: 0.3 },
    ];
    expect(printAll(PAPER, [], 'min')).toEqual(PAPER);
    const two = printAll(PAPER, prints.slice(0, 2), 'min');
    const three = printAll(PAPER, prints, 'min');
    three.forEach((c, i) => expect(c).toBeLessThanOrEqual(two[i] ?? 0));
    expect(printAll(PAPER, prints.slice(0, 2), 'min')).toEqual(
      printMin(PAPER, CYAN, 0.1, MAGENTA, 0.08),
    );
    const darkTwo = printAll(DARK_PAPER, prints.slice(0, 2), 'max');
    const darkThree = printAll(DARK_PAPER, prints, 'max');
    darkThree.forEach((c, i) => expect(c).toBeGreaterThanOrEqual(darkTwo[i] ?? 1));
    expect(printAll(DARK_PAPER, prints.slice(0, 2), 'screen')).toEqual(
      printPair(DARK_PAPER, CYAN, 0.1, MAGENTA, 0.08, 'screen'),
    );
  });
});
