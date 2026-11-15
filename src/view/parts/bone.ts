// The skull, the jaw, the teeth and the bones of the neck.
//
// The skull is the head's own shape taken in by the thickness of the flesh over it, kept only
// where there is bone, with the eye sockets and the opening of the nose carved out. The jaw is a
// flat shape (as seen from the side) bent round the curve of the teeth. Teeth and the bones of
// the neck are rounded lumps set along their curves.
import { closedOutline, curve, outlineDistance, seeded, smoothstep } from "../curve.ts";
import { Dust, KIND, type Part } from "../dust.ts";
import { pillow } from "../head.ts";
import { both, carve, egg, join, rod, scatterInSlice, scatterOnSurface, type Field } from "../solid.ts";

/** Below the cheekbones the skull is only the upper jaw, the cheekbone and the arch that runs back from it to the ear. */
function lowerFace(x: number, y: number, side: number): number {
  let d = egg(x, y, side, 6.2, 2.9, 0, 2.7, 2.0, 3.2);
  d = join(d, egg(x, y, side, 6.0, 4.2, 4.2, 1.5, 1.2, 1.5), 0.5);
  d = join(d, rod(x, y, side, 5.6, 4.1, 5.2, 0.5, 0.3, 4.3, 6.3, 0.38), 0.3);
  // The lump behind the ear.
  return join(d, egg(x, y, side, -1.6, 3.0, 5.5, 1.0, 1.3, 0.9), 0.4);
}
const CHEEK = 4.4;
/** The braincase: an egg. Its underside is the base of the skull. */
const braincase = (x: number, y: number, side: number) => egg(x, y, side, -1.7, 10.5, 0, 9.9, 8.2, 8.0);

const skull: Field = (x, y, z) => {
  const side = Math.abs(z);
  // Flesh is thin over the scalp and brow, thick over the cheeks and round the mouth.
  const flesh = 0.5 + 0.75 * smoothstep(5.5, 1.5, y) * smoothstep(1, 6, x);
  let d = pillow(x, y, side) + flesh;
  // Bone is the braincase, the face above the cheekbones, and below them only the upper jaw,
  // the cheekbone and its arch.
  const low = lowerFace(x, y, side);
  const face = Math.max(CHEEK - y, 1.5 - x);
  d = both(d, join(join(braincase(x, y, side), face, 0.6), low, 0.4), 0.3);
  if (x > 3) {
    d = carve(d, egg(x, y, side, 7.3, 6.5, 3.15, 2.3, 1.55, 1.7), 0.3);
    d = carve(d, egg(x, y, side, 8.7, 3.7, 0, 1.7, 1.5, 1.0), 0.25);
    d = carve(d, egg(x, y, side, 8.6, 4.9, 0, 1.2, 0.9, 0.55), 0.25);
  }
  // The hollow of the temple, above the arch of the cheekbone.
  d = carve(d, egg(x, y, side, 2.6, 6.9, 7.6, 3.2, 2.0, 1.5), 0.6);
  return d;
};
/** Is this point of the skull's surface on the flat face where the upper face was simply cut off at the cheekbones? */
function onCut(x: number, y: number, z: number): boolean {
  const side = Math.abs(z);
  return x > 1.2 && Math.abs(CHEEK - y) < 0.25 && lowerFace(x, y, side) > 0.3 && braincase(x, y, side) > 0.3;
}

// ── the jaw ──
// Seen from the side: the chin, the lower edge back to the angle, the upright up to the joint
// and the point in front of it, and the ledge the lower teeth stand on.
const JAW = closedOutline(
  [8.0, -0.8, 8.35, -2.2, 8.45, -3.5, 7.6, -4.4, 5.0, -4.1, 2.5, -3.6, 0.2, -3.0, -0.6, -0.5, -1.1, 2.5, -0.95, 4.4, -0.3, 4.35, 0.6, 2.9, 1.9, 4.0, 2.3, 1.5, 2.9, -0.3, 4.5, -0.8],
  5,
);
/** The front of the chin at each height: where the horseshoe of the jaw comes round. */
const chinFront = curve([-4.5, 7.5, -4.0, 8.2, -3.4, 8.45, -2.2, 8.35, -0.8, 8.0]);
/** Where the horseshoe turns into the straight uprights, and half the jaw's width there. */
const TURN = 1.0;
const SPREAD = 4.5;

