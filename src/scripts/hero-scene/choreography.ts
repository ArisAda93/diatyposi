/**
 * Choreography of the hero plates, "metamorphosis": pure functions with no DOM or WebGL access, so
 * the whole loop can be unit tested (tests/hero-scene.test.ts).
 *
 * The four arch plates (C, M, Y, K) run one seamless loop of PERIOD seconds through three poses,
 * each held briefly, then moved into the next:
 *  - mark    the plates in the logo's register, gently exploded in depth and breathing;
 *  - target  the arches turn about one common centre (C 90°, M 0°, Y 180°, K −90°) and close into a
 *            ring, the printer's registration target. Where neighbouring feet overlap the inks
 *            overprint. The ring turns slowly while two key hairlines draw through its centre and
 *            retract again (crosshairAt);
 *  - wave    the plates line up side by side, alternately upright and inverted, into one
 *            continuous ribbon of ink. A rolling ripple travels along it, like ink through the
 *            press rollers.
 * Every move interpolates position, rotation and scale per plate, staggered in print order
 * Y, M, C, K. The plates lift off the sheet during a move (depth separation peaks mid-move and
 * collapses at the holds). The move back into the mark ends in the registration snap: the plates
 * come in slightly out of register and snap into it with the small overshoot of `--ease-snap`.
 * Each plate turns back to where it started over one loop, so the loop has no seam.
 *
 * Space ("group space"): logo raster units, y up, origin at the centre of the mark's viewBox (the
 * scene's pivot and docking point). A plate's pose is the position of its anchor (the centre of
 * the arch's bounding box), its depth z, its turn rz about z and tip rx about x (radians), and its
 * scale. Every pose stays inside the ART box, which the hero lays out for it (Hero.astro).
 *
 * The visual tuning lives in the constants below, grouped by pose.
 */
import { boundsOf, type Bounds, type Point } from './geometry';
import { clamp, cubicBezier, easeInOutCubic, lerp, smoothstep } from './math';

export type PlateId = 'c' | 'm' | 'y' | 'k';
export type PoseName = 'mark' | 'target' | 'wave';

// ------------------------------------------------------------------------------------------------
// Tuning
// ------------------------------------------------------------------------------------------------

/**
 * The art box every pose must fit in, in raster units, centred on the group origin. Hero.astro
 * gives `.hero-art` this aspect ratio and sets the SVG mark (viewBox 840 wide) at 840/900 of its
 * width, so the plates' rest scale is the art box width / ART.width.
 */
export const ART = { width: 900, height: 620 } as const;

/** The loop: each pose is held, then moves into the next one (seconds). Period: the sum. */
export const TIMELINE = [
  { pose: 'mark', hold: 3.8, move: 2.4 },
  { pose: 'target', hold: 3.6, move: 2.4 },
  { pose: 'wave', hold: 3.2, move: 2.6 },
] as const satisfies readonly { pose: PoseName; hold: number; move: number }[];

/** Delay between the plates within a move, in print order Y, M, C, K (seconds). */
export const STAGGER = 0.16;

/** Every move: a slow start, a fast middle and a long, quiet settle. */
export const easeMove = cubicBezier(0.7, 0, 0.2, 1);
/** The registration snap, `--ease-snap` (small overshoot). */
export const easeSnap = cubicBezier(0.3, 1.5, 0.5, 1);

interface PlateTuning {
  /** 0–3 in print order Y, M, C, K. */
  print: number;
  /** Mark: depth layer (× MARK.separation), misregistration (raster units, radians), phase. */
  depth: number;
  dx: number;
  dy: number;
  rz: number;
  phase: number;
  /** Target: the arch's turn about the ring centre (0 = apex up, counter-clockwise). */
  ring: number;
  /** Wave: 0 upright, ±π inverted (the sign picks the direction it turns over). */
  wave: number;
  /** Registration snap: how far out of register the plate comes in before it snaps. */
  snap: { x: number; y: number; rz: number };
}

/**
 * Per plate. Turns are chosen so every move turns each plate by at most 180° and each plate ends
 * the loop at the turn it started with (mark 0 → ring → wave → mark 0).
 */
