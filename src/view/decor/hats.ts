// What can be worn on the head, each fitted to the skull by a band (fit.ts): the line round the
// head where the hat sits, and above it the skull it covers. Heights are in cm up the band's
// normal; angles run round the head from the face (0) toward the right ear (π/2).
import { pillow } from "../head.ts";
import { band, cap, reach, type Band } from "./fit.ts";
import { add, ball, beads, circle, cross, lerp, scale, smoothPath, sub, surface, tube, unit, type Look, type Maker, type Vec } from "./shapes.ts";

const TAU = Math.PI * 2;

/**
 * Where each hat's band sits (its height and lean, as band() takes them), and how much the hat
 * hides the skin above it: a hat is not glass all the way through, and the head under a top hat
 * dimmed is what makes it read as a hat on a head and not two outlines drawn over each other.
 */
export const BANDS = {
  tophat: { height: 13.0, lean: 0.15, cover: 0.6 },
  beanie: { height: 10.83, lean: 0.194, cover: 0.6 },
  santa: { height: 11.4, lean: 0.2, cover: 0.6 },
  captain: { height: 12.4, lean: 0.12, cover: 0.6 },
  crown: { height: 13.9, lean: 0.1, cover: 0.3 },
  garland: { height: 13.3, lean: 0.16, cover: 0.3 },
  turban: { height: 10.94, lean: 0.25, cover: 0.65 },
} as const;
const bandOf = (id: keyof typeof BANDS) => band(BANDS[id].height, BANDS[id].lean);

/** A ring of points round a band, `out` beyond the skull and `lift` up. */
const ringOf = (b: Band, out: number | ((a: number) => number), lift: number | ((a: number) => number), from = 0, to = TAU, pieces = 120): Vec[] =>
  Array.from({ length: pieces + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / pieces;
    return b.at(a, typeof out === "number" ? out : out(a), typeof lift === "number" ? lift : lift(a));
  });

/** Something soft and round (a pompom, a fur trim): points through the volume of a ball, most near its outside. */
function fluff(m: Maker, c: Vec, r: number, count: number, look: Look): void {
  count = Math.round(count * m.dense);
  for (let i = 0; i < count; i++) {
    const z = 2 * m.random() - 1;
    const a = m.random() * TAU;
    const s = Math.sqrt(1 - z * z);
    const n: Vec = [s * Math.cos(a), z, s * Math.sin(a)];
    m.put(add(c, n, r * (1 - 0.45 * m.random() ** 2)), n, look);
  }
}

/** A top hat: a tall crown, a little wider at the top, a band of ribbon, and a brim curled up at the sides. */
export function topHat(m: Maker): void {
  const b = bandOf("tophat");
  const H = 12.5;
  const wide = (a: number, t: number) => b.radius(a) + 0.35 + 0.5 * t;
  const crownAt = (a: number, t: number): Vec => add(add(b.middle, b.outward(a), wide(a, t)), b.up, t * H);
  surface(m, (u, v) => crownAt(u * TAU, v), 5200, (_u, v) => (v < 0.12 ? { accent: 1, crease: v > 0.1 ? 9 : 0 } : { crease: v > 0.975 ? 12 : 0 }));
  // The top, and its rim.
  surface(m, (u, v) => add(add(b.middle, b.outward(u * TAU), wide(u * TAU, 1) * Math.sqrt(v)), b.up, H), 1300, { size: 0.75 });
  tube(m, ringOf(b, (a) => wide(a, 1) - b.radius(a), H), 0.08, 600, { crease: 13 });
  // The brim: narrower at the front and back, curled up at the sides.
  const brimWide = (a: number) => 3.4 + 0.9 * Math.sin(a) ** 2;
  const brimAt = (a: number, s: number): Vec => {
    const r = wide(a, 0) + brimWide(a) * s;
    return add(add(b.middle, b.outward(a), r), b.up, -0.15 + 1.5 * s * s * Math.sin(a) ** 2 - 0.35 * s * Math.cos(a) ** 2);
  };
  surface(m, (u, v) => brimAt(u * TAU, v), 2600, (_u, v) => ({ crease: v > 0.96 ? 12 : 0 }));
  tube(m, Array.from({ length: 121 }, (_, i) => brimAt((i / 120) * TAU, 1)), 0.09, 700, { crease: 14 });
  tube(m, ringOf(b, (a) => wide(a, 0) - b.radius(a) + 0.02, 0), 0.07, 400, { crease: 10, accent: 1 });
}

