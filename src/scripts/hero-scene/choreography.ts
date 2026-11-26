/**
 * Choreography of the hero plates, "the press run": pure functions with no DOM or WebGL access, so
 * the whole loop can be unit tested (tests/hero-scene.test.ts).
 *
 * The four arch plates (C, M, Y, K) tell one story in a seamless loop of PERIOD seconds: a print
 * run. The plates float apart in depth above a sheet of paper, glide into register one by one in
 * press order, press onto the sheet, hold as the crisp logo, then lift off again. The beats:
 *  - settle    t = 0 is the moment of contact: the plates have just pressed a little into the sheet
 *              and come back up to lie on it;
 *  - hold      the plates lie in register on the sheet: the logo, still;
 *  - release   the plates lift off in reverse print order K, C, M, Y, depth first, and drift out to
 *              their float offsets. Each leaves its halftone print on the sheet, which then fades;
 *  - float     the plates hang apart in depth above the sheet, breathing gently;
 *  - register  the plates glide back into register in print order Y, M, C, K, each snapping into
 *              place with the small overshoot of `--ease-snap` and hovering just above the sheet;
 *  - press     all four come down together and press into the sheet, which closes the loop.
 * The sheet's response to the contact (a ripple, a bloom and a sheen) and the plates' shadows on
 * it are given here too (effectsAt, printAlpha, plateShadow); the scene draws them.
 *
 * Space ("group space"): logo raster units, y up, origin at the centre of the mark's viewBox (the
 * scene's pivot). A plate's pose is the position of its anchor (the centre of the arch's bounding
 * box), its depth z (the centre of the plate, which is extruded ±17 around it, so z = 0 lies on
 * the sheet), its turn rz about z and tip rx about x (radians), and its scale. Every pose stays
 * inside the ART box, which the hero lays out for it (Hero.astro).
 *
 * The visual tuning lives in the constants below.
 */
import { boundsOf, type Bounds, type Point } from './geometry';
import { clamp, cubicBezier, easeInOutCubic, easeOutCubic, lerp, smoothstep } from './math';

export type PlateId = 'c' | 'm' | 'y' | 'k';
export type BeatName = 'settle' | 'hold' | 'release' | 'float' | 'register' | 'press';

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
export const PERIOD = 12;

/**
 * The beats of the loop, back to back from 0 to PERIOD (seconds). t = 0 is the moment of contact,
 * when the plates have just pressed onto the sheet.
 */
export const BEATS: readonly { name: BeatName; start: number; end: number }[] = [
  { name: 'settle', start: 0, end: 0.25 },
  { name: 'hold', start: 0.25, end: 3.2 },
  { name: 'release', start: 3.2, end: 6.2 },
  { name: 'float', start: 6.2, end: 8.3 },
  { name: 'register', start: 8.3, end: 11.4 },
  { name: 'press', start: 11.4, end: PERIOD },
];

/**
 * Delay between the plates within the staggered beats (seconds): register in print order Y, M,
 * C, K, release in reverse print order K, C, M, Y. Each plate's move lasts the beat less three
 * delays, so the last plate arrives exactly as its beat ends (register 1.9 s, release 2.4 s).
 */
export const STAGGER = { register: 0.4, release: 0.2 } as const;

/** The glide into register: a slow start, a fast middle and a long, quiet settle. */
export const easeMove = cubicBezier(0.7, 0, 0.2, 1);
/** The registration snap, `--ease-snap` (small overshoot). */
export const easeSnap = cubicBezier(0.3, 1.5, 0.5, 1);
/** The press: gathering speed all the way down, fastest at contact. */
const easePress = cubicBezier(0.55, 0, 1, 0.45);

interface PlateTuning {
  /** 0–3 in print order Y, M, C, K. */
  print: number;
  /**
   * Float: offset from register (raster units, y up; z is the height above the sheet) and turn
   * (radians). C, printed last but one, floats highest; K, the last plate, lowest.
   */
  float: { x: number; y: number; z: number; rz: number };
  /** Phase of the plate's breathing while it floats (radians). */
  phase: number;
}

/**
 * Per plate. The float offsets fan the plates out along one shallow diagonal: C, highest, drifts a
 * little up and to the left, K, lowest, down and to the right. The sheet's tilt shows every unit
 * of height higher up the screen, so the offsets stay low: raised plates keep clear of the header
 * and inside the art box.
 */
export const PLATES = {
  c: { print: 2, float: { x: -20, y: 10, z: 380, rz: -0.08 }, phase: 0 },
  m: { print: 1, float: { x: -6, y: -10, z: 270, rz: 0.065 }, phase: 1.3 },
  y: { print: 0, float: { x: 6, y: -28, z: 175, rz: -0.05 }, phase: 2.6 },
  k: { print: 3, float: { x: 16, y: -46, z: 80, rz: 0.035 }, phase: 3.9 },
} as const satisfies Record<PlateId, PlateTuning>;

/** Float: breathing amplitudes (raster units, radians). */
const BREATHE = { y: 8, z: 12, rz: 0.008 } as const;

