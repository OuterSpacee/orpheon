// The airway as the view draws it: where the tube from the folds to the lips lies inside the
// head, and how wide a gap each cross-section of the voice's tube needs.
//
// Everything is in centimetres in the slice down the middle of the head: x forward (toward the
// face), y up, y = 0 where the teeth meet. z, used elsewhere, runs sideways out of that slice.
//
// The roof of the airway does not move: the back wall of the throat, the soft and hard palate,
// the gum ridge, the upper teeth. From each point of the roof a fixed direction points across the
// airway to the floor (the tongue, and at the very front the lower lip). The floor sits along
// that direction at the distance the cross-section asks for, so a tube that the voice has closed
// at the ridge is drawn with the tongue touching the ridge.
import { LANDMARK, TRACT_POINTS } from "../contract.ts";
import { clamp, curve, mix, smoothstep } from "./curve.ts";

export const N = TRACT_POINTS;

/** Position along the airway of point i, 0 at the folds to 1 at the lips. */
export const along = (i: number) => i / (N - 1);

// The roof, as knots along the airway: where it is, and which way is "across" there (degrees
// from straight ahead; 0 points forward, -90 points down). The named places are the contract's,
// so the ridge of this drawing is the ridge of the voice.
//                      s                    x      y    across
const ROOF: number[][] = [
  [0, /*                 the folds        */ 1.0, -8.2, 0],
  [LANDMARK.larynxTop, /*                 */ 0.6, -6.55, 0],
  [0.16, /*                               */ 0.32, -5.55, 0],
  [0.28, /*              back of throat   */ 0.15, -3.55, 0],
  [0.38, /*                               */ 0.12, -1.85, -3],
  [0.44, /*                               */ 0.17, -0.8, -10],
  [LANDMARK.velum, /*    tip of the velum */ 0.55, 0.45, -30],
  [0.55, /*                               */ 1.4, 1.15, -52],
  [LANDMARK.velar, /*                     */ 2.55, 1.6, -72],
  [0.655, /*             hard palate ends */ 3.5, 1.8, -84],
  [LANDMARK.palatal, /*                   */ 5.0, 1.95, -90],
  [LANDMARK.postalveolar, /*              */ 6.65, 1.45, -95],
  [LANDMARK.ridge, /*                     */ 7.4, 0.8, -95],
  [LANDMARK.teeth, /*    edge of incisors */ 8.2, 0.0, -90],
  [LANDMARK.lips, /*                      */ 9.05, 0.1, -90],
];
const column = (k: number) => curve(ROOF.flatMap((r) => [r[0], r[k]]));
export const roofX = column(1);
export const roofY = column(2);
const roofTurn = column(3);
export const acrossX = (s: number) => Math.cos((roofTurn(s) * Math.PI) / 180);
export const acrossY = (s: number) => Math.sin((roofTurn(s) * Math.PI) / 180);

// Seen from the front, a cross-section of the airway is a lens: the roof arches over it and the
// floor is flatter, so the gap is deepest in the middle and closes toward the sides.
//   gap at sideways distance z  =  g · (1 − (z / half)²)        area  =  4/3 · g · half
// Where the walls are free the lens widens as it deepens, half = √(g / flat), which gives
// area ∝ g^1.5: the power law measured between mid-sagittal distance and area (Heinz & Stevens
// 1965; Perrier, Boë & Sock 1992, J. Speech Hear. Res. 35). Where the lens meets the side walls
// (`wide`) it can only deepen.

/** How much the roof arches sideways at s: it sits `arch · z²` further across at distance z. */
export const arch = curve([0, 0.5, 0.1, 0.35, 0.2, 0.1, 0.45, 0.1, 0.6, 0.2, 0.7, 0.3, 0.8, 0.33, 0.89, 0.28, 0.95, 0.12, 1, 0.04]);
/** How much flatter than the roof the floor is at s (1/cm). */
const flat = curve([0, 1.8, 0.1, 1.5, 0.18, 0.5, 0.45, 0.42, 0.6, 0.5, 0.9, 0.55, 1, 0.5]);
/** The widest half-width the walls allow at s. */
const wide = curve([0, 0.75, 0.1, 0.9, 0.2, 1.9, 0.45, 2.0, 0.6, 2.1, 0.8, 2.3, 0.9, 2.1, 0.95, 1.9, 1, 1.9]);

