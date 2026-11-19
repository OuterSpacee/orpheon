// Where things sit on the head: measured off the head's own field (head.ts), so a hat band hugs
// the skull it is on and an earring hangs from the lobe that is there. Every body's head is the
// same shape at its own size (cast.ts), so fitting it once fits them all.
import { pillow, skin } from "../head.ts";
import type { Field } from "../solid.ts";
import { add, cross, scale, sub, unit, type Vec } from "./shapes.ts";

/** How far from `from` along the unit direction `dir` the surface of `field` is (from inside it). */
export function reach(field: Field, from: Vec, dir: Vec, far = 24): number {
  let a = 0;
  let b = 0;
  // Step out until outside, then halve the step until the crossing is found.
  for (let d = 0.25; d <= far; d += 0.25) {
    if (field(from[0] + dir[0] * d, from[1] + dir[1] * d, from[2] + dir[2] * d) > 0) {
      b = d;
      a = d - 0.25;
      break;
    }
  }
  if (b === 0) return far;
  for (let i = 0; i < 24; i++) {
    const m = (a + b) / 2;
    if (field(from[0] + dir[0] * m, from[1] + dir[1] * m, from[2] + dir[2] * m) > 0) b = m;
    else a = m;
  }
  return (a + b) / 2;
}

/** Which way the surface of `field` faces at p. */
export function normalAt(field: Field, p: Vec): Vec {
  const e = 0.02;
  return unit([
    field(p[0] + e, p[1], p[2]) - field(p[0] - e, p[1], p[2]),
    field(p[0], p[1] + e, p[2]) - field(p[0], p[1] - e, p[2]),
    field(p[0], p[1], p[2] + e) - field(p[0], p[1], p[2] - e),
  ]);
}

/** How far outside the skin p is, in cm (negative inside), measured along the skin's own normal. */
export function clearance(p: Vec, field: Field = skin): number {
  const n = normalAt(field, p);
  // The field is not a true distance everywhere; find the surface along its normal instead.
  const inside = field(p[0], p[1], p[2]) < 0;
  const dir: Vec = inside ? n : scale(n, -1);
  const from = p;
  let d = 0;
  for (; d < 6; d += 0.02) {
    const q = add(from, dir, d);
    if ((field(q[0], q[1], q[2]) < 0) !== inside) break;
  }
  return inside ? -d : d;
}

/** Move p out of the skin until it stands `gap` cm clear of it (a point already clear stays). */
export function pushOut(p: Vec, gap: number, field: Field = skin): Vec {
  let q = p;
  for (let i = 0; i < 40; i++) {
    const c = clearance(q, field);
    if (c >= gap - 0.01) return q;
    q = add(q, normalAt(field, q), gap - c);
  }
  return q;
}

/**
 * A band round the head: the line where a plane through (-1, `height`, 0), its top leaned back by
 * `lean` radians, meets the skull. It gives the plane's directions (`up` along its normal, `front`
 * toward the face, `side` toward the right ear) and, at any angle round the head (0 the front,
 * π/2 the right side), how far the skull is from the middle, smoothed so a hat is not lumpy.
 */
export interface Band {
  middle: Vec;
  up: Vec;
  front: Vec;
  side: Vec;
  /** The skull's distance from the middle at angle a. */
  radius(a: number): number;
  /** The point at angle a, `out` cm beyond the skull and `lift` cm up the band's normal. */
  at(a: number, out?: number, lift?: number): Vec;
  /** The outward direction at angle a, in the band's plane. */
  outward(a: number): Vec;
}

const STEPS = 180;

