import { describe, expect, it } from 'vitest';
import {
  SWIPE,
  closeProgress,
  lockAxis,
  releaseVelocity,
  rubberBand,
  swipeIntent,
  type SwipeInput,
} from '../src/scripts/gallery';

/** A portrait phone stage: 358 px wide, 560 px tall. */
const stage = { width: 358, height: 560 };
const drag = (input: Partial<SwipeInput>): SwipeInput => ({
  dx: 0,
  dy: 0,
  vx: 0,
  vy: 0,
  ...stage,
  ...input,
});

describe('lockAxis (drag or tap)', () => {
  it('stays unlocked inside the slop, so a tap is still a tap', () => {
    expect(lockAxis(0, 0)).toBeNull();
    expect(lockAxis(6, 6)).toBeNull();
  });
  it('locks to the axis with the longer travel once past the slop', () => {
    expect(lockAxis(-14, 3)).toBe('x');
    expect(lockAxis(2, 15)).toBe('y');
    expect(lockAxis(0, -12)).toBe('y');
  });
  it('prefers sideways on a perfect diagonal', () => {
    expect(lockAxis(10, 10)).toBe('x');
  });
});

describe('releaseVelocity', () => {
  it('is zero without at least two samples in time', () => {
    expect(releaseVelocity([])).toEqual({ vx: 0, vy: 0 });
    expect(releaseVelocity([{ x: 5, y: 5, t: 10 }])).toEqual({ vx: 0, vy: 0 });
  });
  it('measures px/ms over the newest samples in the window', () => {
    const samples = [
      { x: 0, y: 0, t: 0 },
      { x: 100, y: 0, t: 300 },
      { x: 140, y: 10, t: 340 },
      { x: 180, y: 20, t: 380 },
    ];
    // The window (100 ms) reaches back to t = 300: 80 px across, 20 px down in 80 ms.
    const { vx, vy } = releaseVelocity(samples);
    expect(vx).toBeCloseTo(1);
    expect(vy).toBeCloseTo(0.25);
  });
  it('is zero when the finger rested before lifting', () => {
    const samples = [
      { x: 0, y: 0, t: 0 },
      { x: 120, y: 0, t: 50 },
      { x: 120, y: 0, t: 400 },
    ];
    expect(releaseVelocity(samples)).toEqual({ vx: 0, vy: 0 });
  });
});

describe('swipeIntent', () => {
  it('turns to the next picture on a slow drag left past the threshold, previous on a drag right', () => {
    // 22 % of 358 px is about 79 px.
    expect(swipeIntent(drag({ dx: -90 }))).toBe('next');
    expect(swipeIntent(drag({ dx: 90 }))).toBe('prev');
  });
  it('springs back from a short slow drag', () => {
    expect(swipeIntent(drag({ dx: -60, vx: -0.1 }))).toBe('none');
    expect(swipeIntent(drag({ dx: 40 }))).toBe('none');
  });
  it('turns on a short quick flick in the direction of the drag', () => {
    expect(swipeIntent(drag({ dx: -30, vx: -0.6 }))).toBe('next');
    expect(swipeIntent(drag({ dx: 30, vx: 0.6 }))).toBe('prev');
  });
  it('ignores a flick that travelled less than the flick minimum (tap jitter)', () => {
    expect(swipeIntent(drag({ dx: -(SWIPE.flickMin - 4), vx: -1.2 }))).toBe('none');
  });
  it('cancels when the finger flicks back against a long drag', () => {
    expect(swipeIntent(drag({ dx: -150, vx: 0.5 }))).toBe('none');
    expect(swipeIntent(drag({ dx: 150, vx: -0.5 }))).toBe('none');
  });
  it('bounds the distance threshold on very narrow and very wide stages', () => {
    // 22 % of 200 px is 44 px, raised to the 56 px minimum.
    expect(swipeIntent(drag({ dx: -50, width: 200 }))).toBe('none');
    expect(swipeIntent(drag({ dx: -60, width: 200 }))).toBe('next');
    // 22 % of 1600 px is 352 px, capped at 160 px.
    expect(swipeIntent(drag({ dx: -170, width: 1600 }))).toBe('next');
  });
  it('closes on a drag down past the threshold or a quick flick down', () => {
    // 15 % of 560 px is 84 px.
    expect(swipeIntent(drag({ dy: 100 }))).toBe('close');
    expect(swipeIntent(drag({ dy: 50, vy: 0.6 }))).toBe('close');
  });
  it('does not close on a short slow drag down, a drag up, or a flick back up', () => {
    expect(swipeIntent(drag({ dy: 60, vy: 0.1 }))).toBe('none');
    expect(swipeIntent(drag({ dy: -200, vy: -1 }))).toBe('none');
    expect(swipeIntent(drag({ dy: 150, vy: -0.6 }))).toBe('none');
    expect(swipeIntent(drag({ dy: 30, vy: 0.9 }))).toBe('none');
  });
  it('follows the locked axis over the final travel', () => {
    // Locked sideways, then the finger drifted down: still a sideways turn, never a close.
    expect(swipeIntent(drag({ dx: -100, dy: 140, axis: 'x' }))).toBe('next');
    // Locked down, with some sideways drift: closes, never turns.
    expect(swipeIntent(drag({ dx: 120, dy: 100, axis: 'y' }))).toBe('close');
  });
  it('lets the longer travel decide without a locked axis', () => {
    expect(swipeIntent(drag({ dx: -100, dy: 20 }))).toBe('next');
    expect(swipeIntent(drag({ dx: 10, dy: 120 }))).toBe('close');
  });
});

describe('rubberBand (resisted drag)', () => {
  it('does not move without an offset or a size', () => {
    expect(rubberBand(0, 400)).toBe(0);
    expect(rubberBand(50, 0)).toBe(0);
  });
  it('gives a little over half the offset at first and keeps its direction', () => {
    expect(rubberBand(10, 400)).toBeCloseTo(5.43, 1);
    expect(rubberBand(-10, 400)).toBeCloseTo(-5.43, 1);
  });
  it('grows ever slower and never reaches the size', () => {
    const near = rubberBand(100, 400);
    const far = rubberBand(200, 400);
    const huge = rubberBand(100_000, 400);
    expect(far).toBeGreaterThan(near);
    expect(far - near).toBeLessThan(near);
    expect(huge).toBeLessThan(400);
  });
});

describe('closeProgress (fade while dragging down)', () => {
  it('runs from 0 at rest to 1 at half the stage height', () => {
    expect(closeProgress(0, 560)).toBe(0);
    expect(closeProgress(140, 560)).toBeCloseTo(0.5);
    expect(closeProgress(280, 560)).toBe(1);
  });
  it('stays within 0–1 and is 0 for a drag up or no stage', () => {
    expect(closeProgress(900, 560)).toBe(1);
    expect(closeProgress(-40, 560)).toBe(0);
    expect(closeProgress(40, 0)).toBe(0);
  });
});