/** Half the width of the mouth opening: wide when the lips are spread, small when rounded. */
export const lipHalfWidth = (round: number) => mix(2.3, 0.9, clamp(round, 0, 1));
/** How far rounding pushes the lips forward. */
export const lipReach = (round: number) => 0.7 * clamp(round, 0, 1);
/** How far the whole larynx rides up (+) or down (-) with the pose's larynx value. */
export const larynxLift = (larynx: number) => 0.7 * clamp(larynx, -1, 1);
/** How much of the larynx's lift reaches the airway at s: all of it at the folds, none above the throat. */
export const liftShare = (s: number) => 1 - smoothstep(LANDMARK.larynxTop, 0.38, s);
/** The deepest gap the drawing allows, however large an area it is handed. */
const DEEPEST = 3.6;

/** One point of the airway: the gap across it in the middle, and the half-width of its lens. */
export interface Section {
  gap: number;
  half: number;
}

/** The lens that has `area` cm² at s. Writes into `out`. */
export function sectionFor(area: number, s: number, round: number, out: Section): void {
  const a = Math.max(0, area);
  const k = flat(s);
  let gap = Math.pow(0.75 * a * Math.sqrt(k), 2 / 3);
  let half = Math.sqrt(gap / k);
  const limit = wide(s);
  if (half > limit) {
    half = limit;
    gap = (0.75 * a) / limit;
  }
  // The last stretch is the lips: their corners set the width, the area sets how far they part.
  const lip = smoothstep(LANDMARK.teeth, LANDMARK.lips, s);
  if (lip > 0) {
    const corner = lipHalfWidth(round);
    gap = mix(gap, (0.75 * a) / corner, lip);
    half = mix(half, a > 0 ? corner : 0, lip);
  }
  out.gap = Math.min(gap, DEEPEST);
  out.half = half;
}

/** The area of a lens: what sectionFor undoes. */
export const lensArea = (gap: number, half: number) => (4 / 3) * gap * half;

/** The airway at one instant: for each of the N points, its roof, its across direction and its lens. */
export interface Airway {
  roofX: Float32Array;
  roofY: Float32Array;
  acrossX: Float32Array;
  acrossY: Float32Array;
  gap: Float32Array;
  half: Float32Array;
  arch: Float32Array;
}

export function makeAirway(): Airway {
  const f = () => new Float32Array(N);
  const a: Airway = { roofX: f(), roofY: f(), acrossX: f(), acrossY: f(), gap: f(), half: f(), arch: f() };
  for (let i = 0; i < N; i++) {
    const s = along(i);
    a.acrossX[i] = acrossX(s);
    a.acrossY[i] = acrossY(s);
    a.arch[i] = arch(s);
  }
  return a;
}

const scratch: Section = { gap: 0, half: 0 };

/**
 * Lay the voice's tube into the head. `area` holds N cross-sections in cm² starting at `from`
 * (so the telemetry array can be passed as it is). Does not allocate.
 */
export function shapeAirway(out: Airway, area: ArrayLike<number>, from: number, larynx: number, round: number): void {
  const lift = larynxLift(larynx);
  const reach = lipReach(round);
  for (let i = 0; i < N; i++) {
    const s = along(i);
    out.roofX[i] = roofX(s) + reach * smoothstep(LANDMARK.ridge, 1, s);
    out.roofY[i] = roofY(s) + lift * liftShare(s);
    sectionFor(area[from + i], s, round, scratch);
    out.gap[i] = scratch.gap;
    out.half[i] = scratch.half;
  }
}

/** The floor of the airway (the tongue's surface, the lower lip) in the middle of point i. */
export const floorX = (a: Airway, i: number) => a.roofX[i] + a.acrossX[i] * a.gap[i];
export const floorY = (a: Airway, i: number) => a.roofY[i] + a.acrossY[i] * a.gap[i];
/** The middle of the airway at point i: the line the air travels along. */
export const centreX = (a: Airway, i: number) => a.roofX[i] + a.acrossX[i] * a.gap[i] * 0.5;
export const centreY = (a: Airway, i: number) => a.roofY[i] + a.acrossY[i] * a.gap[i] * 0.5;

/** An open, relaxed tube (cm²): what the view shows before any telemetry arrives. */
export function restingArea(s: number): number {
  return mix(0.7, mix(2.6, 1.8, smoothstep(0.3, 0.95, s)), smoothstep(LANDMARK.larynxTop - 0.02, 0.24, s));
}