/**
 * The sheet: the frame the plates and the sheet share (`tilt`, radians, applied to the group: the
 * top recedes and the right side recedes slightly), its slow drift over the loop (radians), how
 * high the plates hover above it once in register (`hover`) and how far the press sinks them into
 * it (`dip`), in raster units.
 */
export const SHEET = {
  tilt: { x: -0.28, y: 0.14, z: 0 },
  drift: { yaw: 0.05, pitch: 0.025 },
  hover: 26,
  dip: 4,
} as const;

/** The halftone print each plate leaves on the sheet as it lifts off: its strongest ink. */
export const PRINT = { alpha: 0.85 } as const;

/** The prints fade out over this span of loop time (seconds), before the plates come back. */
const PRINT_FADE = { from: 4.9, to: 6.0 } as const;

/**
 * The sheet's response to the contact at t = 0 (seconds after it): how long the ripple runs, how
 * long the bloom lasts, and when the sheen crosses the mark.
 */
const EFFECTS = {
  ripple: 2.4,
  bloom: 1.1,
  sheen: { from: 0.9, to: 2.5 },
} as const;

/**
 * Scroll-out hand-off (progress 0–1, see handoff): blend to the hold pose by `toMark`, collapse
 * into register from `collapseFrom` to `collapseTo`, shrink by `shrink` from `shrinkFrom`, and fade
 * out from `fadeFrom` while the header logo's arches pulse (registrationPulse).
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

/** Base angular frequency: the float's breathing and the sheet's drift use whole multiples. */
const BEAT = (Math.PI * 2) / PERIOD;

/** The print slot of the last plate (K): the staggered moves end with it. */
const LAST_PRINT = 3;

interface Span {
  start: number;
  end: number;
}

const beatOf = (name: BeatName): Span => {
  const beat = BEATS.find((b) => b.name === name);
  if (!beat) throw new Error(`No beat ${name}`);
  return beat;
};

const SETTLE = beatOf('settle');
const RELEASE = beatOf('release');
const REGISTER = beatOf('register');
const PRESS = beatOf('press');

/** Loop time in [0, PERIOD). */
export const loopTime = (t: number): number => t - PERIOD * Math.floor(t / PERIOD);

/** The beat the loop is in at time t (seconds, any value). */
export const beatAt = (t: number): BeatName => {
  const lt = loopTime(t);
  return (BEATS.find((b) => lt < b.end) ?? at(BEATS, BEATS.length - 1)).name;
};

/** A plate's own move within a staggered beat: the plate in slot `slot` leaves `slot` delays in. */
const staggered = (beat: Span, stagger: number, slot: number): Span => {
  const duration = beat.end - beat.start - LAST_PRINT * stagger;
  const start = beat.start + slot * stagger;
  return { start, end: start + duration };
};

/** Release runs in reverse print order: K first, Y last. */
const releaseWindow = (plate: PlateLayout): Span =>
  staggered(RELEASE, STAGGER.release, LAST_PRINT - plate.print);

/** Register runs in print order: Y first, K last. */
const registerWindow = (plate: PlateLayout): Span =>
  staggered(REGISTER, STAGGER.register, plate.print);

const progress = (lt: number, w: Span): number => clamp((lt - w.start) / (w.end - w.start));

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

/** The hold: in register, lying on the sheet (the scroll-out hand-off blends to it). */
export const holdPose = (plate: PlateLayout): PlatePose => registerPose(plate);

/** The float: out of register by the plate's float offset, apart in depth, breathing gently. */
export const floatPose = (plate: PlateLayout, t: number): PlatePose => {
  const { float, phase } = PLATES[plate.id];
  return {
    x: plate.markX + float.x,
    y: plate.markY + float.y + Math.sin(BEAT * 2 * t + phase) * BREATHE.y,
    z: float.z + Math.sin(BEAT * 3 * t + phase) * BREATHE.z,
    rx: 0,
    rz: float.rz + Math.sin(BEAT * 2 * t + phase * 1.7) * BREATHE.rz,
    scale: 1,
  };
};

/** In register at height z above the sheet. */
const inRegisterAt = (plate: PlateLayout, z: number): PlatePose => ({
  ...registerPose(plate),
  z,
});

