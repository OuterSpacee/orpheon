// The outside of the head as a field (see solid.ts), built from a profile and a width at each
// height. In the slice down the middle the head is exactly its profile; to either side that
// outline shrinks inward, slowly at first and then faster, so the head closes like a pillow whose
// seam is the profile. The nose, eyes and ears are shapes of their own, blended on.
import { closedOutline, curve, distanceGrid } from "./curve.ts";
import { ball, carve, join, rod, type Field } from "./solid.ts";

// The profile, clockwise from the crown, without the nose (which is too narrow to be made by
// shrinking an outline). The face first, then down the neck and up the back.
const PROFILE = [
  -1.0, 18.0, 2.6, 17.5, 5.6, 16.0, 7.7, 13.6, 8.6, 11.2, /* brow */ 8.95, 9.4, /* between the eyes */ 8.45, 7.9,
  8.5, 6.0, 8.65, 4.0, /* under the nose */ 8.85, 2.5, 9.2, 1.5, /* upper lip */ 9.25, 0.7, /* mouth */ 8.9, 0.0,
  /* lower lip */ 9.05, -0.8, 8.45, -1.9, /* chin */ 8.7, -3.3, 8.45, -4.4, 7.3, -5.05, 5.2, -5.15, /* under the jaw */ 3.9, -5.6,
  3.45, -6.8, /* larynx */ 3.75, -8.5, 3.3, -10.4, 3.0, -13.0, 3.3, -19.0,
  -8.8, -19.0, -8.4, -12.0, -7.8, -8.0, /* nape */ -7.5, -4.5, -8.3, -1.0, -10.0, 3.0, /* back of the head */ -10.9, 7.5,
  -10.5, 11.5, -8.6, 15.0, -5.2, 17.3,
];
const outline = closedOutline(PROFILE, 8);
const profile = distanceGrid(outline, -13, -20, 12, 20, 0.1);

/** Half the width of the head at each height, before the shrinking rounds it off. */
const widthKnots = curve([-19, 7.6, -13, 6.6, -9, 6.3, -6, 6.0, -3, 5.9, 0, 6.5, 3, 7.1, 6, 7.4, 11, 7.8, 18, 7.4]);
// The same, averaged over a couple of centimetres (the knots of the curve would otherwise show
// as faint rings round the head) and worked out once for every millimetre of height.
const WIDTHS = Float32Array.from({ length: 421 }, (_, i) => {
  const y = -21 + i * 0.1;
  return (widthKnots(y - 1.4) + 2 * widthKnots(y - 0.7) + 3 * widthKnots(y) + 2 * widthKnots(y + 0.7) + widthKnots(y + 1.4)) / 9;
});
function halfWidth(y: number): number {
  const at = Math.max(0, Math.min(419.999, (y + 21) * 10));
  const i = at | 0;
  return WIDTHS[i] + (WIDTHS[i + 1] - WIDTHS[i]) * (at - i);
}
const DEEP = 11;
const SQUARE = 2.5;

/** The head without nose, eyes or ears. */
export const pillow: Field = (x, y, z) => {
  const w = halfWidth(y);
  const u = Math.abs(z) / w;
  const shrink = u >= 1 ? DEEP + (u - 1) * w * 4 : DEEP * (1 - Math.pow(1 - Math.pow(u, SQUARE), 1 / SQUARE));
  return profile(x, y) + shrink;
};

function nose(x: number, y: number, z: number): number {
  const bridge = rod(x, y, z, 8.25, 7.5, 0, 0.5, 10.25, 3.95, 0, 0.72);
  const tip = ball(x, y, z, 10.3, 3.55, 0, 0.74);
  const wing = ball(x, y, z, 9.45, 3.2, 1.05, 0.62);
  return join(join(bridge, tip, 0.4), wing, 0.7);
}

