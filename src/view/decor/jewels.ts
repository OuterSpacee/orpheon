// Jewellery, each piece where it is worn: earrings from the lobes, a nose ring through the wing of
// a nostril, a maang tikka down the parting to the brow, a bindi between the brows, and pearls
// round the neck.
import { skin } from "../head.ts";
import { BROW_MIDDLE, LOBE, NOSTRIL, band, mirror, normalAt, onSkull, pushOut, reach } from "./fit.ts";
import { add, ball, beads, circle, cross, scale, smoothPath, surface, tube, unit, type Maker, type Vec } from "./shapes.ts";

const TAU = Math.PI * 2;
const SIDES = [1, -1] as const;
/** The right lobe, or its mirror on the left. */
const lobe = (side: number): Vec => (side > 0 ? LOBE : mirror(LOBE));

/** Stud earrings: a stone on each lobe, in a ring of tiny ones. */
export function studs(m: Maker): void {
  for (const side of SIDES) {
    const c = add(lobe(side), [0, 0, side * 0.22]);
    ball(m, c, 0.27, 150, { glint: 1, size: 0.6 });
    for (const p of circle(c, [1, 0, 0], [0, 1, 0], 0.34, 8)) ball(m, p, 0.06, 6, { glint: 1, size: 0.45 });
  }
}

/** Hoop earrings: a thin ring through each lobe, hanging against the side of the neck. */
export function hoops(m: Maker): void {
  for (const side of SIDES) {
    const top = add(lobe(side), [0, 0, side * 0.1]);
    const R = 1.1;
    const c = add(top, [-0.15, -R, side * 0.18]);
    // Its plane faces out from the head and a little forward.
    const face = unit([0.25, 0, side]);
    const across = unit(cross([0, 1, 0], face));
    const ring = circle(c, across, [0, 1, 0], R, 64).map((p) => pushOut(p, 0.12));
    tube(m, ring, 0.075, 650, { glint: 0.7, crease: 10, size: 0.6 });
  }
}

/** Jhumkas: a flower stud on each lobe, and under it a little bell with a fringe of beads. */
export function jhumkas(m: Maker): void {
  for (const side of SIDES) {
    const stud = add(lobe(side), [0, 0, side * 0.22]);
    ball(m, stud, 0.2, 50, { accent: 1, glint: 1, size: 0.5 });
    for (const p of circle(stud, [1, 0, 0], [0, 1, 0], 0.3, 6).slice(0, 6)) ball(m, p, 0.11, 14, { glint: 1, size: 0.5 });
    const top = add(stud, [0, -0.55, side * 0.12]);
    tube(m, [stud, top], 0.04, 30, { glint: 0.6 });
    // The bell: a dome opening downward, banded.
    const H = 1.05;
    const W = 0.72;
    const bellAt = (u: number, v: number): Vec => {
      const a = u * TAU;
      const r = W * Math.sin((v * Math.PI) / 2) ** 0.75;
      return add(top, [r * Math.cos(a), -0.12 - H * v, r * Math.sin(a)]);
    };
    surface(m, bellAt, 520, (_u, v) => ({ glint: 0.5, crease: Math.abs(v - 0.55) < 0.04 || Math.abs(v - 0.8) < 0.03 ? 10 : 0, size: 0.55 }));
    const rim = Array.from({ length: 41 }, (_, i) => bellAt(i / 40, 1));
    tube(m, rim, 0.05, 160, { glint: 0.8, crease: 12 });
    // The fringe: a bead hanging from every few places on the rim.
    for (let k = 0; k < 14; k++) {
      const p = rim[Math.round((k / 14) * 40)];
      ball(m, add(p, [0, -0.2, 0]), 0.08, 10, { accent: 1, glint: 1, size: 0.45 });
      ball(m, add(p, [0, -0.42, 0]), 0.1, 12, { accent: 1, glint: 1, size: 0.45 });
    }
    // A pearl inside the bell, as a clapper.
    ball(m, add(top, [0, -H - 0.25, 0]), 0.16, 26, { accent: 1, glint: 1, size: 0.5 });
  }
}

/**
 * A nath: a large ring through the wing of the left nostril, a cluster of pearls on its lower
 * curve, and a fine chain swept back over the cheek to the hair above the ear.
 */
