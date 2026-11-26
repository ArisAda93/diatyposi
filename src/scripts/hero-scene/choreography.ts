/**
 * Choreography of the hero plates, "registration in depth": pure functions with no DOM or WebGL
 * access, so the whole loop can be unit tested (tests/hero-scene.test.ts).
 *
 * The four arch plates (C, M, Y, K) hang at different depths in open space: C nearest the viewer,
 * then M and Y, K furthest back. From one viewpoint only, perspective lines them up exactly into
 * the logo. The camera (the scene turns the group about the mark's centre instead, which looks the
 * same) moves away from that viewpoint so the plates come apart in parallax, then glides back to
 * it and they click into register. Registration happens through perspective alone: the plates
 * never move sideways. A seamless loop of PERIOD seconds, in beats:
 *  - hold      t = 0 is the click: seen straight on, the plates read as the logo. They breathe
 *              slowly in depth, which the alignment to the camera hides;
 *  - depart    the camera eases away, turning to one side and tipping down;
 *  - orbit     it swings slowly up over the mark, mostly in pitch, staying on that side, the
 *              plates sliding past one another as it goes;
 *  - approach  it glides back and passes the straight-on view by a little: the click;
 *  - settle    it comes back to rest straight on, exactly as the loop closes.
 * The orbit swings mostly in pitch because there is far more room above and below the mark than
 * beside it, and it stays on one side in yaw so it never passes the straight-on view on the way
 * round: the plates line up only at the click. The view's path is made of cubic Hermite segments
 * whose velocities match at every join, so it never jerks. At the ends of the orbit the pitch is
 * already moving on as it turns, so the camera traces a loop and only comes to rest at the click.
 * The effects tied to the loop (the sheen after the click, the ink dust drawn into the plates
 * around it, and how close the plates are to register) are given here too (effectsAt); the scene
 * draws them.
 *
 * Space ("group space"): logo raster units, y up, origin at the centre of the mark's viewBox (the
 * scene's pivot), z towards the camera. A plate's pose is the position of its anchor (the centre
 * of the arch's bounding box), its depth z (the centre of the plate, which is extruded ±17 around
 * it), its turn rz about z and tip rx about x (radians), and its scale. The loop puts each plate
 * in register at its depth; alignToView then slides it along the camera's line of sight and
 * scales it, so that seen straight on it covers its place in the logo exactly. The view (viewAt)
 * is the group's rotation: pitch about x, yaw about y. Every plate must stay inside the ART box as
 * seen on screen, which the hero lays out for it (Hero.astro).
 *
 * The visual tuning lives in the constants below.
 */
import { boundsOf, type Bounds, type Point } from './geometry';
import { clamp, cubicBezier, easeInOutCubic, lerp, smoothstep } from './math';

export type PlateId = 'c' | 'm' | 'y' | 'k';
export type BeatName = 'hold' | 'depart' | 'orbit' | 'approach' | 'settle';

// ------------------------------------------------------------------------------------------------
// Tuning
// ------------------------------------------------------------------------------------------------

/**
 * The art box every pose must fit in, in raster units, centred on the group origin. Hero.astro
 * gives `.hero-art` this aspect ratio and sets the SVG mark (viewBox 840 wide) at 840/900 of its
 * width, so the plates' rest scale is the art box width / ART.width.
 */
export const ART = { width: 900, height: 620 } as const;

/** Length of the loop (seconds). */
export const PERIOD = 14;

/**
 * The beats of the loop, back to back from 0 to PERIOD (seconds). t = 0 is the click: the view is
 * straight on and the plates are in register.
 */
export const BEATS: readonly { name: BeatName; start: number; end: number }[] = [
  { name: 'hold', start: 0, end: 3 },
  { name: 'depart', start: 3, end: 5.5 },
  { name: 'orbit', start: 5.5, end: 10.5 },
  { name: 'approach', start: 10.5, end: 13.2 },
  { name: 'settle', start: 13.2, end: PERIOD },
];

