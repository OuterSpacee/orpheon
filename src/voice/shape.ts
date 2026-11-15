// The pose becomes a tube: from what the jaw, tongue, lips and velum are doing to the
// cross-section of the airway in each slice.
//
// The model works on the gap between the tongue and the wall opposite it (the back of the throat,
// then the roof of the mouth), as seen in a side view of the head, and turns gap into area with
// the power law Heinz & Stevens (1965) fitted to X-ray tracings: area = ALPHA × gap^1.5.
//
//   the floor     the gap with the tongue lying low and flat; the jaw swings it open, more the
//                 further forward (the jaw hinges near the ear).
//   the body      the tongue's bulk makes one hump. tongueX slides it from the lower throat to
//                 under the hard palate, tongueY raises it until it seals. The tongue keeps its
//                 volume: bunched forward it leaves the throat wide (ee); pulled back, its blade
//                 lies low and leaves the mouth wide (ah, oo). The tongue hangs from the jaw, so
//                 an open jaw also swings its root back into the bottom of the throat.
//   the tip       a second, narrow hump at the teeth, the ridge or just behind it.
//   the teeth     an opening that only the jaw sets.
//   the lips      the last two slices. Rounding narrows them and, with the larynx, changes how
//                 long the whole tube is.
//
// Positions along the tube are fractions of its length, the LANDMARK table, so the view draws
// the same anatomy.
import { LANDMARK, POSE } from "../contract.ts";
import type { Body } from "../contract.ts";
import { AREA_FLOOR, NOSE_SECTIONS, SECTIONS } from "./tube.ts";

/** The tract length the reference anatomy below is drawn for, cm (an adult man). */
export const REFERENCE_TRACT = 17.5;

const ALPHA = 1.6;

/** Gap in cm with the jaw shut and the tongue low, at fractions of the tract's length. */
const FLOOR: [number, number][] = [
  [LANDMARK.larynxTop, 1.5],
  [0.2, 1.4],
  [0.45, 1.5],
  [LANDMARK.velar, 1.5],
  [LANDMARK.palatal, 1.3],
  [LANDMARK.postalveolar, 0.9],
  [LANDMARK.ridge, 0.6],
  [LANDMARK.teeth, 0.2],
  [1, 0.2],
];
/** How far a fully open jaw adds to the gap at the teeth, cm. */
const JAW_SWING = 2.4;
/** Where along the tract the jaw's swing starts. */
const JAW_HINGE = 0.45;
/** The larynx tube: fixed whatever the tongue does (cm²), narrow just above the folds and opening
 *  into the throat. Three narrow slices (about a centimetre) leave the resonances of the whole
 *  tract where a plain tube of the same length would put them. */
const LARYNX_TUBE = [0.5, 0.7, 1.4, 2.4, 3.0];

/** The tongue body's hump: where its centre can go, and its half-width. */
const BODY_BACK = 0.28;
const BODY_FRONT = 0.8;
const BODY_HALF = 0.28;
/** How much an open jaw narrows the throat, and a pulled-back tongue widens the mouth. */
const JAW_INTO_THROAT = 0.6;
const BLADE_DROP = 0.7;
/** How much a tongue bunched fully forward widens the upper throat. */
const THROAT_ROOM = 2;
/** The tip's hump is narrow. */
const TIP_HALF = 0.045;
/** A tip curled up and back leaves a hollow under it, between it and the teeth: extra gap in cm
 *  (the sublingual space that gives an American r its low third formant; Espy-Wilson et al. 2000). */
const UNDER_TIP = 1.2;
/** How much of the tract's length the lips give up spread over a fully open jaw. */
const LIPS_THIN = 0.04;
/** Side channels of an l, cm². */
const LATERAL_AREA = 0.45;

/** Sections whose centre is in front of the teeth are the lips. */
const LIP_FROM = Math.round(0.955 * SECTIONS);
const TEETH_AT = Math.floor(LANDMARK.teeth * SECTIONS);

const centre = new Float64Array(SECTIONS);
const floor = new Float64Array(SECTIONS);
const jawSwing = new Float64Array(SECTIONS);
const root = new Float64Array(SECTIONS);
const throat = new Float64Array(SECTIONS);
const mouth = new Float64Array(SECTIONS);
const velumHang = new Float64Array(SECTIONS);
for (let j = 0; j < SECTIONS; j++) {
  const x = (j + 0.5) / SECTIONS;
  centre[j] = x;
  floor[j] = table(FLOOR, x);
  jawSwing[j] = JAW_SWING * clamp01((x - JAW_HINGE) / (LANDMARK.teeth - JAW_HINGE));
  root[j] = smooth((x - 0.1) / 0.06) * (1 - smooth((x - 0.24) / 0.12));
  throat[j] = smooth((x - 0.18) / 0.14) * (1 - smooth((x - 0.44) / 0.12));
  mouth[j] = smooth((x - 0.5) / 0.12) * (1 - 0.5 * smooth((x - 0.84) / 0.1));
  velumHang[j] = hump((x - 0.54) / 0.07);
}

/** What shape() returns beside the areas. */
export interface Airway {
  /** SECTIONS areas in cm², folds to lips. */
  area: Float64Array;
  /** Opening into the nose, cm². */
  port: number;
  /** Length of the tract now, cm. */
  length: number;
}

export function newAirway(): Airway {
  return { area: new Float64Array(SECTIONS), port: 0, length: REFERENCE_TRACT };
}

