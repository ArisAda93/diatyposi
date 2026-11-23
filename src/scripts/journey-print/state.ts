/**
 * The press run that turns a step's sketch into its product photograph on the home journey stage
 * (src/scripts/journey-print/index.ts draws it; src/scripts/idea-journey.ts decides how far each
 * step is printed). Pure, so it can be unit-tested (tests/journey-print.test.ts).
 *
 * `real` (0…1) is how far the step's photograph is printed. Over that run:
 * 1. the sheet arrives (the photo's paper, under the sketch's lines);
 * 2. the four process plates print in press order, Y, M, C, K, each as a halftone screen at its
 *    own angle whose dots grow from nothing, each sliding in out of register and snapping into
 *    register with a small overshoot;
 * 3. the screens resolve: the dots melt into continuous tone;
 * 4. the true photograph takes over from the four-ink approximation.
 * The sketch's lines fade out over the last part of the run, and the vector mark hands over to
 * the photographed one (`lineFade` and `markFade` in src/scripts/idea-journey.ts). Scrolling back
 * runs it in reverse.
 */
import { clamp01, easeOutBack, ramp, smoothstep } from '../idea-journey';

export interface PrintPlate {
  id: 'y' | 'm' | 'c' | 'k';
  /** The ink as linear 0…1 RGB (the site's process inks, src/styles/global.css). */
  ink: readonly [number, number, number];
  /** Screen angle in degrees (the classic process angles). */
  angle: number;
  /** Where in the run (0…1 of `real`) the plate starts to print. */
  from: number;
  /** Out-of-register offset as a share of the sheet (x right, y down). */
  ox: number;
  oy: number;
}

/** Press order. */
export const PRINT_PLATES: readonly PrintPlate[] = [
  { id: 'y', ink: [1, 0.945, 0], angle: 0, from: 0.05, ox: -0.05, oy: 0.035 },
  { id: 'm', ink: [0.929, 0, 0.549], angle: 75, from: 0.17, ox: 0.045, oy: -0.03 },
  { id: 'c', ink: [0, 0.682, 0.937], angle: 15, from: 0.29, ox: -0.035, oy: -0.045 },
  { id: 'k', ink: [0.133, 0.122, 0.125], angle: 45, from: 0.41, ox: 0.03, oy: 0.04 },
];

/** Share of the run each plate takes from its start to sitting in register. */
const PLATE_SPAN = 0.4;

export interface PlateState {
  /** How much of the plate's ink is down (0…1): the halftone dots grow with it. */
  cover: number;
  /** Multiplies the plate's out-of-register offset (1 far out, 0 in register; dips below 0). */
  shift: number;
}

export interface PrintState {
  /** The photo's sheet (0…1). */
  paper: number;
  /** In press order (PRINT_PLATES). */
  plates: PlateState[];
  /** 0 halftone dots … 1 continuous tone. */
  resolve: number;
  /** 0 four-ink print … 1 the true photograph. */
  photo: number;
}

export const printState = (real: number): PrintState => {
  const r = clamp01(real);
  return {
    paper: smoothstep(ramp(r, 0, 0.16)),
    plates: PRINT_PLATES.map((plate) => {
      const q = ramp(r, plate.from, plate.from + PLATE_SPAN);
      return { cover: smoothstep(ramp(q, 0, 0.55)), shift: 1 - easeOutBack(q) };
    }),
    resolve: smoothstep(ramp(r, 0.62, 0.92)),
    photo: smoothstep(ramp(r, 0.86, 1)),
  };
};