/** A glide: a slow start, a fast middle and a long, quiet settle. */
export const easeMove = cubicBezier(0.7, 0, 0.2, 1);
/** The registration snap, `--ease-snap` (small overshoot). */
export const easeSnap = cubicBezier(0.3, 1.5, 0.5, 1);

interface PlateTuning {
  /** 0–3 in print order Y, M, C, K. */
  print: number;
  /** Depth of the plate's centre (raster units, + towards the camera). */
  depth: number;
  /** Phase of the plate's breathing and drift (radians). */
  phase: number;
}

/**
 * Per plate. The depths step evenly back from C, nearest, to K, furthest: equal steps make the
 * plates slide past one another at an even pace as the camera moves.
 */
export const PLATES = {
  c: { print: 2, depth: 300, phase: 0 },
  m: { print: 1, depth: 100, phase: 1.3 },
  y: { print: 0, depth: -100, phase: 2.6 },
  k: { print: 3, depth: -300, phase: 3.9 },
} as const satisfies Record<PlateId, PlateTuning>;

/** Breathing of each plate in depth, at any time (raster units). */
const BREATHE = { depth: 14 } as const;

/** The plates' slow turn about z while the camera is away, at its strongest (radians). */
const DRIFT = { rz: 0.025 } as const;

/**
 * The camera's reach (radians): the view at the start and the end of the orbit, and how far past
 * straight on the approach carries it, as a share of the orbit's end, on the other side. The
 * orbit swings from below the mark to above it and keeps a positive yaw throughout, which slides
 * the near plates over the far ones; a negative yaw would fan them out sideways, and the logo
 * leaves only about 40 raster units beside it in the art box.
 */
export const VIEW = {
  orbitStart: { yaw: 0.34, pitch: -0.22 },
  orbitEnd: { yaw: 0.16, pitch: 0.24 },
  overshoot: 0.07,
} as const;

/**
 * The effects tied to the loop (seconds of loop time): the sheen crosses the mark just after the
 * click; the ink dust gathers into the plates over the approach and the settle and is released
 * after the click; `align` is the view's angle (radians) beyond which the plates count as fully
 * out of register.
 */
const EFFECTS = {
  sheen: { from: 0.1, to: 1.5 },
  absorb: { gather: { from: 12.2, to: PERIOD }, release: { from: 0.3, to: 2.5 } },
  align: 0.12,
} as const;

/**
 * Scroll-out hand-off (progress 0–1, see handoff): blend to the hold pose and the rest view by
 * `toMark`, collapse into register from `collapseFrom` to `collapseTo`, shrink by `shrink` from
 * `shrinkFrom`, and fade out from `fadeFrom` while the header logo's arches pulse
 * (registrationPulse).
 */
export const HANDOFF = {
  toMark: 0.25,
  collapseFrom: 0.15,
  collapseTo: 0.65,
  shrinkFrom: 0.35,
  shrink: 0.12,
  fadeFrom: 0.5,
} as const;

/** Header logo pulse: the dock progress at which its arches are furthest out of register. */
export const PULSE_PEAK = 0.55;

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
  /** 0–3 in print order Y, M, C, K. */
  print: number;
  /** Anchor in the logo, in register. */
  markX: number;
  markY: number;
}

export interface Layout {
  metrics: ArchMetrics;
  /** In the logo's order, left to right. */
  plates: readonly PlateLayout[];
}

/**
 * Places the plates in register from the arch's measurements and the logo's plate offsets
 * (raster x) around `center` (raster point of the group origin).
 */
export const buildLayout = (
  metrics: ArchMetrics,
  logoPlates: readonly { id: PlateId; x: number }[],
  center: Point,
): Layout => {
  const { anchor } = metrics;
  const plates = [...logoPlates]
    .sort((a, b) => a.x - b.x)
    .map((plate): PlateLayout => ({
      id: plate.id,
      print: PLATES[plate.id].print,
      markX: anchor.x + plate.x - center.x,
      markY: center.y - anchor.y,
    }));
  return { metrics, plates };
};

