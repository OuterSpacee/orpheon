// Shapes described by a field: a function that is negative inside the shape, positive outside
// and (roughly) the distance to its surface. Simple fields are blended into a head, and particles
// are scattered on the surface where the blend crosses zero.

export type Field = (x: number, y: number, z: number) => number;

/** The nearer of two shapes, with their join rounded over a width k. */
export function join(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
/** Shape a with shape b carved out of it, the rim rounded over a width k. */
export function carve(a: number, b: number, k: number): number {
  return -join(-a, b, k);
}
/** Only where both shapes are, the edge rounded over a width k. */
export function both(a: number, b: number, k: number): number {
  return -join(-a, -b, k);
}

export function ball(x: number, y: number, z: number, cx: number, cy: number, cz: number, r: number): number {
  return Math.hypot(x - cx, y - cy, z - cz) - r;
}
/** A ball stretched to radii (rx, ry, rz). Close to a true distance near its surface. */
export function egg(x: number, y: number, z: number, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number): number {
  const px = (x - cx) / rx;
  const py = (y - cy) / ry;
  const pz = (z - cz) / rz;
  const k0 = Math.hypot(px, py, pz);
  const k1 = Math.hypot(px / rx, py / ry, pz / rz);
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
}
/** A rod from a to b whose radius runs from ra to rb. */
export function rod(
  x: number, y: number, z: number,
  ax: number, ay: number, az: number, ra: number,
  bx: number, by: number, bz: number, rb: number,
): number {
  const ex = bx - ax;
  const ey = by - ay;
  const ez = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey + (z - az) * ez) / (ex * ex + ey * ey + ez * ez)));
  return Math.hypot(x - ax - ex * t, y - ay - ey * t, z - az - ez * t) - (ra + (rb - ra) * t);
}

export interface Scatter {
  /** The box to look in: [x0, y0, z0, x1, y1, z1]. */
  box: readonly number[];
  count: number;
  random: () => number;
  /** The chance (0..1) of keeping a point here: thins the cloud where it should fade. */
  keep?: (x: number, y: number, z: number) => number;
  /** `bend` is how sharply the surface curves here, 0 (flat, or as gently as a skull) to 1 (the rim of an ear). */
  emit: (x: number, y: number, z: number, nx: number, ny: number, nz: number, bend: number) => void;
}

const E = 0.02;
/** The distance over which the bend of a surface is felt: about the size of a nostril. */
const FEEL = 0.3;

/**
 * Scatter `count` points evenly over the surface of a field. Points are thrown into the box,
 * those close to the surface are slid onto it, and each is handed over with the way the surface
 * faces there.
 */
export function scatterOnSurface(field: Field, s: Scatter): void {
  const [x0, y0, z0, x1, y1, z1] = s.box;
  const band = 0.18;
  let made = 0;
  let tries = 0;
  const limit = s.count * 4000;
  while (made < s.count && tries++ < limit) {
    let x = x0 + s.random() * (x1 - x0);
    let y = y0 + s.random() * (y1 - y0);
    let z = z0 + s.random() * (z1 - z0);
    let d = field(x, y, z);
    if (Math.abs(d) > band * 3) continue;
    let gx = 0;
    let gy = 0;
    let gz = 0;
    let g = 1;
    for (let step = 0; step < 2; step++) {
      gx = (field(x + E, y, z) - field(x - E, y, z)) / (2 * E);
      gy = (field(x, y + E, z) - field(x, y - E, z)) / (2 * E);
      gz = (field(x, y, z + E) - field(x, y, z - E)) / (2 * E);
      g = Math.hypot(gx, gy, gz) || 1;
      // Keep only what started within the band, measured in real distance, so every patch of
      // surface gets its share whatever the field's slope is there.
      if (step === 0 && Math.abs(d) / g > band) {
        d = NaN;
        break;
      }
      const k = d / (g * g);
      x -= gx * k;
      y -= gy * k;
      z -= gz * k;
      d = field(x, y, z);
    }
    if (!(Math.abs(d) < 0.03)) continue;
    if (s.keep && s.random() > s.keep(x, y, z)) continue;
    // How much the field's neighbours differ from it on average is twice the surface's curvature.
    const around = field(x + FEEL, y, z) + field(x - FEEL, y, z) + field(x, y + FEEL, z) + field(x, y - FEEL, z) + field(x, y, z + FEEL) + field(x, y, z - FEEL);
    const bend = Math.abs(around - 6 * d) / (FEEL * FEEL * g);
    s.emit(x, y, z, gx / g, gy / g, gz / g, Math.max(0, Math.min(1, (bend - 0.6) / 2.4)));
    made++;
  }
}

export interface Slice {
  /** The box to look in, in the slice down the middle (z = 0): [x0, y0, x1, y1]. */
  box: readonly number[];
  count: number;
  random: () => number;
  /** How far under the surface the points reach. They crowd toward the surface. */
  depth: number;
  keep?: (x: number, y: number) => number;
  emit: (x: number, y: number, depth: number) => void;
}

/**
 * Scatter points in the slice down the middle of a field, inside it and near its surface: the
 * cut face of a shell, which the view shows when the head is sliced open.
 */
export function scatterInSlice(field: Field, s: Slice): void {
  const [x0, y0, x1, y1] = s.box;
  let made = 0;
  let tries = 0;
  const limit = s.count * 4000;
  while (made < s.count && tries++ < limit) {
    const x = x0 + s.random() * (x1 - x0);
    const y = y0 + s.random() * (y1 - y0);
    const d = field(x, y, 0);
    if (d > 0 || d < -s.depth) continue;
    const under = -d / s.depth;
    // Mostly at the surface, a few deeper.
    if (s.random() > Math.exp(-under * 2.2)) continue;
    if (s.keep && s.random() > s.keep(x, y)) continue;
    s.emit(x, y, under);
    made++;
  }
}