/** A knitted beanie: ribs running up to a pompom, and a deep folded cuff. */
export function beanie(m: Maker): void {
  const b = bandOf("beanie");
  const skull = cap(b);
  const cuff = 0.3;
  const dome = (a: number, e: number): Vec => {
    const s = skull(a, e);
    // The knit stands a little off the hair, and slouches at the top.
    return add(b.middle, s.dir, s.r + 0.45 + 0.7 * Math.sin(e) ** 2);
  };
  // The ribs: the knit runs up in lines that meet at the top.
  const RIBS = 44;
  surface(m, (u, v) => dome(u * TAU, cuff + (Math.PI / 2 - cuff) * v), 6800, { size: 0.75 }, (u) => 0.35 + 0.65 * Math.cos(u * TAU * RIBS * 0.5) ** 4);
  // The cuff: turned up, standing out from the rest, its own ribs finer.
  const cuffAt = (a: number, t: number): Vec => {
    const s = skull(a, t * cuff * 1.05);
    return add(b.middle, s.dir, s.r + 0.95 + 0.1 * t);
  };
  surface(m, (u, v) => cuffAt(u * TAU, v), 3600, (_u, v) => ({ accent: 1, crease: v < 0.06 || v > 0.94 ? 10 : 0 }), (u) => 0.4 + 0.6 * Math.cos(u * TAU * 36) ** 2);
  tube(m, Array.from({ length: 121 }, (_, i) => cuffAt((i / 120) * TAU, 1)), 0.09, 600, { crease: 12, accent: 1 });
  tube(m, Array.from({ length: 121 }, (_, i) => cuffAt((i / 120) * TAU, 0)), 0.09, 600, { crease: 12, accent: 1 });
  const top = skull(0, Math.PI / 2);
  fluff(m, add(b.middle, top.dir, top.r + 1.15 + 1.7), 1.9, 1700, { accent: 1, size: 0.9 });
}

/** A Santa hat: a soft cone that flops over behind, a thick white trim, and a pompom at its tip. */
export function santaHat(m: Maker): void {
  const b = bandOf("santa");
  const skull = cap(b);
  const back = scale(b.front, -1);
  // The cone's middle line: up, then over and down behind the head, a little to the right.
  const spine = (t: number): Vec => {
    const p0 = add(b.middle, b.up, 1.2);
    const p1 = add(add(b.middle, b.up, 17), back, 2.0);
    const p2 = add(add(add(b.middle, b.up, 8.5), back, 11.5), b.side, 3.0);
    const k = 1 - t;
    return add(add(scale(p0, k * k), p1, 2 * k * t), p2, t * t);
  };
  const size = (t: number) => 0.92 * (1 - t) ** 1.45 + 0.06;
  const coneAt = (a: number, t: number): Vec => {
    const ring = sub(b.at(a, 0.55, 0), b.middle);
    let p = add(spine(t), ring, size(t));
    // Never inside the skull: where the cone would cut into it, it rests on it instead.
    const d = sub(p, b.middle);
    const e = Math.atan2(d[0] * b.up[0] + d[1] * b.up[1], Math.hypot(d[0] * b.front[0] + d[1] * b.front[1], d[2]));
    if (e > 0) {
      const aa = Math.atan2(d[2], d[0] * b.front[0] + d[1] * b.front[1]);
      const s = skull(aa, e);
      const dist = Math.hypot(d[0], d[1], d[2]);
      if (dist < s.r + 0.6) p = add(b.middle, s.dir, s.r + 0.6);
    }
    return p;
  };
  // A few soft folds run down the cloth.
  surface(m, (u, v) => coneAt(u * TAU, v), 7000, (u, v) => ({ crease: Math.abs(Math.sin(u * TAU * 3 + v * 4)) > 0.985 ? 7 : 0 }));
  // The trim: a thick soft roll round the band.
  for (let i = 0; i < 3800 * m.dense; i++) {
    const a = m.random() * TAU;
    const c = b.at(a, 0.9, 0.55);
    const out = b.outward(a);
    const w = m.random() * TAU;
    const n = add(scale(out, Math.cos(w)), b.up, Math.sin(w));
    m.put(add(c, n, 1.05 * (1 - 0.4 * m.random() ** 2)), n, { accent: 1, size: 0.9 });
  }
  fluff(m, spine(1), 1.45, 1300, { accent: 1, size: 0.9 });
}

