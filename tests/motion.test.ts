import { describe, expect, it } from 'vitest';
import {
  DEPTH_TILT,
  HALFTONE_MS,
  HALFTONE_QUICK_MS,
  PARALLAX_GAIN,
  PARALLAX_LIMIT,
  PARALLAX_MAX,
  clamp,
  damp,
  depthAmplitude,
  depthStartScale,
  effectiveParallax,
  fitScale,
  magneticPull,
  motionProfile,
  parallaxOffset,
  parallaxSpeed,
  perspectiveGrow,
  plateDirection,
  pointerNorm,
  rippleDiameter,
  scrollProgress,
  scrubRange,
  springStep,
  tiltLimit,
  velocityOffset,
  type Spring,
} from '../src/scripts/motion';
import {
  archBox,
  blockCoverage,
  printAmount,
  rippleBand,
  scrollPrint,
  smoothstep,
  swellFalloff,
} from '../src/scripts/halftone-field';

describe('clamp and damp', () => {
  it('clamps into the range', () => {
    expect(clamp(-2, 0, 1)).toBe(0);
    expect(clamp(0.4, 0, 1)).toBe(0.4);
    expect(clamp(3, 0, 1)).toBe(1);
  });

  it('moves towards the target without passing it', () => {
    const next = damp(0, 10, 8, 16);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(10);
    expect(damp(0, 10, 8, 10_000)).toBeCloseTo(10, 6);
  });

  it('does not depend on the frame rate', () => {
    const twoShort = damp(damp(0, 1, 9, 8), 1, 9, 8);
    expect(twoShort).toBeCloseTo(damp(0, 1, 9, 16), 10);
  });
});

describe('logo misregistration spring', () => {
  const run = (start: Spring, target: number, frames: number, dt = 16): Spring => {
    let s = start;
    for (let i = 0; i < frames; i++) s = springStep(s, target, dt, 240, 18);
    return s;
  };

  it('clamps the velocity offset to ±max px', () => {
    expect(velocityOffset(0.5, 1.4, 5)).toBeCloseTo(0.7);
    expect(velocityOffset(20, 1.4, 5)).toBe(5);
    expect(velocityOffset(-20, 1.4, 5)).toBe(-5);
  });

  it('springs back into register when the target returns to 0', () => {
    const s = run({ x: 5, v: 0 }, 0, 120);
    expect(Math.abs(s.x)).toBeLessThan(0.02);
    expect(Math.abs(s.v)).toBeLessThan(0.05);
  });

  it('overshoots a little on the way back (the register snap)', () => {
    let s: Spring = { x: 5, v: 0 };
    let lowest = s.x;
    for (let i = 0; i < 60; i++) {
      s = springStep(s, 0, 16, 240, 18);
      lowest = Math.min(lowest, s.x);
    }
    expect(lowest).toBeLessThan(0);
    expect(lowest).toBeGreaterThan(-5);
  });

  it('stays stable through a long frame', () => {
    const s = springStep({ x: 5, v: 0 }, 0, 250, 240, 18);
    expect(Number.isFinite(s.x)).toBe(true);
    expect(Math.abs(s.x)).toBeLessThanOrEqual(5);
  });
});

describe('scroll progress', () => {
  it('maps the scroll position to 0–1', () => {
    expect(scrollProgress(0, 1000)).toBe(0);
    expect(scrollProgress(250, 1000)).toBe(0.25);
    expect(scrollProgress(1200, 1000)).toBe(1);
    expect(scrollProgress(-40, 1000)).toBe(0);
  });

  it('is 0 on a page that does not scroll', () => {
    expect(scrollProgress(0, 0)).toBe(0);
    expect(scrollProgress(10, -5)).toBe(0);
  });
});

