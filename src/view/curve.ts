// Small numeric helpers shared by the anatomy: a seeded random source and smooth curves through
// hand-placed points. Nothing here knows about the body.

/** A seeded random source (mulberry32), so the cloud is the same on every load. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export function smoothstep(a: number, b: number, v: number): number {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * A smooth curve y(x) through knots given as [x, y, x, y, …] with rising x. Between knots it is a
 * cubic that keeps the slope continuous (Catmull-Rom on uneven knots); past the ends it holds.
 */
export function curve(knots: readonly number[]): (x: number) => number {
  const n = knots.length / 2;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const ms = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = knots[2 * i];
    ys[i] = knots[2 * i + 1];
  }
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    ms[i] = (ys[b] - ys[a]) / (xs[b] - xs[a] || 1);
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h * ms[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h * ms[i + 1]
    );
  };
}

/** A closed smooth outline through points [x, y, …]: each span is cut into `per` straight pieces. */
export function closedOutline(points: readonly number[], per: number): Float64Array {
  const n = points.length / 2;
  const out = new Float64Array(n * per * 2);
  const at = (i: number, k: number) => points[2 * (((i % n) + n) % n) + k];
  let o = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < per; j++) {
      const t = j / per;
      const t2 = t * t;
      const t3 = t2 * t;
      for (let k = 0; k < 2; k++) {
        const p0 = at(i - 1, k);
        const p1 = at(i, k);
        const p2 = at(i + 1, k);
        const p3 = at(i + 2, k);
        out[o++] = 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
      }
    }
  }
  return out;
}

/** Signed distance from (x, y) to a closed outline [x, y, …]: negative inside. */
export function outlineDistance(poly: Float64Array, x: number, y: number): number {
  const n = poly.length / 2;
  let best = Infinity;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = poly[2 * j];
    const ay = poly[2 * j + 1];
    const bx = poly[2 * i];
    const by = poly[2 * i + 1];
    const ex = bx - ax;
    const ey = by - ay;
    const wx = x - ax;
    const wy = y - ay;
    const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey || 1), 0, 1);
    const dx = wx - ex * t;
    const dy = wy - ey * t;
    const d = dx * dx + dy * dy;
    if (d < best) best = d;
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside ? -Math.sqrt(best) : Math.sqrt(best);
}

/**
 * The same distance, worked out once on a grid and read back with bilinear blending: the head's
 * outline has hundreds of pieces and is asked about millions of times while the cloud is made.
 */
export function distanceGrid(poly: Float64Array, x0: number, y0: number, x1: number, y1: number, step: number) {
  const w = Math.ceil((x1 - x0) / step) + 1;
  const h = Math.ceil((y1 - y0) / step) + 1;
  const cells = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) cells[j * w + i] = outlineDistance(poly, x0 + i * step, y0 + j * step);
  return (x: number, y: number) => {
    const fx = clamp((x - x0) / step, 0, w - 1.001);
    const fy = clamp((y - y0) / step, 0, h - 1.001);
    const i = fx | 0;
    const j = fy | 0;
    const tx = fx - i;
    const ty = fy - j;
    const k = j * w + i;
    return (cells[k] * (1 - tx) + cells[k + 1] * tx) * (1 - ty) + (cells[k + w] * (1 - tx) + cells[k + w + 1] * tx) * ty;
  };
}