/** A captain's cap: a white top wider than the head, a dark band with a cord across it, a black peak, and an anchor badge. */
export function captainCap(m: Maker): void {
  const b = bandOf("captain");
  const BAND = 3.0;
  const TOP = 4.9;
  const bandAt = (a: number, t: number) => b.at(a, 0.3 + 0.15 * t, t * BAND);
  surface(m, (u, v) => bandAt(u * TAU, v), 3000, { accent: 1, size: 0.75 });
  // From the band out to the top's rim, which overhangs it, most at the front.
  const rim = (a: number) => b.radius(a) * 1.08 + 1.5 + 0.6 * Math.cos(a);
  const crownAt = (a: number, t: number): Vec => {
    const r = b.radius(a) + 0.45 + (rim(a) - b.radius(a) - 0.45) * Math.sin((t * Math.PI) / 2);
    return add(add(b.middle, b.outward(a), r), b.up, BAND + (TOP - BAND) * t + 0.5 * Math.cos(a) * t);
  };
  surface(m, (u, v) => crownAt(u * TAU, v), 3600);
  const topAt = (a: number, s: number): Vec => add(add(b.middle, b.outward(a), rim(a) * Math.sqrt(s)), b.up, TOP + 0.5 * Math.cos(a) + 0.2 * (1 - s));
  surface(m, (u, v) => topAt(u * TAU, v), 3300, { size: 0.8 });
  tube(m, Array.from({ length: 121 }, (_, i) => topAt((i / 120) * TAU, 1)), 0.12, 900, { crease: 14 });
  tube(m, Array.from({ length: 121 }, (_, i) => bandAt((i / 120) * TAU, 1)), 0.07, 500, { crease: 10, accent: 1 });
  // The peak: a stiff half-moon over the brow, dipping toward its edge.
  const peakAt = (u: number, s: number): Vec => {
    const a = (u - 0.5) * 2.5;
    const reach = 3.6 * Math.cos(a * 0.62) ** 1.5;
    return add(add(b.middle, b.outward(a), b.radius(a) + 0.3 + reach * s), b.up, 0.1 - 0.9 * s - 0.3 * s * s);
  };
  surface(m, peakAt, 2300, (_u, v) => ({ accent: 1, crease: v > 0.95 ? 12 : 0 }));
  tube(m, Array.from({ length: 81 }, (_, i) => peakAt(i / 80, 1)), 0.08, 600, { accent: 1, crease: 13 });
  // The cord across the front of the band, with a button at each end.
  const cord = ringOf(b, 0.5, 0.45, -1.15, 1.15, 60);
  tube(m, cord, 0.08, 500, { glint: 0.6, crease: 6 });
  ball(m, cord[0], 0.2, 60, { glint: 1 });
  ball(m, cord[cord.length - 1], 0.2, 60, { glint: 1 });
  anchor(m, b.at(0, 0.62, 1.65), b.outward(0), b.up);
}

/** An anchor badge about c, on a surface facing `out`, upright along `up`. */
function anchor(m: Maker, c: Vec, out: Vec, up: Vec): void {
  const across = unit(cross(up, out));
  const at = (x: number, y: number): Vec => add(add(c, across, x), up, y);
  const look = { glint: 0.8, crease: 8, size: 0.6 };
  tube(m, [at(0, 0.85), at(0, -0.85)], 0.07, 160, look);
  tube(m, [at(-0.45, 0.45), at(0.45, 0.45)], 0.06, 90, look);
  tube(m, circle(at(0, 1.05), across, up, 0.2, 16), 0.05, 70, look);
  const arms = circle(at(0, -0.2), across, up, 0.68, 24, Math.PI * 1.08, Math.PI * 1.92);
  tube(m, arms, 0.06, 200, look);
  ball(m, arms[0], 0.11, 30, look);
  ball(m, arms[arms.length - 1], 0.11, 30, look);
  // The laurel either side of it, as two arcs of leaves.
  for (const side of [-1, 1]) {
    const arc = circle(at(0, 0.1), across, up, 1.35, 10, side < 0 ? Math.PI * 0.62 : Math.PI * 0.38, side < 0 ? Math.PI * 1.38 : -Math.PI * 0.38);
    for (const p of arc) ball(m, p, 0.12, 14, { glint: 0.5, size: 0.55 });
  }
}