describe('scrub ranges', () => {
  it('runs from the start fraction to the end fraction of the viewport', () => {
    // Top at 3000px, viewport 1000px: from 95% (2050) to 60% (2400).
    expect(scrubRange(3000, 1000, 0.95, 0.6, 10_000)).toEqual([2050, 2400]);
  });

  it('always finishes by the end of the page', () => {
    // The natural end (2400) is past the last scroll position (2200).
    const [start, end] = scrubRange(3000, 1000, 0.95, 0.6, 2200);
    expect(end).toBe(2200);
    expect(start).toBeLessThan(end);
    // Even the start is past the end of the page: both clamp, start still before end.
    const [lateStart, lateEnd] = scrubRange(3000, 1000, 0.95, 0.6, 1500);
    expect(lateEnd).toBe(1500);
    expect(lateStart).toBe(1499);
  });

  it('never starts before the top of the page', () => {
    const [start, end] = scrubRange(500, 1000, 1, 0.65, 10_000);
    expect(start).toBe(0);
    expect(end).toBeGreaterThan(start);
  });
});

describe('depth and tilt stay inside their box', () => {
  /** Projected half-width of the near edge relative to the box, for a centred transform. */
  const nearEdgeWidth = (height: number, amplitude: number, d: number): number => {
    const scale = 1 - d * (1 - depthStartScale(height, amplitude));
    const angle = (DEPTH_TILT * amplitude * d * Math.PI) / 180;
    return scale * perspectiveGrow(scale * (height / 2) * Math.sin(angle));
  };

  it('keeps the design start scale for ordinary blocks', () => {
    expect(depthStartScale(300, depthAmplitude(300))).toBe(0.96);
  });

  it('shrinks the start scale for tall panels so the near edge never overflows', () => {
    // The contact form on a 360px phone: about 1800px tall.
    const amplitude = depthAmplitude(1800);
    expect(depthStartScale(1800, amplitude)).toBeLessThan(0.96);
    [0, 0.25, 0.5, 0.75, 1].forEach((d) => {
      expect(nearEdgeWidth(1800, amplitude, d)).toBeLessThanOrEqual(1);
    });
  });

  it('never overflows at any height through the whole entry', () => {
    [120, 400, 560, 900, 1400, 2400, 4000].forEach((height) => {
      const amplitude = depthAmplitude(height);
      for (let d = 0; d <= 1; d += 0.05) {
        expect(nearEdgeWidth(height, amplitude, d)).toBeLessThanOrEqual(1);
      }
    });
  });

  it('scales a tilted element only when its near edge would leave the viewport', () => {
    // Plenty of room beside the card: no scaling.
    expect(fitScale(300, 40, 15)).toBe(1);
    // Full width (no room): the grown edge is scaled back to the box.
    const fit = fitScale(360, 0, 18);
    expect(fit).toBeLessThan(1);
    expect(fit * perspectiveGrow(18)).toBeCloseTo(1);
    expect(fitScale(0, 0, 10)).toBe(1);
  });
});

describe('pointer helpers', () => {
  it('normalises the pointer to -1…1 inside a box', () => {
    expect(pointerNorm(150, 100, 100, 50, 100, 100)).toEqual([0, 0]);
    expect(pointerNorm(100, 50, 100, 50, 100, 100)).toEqual([-1, -1]);
    expect(pointerNorm(400, 400, 100, 50, 100, 100)).toEqual([1, 1]);
    expect(pointerNorm(10, 10, 0, 0, 0, 0)).toEqual([0, 0]);
  });

  it('tilts cards by 6° at most and big panels by less, never under 2.5°', () => {
    expect(tiltLimit(300)).toBe(6);
    expect(tiltLimit(840)).toBeCloseTo(3);
    expect(tiltLimit(4000)).toBe(2.5);
  });

  it('scales the depth rotation down for tall panels', () => {
    expect(depthAmplitude(400)).toBe(1);
    expect(depthAmplitude(1120)).toBeCloseTo(0.5);
    expect(depthAmplitude(10_000)).toBe(0.25);
  });

  it('caps the magnetic pull at the maximum length', () => {
    const [x, y] = magneticPull(10, 0, 0.22, 6);
    expect(x).toBeCloseTo(2.2);
    expect(y).toBe(0);
    const [cx, cy] = magneticPull(300, 400, 0.22, 6);
    expect(Math.hypot(cx, cy)).toBeCloseTo(6);
    expect(cx / cy).toBeCloseTo(0.75);
  });

  it('points the plate shadow towards the pointer, null near the centre', () => {
    expect(plateDirection(0.05, -0.05)).toBeNull();
    expect(plateDirection(0.5, 0.5)).toEqual([1, 1]);
    expect(plateDirection(-0.8, 0.4)).toEqual([-1, 0.5]);
  });
});