export const PLATES = {
  c: {
    print: 2,
    depth: 1.5,
    dx: -9,
    dy: 6,
    rz: 0.012,
    phase: 0,
    ring: Math.PI / 2,
    wave: 0,
    snap: { x: 28, y: 22, rz: -0.05 },
  },
  m: {
    print: 1,
    depth: 0.5,
    dx: 7,
    dy: -5,
    rz: -0.009,
    phase: 1.3,
    ring: 0,
    wave: Math.PI,
    snap: { x: -22, y: -18, rz: 0.04 },
  },
  y: {
    print: 0,
    depth: -0.5,
    dx: -5,
    dy: -8,
    rz: 0.006,
    phase: 2.6,
    ring: Math.PI,
    wave: 0,
    snap: { x: 24, y: -20, rz: 0.035 },
  },
  k: {
    print: 3,
    depth: -1.5,
    dx: 8,
    dy: 4,
    rz: -0.012,
    phase: 3.9,
    ring: -Math.PI / 2,
    wave: -Math.PI,
    snap: { x: -28, y: 16, rz: -0.04 },
  },
} as const satisfies Record<PlateId, PlateTuning>;

/** Mark: depth between neighbouring plates, breathing amplitudes, rest tilt of the stack. */
export const MARK = {
  separation: 85,
  breathe: { z: 0.1, y: 4, rz: 0.006 },
  /** The right end recedes, the top leans in (radians). */
  tilt: { x: 0.12, y: 0.36, z: -0.03 },
} as const;

/**
 * Target: plate scale, how far neighbouring feet overlap (raster units, before scale), depth
 * between plates, spin of the ring (radians per second, negative = clockwise), tilt and sway.
 */
export const RING = {
  scale: 0.66,
  overlap: 36,
  layer: 5,
  spin: -0.12,
  tilt: { x: 0.05, y: -0.1, z: 0 },
  sway: 0.05,
} as const;

/**
 * Wave: plate scale, foot overlap at the joins, depth between plates, and the travelling ripple:
 * its angular speed (rad/s), phase step between neighbours, roll (tip about x, radians), depth
 * and vertical amplitudes (raster units).
 */
export const WAVE = {
  scale: 0.5,
  overlap: 12,
  layer: 3,
  speed: 2.2,
  step: Math.PI / 2,
  roll: 0.2,
  depth: 14,
  bob: 3,
  tilt: { x: 0.2, y: 0.16, z: 0 },
} as const;

/** Lift off the sheet at the peak of a move: towards the camera, and spread by mark depth. */
export const LIFT = { forward: 40, spread: 56 } as const;

/** Registration snap: share of the move back into the mark spent coming in out of register. */
export const SNAP_AT = 0.62;

/**
 * Crosshair: half-length (× ring outer radius), delay after the target hold starts (and before
 * it ends), time to draw or retract one line, and the delay of the vertical line behind the
 * horizontal one (seconds).
 */
export const CROSSHAIR = { reach: 1.28, delay: 0.25, draw: 1.0, stagger: 0.18 } as const;

/** Scroll-out: blend to the mark by this docking progress, then collapse over this span. */
export const DOCK_BLEND = { toMark: 0.2, collapseFrom: 0.12, collapseTo: 0.78 } as const;

// ------------------------------------------------------------------------------------------------
// Types and layout
// ------------------------------------------------------------------------------------------------

export interface PlatePose {
  x: number;
  y: number;
  z: number;
  /** Tip about x, then turn about z (radians). */
  rx: number;
  rz: number;
  scale: number;
}

export interface Tilt {
  x: number;
  y: number;
  z: number;
}

/** The arch, measured from its outline in raster space (y down). */
export interface ArchMetrics {
  /** Centre of the bounding box: the plate's anchor. */
  anchor: Point;
  halfWidth: number;
  halfHeight: number;
  /** The two feet on the base line, x relative to the anchor, [outer, inner] / [inner, outer]. */
  leftFoot: readonly [number, number];
  rightFoot: readonly [number, number];
}

const at = <T>(list: readonly T[], i: number): T => {
  const value = list[i];
  if (value === undefined) throw new RangeError(`Index ${i} out of range`);
  return value;
};

export const archMetrics = (outline: readonly Point[]): ArchMetrics => {
  const b = boundsOf(outline);
  const anchor = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  const base = outline
    .filter((p) => Math.abs(p.y - b.maxY) < 1e-6)
    .map((p) => p.x - anchor.x)
    .sort((p, q) => p - q);
  if (base.length !== 4) throw new Error('Arch outline: expected four foot corners on its base');
  return {
    anchor,
    halfWidth: (b.maxX - b.minX) / 2,
    halfHeight: (b.maxY - b.minY) / 2,
    leftFoot: [at(base, 0), at(base, 1)],
    rightFoot: [at(base, 2), at(base, 3)],
  };
};