function addJaw(dust: Dust, random: () => number, count: number): void {
  let made = 0;
  while (made < count) {
    // Seen from above the jaw is half an ellipse that carries on straight back to the joints.
    // Walk round it by angle in the bend and by distance on the straights, so the chin gets
    // its share of the dust.
    const y = -4.6 + random() * 9.2;
    let x: number;
    let out: number;
    let nx: number;
    let nz: number;
    if (random() < 0.7) {
      const a = random() * Math.PI * 0.5;
      const front = chinFront(Math.max(-4.5, Math.min(-0.8, y)));
      x = TURN + (front - TURN) * Math.cos(a);
      out = SPREAD * Math.sin(a);
      nx = Math.cos(a) / (front - TURN);
      nz = Math.sin(a) / SPREAD;
    } else {
      x = TURN - random() * 2.3;
      out = SPREAD + (TURN - x) * 0.2;
      nx = 0.2;
      nz = 1;
    }
    const d = outlineDistance(JAW, x, y);
    if (d > 0) continue;
    // More at the outline than in the flat of the bone, so the shape is drawn by its edge.
    if (d < -0.25 && random() > 0.5) continue;
    const l = Math.hypot(nx, nz);
    const thick = (y > -0.5 ? 0.18 : 0.3) * (random() < 0.6 ? 1 : -1);
    for (const mirror of [1, -1]) {
      const z = (out + (thick * nz) / l) * mirror;
      dust.add(KIND.rigid, x + (thick * nx) / l, y, z, nx / l, 0, (nz / l) * mirror, 0.85, 1);
      if (made % 90 === 0) dust.mark(x, y, z);
    }
    made += 2;
  }
  // The cut face of the jaw in the middle: the chin, sliced.
  for (let i = 0; i < count * 0.05; i++) {
    const y = -4.4 + random() * 3.6;
    const x = chinFront(y) - random() * 1.1 * Math.min(1, (y + 4.5) / 1.2 + 0.3);
    dust.add(KIND.rigid, x, y, 0, 0, 0, 1, -0.9, 1);
  }
}

// ── the teeth ──
/** Widths of the teeth of one side, from the middle outward: two incisors, a canine, two premolars, two molars. */
const TEETH = [0.86, 0.68, 0.78, 0.7, 0.7, 1.02, 1.0];

function addTeeth(dust: Dust, random: () => number, count: number): void {
  const each = Math.floor(count / (TEETH.length * 4));
  for (const lower of [false, true]) {
    // The curve of the teeth seen from above; the lower teeth close just inside the upper.
    const front = lower ? 7.95 : 8.25;
    const curl = lower ? 0.6 : 0.55;
    let z0 = 0;
    for (let t = 0; t < TEETH.length; t++) {
      // Walk along the curve by the tooth's width.
      const mid = stepAlong(z0, TEETH[t] / 2, curl);
      const z1 = stepAlong(z0, TEETH[t], curl);
      z0 = z1;
      const cx = front - curl * mid * mid;
      const turn = Math.atan(2 * curl * mid);
      const biting = t < 3;
      const tall = biting ? 0.95 : t < 5 ? 0.75 : 0.62;
      const deep = biting ? 0.3 : t < 5 ? 0.4 : 0.52;
      // Front teeth overlap (the upper in front of and a little below the lower); the back teeth meet.
      const cy = lower ? (biting ? 0.12 : 0) - tall / 2 : (biting ? -0.02 : 0) + tall / 2;
      for (let i = 0; i < each; i++) {
        // A point on a rounded block.
        let ux = random() * 2 - 1;
        let uy = random() * 2 - 1;
        let uz = random() * 2 - 1;
        const m = Math.max(Math.abs(ux), Math.abs(uy), Math.abs(uz));
        const round = Math.pow(Math.abs(ux / m) ** 4 + Math.abs(uy / m) ** 4 + Math.abs(uz / m) ** 4, 0.25);
        ux /= m * round;
        uy /= m * round;
        uz /= m * round;
        // Front teeth are blades: thin at the biting edge.
        const blade = biting ? 0.45 + 0.55 * (lower ? 0.5 - uy * 0.5 : 0.5 + uy * 0.5) : 1;
        const ax = ux * deep * blade;
        const az = (uz * TEETH[t]) / 2.15;
        const c = Math.cos(turn);
        const s = Math.sin(turn);
        for (const mirror of [1, -1]) {
          dust.add(KIND.rigid, cx + ax * c - az * s, cy + (uy * tall) / 2, (mid + ax * s + az * c) * mirror, ux * c - uz * s, uy, (ux * s + uz * c) * mirror, 0.6, lower ? 1 : 0, 0, 2);
        }
      }
    }
    // The cut face of the front teeth.
    for (let i = 0; i < each * 2; i++) {
      const uy = random();
      const ux = (random() * 2 - 1) * 0.3 * (0.45 + 0.55 * uy);
      dust.add(KIND.rigid, front + ux, lower ? 0.12 - uy : -0.02 + uy, 0, 0, 0, 1, -1, lower ? 1 : 0, 0, 2);
    }
  }
}
/** The sideways position a distance further along the curve x = front − curl·z². */
function stepAlong(z: number, distance: number, curl: number): number {
  for (let left = distance; left > 0; left -= 0.02) z += Math.min(left, 0.02) / Math.hypot(1, 2 * curl * z);
  return z;
}