describe('parallax', () => {
  const vh = 900;
  const max = vh * PARALLAX_MAX;
  /** Screen centre of an element whose layout centre starts at `start`, after scrolling `s`. */
  const screen = (start: number, s: number, speed: number): number => {
    const centre = start - s;
    return centre + parallaxOffset(centre, vh / 2, speed, max);
  };

  it('reads data-parallax speeds within ±0.4', () => {
    expect(parallaxSpeed('0.2')).toBe(0.2);
    expect(parallaxSpeed('-0.15')).toBe(-0.15);
    expect(parallaxSpeed('1')).toBe(PARALLAX_LIMIT);
    expect(parallaxSpeed('-3')).toBe(-PARALLAX_LIMIT);
    expect(parallaxSpeed(' 0.1 ')).toBe(0.1);
  });

  it('ignores missing, invalid and zero speeds', () => {
    expect(parallaxSpeed(null)).toBeNull();
    expect(parallaxSpeed('')).toBeNull();
    expect(parallaxSpeed('fast')).toBeNull();
    expect(parallaxSpeed('0')).toBeNull();
    expect(parallaxSpeed('Infinity')).toBeNull();
  });

  it('is zero at the viewport centre and for speed 0', () => {
    expect(parallaxOffset(450, 450, 0.3, max)).toBe(0);
    expect(parallaxOffset(450, 450, -0.3, max)).toBe(0);
    [-2000, -100, 0, 300, 450, 900, 5000].forEach((centre) => {
      expect(parallaxOffset(centre, 450, 0, max)).toBe(0);
    });
  });

  it('pushes away from the centre for negative speeds and towards it for positive ones', () => {
    // Below the centre.
    expect(parallaxOffset(650, 450, 0.2, max)).toBeLessThan(0);
    expect(parallaxOffset(650, 450, -0.2, max)).toBeGreaterThan(0);
    // Above the centre: mirrored.
    expect(parallaxOffset(250, 450, 0.2, max)).toBeCloseTo(-parallaxOffset(650, 450, 0.2, max));
  });

  it('lags the scroll for positive speeds and leads it for negative ones', () => {
    // Scrolling 20px moves the content 20px; a lagging element moves less, a leading one more.
    const moved = (speed: number): number =>
      Math.abs(screen(600, 120, speed) - screen(600, 100, speed));
    expect(moved(0)).toBeCloseTo(20);
    expect(moved(0.25)).toBeLessThan(20);
    expect(moved(-0.25)).toBeGreaterThan(20);
  });

  it('emphasizes every speed by the global gain, keeping their order and direction', () => {
    expect(PARALLAX_GAIN).toBeCloseTo(1.6);
    // The maximum offset scales with the gain (18vh before it), rounded to 26vh.
    expect(PARALLAX_MAX).toBeCloseTo(0.26);
    expect(Math.abs(PARALLAX_MAX - 0.18 * PARALLAX_GAIN)).toBeLessThan(0.03);
    const speeds = [-0.4, -0.14, -0.06, 0.08, 0.12, 0.22, 0.4];
    const effective = speeds.map(effectiveParallax);
    effective.forEach((value, i) => {
      const speed = speeds[i] ?? 0;
      expect(Math.sign(value)).toBe(Math.sign(speed));
      expect(Math.abs(value)).toBeGreaterThan(Math.abs(speed));
      const next = effective[i + 1];
      if (next !== undefined) expect(next).toBeGreaterThan(value);
    });
    expect(effectiveParallax(0)).toBe(0);
  });

  it('moves a layer further than before the gain, still within the maximum', () => {
    // 200 px below the centre, speed 0.2: 40 px before the gain, 64 px with it.
    expect(Math.abs(parallaxOffset(650, 450, effectiveParallax(0.2), max))).toBeCloseTo(64);
    expect(Math.abs(parallaxOffset(650, 450, effectiveParallax(0.2), max))).toBeGreaterThan(
      Math.abs(parallaxOffset(650, 450, 0.2, max)),
    );
    // The strongest speed at the edge of a tall page still stops at the maximum.
    expect(parallaxOffset(10_000, 450, effectiveParallax(PARALLAX_LIMIT), max)).toBe(-max);
    // Lag and lead keep their sense with the gain.
    const moved = (speed: number): number =>
      Math.abs(
        650 -
          120 +
          parallaxOffset(650 - 120, 450, effectiveParallax(speed), max) -
          (650 - 100 + parallaxOffset(650 - 100, 450, effectiveParallax(speed), max)),
      );
    expect(moved(0.25)).toBeLessThan(20);
    expect(moved(-0.25)).toBeGreaterThan(20);
  });

  it('never moves an element more than the maximum from its layout position', () => {
    [-0.4, -0.1, 0.1, 0.4].forEach((speed) => {
      [-10_000, -900, 0, 450, 900, 10_000].forEach((centre) => {
        expect(Math.abs(parallaxOffset(centre, 450, speed, max))).toBeLessThanOrEqual(max);
      });
    });
    expect(parallaxOffset(10_000, 450, 0.4, max)).toBe(-max);
    expect(parallaxOffset(-10_000, 450, 0.4, max)).toBe(max);
  });
});