export interface PlateLayout {
  id: PlateId;
  print: number;
  /** Anchor in the logo, in register. */
  markX: number;
  markY: number;
  ringAngle: number;
  /** Wave anchor (before WAVE.scale), turn, and place in the ribbon from the left. */
  waveX: number;
  waveY: number;
  waveTurn: number;
  waveIndex: number;
}

export interface Layout {
  metrics: ArchMetrics;
  /** In the logo's order, left to right. */
  plates: readonly PlateLayout[];
  /** Distance of the ring plates' anchors from the centre (before RING.scale). */
  ringRadius: number;
  /** Crosshair half-length in group units. */
  crossReach: number;
}

const isInverted = (turn: number): boolean => Math.abs(Math.cos(turn) + 1) < 1e-9;

/**
 * Builds the three layouts from the arch's measurements and the logo's plate offsets (raster x)
 * around `center` (raster point of the group origin).
 *
 * Ring: an apex-up arch whose anchor sits `d` above the centre has its outer right foot corner at
 * (halfWidth, d − halfHeight); its neighbour turned −90° has its outer left foot corner at
 * (d − halfHeight, halfWidth). They meet on the diagonal when d = halfWidth + halfHeight;
 * RING.overlap pulls all four in so the feet overprint.
 *
 * Wave: an inverted arch's feet sit on the same base line as its upright neighbour's when its
 * anchor is 2 × halfHeight lower. Upright → inverted joins the two right (thin) legs, inverted →
 * upright the two left (thick) legs, so the spacing alternates; WAVE.overlap pulls each join in.
 */
export const buildLayout = (
  metrics: ArchMetrics,
  logoPlates: readonly { id: PlateId; x: number }[],
  center: Point,
): Layout => {
  const { anchor, halfWidth, halfHeight, leftFoot, rightFoot } = metrics;
  const ordered = [...logoPlates].sort((a, b) => a.x - b.x);

  const waveX: number[] = [];
  ordered.forEach((plate, i) => {
    if (i === 0) {
      waveX.push(0);
      return;
    }
    const before = at(ordered, i - 1);
    const fromInverted = isInverted(PLATES[before.id].wave);
    if (fromInverted === isInverted(PLATES[plate.id].wave)) {
      throw new Error('Wave: neighbouring plates must alternate upright and inverted');
    }
    const spacing = fromInverted
      ? -(leftFoot[0] + leftFoot[1]) - WAVE.overlap
      : rightFoot[0] + rightFoot[1] - WAVE.overlap;
    waveX.push(at(waveX, i - 1) + spacing);
  });
  const waveMid = (at(waveX, 0) + at(waveX, waveX.length - 1)) / 2;

  const plates = ordered.map((plate, i): PlateLayout => {
    const tuning = PLATES[plate.id];
    return {
      id: plate.id,
      print: tuning.print,
      markX: anchor.x + plate.x - center.x,
      markY: center.y - anchor.y,
      ringAngle: tuning.ring,
      waveX: at(waveX, i) - waveMid,
      waveY: isInverted(tuning.wave) ? -halfHeight : halfHeight,
      waveTurn: tuning.wave,
      waveIndex: i,
    };
  });

  const ringRadius = halfWidth + halfHeight - RING.overlap;
  return {
    metrics,
    plates,
    ringRadius,
    crossReach: (ringRadius + halfHeight) * RING.scale * CROSSHAIR.reach,
  };
};

// ------------------------------------------------------------------------------------------------
// Timeline
// ------------------------------------------------------------------------------------------------

export interface Segment {
  pose: PoseName;
  next: PoseName;
  holdStart: number;
  moveStart: number;
  end: number;
}

export const SEGMENTS: readonly Segment[] = (() => {
  let t = 0;
  return TIMELINE.map((entry, i) => {
    const segment = {
      pose: entry.pose,
      next: at(TIMELINE, (i + 1) % TIMELINE.length).pose,
      holdStart: t,
      moveStart: t + entry.hold,
      end: t + entry.hold + entry.move,
    };
    t = segment.end;
    return segment;
  });
})();

export const PERIOD = at(SEGMENTS, SEGMENTS.length - 1).end;

/** Base angular frequency: the mark's breathing uses whole multiples, so the loop has no seam. */
const BEAT = (Math.PI * 2) / PERIOD;

const segmentOf = (pose: PoseName): Segment => {
  const segment = SEGMENTS.find((s) => s.pose === pose);
  if (!segment) throw new Error(`No segment for pose ${pose}`);
  return segment;
};