/** A crown: a jewelled band, its points tipped with pearls, two arches over a velvet cap, an orb and a cross. */
export function crown(m: Maker): void {
  const b = bandOf("crown");
  const POINTS = 8;
  const BAND = 1.9;
  const flare = (lift: number) => 0.25 + 0.18 * lift;
  const height = (a: number) => BAND + 2.3 * (0.5 + 0.5 * Math.cos(a * POINTS)) ** 3;
  surface(m, (u, v) => {
    const a = u * TAU;
    const lift = v * height(a);
    return b.at(a, flare(lift), lift);
  }, 5200, (u, v) => ({ crease: v > 0.97 ? 12 : 0, size: 0.75 }));
  // The band's two rims, and the jewels set between them.
  tube(m, ringOf(b, flare(0), 0), 0.12, 700, { crease: 13 });
  tube(m, ringOf(b, flare(BAND), BAND), 0.1, 700, { crease: 12 });
  for (let k = 0; k < POINTS * 2; k++) {
    const a = (k / (POINTS * 2)) * TAU;
    if (k % 2 === 0) ball(m, b.at(a, flare(1) + 0.25, BAND / 2), 0.38, 110, { accent: 1, glint: 1 });
    else ball(m, b.at(a, flare(1) + 0.15, BAND / 2), 0.2, 50, { glint: 1 });
    // A pearl on the tip of each point.
    if (k % 2 === 0) ball(m, b.at(a, flare(height(a)) + 0.05, height(a) + 0.32), 0.3, 80, { glint: 1 });
  }
  // Two arches from the tall points, crossing over the top, and the velvet cap under them.
  const top = add(b.middle, b.up, 7.2);
  for (const a0 of [0, Math.PI / 2]) {
    const arch = smoothPath([
      b.at(a0, flare(height(a0)) - 0.1, height(a0) - 0.2),
      lerp(b.at(a0, 0.5, 6.0), top, 0.35),
      top,
      lerp(b.at(a0 + Math.PI, 0.5, 6.0), top, 0.35),
      b.at(a0 + Math.PI, flare(height(a0 + Math.PI)) - 0.1, height(a0 + Math.PI) - 0.2),
    ], 10);
    tube(m, arch, 0.14, 900, { crease: 11 });
    beads(m, arch, 0.55, 0.09, 8, { glint: 1, size: 0.55 });
  }
  const skull = cap(b);
  surface(m, (u, v) => {
    const s = skull(u * TAU, v * (Math.PI / 2));
    return add(b.middle, s.dir, Math.min(s.r + 1.3, 6.9));
  }, 1800, { accent: 1, size: 0.7 }, (_u, v) => 0.25 + 0.75 * v);
  ball(m, add(top, b.up, 0.75), 0.62, 260, { glint: 0.6, crease: 6 });
  const orbTop = add(top, b.up, 1.4);
  tube(m, [orbTop, add(orbTop, b.up, 1.3)], 0.09, 120, { glint: 1, crease: 8 });
  tube(m, [add(add(orbTop, b.up, 0.85), b.side, -0.45), add(add(orbTop, b.up, 0.85), b.side, 0.45)], 0.08, 90, { glint: 1, crease: 8 });
}

/**
 * A tiara: it rests across the top of the head from ear to ear, a little behind the brow, and
 * rises highest over the middle of the forehead: a band, a row of arches, rays tipped with gems,
 * and a drop-shaped stone at its heart.
 */
