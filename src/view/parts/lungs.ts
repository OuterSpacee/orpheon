// The lungs: two soft shells, and inside each the tree of airways that the breath climbs.
// The tree is grown, not drawn: a branch forks into two shorter ones, again and again, turning
// back inward whenever it would leave the lung.
import { seeded, smoothstep } from "../curve.ts";
import { Dust, KIND, type Part } from "../dust.ts";

const TOP = -14.5;
const TALL = 23;
/** Where the airways enter each lung (the shader breathes the lungs about these points). */
const ROOT = [-0.3, -23.5, 3.6] as const;

/** How wide a lung is at a height, 0 its tip to 1 its base: a rounded cone. */
const girth = (v: number) => Math.pow(Math.sin((Math.PI / 2) * Math.min(1, v / 0.7)), 0.75) * (1 - 0.1 * smoothstep(0.85, 1, v));
/** Is this point inside a lung (given |z|)? */
function inside(x: number, y: number, z: number): boolean {
  const v = (TOP - y) / TALL;
  if (v < 0.02 || v > 0.97) return false;
  const g = girth(v) * 0.9;
  const dz = z - 7.3;
  return ((x + 1) / (6 * g)) ** 2 + (dz / ((dz < 0 ? 3.0 : 4.9) * g)) ** 2 < 1;
}

export function makeLungs(count: number): Part {
  const random = seeded(97);
  const dust = new Dust("lungs", random, count);

  // The shells.
  const shell = Math.round(count * 0.42);
  for (let i = 0; i < shell; i++) {
    const side = random() < 0.5 ? 1 : -1;
    const a = random() * Math.PI * 2;
    const base = random() < 0.13;
    const v = base ? 1 : Math.pow(random(), 0.8);
    const r = base ? Math.sqrt(random()) : 1;
    const g = girth(v) * r;
    const x = -1 + 6 * g * Math.cos(a);
    const out = Math.sin(a);
    // The side facing the heart is flatter.
    const zl = (out < 0 ? 3.0 : 4.9) * g * out;
    // The base is hollowed where it sits on the diaphragm.
    const y = TOP - TALL * v + (base ? 2.6 * (1 - r * r) : 0);
    // A fine seam where the lobes meet.
    if (!base && Math.abs(y - (-25 + 0.9 * x)) < 0.22) continue;
    const z = side * (7.3 + zl);
    dust.add(KIND.lung, x, y, z, Math.cos(a), base ? -1 : 0.25, out * side, 0.8 + random() * 0.4, 0, 0, 0);
    if (i % 70 === 0) dust.mark(x, y, z);
  }

  // The air in the windpipe, on its way down to the fork.
  const pipe = Math.round(count * 0.05);
  for (let i = 0; i < pipe; i++) {
    const h = random();
    const y = -8.8 - h * 12.7;
    const a = random() * Math.PI * 2;
    const r = 0.75 * Math.sqrt(random());
    dust.add(KIND.lung, 1.5 + (y + 10.5) * 0.115 + r * Math.cos(a), y, r * Math.sin(a), 0, 0, 0, 0.9, h * 0.1, 0, 1);
  }

  // The trees. Scatter the places the smallest airways must reach, then join them up: from where
  // it stands, an airway goes halfway to the middle of the places it still has to serve, splits
  // them into two groups, and sends a branch on to each.
  const ends: number[] = [];
  while (ends.length < 3 * 420) {
    const x = -7 + random() * 12;
    const y = TOP - random() * TALL;
    const z = 4.3 + random() * 8;
    if (inside(x, y, z)) ends.push(x, y, z);
  }
  // Each stretch of airway: from, to, how many ends it serves, how far it is from the windpipe.
  const stretches: number[] = [];
  let length = 0;
  function reach(from: number, to: number, x: number, y: number, z: number, travelled: number): void {
    const n = to - from;
    if (n <= 0) return;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let i = from; i < to; i++) {
      cx += ends[3 * i];
      cy += ends[3 * i + 1];
      cz += ends[3 * i + 2];
    }
    const part = n === 1 ? 1 : 0.5;
    const ex = x + (cx / n - x) * part;
    const ey = y + (cy / n - y) * part;
    const ez = z + (cz / n - z) * part;
    const l = Math.hypot(ex - x, ey - y, ez - z);
    stretches.push(x, y, z, ex, ey, ez, n, travelled);
    length += l;
    if (n === 1) return;
    // Split the ends in two along the direction they are most spread out in.
    let axis = 0;
    let widest = 0;
    for (let k = 0; k < 3; k++) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = from; i < to; i++) {
        lo = Math.min(lo, ends[3 * i + k]);
        hi = Math.max(hi, ends[3 * i + k]);
      }
      if (hi - lo > widest) {
        widest = hi - lo;
        axis = k;
      }
    }
    const order = Array.from({ length: n }, (_, i) => from + i).sort((p, q) => ends[3 * p + axis] - ends[3 * q + axis]);
    const sorted = order.flatMap((i) => [ends[3 * i], ends[3 * i + 1], ends[3 * i + 2]]);
    for (let i = 0; i < sorted.length; i++) ends[3 * from + i] = sorted[i];
    const half = from + (n >> 1);
    reach(from, half, ex, ey, ez, travelled + l);
    reach(half, to, ex, ey, ez, travelled + l);
  }
  reach(0, ends.length / 3, ROOT[0], ROOT[1], ROOT[2], 0);
  const perCm = (count - shell - pipe) / 2 / length;
  for (let k = 0; k < stretches.length; k += 8) {
    const [ax, ay, az, bx, by, bz, serves, travelled] = stretches.slice(k, k + 8);
    const l = Math.hypot(bx - ax, by - ay, bz - az);
    // The big airways are wide and bright; the last twigs are a single thread.
    const thick = 0.07 * Math.pow(serves, 0.42);
    const points = Math.max(1, Math.round(l * perCm * (0.6 + 0.25 * Math.log2(serves + 1))));
    for (let i = 0; i < points; i++) {
      const t = random();
      const far = Math.min(1, 0.12 + (travelled + t * l) / 24);
      const jx = (random() - 0.5) * thick;
      const jy = (random() - 0.5) * thick;
      const jz = (random() - 0.5) * thick;
      for (const side of [1, -1]) {
        dust.add(KIND.lung, ax + (bx - ax) * t + jx, ay + (by - ay) * t + jy, side * (az + (bz - az) * t + jz), 0, 0, 0, 0.7 + 0.08 * Math.log2(serves + 1), far, 0, 1);
      }
    }
  }
  return dust.finish();
}