export function band(height: number, lean: number, back = -1, smooth = 3): Band {
  const middle: Vec = [back, height, 0];
  const up: Vec = [-Math.sin(lean), Math.cos(lean), 0];
  const front: Vec = [Math.cos(lean), Math.sin(lean), 0];
  const side: Vec = [0, 0, 1];
  const outward = (a: number): Vec => add(scale(front, Math.cos(a)), side, Math.sin(a));
  let table = Float64Array.from({ length: STEPS }, (_, i) => reach(pillow, middle, outward((i / STEPS) * Math.PI * 2)));
  // A few passes of a small average round the ring.
  for (let pass = 0; pass < smooth; pass++) {
    const next = new Float64Array(STEPS);
    for (let i = 0; i < STEPS; i++) {
      let sum = 0;
      for (let k = -3; k <= 3; k++) sum += table[(i + k + STEPS) % STEPS] * (4 - Math.abs(k));
      next[i] = sum / 16;
    }
    table = next;
  }
  // The average shrinks a ring only where it bends in; never let it sink into the skull.
  for (let i = 0; i < STEPS; i++) table[i] = Math.max(table[i], reach(pillow, middle, outward((i / STEPS) * Math.PI * 2)));
  const radius = (a: number) => {
    const at = (((a / (Math.PI * 2)) % 1) + 1) % 1 * STEPS;
    const i = Math.floor(at) % STEPS;
    const t = at - Math.floor(at);
    return table[i] * (1 - t) + table[(i + 1) % STEPS] * t;
  };
  return {
    middle, up, front, side, radius, outward,
    at: (a, out = 0, lift = 0) => add(add(middle, outward(a), radius(a) + out), up, lift),
  };
}

/** The skull seen from a point inside it: where it is in a direction, and which way it faces there. */
export function onSkull(dir: Vec, from: Vec = [-1, 8, 0], field: Field = pillow): { p: Vec; n: Vec; r: number } {
  const d = unit(dir);
  const r = reach(field, from, d);
  const p = add(from, d, r);
  return { p, n: normalAt(field, p), r };
}

/** A frame at p: `n` the way out, and two directions across it. */
export function frameAt(n: Vec, along: Vec = [0, 1, 0]): { n: Vec; a: Vec; b: Vec } {
  const nn = unit(n);
  const a = unit(cross(along, nn));
  return { n: nn, a, b: cross(nn, a) };
}

/** Where the earrings hang: just above the bottom of each lobe, on its outer face (z for the right ear). */
export const LOBE: Vec = [-0.95, 2.5, 7.05];

/** The middle of the right nostril's wing, and its outer face. */
export const NOSTRIL: Vec = [9.45, 3.05, 1.62];

/** Between the brows. */
export const BROW_MIDDLE: Vec = [8.9, 9.1, 0];

/** The middle of each eye (the right one; the left is mirrored in z). */
export { EYE } from "../head.ts";

/** Where p is, mirrored to the left side. */
export const mirror = (p: Vec): Vec => [p[0], p[1], -p[2]];

/** p moved `d` cm toward q. */
export const toward = (p: Vec, q: Vec, d: number): Vec => add(p, unit(sub(q, p)), d);

/**
 * The skull above a band, seen from the band's middle: at angle `a` round the head and `e` up from
 * the band's plane (0) to its normal (π/2), the direction and how far the skull is. Worked out on a
 * grid once, and read back blended, since a hat asks it thousands of times.
 */
export function cap(b: Band): (a: number, e: number) => { dir: Vec; r: number } {
  const A = 96;
  const E = 32;
  const dirOf = (a: number, e: number): Vec => add(scale(b.outward(a), Math.cos(e)), b.up, Math.sin(e));
  const grid = new Float64Array((A + 1) * (E + 1));
  for (let j = 0; j <= E; j++) for (let i = 0; i <= A; i++) grid[j * (A + 1) + i] = reach(pillow, b.middle, dirOf((i / A) * Math.PI * 2, (j / E) * (Math.PI / 2)));
  return (a, e) => {
    const fa = ((((a / (Math.PI * 2)) % 1) + 1) % 1) * A;
    const fe = Math.max(0, Math.min(E - 1e-6, (e / (Math.PI / 2)) * E));
    const i = Math.min(A - 1, Math.floor(fa));
    const j = Math.floor(fe);
    const ta = fa - i;
    const te = fe - j;
    const g = (ii: number, jj: number) => grid[jj * (A + 1) + ii];
    const r = (g(i, j) * (1 - ta) + g(i + 1, j) * ta) * (1 - te) + (g(i, j + 1) * (1 - ta) + g(i + 1, j + 1) * ta) * te;
    return { dir: dirOf(a, e), r };
  };
}