// ── the neck ──
function addNeck(dust: Dust, random: () => number, count: number): void {
  const bones = 8;
  const each = Math.floor(count / bones);
  for (let b = 0; b < bones; b++) {
    const y = 1.9 - b * 1.85;
    // The neck's gentle forward bow.
    const x = -2.0 + 0.75 * Math.sin((Math.PI * b) / (bones - 0.5));
    for (let i = 0; i < each; i++) {
      const a = random() * Math.PI * 2;
      const which = random();
      if (which < 0.5) {
        // The drum of the bone: a short, wide cylinder with a waist.
        const end = random() < 0.3;
        const h = end ? (random() < 0.5 ? 1 : -1) : random() * 2 - 1;
        const r = end ? Math.sqrt(random()) : 1 - 0.1 * (1 - h * h);
        dust.add(KIND.rigid, x + r * 0.9 * Math.cos(a), y + h * 0.6, r * 1.2 * Math.sin(a), end ? 0 : Math.cos(a), end ? h : 0, end ? 0 : Math.sin(a), 0.7);
      } else if (which < 0.8) {
        // The spur that points back and down, and the arch that carries it.
        const t = random();
        const r = 0.34 - 0.14 * t;
        dust.add(KIND.rigid, x - 1.2 - 2.0 * t + r * Math.cos(a) * 0.4, y - 0.1 - 0.75 * t + r * Math.sin(a), r * Math.cos(a) * 1.2, -0.3, Math.sin(a), Math.cos(a), 0.65);
      } else if (which < 0.92) {
        // The wings to either side.
        const side = random() < 0.5 ? 1 : -1;
        const t = random();
        dust.add(KIND.rigid, x - 0.5 - 0.5 * t + 0.25 * Math.cos(a), y + 0.25 * Math.sin(a), side * (1.2 + 1.3 * t), Math.cos(a), Math.sin(a), 0, 0.65);
      } else {
        // Their cut faces.
        const fx = random() * 2 - 1;
        const fy = random() * 2 - 1;
        if (random() < 0.6) dust.add(KIND.rigid, x + fx * 0.9, y + fy * 0.6, 0, 0, 0, 1, Math.max(Math.abs(fx), Math.abs(fy)) > 0.85 ? -1.0 : -0.6);
        else {
          const t = random();
          dust.add(KIND.rigid, x - 1.2 - 2.0 * t, y - 0.1 - 0.75 * t + fy * (0.34 - 0.14 * t), 0, 0, 0, 1, -0.8);
        }
      }
    }
    dust.mark(x, y, 0);
  }
}

export function makeBone(count: number): Part {
  const random = seeded(23);
  const dust = new Dust("bone", random, count);
  let n = 0;
  scatterOnSurface(skull, {
    box: [-11.5, 0.6, -8.5, 10, 18.5, 8.5],
    count: Math.round(count * 0.55),
    random,
    keep: (x, y, z) => (onCut(x, y, z) ? 0.08 : x > 3 && y < 10 ? 1 : 0.55),
    emit(x, y, z, nx, ny, nz, bend) {
      dust.add(KIND.rigid, x, y, z, nx, ny, nz, 0.75 + random() * 0.4, 0, 0, 4 * Math.round(bend * 15));
      if (n++ % 140 === 0) dust.mark(x, y, z);
    },
  });
  // Bone has thickness: its cut face is a band.
  scatterInSlice(skull, {
    box: [-11.5, 0.6, 10, 18.5],
    count: Math.round(count * 0.07),
    random,
    depth: 0.6,
    emit: (x, y) => dust.add(KIND.rigid, x, y, 0, 0, 0, 1, -0.9),
  });
  addJaw(dust, random, Math.round(count * 0.17));
  addTeeth(dust, random, Math.round(count * 0.11));
  addNeck(dust, random, Math.round(count * 0.1));
  return dust.finish();
}