// ------------------------------------------------------------------------------------------------
// Timeline
// ------------------------------------------------------------------------------------------------

/** Base angular frequency: the breathing and the drift use whole multiples, so they loop. */
const BEAT = (Math.PI * 2) / PERIOD;

interface Span {
  start: number;
  end: number;
}

const beatOf = (name: BeatName): Span => {
  const beat = BEATS.find((b) => b.name === name);
  if (!beat) throw new Error(`No beat ${name}`);
  return beat;
};

const DEPART = beatOf('depart');
const ORBIT = beatOf('orbit');
const APPROACH = beatOf('approach');
const SETTLE = beatOf('settle');

/** Loop time in [0, PERIOD). */
export const loopTime = (t: number): number => t - PERIOD * Math.floor(t / PERIOD);

/** The beat the loop is in at time t (seconds, any value). */
export const beatAt = (t: number): BeatName => {
  const lt = loopTime(t);
  return (BEATS.find((b) => lt < b.end) ?? at(BEATS, BEATS.length - 1)).name;
};

// ------------------------------------------------------------------------------------------------
// The view
// ------------------------------------------------------------------------------------------------

/** The camera's angle (radians): yaw is the group's rotation about y, pitch about x. */
export interface View {
  yaw: number;
  pitch: number;
}

/** Straight on: the plates line up into the logo (the scroll-out hand-off blends to it). */
export const restView = (): View => ({ yaw: 0, pitch: 0 });

/** Where the approach turns back: past straight on, on the other side from the orbit's end. */
const OVERSHOOT: View = {
  yaw: -VIEW.overshoot * VIEW.orbitEnd.yaw,
  pitch: -VIEW.overshoot * VIEW.orbitEnd.pitch,
};

/** A point the view's path passes through: when, where, and how fast (radians a second). */
interface Knot {
  t: number;
  view: View;
  rate: View;
}

/** Mean pace (radians a second) of a move from a to b over a span. */
const paceOf = (a: number, b: number, span: Span): number => (b - a) / (span.end - span.start);

/**
 * The rate at a knot that never carries a value past it: 0 where the value turns round there,
 * otherwise the harmonic mean of the paces either side (Fritsch–Carlson).
 */
const steadyRate = (before: number, after: number): number =>
  before * after > 0 ? (2 * before * after) / (before + after) : 0;

/**
 * The view's path, knot to knot. It leaves the hold and comes to rest at the click (and turns back
 * at the far end of the overshoot) with no speed. At the ends of the orbit the yaw takes a steady
 * rate, so it never runs past either end: it turns round exactly at orbitStart and passes through
 * orbitEnd on its way to the overshoot. The pitch carries on at the mean pace of the move it is
 * starting, so the camera never stops there.
 */
const KNOTS: readonly Knot[] = [
  { t: DEPART.start, view: restView(), rate: restView() },
  {
    t: ORBIT.start,
    view: VIEW.orbitStart,
    rate: {
      yaw: steadyRate(
        paceOf(0, VIEW.orbitStart.yaw, DEPART),
        paceOf(VIEW.orbitStart.yaw, VIEW.orbitEnd.yaw, ORBIT),
      ),
      pitch: paceOf(VIEW.orbitStart.pitch, VIEW.orbitEnd.pitch, ORBIT),
    },
  },
  {
    t: APPROACH.start,
    view: VIEW.orbitEnd,
    rate: {
      yaw: steadyRate(
        paceOf(VIEW.orbitStart.yaw, VIEW.orbitEnd.yaw, ORBIT),
        paceOf(VIEW.orbitEnd.yaw, OVERSHOOT.yaw, APPROACH),
      ),
      pitch: paceOf(VIEW.orbitEnd.pitch, OVERSHOOT.pitch, APPROACH),
    },
  },
  { t: SETTLE.start, view: OVERSHOOT, rate: restView() },
  { t: PERIOD, view: restView(), rate: restView() },
];