const TARGET = segmentOf('target');
/** The ring is at its canonical angles (apexes on the crosshair) in the middle of its hold. */
const TARGET_MID = (TARGET.holdStart + TARGET.moveStart) / 2;

/** Loop time in [0, PERIOD). */
export const loopTime = (t: number): number => t - PERIOD * Math.floor(t / PERIOD);

export const segmentAt = (t: number): Segment => {
  const lt = loopTime(t);
  return SEGMENTS.find((s) => lt < s.end) ?? at(SEGMENTS, SEGMENTS.length - 1);
};

/**
 * Progress of one plate through the move of `segment` at loop time lt, 0–1. Plates leave and
 * arrive STAGGER apart in print order; the last one arrives exactly at the segment's end.
 */
export const moveProgress = (lt: number, segment: Segment, print: number): number => {
  const span = segment.end - segment.moveStart - STAGGER * 3;
  return clamp((lt - segment.moveStart - print * STAGGER) / span);
};

// ------------------------------------------------------------------------------------------------
// Poses
// ------------------------------------------------------------------------------------------------

export const blendPose = (a: PlatePose, b: PlatePose, w: number): PlatePose => ({
  x: lerp(a.x, b.x, w),
  y: lerp(a.y, b.y, w),
  z: lerp(a.z, b.z, w),
  rx: lerp(a.rx, b.rx, w),
  rz: lerp(a.rz, b.rz, w),
  scale: lerp(a.scale, b.scale, w),
});

export const blendTilt = (a: Tilt, b: Tilt, w: number): Tilt => ({
  x: lerp(a.x, b.x, w),
  y: lerp(a.y, b.y, w),
  z: lerp(a.z, b.z, w),
});

/** Flat and exactly in register: where the plates start (hand-over from the SVG) and dock. */
export const registerPose = (plate: PlateLayout): PlatePose => ({
  x: plate.markX,
  y: plate.markY,
  z: 0,
  rx: 0,
  rz: 0,
  scale: 1,
});

export const markPose = (plate: PlateLayout, t: number): PlatePose => {
  const p = PLATES[plate.id];
  const { breathe } = MARK;
  return {
    x: plate.markX + p.dx,
    y: plate.markY + p.dy + Math.sin(BEAT * 2 * t + p.phase) * breathe.y,
    z: (p.depth + Math.sin(BEAT * 3 * t + p.phase) * breathe.z) * MARK.separation,
    rx: 0,
    rz: p.rz + Math.sin(BEAT * 2 * t + p.phase * 1.7) * breathe.rz,
    scale: 1,
  };
};

/** Turn of the whole ring at loop time t (0 in the middle of the target hold). */
export const ringSpin = (t: number): number => RING.spin * (t - TARGET_MID);

export const targetPose = (plate: PlateLayout, t: number, layout: Layout): PlatePose => {
  const angle = plate.ringAngle + ringSpin(t);
  const r = layout.ringRadius * RING.scale;
  const p = PLATES[plate.id];
  return {
    x: -Math.sin(angle) * r,
    y: Math.cos(angle) * r,
    z: (p.print - 1.5) * RING.layer + Math.sin(BEAT * 3 * t + p.phase) * RING.layer * 0.5,
    rx: 0,
    rz: angle,
    scale: RING.scale,
  };
};

export const wavePose = (plate: PlateLayout, t: number): PlatePose => {
  const phase = WAVE.speed * t - plate.waveIndex * WAVE.step;
  const p = PLATES[plate.id];
  return {
    x: plate.waveX * WAVE.scale,
    y: plate.waveY * WAVE.scale + Math.sin(phase) * WAVE.bob,
    z: (p.print - 1.5) * WAVE.layer + Math.cos(phase) * WAVE.depth,
    rx: Math.sin(phase) * WAVE.roll,
    rz: plate.waveTurn,
    scale: WAVE.scale,
  };
};

const poseOf = (name: PoseName, plate: PlateLayout, t: number, layout: Layout): PlatePose => {
  switch (name) {
    case 'mark':
      return markPose(plate, t);
    case 'target':
      return targetPose(plate, t, layout);
    case 'wave':
      return wavePose(plate, t);
  }
};