function ear(x: number, y: number, z: number): number {
  // An ear lies in a plane that leans out from the head toward its back edge.
  const px = x + 1.5;
  const py = y - 5.7;
  const pz = z - 7.15 + px * 0.42;
  const tilt = px + py * 0.22;
  const ring = (Math.hypot(tilt / 1.55, py / 3.0) - 1) * 1.55;
  const rim = Math.hypot(ring, pz) - 0.3;
  const bowl = Math.max(ring, Math.abs(pz + 0.12) - 0.1);
  return Math.min(rim, bowl);
}

/** The skin: the pillow with a nose, brows, eye sockets with closed eyes in them, and ears. */
export const skin: Field = (x, y, z) => {
  const side = Math.abs(z);
  let d = pillow(x, y, side);
  if (x > 4 && y > 1 && y < 11) {
    if (side < 3) d = join(d, nose(x, y, side), 0.55);
    // The brow, then the socket under it, the round of the closed eye, and the line where the lids meet.
    d = join(d, rod(x, y, side, 8.25, 8.3, 1.2, 0.5, 7.0, 8.45, 5.0, 0.4), 0.9);
    d = carve(d, ball(x, y, side, 8.35, 6.5, 3.15, 1.5), 0.9);
    d = join(d, ball(x, y, side, 6.4, 6.45, 3.15, 1.25), 0.6);
    d = join(d, rod(x, y, side, 7.5, 6.3, 2.0, 0.1, 7.15, 6.45, 4.3, 0.1), 0.12);
  }
  if (x < 2 && x > -5 && y > 1.5 && y < 10 && side > 5.5) d = join(d, ear(x, y, side), 0.3);
  return d;
};

/**
 * The eyes: where each eyeball sits (its middle; z is for the right eye, the left is mirrored),
 * its radius, and the opening between the lids. An adult eyeball is about 24 mm across and the
 * opening between the lids about 30 by 10 mm, its outer corner a little higher than its inner.
 */
export const EYE = { x: 6.4, y: 6.45, z: 3.15, r: 1.15, wide: 1.35, high: 0.5, tilt: 0.06 } as const;

/** Half the height of the opening between the lids, `u` cm out from the middle of the eye (0 past its corners). */
export function eyeOpening(u: number): number {
  const t = 1 - (u / EYE.wide) ** 2;
  return t > 0 ? EYE.high * Math.pow(t, 0.65) : 0;
}

/**
 * Where a point of the face is against the opening of the eye on its side: `inside` is true for
 * the lid that closes over the eye, with `v` from 0 at the lower lid to 1 at the upper; `edge` is
 * how near (0..1) a point just outside is to the rim of the opening.
 */
export function eyeLid(x: number, y: number, z: number): { inside: boolean; v: number; edge: number } {
  const u = Math.abs(z) - EYE.z;
  const w = y - EYE.y - EYE.tilt * u;
  const h = eyeOpening(u);
  const front = x > EYE.x + 0.45;
  if (front && h > 0 && Math.abs(w) < h) return { inside: true, v: (w + h) / (2 * h), edge: 0 };
  const out = Math.abs(w) - h;
  const edge = x > EYE.x + 0.3 && Math.abs(u) < EYE.wide + 0.15 ? Math.max(0, 1 - out / 0.16) : 0;
  return { inside: false, v: 0, edge };
}

/** How much a point of the face follows the jaw: 1 on the chin, 0 above the mouth and behind the jaw. */
export function jawShare(x: number, y: number, z: number): number {
  const side = Math.abs(z);
  // At the mouth the change from "upper" to "lower" is the lip line itself; out on the cheek it
  // is spread over the height of the cheek.
  const spread = 0.1 + 1.7 * step(1.5, 3.6, side);
  const below = step(-1, 1, -y / spread);
  const front = step(-2.5, 2.0, x);
  const neck = step(-9.5, -5.2, y);
  return below * front * neck;
}

/** How much a point of the face follows the lips: 1 at the lip line, fading into the cheeks and chin. */
export function lipShare(x: number, y: number, z: number): number {
  const side = Math.abs(z);
  const near = Math.exp(-((y / 1.1) ** 2));
  return near * (1 - step(2.0, 3.4, side)) * step(6.2, 8.0, x);
}

function step(a: number, b: number, v: number): number {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