/**
 * Cubic Hermite step from p0 (rate m0) to p1 (rate m1) over h seconds, at s (0–1): it starts and
 * ends exactly at p0 and p1 with exactly those rates, so neighbouring steps join smoothly.
 */
const hermite = (p0: number, m0: number, p1: number, m1: number, h: number, s: number): number => {
  const s2 = s * s;
  const s3 = s2 * s;
  return (
    (2 * s3 - 3 * s2 + 1) * p0 +
    (s3 - 2 * s2 + s) * h * m0 +
    (3 * s2 - 2 * s3) * p1 +
    (s3 - s2) * h * m1
  );
};

/**
 * The view at time t (seconds, any value): exactly straight on through the hold; away from it
 * otherwise, along a path whose position and velocity are continuous everywhere, the seam
 * included.
 */
export const viewAt = (t: number): View => {
  const lt = loopTime(t);
  if (lt < at(KNOTS, 0).t) return restView();
  for (let i = 1; i < KNOTS.length; i++) {
    const b = at(KNOTS, i);
    if (lt < b.t) {
      const a = at(KNOTS, i - 1);
      const h = b.t - a.t;
      const s = (lt - a.t) / h;
      return {
        yaw: hermite(a.view.yaw, a.rate.yaw, b.view.yaw, b.rate.yaw, h, s),
        pitch: hermite(a.view.pitch, a.rate.pitch, b.view.pitch, b.rate.pitch, h, s),
      };
    }
  }
  return restView();
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

/** Flat and exactly in register: where the plates start (hand-over from the SVG) and fade. */
export const registerPose = (plate: PlateLayout): PlatePose => ({
  x: plate.markX,
  y: plate.markY,
  z: 0,
  rx: 0,
  rz: 0,
  scale: 1,
});

/** A plate's depth at time t: its own depth, breathing gently (seconds, any value). */
export const depthAt = (plate: PlateLayout, t: number): number => {
  const { depth, phase } = PLATES[plate.id];
  return depth + BREATHE.depth * Math.sin(BEAT * 3 * loopTime(t) + phase);
};

/** The hold: in register at the plate's depth (the scroll-out hand-off blends to it). */
export const holdPose = (plate: PlateLayout, t: number): PlatePose => ({
  ...registerPose(plate),
  z: depthAt(plate, t),
});

/** How much of the plates' drift shows: none in the hold and the settle, all of it mid-orbit. */
const driftShare = (lt: number): number =>
  smoothstep(DEPART.start, DEPART.end, lt) * (1 - smoothstep(APPROACH.start, APPROACH.end, lt));

/**
 * A plate's pose at time t (seconds, any value: the loop repeats every PERIOD). It stays in
 * register at its depth throughout; only while the camera is away does it turn slightly about z.
 */
export const platePoseAt = (t: number, plate: PlateLayout): PlatePose => {
  const lt = loopTime(t);
  const share = driftShare(lt);
  return {
    x: plate.markX,
    y: plate.markY,
    z: depthAt(plate, lt),
    rx: 0,
    rz: share > 0 ? DRIFT.rz * share * Math.sin(BEAT * 2 * lt + PLATES[plate.id].phase * 1.7) : 0,
    scale: 1,
  };
};

/**
 * The camera in the group's unrotated frame, in group raster units: its position over the plane
 * z = 0 (x, y) and its distance from it. The scene: x = −groupPos.x / scale, y = −groupPos.y /
 * scale, distance = camera distance (px) / scale.
 */
export interface Camera {
  x: number;
  y: number;
  distance: number;
}

/**
 * Slides a plate along the camera's line of sight to its anchor and scales it with the distance,
 * so that seen from the camera with the group unturned it covers exactly what it would at z = 0:
 * the nearer plates shrink and the further ones grow. Depth, tip and turn are unchanged.
 */
export const alignToView = (pose: PlatePose, camera: Camera): PlatePose => {
  const k = (camera.distance - pose.z) / camera.distance;
  return {
    x: camera.x + (pose.x - camera.x) * k,
    y: camera.y + (pose.y - camera.y) * k,
    z: pose.z,
    rx: pose.rx,
    rz: pose.rz,
    scale: pose.scale * k,
  };
};

// ------------------------------------------------------------------------------------------------
// Effects
// ------------------------------------------------------------------------------------------------

export interface Effects {
  /** Position of the sheen across the mark: 0 left of it, 1 right of it. */
  sheen: number;
  /** Strength of the sheen (0–1). */
  sheenAlpha: number;
  /** How much of the ink dust near the mark is drawn into the plates (0–1): 1 at the click. */
  absorb: number;
  /** How close the plates are to register (0–1): 1 straight on, 0 well away (damps the tilt). */
  align: number;
}

/**
 * The effects at time t: a sheen crossing the mark from left to right just after the click, the
 * ink dust gathering into the plates as the camera comes home and released again after the click,
 * and how close the view is to straight on. The sheen and the dust are 0 outside their spans.
 */
export const effectsAt = (t: number): Effects => {
  const age = loopTime(t);

  const { from, to } = EFFECTS.sheen;
  const inSheen = age > from && age < to;
  const u = (age - from) / (to - from);

  const { gather, release } = EFFECTS.absorb;
  const view = viewAt(age);

  return {
    sheen: inSheen ? easeInOutCubic(u) : 0,
    sheenAlpha: inSheen ? Math.sin(Math.PI * u) : 0,
    absorb: Math.max(
      1 - smoothstep(release.from, release.to, age),
      smoothstep(gather.from, gather.to, age),
    ),
    align: 1 - smoothstep(0, EFFECTS.align, Math.max(Math.abs(view.yaw), Math.abs(view.pitch))),
  };
};

// ------------------------------------------------------------------------------------------------
// Hand-off
// ------------------------------------------------------------------------------------------------

export interface Handoff {
  /** Blend from the loop pose to the hold pose (the loop clock also slows to a stop with it). */
  toMark: number;
  /** From the hold into flat register. */
  collapse: number;
  /** Scale of the plates (1 → 1 − HANDOFF.shrink). */
  scale: number;
  /** Ink of the hero plates (1 → 0). */
  ink: number;
  /** Progress of the hand-off to the header logo (`--dock`, 0 → 1), as the hero plates fade. */
  dock: number;
}

/**
 * The hand-off at scroll progress p (math.ts dockProgress): the plates first blend to the hold
 * pose (and the view to straight on) from wherever they are in the loop, collapse into register,
 * then shrink a little and fade out in the art column while the header logo's arches pulse out of
 * register and snap back. Scrolling back runs it in reverse.
 */
export const handoff = (p: number): Handoff => {
  const fade = smoothstep(HANDOFF.fadeFrom, 1, p);
  return {
    toMark: smoothstep(0, HANDOFF.toMark, p),
    collapse: easeInOutCubic(
      (p - HANDOFF.collapseFrom) / (HANDOFF.collapseTo - HANDOFF.collapseFrom),
    ),
    scale: 1 - HANDOFF.shrink * smoothstep(HANDOFF.shrinkFrom, 1, p),
    ink: 1 - fade,
    dock: fade,
  };
};

/**
 * How far out of register the header logo's arches are during the hand-off (`--dock-reg`; 1 is
 * the full offset set in Hero.astro), from the dock progress (handoff().dock, 0–1). A pulse:
 * exactly 0 at the top (the arches sit in register), rising smoothly to 1 at PULSE_PEAK, then
 * snapping back with --ease-snap (a small overshoot past register) to exactly 0 as the hero
 * plates finish fading. Scrolling back runs it in reverse.
 */
export const registrationPulse = (dock: number): number => {
  const d = clamp(dock);
  if (d <= PULSE_PEAK) return Math.sin((Math.PI / 2) * (d / PULSE_PEAK));
  return 1 - easeSnap((d - PULSE_PEAK) / (1 - PULSE_PEAK));
};

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