/** A plate's pose at time t (seconds, any value: the loop repeats every PERIOD). */
export const platePoseAt = (t: number, plate: PlateLayout): PlatePose => {
  const lt = loopTime(t);

  // Settle: just pressed into the sheet, the plate comes back up to lie on it.
  if (lt < SETTLE.end) {
    return inRegisterAt(plate, lerp(-SHEET.dip, 0, easeOutCubic(progress(lt, SETTLE))));
  }

  // Hold, then release: the plate lifts off depth first and drifts out to its float offset.
  const release = releaseWindow(plate);
  if (lt < release.start) return holdPose(plate);
  if (lt < release.end) {
    const u = progress(lt, release);
    const hold = holdPose(plate);
    const float = floatPose(plate, lt);
    const glide = easeInOutCubic(u);
    return {
      x: lerp(hold.x, float.x, glide),
      y: lerp(hold.y, float.y, glide),
      z: lerp(hold.z, float.z, easeOutCubic(u)),
      rx: 0,
      rz: lerp(hold.rz, float.rz, glide),
      scale: 1,
    };
  }

  // Float, then register: the plate glides back, snaps into register and hovers above the sheet.
  const register = registerWindow(plate);
  if (lt < register.start) return floatPose(plate, lt);
  if (lt < register.end) {
    const u = progress(lt, register);
    const reg = registerPose(plate);
    const float = floatPose(plate, lt);
    const snap = easeSnap(u);
    return {
      x: lerp(float.x, reg.x, snap),
      y: lerp(float.y, reg.y, snap),
      z: lerp(float.z, SHEET.hover, easeMove(u)),
      rx: 0,
      rz: lerp(float.rz, reg.rz, snap),
      scale: 1,
    };
  }
  if (lt < PRESS.start) return inRegisterAt(plate, SHEET.hover);

  // Press: all four come down together and sink into the sheet; the loop closes at contact.
  const u = (lt - PRESS.start) / (PRESS.end - PRESS.start);
  return inRegisterAt(plate, lerp(SHEET.hover, -SHEET.dip, easePress(u)));
};

/** The frame of the plates and the sheet at time t: the sheet's tilt with a slow drift. */
export const tiltAt = (t: number): Tilt => {
  const lt = loopTime(t);
  return {
    x: SHEET.tilt.x + SHEET.drift.pitch * Math.sin(BEAT * 2 * lt + 0.7),
    y: SHEET.tilt.y + SHEET.drift.yaw * Math.sin(BEAT * lt),
    z: SHEET.tilt.z,
  };
};

/** The sheet's tilt without its drift: the scroll-out hand-off blends to it. */
export const restTilt = (): Tilt => ({ ...SHEET.tilt });

// ------------------------------------------------------------------------------------------------
// The sheet: effects of the contact, prints and shadows
// ------------------------------------------------------------------------------------------------

export interface Effects {
  /** Reach of the ripple from the mark, as a share of its full reach (0–1). */
  ripple: number;
  /** Strength of the ripple (0–1): rises at once, then fades out as it spreads. */
  rippleAlpha: number;
  /** Brightening of the sheet under the plates at contact (0–1). */
  bloom: number;
  /** Position of the sheen across the mark: 0 left of it, 1 right of it. */
  sheen: number;
  /** Strength of the sheen (0–1). */
  sheenAlpha: number;
}

/**
 * The sheet's response to the contact at t = 0: a ripple spreading out from the mark, a short bloom
 * under the plates, and a sheen crossing the mark from left to right. All are 0 outside their
 * spans, so they never show away from the contact.
 */
export const effectsAt = (t: number): Effects => {
  const age = loopTime(t);

  const u = age / EFFECTS.ripple;
  const ripple = u < 1 ? easeOutCubic(u) : 0;
  const rippleAlpha = u < 1 ? smoothstep(0, 0.06, u) * Math.pow(1 - u, 1.6) : 0;

  const v = age / EFFECTS.bloom;
  const bloom = v < 1 ? smoothstep(0, 0.08, v) * (1 - smoothstep(0.08, 1, v)) : 0;

  const { from, to } = EFFECTS.sheen;
  const inSheen = age > from && age < to;
  const s = (age - from) / (to - from);

  return {
    ripple,
    rippleAlpha,
    bloom,
    sheen: inSheen ? easeInOutCubic(s) : 0,
    sheenAlpha: inSheen ? Math.sin(Math.PI * s) : 0,
  };
};

/**
 * Strength of the halftone print a plate leaves on the sheet (0–PRINT.alpha): it inks in as the
 * plate lifts off (K first) and fades out before the plates come back. 0 outside the release.
 */
export const printAlpha = (t: number, plate: PlateLayout): number => {
  const lt = loopTime(t);
  if (lt < RELEASE.start || lt >= PRINT_FADE.to) return 0;
  const r = progress(lt, releaseWindow(plate));
  const fade = 1 - smoothstep(PRINT_FADE.from, PRINT_FADE.to, lt);
  return PRINT.alpha * smoothstep(0, 0.3, r) * fade;
};

/**
 * The shadow a plate at height z casts on the sheet, light from the upper left: its offset (raster
 * units, y up, so it falls down and to the right), blur radius and strength. None while the plate
 * lies on or in the sheet; the higher it floats, the further, softer and fainter the shadow.
 */
export const plateShadow = (
  z: number,
): { x: number; y: number; softness: number; alpha: number } => {
  const zc = Math.max(0, z);
  return {
    x: 0.16 * zc,
    y: -0.24 * zc,
    softness: 6 + 0.09 * zc,
    alpha: smoothstep(0, 10, zc) * (1 - 0.65 * clamp(zc / 450)),
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
 * pose from wherever they are in the press run, collapse into register, then shrink a little and
 * fade out in the art column while the header logo's arches pulse out of register and snap back.
 * Scrolling back runs it in reverse.
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