/** A plate's pose at time t (seconds, any value: the loop repeats every PERIOD). */
export const platePoseAt = (t: number, plate: PlateLayout, layout: Layout): PlatePose => {
  const lt = loopTime(t);
  const segment = segmentAt(lt);
  const from = poseOf(segment.pose, plate, lt, layout);
  if (lt < segment.moveStart) return from;

  const u = moveProgress(lt, segment, plate.print);
  const pose = blendPose(from, poseOf(segment.next, plate, lt, layout), easeMove(u));

  // Lift off the sheet: zero (and still) at both ends of the move, highest mid-move.
  const lift = Math.sin(Math.PI * u) ** 2;
  pose.z += lift * (LIFT.forward + LIFT.spread * PLATES[plate.id].depth);

  if (segment.next === 'mark') {
    // Registration snap: drift out of register on the way in, then snap into it (overshoot).
    const off =
      u < SNAP_AT ? smoothstep(0, SNAP_AT, u) : 1 - easeSnap((u - SNAP_AT) / (1 - SNAP_AT));
    const { snap } = PLATES[plate.id];
    pose.x += snap.x * off;
    pose.y += snap.y * off;
    pose.rz += snap.rz * off;
  }
  return pose;
};

const tiltOf = (name: PoseName, t: number): Tilt => {
  switch (name) {
    case 'mark':
      return MARK.tilt;
    case 'target':
      return {
        x: RING.tilt.x,
        y: RING.tilt.y + Math.sin((t - TARGET_MID) * 0.7) * RING.sway,
        z: RING.tilt.z,
      };
    case 'wave':
      return WAVE.tilt;
  }
};

/** Rotation of the whole group at time t; moves blend it without the per-plate stagger. */
export const tiltAt = (t: number): Tilt => {
  const lt = loopTime(t);
  const segment = segmentAt(lt);
  const from = tiltOf(segment.pose, lt);
  if (lt < segment.moveStart) return from;
  const w = easeMove((lt - segment.moveStart) / (segment.end - segment.moveStart));
  return blendTilt(from, tiltOf(segment.next, lt), w);
};

/** The mark's group tilt: the docking blend targets it. */
export const markTilt = (): Tilt => MARK.tilt;

export interface Span {
  /** Ends of the drawn part of a crosshair line, −1 to 1 along it (× Layout.crossReach). */
  from: number;
  to: number;
}

/**
 * The two key hairlines of the target. Each draws through the centre (its head travels from −1
 * to 1: the horizontal line left to right, the vertical one top to bottom) and later retracts the
 * same way (its tail follows). Outside the target hold both are empty (from === to).
 */
export const crosshairAt = (t: number): { horizontal: Span; vertical: Span } => {
  const lt = loopTime(t);
  const line = (delay: number): Span => {
    const drawStart = TARGET.holdStart + CROSSHAIR.delay + delay;
    const retractStart =
      TARGET.moveStart - CROSSHAIR.delay - CROSSHAIR.stagger - CROSSHAIR.draw + delay;
    return {
      from: -1 + 2 * easeMove((lt - retractStart) / CROSSHAIR.draw),
      to: -1 + 2 * easeMove((lt - drawStart) / CROSSHAIR.draw),
    };
  };
  return { horizontal: line(0), vertical: line(CROSSHAIR.stagger) };
};

/**
 * Scroll-out before docking (progress 0–1, math.ts dockProgress): the plates first blend to the
 * mark pose (`toMark`; the loop clock also slows to a stop with it), then collapse into register
 * (`collapse`). Scrolling back runs it in reverse.
 */
export const dockBlend = (progress: number): { toMark: number; collapse: number } => ({
  toMark: smoothstep(0, DOCK_BLEND.toMark, progress),
  collapse: easeInOutCubic(
    (progress - DOCK_BLEND.collapseFrom) / (DOCK_BLEND.collapseTo - DOCK_BLEND.collapseFrom),
  ),
});

/**
 * 2D bounds (group space) of the plates in their poses, from the arch outline in plate space
 * (anchor-centred, y up). The tip about x only shortens the outline on screen, so it is ignored.
 */
export const poseBounds = (poses: readonly PlatePose[], outline: readonly Point[]): Bounds => {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const pose of poses) {
    const cos = Math.cos(pose.rz) * pose.scale;
    const sin = Math.sin(pose.rz) * pose.scale;
    for (const p of outline) {
      const x = pose.x + p.x * cos - p.y * sin;
      const y = pose.y + p.x * sin + p.y * cos;
      b.minX = Math.min(b.minX, x);
      b.minY = Math.min(b.minY, y);
      b.maxX = Math.max(b.maxX, x);
      b.maxY = Math.max(b.maxY, y);
    }
  }
  return b;
};
