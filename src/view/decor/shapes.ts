// The few shapes the decorations are made of, as particles: a surface given by two parameters
// (a band, a brim, a dome, a cone), a tube along a line (a wire, a chain, a rim), a ball (a pearl,
// a gem, a flower). Each is sampled evenly over its area, so a shape is as dense everywhere and
// reads as the glowing shell the anatomy is.
import { Dust, KIND, type Part } from "../dust.ts";
import { seeded } from "../curve.ts";
import type { ItemId } from "./outfit.ts";

export type Vec = readonly [number, number, number];

export const add = (a: Vec, b: Vec, k = 1): Vec => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
export const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a: Vec): number => Math.hypot(a[0], a[1], a[2]);
export const unit = (a: Vec): Vec => {
  const l = length(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const lerp = (a: Vec, b: Vec, t: number): Vec => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** How a particle of a shape is drawn. */
export interface Look {
  /** Its size in cm (as the anatomy's; about 1). */
  size?: number;
  /** 0 the item's own colour .. 1 its accent. */
  accent?: number;
  /** 0 .. 1: how much it glints. */
  glint?: number;
  /** 0 .. 15: a rim or an edge, drawn as a line of light. */
  crease?: number;
}

/** One item being made: its particles and a few marks for framing it. */
export class Maker {
  readonly random: () => number;
  private dust: Dust<ItemId>;
  private made = 0;

  /** `dense` multiplies every count asked of the shapes: how thick this item's cloud is. */
  constructor(readonly id: ItemId, seed: number, readonly dense = 1) {
    this.random = seeded(seed);
    this.dust = new Dust<ItemId>(id, this.random);
  }

  /** Add one particle at p, its surface facing n. */
  put(p: Vec, n: Vec, look: Look = {}): void {
    const size = (look.size ?? 0.8) * (0.8 + 0.4 * this.random());
    this.dust.add(KIND.worn, p[0], p[1], p[2], n[0], n[1], n[2], size, look.accent ?? 0, look.glint ?? 0, 4 * Math.max(0, Math.min(15, Math.round(look.crease ?? 0))));
    // A few of its places, so the frame can make room for it.
    if (this.made++ % 97 === 0) this.dust.mark(p[0], p[1], p[2]);
  }

  finish(): Part<ItemId> {
    return this.dust.finish();
  }
}

/**
 * `count` particles over the surface f(u, v), u and v each 0..1, evenly by area. `look` may
 * change over the surface. The surface's normal is the cross product of its two directions;
 * `flip` turns it round (it only matters for which side is lit).
 */
export function surface(m: Maker, f: (u: number, v: number) => Vec, count: number, look: Look | ((u: number, v: number) => Look) = {}, keep?: (u: number, v: number) => number): void {
  const e = 1e-3;
  const areaAt = (u: number, v: number) => {
    const p = f(u, v);
    const du = scale(sub(f(Math.min(1, u + e), v), f(Math.max(0, u - e), v)), 1 / (Math.min(1, u + e) - Math.max(0, u - e)));
    const dv = scale(sub(f(u, Math.min(1, v + e)), f(u, Math.max(0, v - e))), 1 / (Math.min(1, v + e) - Math.max(0, v - e)));
    const n = cross(du, dv);
    return { p, n, a: length(n) };
  };
  // The largest patch first, so the rest can be kept in proportion to it.
  let most = 1e-9;
  for (let i = 0; i < 400; i++) most = Math.max(most, areaAt(m.random(), m.random()).a);
  most *= 1.15;
  let made = 0;
  count = Math.round(count * m.dense);
  for (let tries = 0; made < count && tries < count * 60; tries++) {
    const u = m.random();
    const v = m.random();
    const s = areaAt(u, v);
    if (m.random() * most > s.a) continue;
    if (keep && m.random() > keep(u, v)) continue;
    m.put(s.p, s.a > 1e-9 ? scale(s.n, 1 / s.a) : [0, 1, 0], typeof look === "function" ? look(u, v) : look);
    made++;
  }
}

/** A ball: a shell of radius r, a little denser toward `light` if given (a pearl's sheen). */
export function ball(m: Maker, c: Vec, r: number, count: number, look: Look = {}): void {
  count = Math.round(count * m.dense);
  for (let i = 0; i < count; i++) {
    const z = 2 * m.random() - 1;
    const a = m.random() * Math.PI * 2;
    const s = Math.sqrt(1 - z * z);
    const n: Vec = [s * Math.cos(a), z, s * Math.sin(a)];
    m.put(add(c, n, r), n, look);
  }
}

/** A path through points, as a function of 0..1 along its length (straight between the points). */
export function path(points: readonly Vec[]): { at(t: number): Vec; length: number } {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + length(sub(points[i], points[i - 1])));
  const total = lengths[lengths.length - 1] || 1;
  return {
    length: total,
    at(t: number): Vec {
      const d = Math.max(0, Math.min(1, t)) * total;
      let i = 1;
      while (i < lengths.length - 1 && lengths[i] < d) i++;
      const span = lengths[i] - lengths[i - 1] || 1;
      return lerp(points[i - 1], points[i], (d - lengths[i - 1]) / span);
    },
  };
}

/** A smooth curve through points (Catmull-Rom), cut into `per` pieces between each two. */
export function smoothPath(points: readonly Vec[], per = 8, closed = false): Vec[] {
  const n = points.length;
  const at = (i: number) => (closed ? points[((i % n) + n) % n] : points[Math.max(0, Math.min(n - 1, i))]);
  const out: Vec[] = [];
  const spans = closed ? n : n - 1;
  for (let i = 0; i < spans; i++) {
    for (let j = 0; j < per; j++) {
      const t = j / per;
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      const t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((k) => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t3)) as unknown as Vec);
    }
  }
  out.push(closed ? points[0] : points[n - 1]);
  return out;
}

/** A tube of radius r along a path: a wire, a rim, a chain seen from afar. */
export function tube(m: Maker, points: readonly Vec[], r: number, count: number, look: Look = {}): void {
  const line = path(points);
  count = Math.round(count * m.dense);
  for (let i = 0; i < count; i++) {
    const t = m.random();
    const p = line.at(t);
    const ahead = unit(sub(line.at(Math.min(1, t + 0.002)), line.at(Math.max(0, t - 0.002))));
    // Any direction across the line.
    const side = unit(cross(ahead, Math.abs(ahead[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    const other = cross(ahead, side);
    const a = m.random() * Math.PI * 2;
    const n = add(scale(side, Math.cos(a)), other, Math.sin(a));
    m.put(add(p, n, r), n, look);
  }
}

/** Beads along a path, `gap` cm apart: a chain, a string of pearls. Returns where each bead is. */
export function beads(m: Maker, points: readonly Vec[], gap: number, r: number, each: number, look: Look = {}): Vec[] {
  const line = path(points);
  const n = Math.max(1, Math.round(line.length / gap));
  const at: Vec[] = [];
  for (let i = 0; i <= n; i++) {
    const c = line.at(i / n);
    at.push(c);
    ball(m, c, r, each, look);
  }
  return at;
}

/** A circle of radius r about c in the plane of the directions a and b, as points. */
export function circle(c: Vec, a: Vec, b: Vec, r: number, pieces = 48, from = 0, to = Math.PI * 2): Vec[] {
  return Array.from({ length: pieces + 1 }, (_, i) => {
    const t = from + ((to - from) * i) / pieces;
    return add(add(c, a, r * Math.cos(t)), b, r * Math.sin(t));
  });
}