describe('motion profile (phones and touch screens)', () => {
  const desktop = motionProfile(false, true);
  const phone = motionProfile(true, false);
  const tablet = motionProfile(false, false);

  it('keeps the desktop tuning unchanged', () => {
    expect(desktop).toEqual({
      quickPrint: false,
      halftoneMargin: '0px 0px -8% 0px',
      halftoneMs: HALFTONE_MS,
      parallaxScale: 1,
      depthTo: 0.65,
      registrationTo: 0.6,
    });
  });

  it('prints photos quickly on phones and touch screens, starting before they enter', () => {
    [phone, tablet, motionProfile(true, true)].forEach((profile) => {
      expect(profile.quickPrint).toBe(true);
      expect(profile.halftoneMs).toBe(HALFTONE_QUICK_MS);
      // A positive bottom margin: the print starts before the element reaches the viewport.
      const bottom = profile.halftoneMargin.split(' ')[2] ?? '';
      expect(bottom.startsWith('-')).toBe(false);
      expect(Number.parseFloat(bottom)).toBeGreaterThan(0);
    });
    // The quick print (motion.css: 80 ms delay + 460 ms) ends well before its safety timeout,
    // and the timeout is far shorter than the desktop one.
    expect(HALFTONE_QUICK_MS).toBeGreaterThan(80 + 460);
    expect(HALFTONE_QUICK_MS).toBeLessThan(HALFTONE_MS);
    expect(HALFTONE_MS).toBeGreaterThan(250 + 1100);
  });

  it('settles the scrubs sooner and halves parallax on phones only', () => {
    expect(phone.parallaxScale).toBe(0.5);
    expect(phone.depthTo).toBeGreaterThan(desktop.depthTo);
    expect(phone.depthTo).toBeLessThan(1);
    expect(phone.registrationTo).toBeGreaterThan(desktop.registrationTo);
    expect(phone.registrationTo).toBeLessThan(0.95);
    // A touch tablet keeps the desktop scroll tuning; only the print-in is quicker.
    expect(tablet.parallaxScale).toBe(1);
    expect(tablet.depthTo).toBe(desktop.depthTo);
    expect(tablet.registrationTo).toBe(desktop.registrationTo);
  });

  it('still gives every staggered depth scrub a forward range on phones', () => {
    // setupScrubs staggers siblings by 0.03 per index (index capped at 4).
    [0, 1, 2, 3, 4].forEach((index) => {
      const [start, end] = scrubRange(
        2000,
        800,
        1 - index * 0.03,
        phone.depthTo - index * 0.03,
        10_000,
      );
      expect(end).toBeGreaterThan(start);
    });
  });

  it('never moves a phone parallax layer further than half the desktop maximum', () => {
    const vh = 844;
    const max = vh * PARALLAX_MAX * phone.parallaxScale;
    [-0.4, -0.12, 0.1, 0.24, 0.4].forEach((speed) => {
      [-5000, 0, 422, 900, 5000].forEach((centre) => {
        const offset = parallaxOffset(
          centre,
          vh / 2,
          effectiveParallax(speed) * phone.parallaxScale,
          max,
        );
        expect(Math.abs(offset)).toBeLessThanOrEqual((vh * PARALLAX_MAX) / 2 + 1e-9);
      });
    });
  });
});