export function tiara(m: Maker): void {
  // The line it rests on: a plane through the head leaning forward, from above one ear to above the other.
  const lean: Vec = unit([5.5, 5.0, 0]);
  const from: Vec = add([1.6, 11.8, 0], lean, -2.5);
  const side: Vec = [0, 0, 1];
  const dirOf = (f: number): Vec => add(scale(lean, Math.cos(f)), side, Math.sin(f));
  const SPAN = 1.32;
  const rest = Array.from({ length: 121 }, (_, i) => {
    const f = -SPAN + (2 * SPAN * i) / 120;
    const d = dirOf(f);
    return { f, d, r: reachSkull(from, d) + 0.25 };
  });
  const point = (f: number, h: number): Vec => {
    const k = Math.max(0, Math.min(120, ((f + SPAN) / (2 * SPAN)) * 120));
    const i = Math.min(119, Math.floor(k));
    const t = k - i;
    const r = rest[i].r * (1 - t) + rest[i + 1].r * t;
    return add(from, dirOf(f), r + h);
  };
  const tall = (f: number) => 0.5 + 3.1 * Math.cos(f * 1.1) ** 8;
  const look: Look = { glint: 0.7, crease: 9, size: 0.6 };
  // The band, doubled.
  for (const h of [0, 0.32]) tube(m, Array.from({ length: 121 }, (_, i) => point(-SPAN + (2 * SPAN * i) / 120, h)), 0.06, 500, { crease: 7, glint: 0.4 });
  // Arches between the rays, each as tall as the tiara is there.
  const RAYS = 13;
  for (let k = 0; k < RAYS; k++) {
    const f0 = -SPAN * 0.92 + ((2 * SPAN * 0.92) / RAYS) * k;
    const f1 = f0 + (2 * SPAN * 0.92) / RAYS;
    const fm = (f0 + f1) / 2;
    const arch = Array.from({ length: 17 }, (_, i) => {
      const s = i / 16;
      const f = f0 + (f1 - f0) * s;
      return point(f, 0.32 + Math.sin(Math.PI * s) * tall(fm) * 0.62);
    });
    tube(m, arch, 0.05, 260, look);
    // A small loop inside each arch.
    ball(m, point(fm, 0.32 + tall(fm) * 0.3), 0.1, 18, { glint: 1, size: 0.5 });
    // The ray between this arch and the next, and the gem on its tip.
    if (k > 0) {
      tube(m, [point(f0, 0.32), point(f0, 0.32 + tall(f0) * 0.95)], 0.045, 130, look);
      ball(m, point(f0, 0.45 + tall(f0) * 0.95), 0.16, 50, { glint: 1, size: 0.55 });
    }
  }
  // The stone at its heart, in a ring of tiny ones.
  const heart = point(0, 1.55);
  const facing = dirOf(0);
  const across = side;
  const along = unit(cross(across, facing));
  const drop = Array.from({ length: 31 }, (_, i) => {
    const t = (i / 30) * TAU;
    return add(add(heart, across, 0.42 * Math.sin(t) * (1 - 0.35 * Math.cos(t))), along, -0.55 * Math.cos(t));
  });
  surface(m, (u, v) => lerp(heart, drop[Math.min(30, Math.floor(u * 30))], v), 220, { accent: 1, glint: 1, size: 0.55 });
  tube(m, drop, 0.05, 120, { accent: 1, glint: 1, crease: 10 });
  for (const p of circle(heart, across, facing, 0.85, 14)) ball(m, add(p, along, 0.2), 0.08, 10, { glint: 1, size: 0.5 });
}

/** The skull's distance from `from` along `dir`. */
const reachSkull = (from: Vec, dir: Vec) => reach(pillow, from, dir);

/** A garland of marigolds round the head, with leaves between them. */
export function garland(m: Maker): void {
  const b = bandOf("garland");
  const FLOWERS = 12;
  for (let k = 0; k < FLOWERS; k++) {
    const a = (k / FLOWERS) * TAU + 0.12 * Math.sin(k * 2.3);
    const r = 1.7 + 0.2 * Math.sin(k * 1.7);
    const c = b.at(a, r * 0.7, 0.2 * Math.sin(k * 3.1));
    marigold(m, c, b.outward(a), b.up, r, k);
    // A leaf on each side of the next flower's gap.
    const a2 = a + TAU / FLOWERS / 2;
    leaf(m, b.at(a2, 0.35, -0.25), b.outward(a2), b.up, a2 * 7);
  }
}

/**
 * A marigold: a full round head of ruffled petals, a little flattened against the hair. The
 * petals are many small frills: the ball's surface rises and falls with them, and their tips are
 * lines of light, so it reads as a flower and not as a ball of light.
 */
function marigold(m: Maker, c: Vec, out: Vec, up: Vec, r: number, seed: number): void {
  const across = unit(cross(up, out));
  const upright = cross(out, across);
  const count = Math.round(1100 * m.dense);
  for (let i = 0; i < count; i++) {
    const z = 2 * m.random() - 1;
    const a = m.random() * TAU;
    const s = Math.sqrt(1 - z * z);
    // z runs along `out`: the back half, against the hair, is flatter and thinner.
    if (z < 0 && m.random() < 0.6) continue;
    const frill = Math.abs(Math.sin(a * 9 + seed) * Math.sin(Math.acos(z) * 7 + seed));
    // Some of it fills the flower's inside, so face-on it is a full flower and not a ring.
    const rr = r * (0.72 + 0.28 * frill) * (m.random() < 0.45 ? 0.2 + 0.8 * Math.sqrt(m.random()) : 1);
    const n = unit(add(add(scale(across, s * Math.cos(a)), upright, s * Math.sin(a)), out, z));
    const p = add(add(add(c, across, rr * s * Math.cos(a)), upright, rr * s * Math.sin(a)), out, rr * z * (z < 0 ? 0.45 : 0.85));
    m.put(p, n, { crease: frill > 0.8 ? 11 : 0, size: 0.75, glint: frill > 0.8 ? 0.4 : 0 });
  }
}