export function nath(m: Maker): void {
  const side = -1;
  const hole: Vec = [NOSTRIL[0], NOSTRIL[1], NOSTRIL[2] * side];
  const R = 1.5;
  const face = unit([0.55, 0, side * 0.83]);
  const down: Vec = unit([0.15, -1, 0]);
  const across = unit(cross(down, face));
  const c = add(hole, down, R);
  const ring = circle(c, across, scale(down, -1), R, 72).map((p) => pushOut(p, 0.12));
  tube(m, ring, 0.08, 1100, { glint: 0.8, crease: 13, size: 0.6 });
  // Pearls and a stone on the lower part of the ring (it starts at its front and runs up, back and down).
  const lower = ring.slice(44, 65);
  lower.forEach((p, i) => {
    if (i % 4 === 2) ball(m, p, i === 10 ? 0.22 : 0.15, i === 10 ? 50 : 26, { accent: i === 10 ? 1 : 0, glint: 1, size: 0.5 });
  });
  // The chain: from the back of the ring, over the cheek, to above the ear.
  const ear = add(mirror(LOBE), [0.6, 5.6, -0.5]);
  const chain = smoothPath([ring[36], add(hole, [-2.3, -0.1, side * 1.8]), [4.2, 3.6, side * 6.1], [1.6, 6.0, side * 7.3], ear], 10).map((p) => pushOut(p, 0.2));
  beads(m, chain, 0.2, 0.035, 3, { glint: 0.7, size: 0.45 });
}

/**
 * A maang tikka: a chain down the parting from the crown to the hairline, and from it a medallion
 * on the middle of the brow, a stone at its heart and a fringe below.
 */
export function tikka(m: Maker): void {
  const from: Vec = [-1, 8, 0];
  // Down the parting, on the skull.
  const parting = Array.from({ length: 13 }, (_, i) => {
    const e = 1.35 - (i / 12) * 0.75;
    const s = onSkull([Math.cos(e), Math.sin(e), 0], from);
    return add(s.p, s.n, 0.15);
  });
  const hang = parting[parting.length - 1];
  // The medallion: on the brow under the chain's end.
  const y = hang[1] - 1.5;
  const x = reach(skin, [0, y, 0], [1, 0, 0]);
  const n = normalAt(skin, [x, y, 0]);
  const centre = add([x, y, 0], n, 0.2);
  const chain = [...parting, add(centre, [0, 0.75, 0])];
  beads(m, smoothPath(chain, 6), 0.2, 0.05, 4, { glint: 0.8, size: 0.45 });
  const across: Vec = [0, 0, 1];
  const upright = unit(cross(n, across));
  surface(m, (u, v) => add(add(centre, across, 0.62 * Math.sqrt(v) * Math.cos(u * TAU)), upright, 0.62 * Math.sqrt(v) * Math.sin(u * TAU)), 200, { glint: 0.6, size: 0.5 });
  tube(m, circle(centre, across, upright, 0.66, 40), 0.05, 140, { glint: 1, crease: 12, size: 0.5 });
  for (const p of circle(centre, across, upright, 0.85, 12)) ball(m, p, 0.07, 9, { glint: 1, size: 0.45 });
  ball(m, add(centre, n, 0.08), 0.24, 70, { accent: 1, glint: 1, size: 0.5 });
  // A drop under it, and three tiny pearls.
  const drop = add(centre, upright, -1.15);
  ball(m, drop, 0.17, 34, { accent: 1, glint: 1, size: 0.5 });
  for (const dz of [-0.3, 0, 0.3]) ball(m, add(add(drop, across, dz), upright, -0.38 - (dz === 0 ? 0.12 : 0)), 0.07, 9, { glint: 1, size: 0.45 });
}

/** A bindi: a small round mark between the brows, with a fine ring of light round it. */
export function bindi(m: Maker): void {
  const x = reach(skin, [0, BROW_MIDDLE[1], 0], [1, 0, 0]);
  const p: Vec = [x, BROW_MIDDLE[1], 0];
  const n = normalAt(skin, p);
  const c = add(p, n, 0.06);
  const across: Vec = [0, 0, 1];
  const upright = unit(cross(n, across));
  surface(m, (u, v) => add(add(c, across, 0.3 * Math.sqrt(v) * Math.cos(u * TAU)), upright, 0.34 * Math.sqrt(v) * Math.sin(u * TAU)), 170, { size: 0.5, glint: 0.3 });
  tube(m, circle(c, across, upright, 0.34, 32).map((q, i) => add(q, upright, 0.04 * Math.sin((i / 32) * TAU))), 0.03, 70, { crease: 12, size: 0.45, glint: 0.6 });
}

/** A string of pearls round the base of the neck, lower at the front where it lies on the collarbones. */
export function pearls(m: Maker): void {
  const b = band(-10.2, -0.32, -2.2);
  const strand = Array.from({ length: 121 }, (_, i) => {
    const a = (i / 120) * TAU;
    const front = (0.5 + 0.5 * Math.cos(a)) ** 2;
    return b.at(a, 0.42 + 0.5 * front, -0.9 * front);
  });
  const at = beads(m, strand, 0.78, 0.36, 60, { glint: 0.75, size: 0.6 });
  // Each pearl has a bright sheen on the side the light comes from.
  const light = unit([0.55, 0.45, 0.7]);
  for (const c of at) ball(m, add(c, light, 0.2), 0.12, 6, { glint: 1, size: 0.5, accent: 1 });
  // The clasp at the back.
  ball(m, b.at(Math.PI, 0.5, 0), 0.22, 40, { accent: 1, glint: 1, size: 0.5 });
}