describe('ink ripple', () => {
  it('reaches every corner of the button from wherever it starts', () => {
    const [w, h] = [220, 48];
    [
      [0, 0],
      [110, 24],
      [219, 47],
      [30, 40],
    ].forEach(([x = 0, y = 0]) => {
      const r = rippleDiameter(x, y, w, h) / 2;
      [
        [0, 0],
        [w, 0],
        [0, h],
        [w, h],
      ].forEach(([cx = 0, cy = 0]) => {
        expect(Math.hypot(cx - x, cy - y)).toBeLessThanOrEqual(r + 1e-9);
      });
    });
  });

  it('is just large enough: from the centre it spans the diagonal', () => {
    expect(rippleDiameter(110, 24, 220, 48)).toBeCloseTo(Math.hypot(220, 48));
  });
});

describe('halftone field helpers', () => {
  it('averages the alpha of each supersampled cell', () => {
    // 2 × 1 cells, 2 × 2 samples each: the left cell fully inked, the right one half.
    const cols = 2;
    const ss = 2;
    const rgba = new Uint8ClampedArray(cols * ss * ss * 4);
    const setAlpha = (px: number, py: number, a: number): void => {
      rgba[(py * cols * ss + px) * 4 + 3] = a;
    };
    [0, 1].forEach((py) => {
      setAlpha(0, py, 255);
      setAlpha(1, py, 255);
      setAlpha(2, py, 255);
    });
    const cover = blockCoverage(rgba, cols, 1, ss);
    expect(cover[0]).toBeCloseTo(1);
    expect(cover[1]).toBeCloseTo(0.5);
  });

  it('prints every dot by the end of the print-in, later dots later', () => {
    expect(printAmount(0, 0)).toBe(0);
    expect(printAmount(1, 0)).toBe(1);
    expect(printAmount(1, 1)).toBe(1);
    expect(printAmount(0.4, 0)).toBeGreaterThan(printAmount(0.4, 1));
  });

  it('eases with smoothstep', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    expect(smoothstep(0, 1, 2)).toBe(1);
  });

  it('swells most at the pointer and not at all outside the radius', () => {
    expect(swellFalloff(0, 100)).toBe(1);
    expect(swellFalloff(50, 100)).toBeCloseTo(0.25);
    expect(swellFalloff(100, 100)).toBe(0);
    expect(swellFalloff(400, 100)).toBe(0);
  });

  it('peaks on the ripple ring', () => {
    expect(rippleBand(120, 120, 60)).toBe(1);
    expect(rippleBand(240, 120, 60)).toBeLessThan(0.05);
  });

  it('targets the print-in from the section position', () => {
    expect(scrollPrint(900, 500, 900)).toBe(0);
    expect(scrollPrint(630, 500, 900)).toBeCloseTo(0.5);
    // Fully on screen: printed.
    expect(scrollPrint(300, 500, 900)).toBe(1);
  });

  it('places the arches at the bottom right, bleeding slightly off the edges', () => {
    const wide = archBox(1440, 600);
    expect(wide.w).toBeCloseTo(1440 * 0.74);
    expect(wide.h / wide.w).toBeCloseTo(205 / 840);
    expect(wide.x + wide.w).toBeGreaterThan(1440);
    expect(wide.y + wide.h).toBeGreaterThan(600);
    expect(wide.x).toBeGreaterThan(0);

    const phone = archBox(390, 420);
    expect(phone.w).toBeGreaterThan(390);
    expect(phone.x + phone.w).toBeGreaterThan(390);
  });
});