/** A small pointed leaf lying along the band. */
function leaf(m: Maker, c: Vec, out: Vec, up: Vec, seed: number): void {
  const along = unit(cross(up, out));
  const tilt = 0.4 * Math.sin(seed);
  const dir = add(scale(along, Math.cos(tilt)), up, Math.sin(tilt));
  const wide = cross(out, dir);
  surface(m, (u, v) => {
    const s = u * 2 - 1;
    const half = 0.45 * (1 - s * s);
    return add(add(add(c, dir, s * 1.1), wide, (v * 2 - 1) * half), out, 0.15 * (1 - s * s));
  }, 90, (_u, v) => ({ accent: 1, size: 0.55, crease: Math.abs(v - 0.5) < 0.05 ? 8 : 0 }));
}

/**
 * A turban: cloth wound round and round the head, each turn a soft roll; the turns rise toward
 * the front, where they cross in a point over the forehead, and a jewelled brooch with a plume
 * sits there.
 */
export function turban(m: Maker): void {
  const b = bandOf("turban");
  const skull = cap(b);
  const TURNS = 5.5;
  /** Which turn of the cloth a place is on: the turns rise toward the front, in a point. */
  const turnAt = (a: number, e: number) => {
    const fromFront = Math.abs(((a + Math.PI) % TAU) - Math.PI) / Math.PI;
    return ((e / (Math.PI / 2)) * 1.25 - 0.55 * (1 - fromFront) ** 1.4) * TURNS;
  };
  const at = (a: number, e: number): Vec => {
    const s = skull(a, e);
    const q = turnAt(a, e);
    const roll = Math.sin(Math.PI * (((q % 1) + 1) % 1));
    // It stands well off the head, fullest at the crown, each turn a soft roll.
    const thick = 1.3 + 3.4 * Math.sin(e) ** 1.2 + 0.7 * roll;
    return add(b.middle, s.dir, s.r + thick);
  };
  surface(m, (u, v) => at(u * TAU, 0.04 + v * (Math.PI / 2 - 0.04)), 9000, (u, v) => {
    const q = turnAt(u * TAU, 0.04 + v * (Math.PI / 2 - 0.04));
    const seam = 1 - Math.abs(((q % 1) + 1) % 1 - 0.5) * 2;
    return { crease: seam > 0.9 ? 12 : 0, size: 0.8 };
  });
  // The edge of the cloth on the brow and round the back.
  tube(m, Array.from({ length: 121 }, (_, i) => at((i / 120) * TAU, 0.04)), 0.12, 800, { crease: 11 });
  // The brooch, and its plume curling up and back.
  const brooch = add(at(0, 0.62), b.front, 0.35);
  ball(m, brooch, 0.5, 180, { accent: 1, glint: 1 });
  for (const p of circle(brooch, [0, 0, 1], b.up, 0.78, 16)) ball(m, add(p, b.front, -0.1), 0.11, 14, { accent: 1, glint: 1, size: 0.5 });
  const plume = smoothPath([add(brooch, b.up, 0.6), add(add(brooch, b.up, 3.2), b.front, -0.5), add(add(brooch, b.up, 5.4), b.front, -2.0), add(add(brooch, b.up, 6.2), b.front, -4.0)], 12);
  tube(m, plume, 0.05, 260, { accent: 1, glint: 0.8, crease: 8 });
  // Its barbs, longest in the middle, swept back.
  for (let i = 4; i < plume.length - 2; i++) {
    const p = plume[i];
    const ahead = unit(sub(plume[i + 1], plume[i - 1]));
    const s = i / plume.length;
    const len = 0.9 * Math.sin(Math.PI * s) + 0.2;
    for (const side of [-1, 1]) {
      const sideways = unit(cross(ahead, [0, 0, side]));
      tube(m, [p, add(add(p, sideways, len), ahead, -len * 0.5)], 0.02, 14, { accent: 1, glint: 0.6, size: 0.5 });
    }
  }
}