/**
 * Fill `into` with the airway for a pose (a Float32Array or Float64Array indexed by POSE).
 * Does not allocate.
 */
export function shapeAirway(pose: ArrayLike<number>, body: Body, into: Airway): void {
  const size = body.tract / REFERENCE_TRACT;
  const scale = size * size;
  const area = into.area;

  const jaw = clamp01(pose[POSE.jaw]);
  const tongueX = clamp01(pose[POSE.tongueX]);
  // A little past "against the roof" presses harder: the seal is firm at 1, not grazing.
  const tongueY = clamp01(pose[POSE.tongueY]) * 1.12;
  const tip = clamp01(pose[POSE.tip]) * 1.25;
  const tipX = clamp01(pose[POSE.tipX]);
  const lateral = clamp01(pose[POSE.lateral]);
  const round = clamp01(pose[POSE.round]);
  const velum = clamp01(pose[POSE.velum]);
  const lips = clamp01(pose[POSE.lips]);

  const bodyAt = BODY_BACK + (BODY_FRONT - BODY_BACK) * tongueX;
  const tipAt = tipX < 0.5
    ? LANDMARK.teeth + (LANDMARK.ridge - LANDMARK.teeth) * tipX * 2
    : LANDMARK.ridge + (LANDMARK.postalveolar - LANDMARK.ridge) * (tipX - 0.5) * 2;
  // Which way the tongue's bulk has gone: +1 forward (the throat gains the room), -1 back.
  const lean = (bodyAt - 0.52) / 0.24;
  const bulk = 0.3 + 0.7 * clamp01(pose[POSE.tongueY]);
  const throatRoom = lean > 0 ? THROAT_ROOM * lean * bulk : 0;
  const rootBack = JAW_INTO_THROAT * jaw;
  const mouthRoom = BLADE_DROP * (1 - tongueX) * bulk;
  const hollow = tipX > 0.5 ? UNDER_TIP * (tip < 1 ? tip : 1) * (tipX - 0.5) * 2 : 0;

  for (let j = 0; j < SECTIONS; j++) {
    if (j < LARYNX_TUBE.length) {
      area[j] = LARYNX_TUBE[j] * scale;
      continue;
    }
    const x = centre[j];
    let gap = floor[j] + jaw * jawSwing[j];
    gap *= 1 + throatRoom * throat[j] + mouthRoom * mouth[j] - rootBack * root[j];
    const body = 1 - tongueY * hump((x - bodyAt) / BODY_HALF);
    gap *= body > 0 ? body : 0;
    gap *= 1 - 0.35 * velum * velumHang[j];
    const tipHump = hump((x - tipAt) / TIP_HALF);
    if (x > tipAt && x < LANDMARK.teeth) gap += hollow * (1 - tipHump);
    const under = 1 - tip * tipHump;
    gap *= under > 0 ? under : 0;
    let a = ALPHA * gap * Math.sqrt(gap);
    // Air around the sides of a raised tip.
    a += lateral * LATERAL_AREA * tipHump * (tip < 1 ? tip : 1);
    area[j] = a * scale;
  }

  // The teeth: the gap between upper and lower, whatever the tongue does behind them.
  const teeth = (0.25 + 4.5 * jaw) * scale;
  if (area[TEETH_AT] > teeth) area[TEETH_AT] = teeth;

  // The lips. Sealed a little before 0 so that "0" is firmly shut.
  const open = lips > 0.08 ? (lips - 0.08) / 0.92 : 0;
  const widest = (1 - round) * (1.5 + 7 * jaw) + round * (0.25 + jaw);
  for (let j = LIP_FROM; j < SECTIONS; j++) area[j] = open * widest * scale;

  for (let j = 0; j < SECTIONS; j++) if (area[j] < AREA_FLOOR) area[j] = AREA_FLOOR;

  into.port = velum > 0.08 ? ((velum - 0.08) / 0.92) * 1.6 * scale : 0;
  // Pushing the lips forward and lowering the larynx both lengthen the tube (Fant 1960). The
  // lips are a short passage of their own: thick and long pushed forward, thinned to almost
  // nothing when spread and stretched over an open jaw (Fant's area functions put it near 1 cm for
  // a spread vowel and twice that rounded), so a wide-open, spread mouth is a shorter tube.
  const larynx = clamp(pose[POSE.larynx], -1, 1);
  into.length = body.tract * (1 + 0.08 * (round - 0.2) - 0.06 * larynx - LIPS_THIN * jaw * (1 - round));
}

/**
 * The nose for a body: NOSE_SECTIONS areas in cm², port to nostrils. A sketch of the MRI
 * measurements of Dang, Honda & Suzuki (1994): a roomy back, a long middle, narrow nostrils.
 * Slice 0 is the port and is set by the velum.
 */
export function noseAirway(body: Body, into: Float64Array): void {
  const size = body.tract / REFERENCE_TRACT;
  for (let k = 0; k < NOSE_SECTIONS; k++) {
    const x = (k + 0.5) / NOSE_SECTIONS;
    const a = x < 0.15 ? 1.2 + (1.8 * x) / 0.15 : x < 0.6 ? 3 : 3 - 2.3 * smooth((x - 0.6) / 0.4);
    into[k] = a * size * size;
  }
}

function hump(u: number): number {
  const s = 1 - u * u;
  return s > 0 ? s * s : 0;
}

function smooth(u: number): number {
  const t = clamp01(u);
  return t * t * (3 - 2 * t);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function table(points: [number, number][], x: number): number {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (x <= points[i][0]) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return points[points.length - 1][1];
}
