// The larynx: the shield and the ring of cartilage that hold the two folds, the leaf that covers
// them when swallowing, the bone the whole thing hangs from, and the windpipe below.
// Everything rides up and down with the pose's larynx value; the folds themselves are placed by
// the shader, which shows their cycle slowed as a stroboscope does.
import { seeded, smoothstep } from "../curve.ts";
import { Dust, KIND, type Part } from "../dust.ts";

const TOP_OF_WINDPIPE = -10.5;
const FORK = -21.5;

export function makeLarynx(count: number): Part {
  const random = seeded(83);
  const dust = new Dust("larynx", random, count);
  const side = () => (random() < 0.5 ? 1 : -1);

  // The shield (thyroid cartilage): two plates that meet in front at the Adam's apple.
  for (let i = 0; i < count * 0.24; i++) {
    const cut = random() < 0.08;
    const u = cut ? 0 : Math.pow(random(), 0.9);
    const top = -7.0 - 0.65 * Math.exp(-u / 0.12) + 1.0 * smoothstep(0.86, 1, u);
    const bottom = -9.6 - 0.55 * smoothstep(0.86, 1, u);
    const edge = random() < 0.2;
    const y = edge ? (random() < 0.5 ? top : bottom) : bottom + random() * (top - bottom);
    const z = cut ? 0 : side() * (0.12 + 2.05 * Math.pow(u, 0.85));
    dust.add(KIND.larynx, 3.05 - 2.25 * u, y, z, 0.67, 0, Math.sign(z) * 0.74, cut ? -1.1 : 0.8, 1);
    if (i % 50 === 0) dust.mark(3.05 - 2.25 * u, y, z);
  }
  // The ring (cricoid cartilage): low in front, tall behind.
  for (let i = 0; i < count * 0.11; i++) {
    const cut = random() < 0.15;
    const a = cut ? (random() < 0.4 ? 0 : Math.PI) : (random() * 2 - 1) * Math.PI;
    const top = -9.75 + 1.3 * smoothstep(0.55 * Math.PI, 0.95 * Math.PI, Math.abs(a));
    const y = -10.45 + random() * (top + 10.45);
    dust.add(KIND.larynx, 1.5 + 1.05 * Math.cos(a), y, 1.2 * Math.sin(a), Math.cos(a), 0, Math.sin(a), cut ? -1.1 : 0.8, 1);
  }
  // Two small pyramids on the back of the ring, which swing the folds together and apart.
  for (let i = 0; i < count * 0.03; i++) {
    const h = random();
    const a = random() * Math.PI * 2;
    const r = 0.3 * (1 - h) + 0.05;
    dust.add(KIND.larynx, 1.05 + r * Math.cos(a), -8.45 + h * 0.95, side() * 0.5 + r * Math.sin(a), Math.cos(a), 0.3, Math.sin(a), 0.7, 1);
  }
  // The leaf (epiglottis), standing up behind the root of the tongue.
  for (let i = 0; i < count * 0.09; i++) {
    const cut = random() < 0.2;
    const e = random();
    const half = 0.22 + 1.0 * Math.pow(Math.sin(Math.PI * Math.pow(e, 0.75) * 0.93), 0.8);
    const t = cut ? 0 : random() * 2 - 1;
    const x = 2.3 - 0.25 * e - 0.55 * e * e - 0.3 * t * t;
    dust.add(KIND.larynx, x, -7.9 + 2.6 * e, t * half, 1, 0.3, -0.6 * t, cut ? -1.1 : 0.8, 0.85);
  }
  // The bone under the tongue (hyoid): a horseshoe open to the back.
  for (let i = 0; i < count * 0.07; i++) {
    const h = Math.pow(random(), 0.8);
    const a = random() * Math.PI * 2;
    const cut = random() < 0.1;
    const x = 3.1 - 2.3 * Math.pow(cut ? 0 : h, 1.3);
    const z = cut ? 0 : side() * 2.3 * Math.pow(Math.sin((Math.PI / 2) * h), 0.8);
    dust.add(KIND.larynx, x + (cut ? random() - 0.5 : 0.22 * Math.cos(a)) * (cut ? 0.4 : 1), -5.75 + 0.5 * h + 0.22 * Math.sin(a) * (cut ? random() : 1), z, Math.cos(a), Math.sin(a), 0, cut ? -1.0 : 0.8, 0.7);
  }
  // The folds: for each, its top, its lower lip, its free edge, and a little inside.
  for (let i = 0; i < count * 0.2; i++) {
    const pick = random();
    const along = random();
    const which = side();
    if (pick < 0.42) dust.add(KIND.fold, along, 1, Math.pow(random(), 1.3), which, 0, 0, 0.85);
    else if (pick < 0.62) dust.add(KIND.fold, along, 0, Math.pow(random(), 1.3), which, 0, 0, 0.8);
    else if (pick < 0.9) dust.add(KIND.fold, along, random(), 0, which, 0, 0, 1.0);
    else dust.add(KIND.fold, along, random(), random(), which, 0, 0, 0.6);
  }
  // The windpipe: a tube stiffened by rings, leaning back as it goes down, and its fork.
  for (let i = 0; i < count * 0.26; i++) {
    const cut = random() < 0.1;
    const y = TOP_OF_WINDPIPE + random() * (FORK - TOP_OF_WINDPIPE);
    const ring = Math.cos((Math.PI * y) / 0.62) ** 2;
    if (!cut && random() > 0.25 + 0.75 * ring * ring) continue;
    const a = cut ? (random() < 0.5 ? 0 : Math.PI) : random() * Math.PI * 2;
    const r = 0.95 + 0.06 * ring;
    const x = 1.5 + (y - TOP_OF_WINDPIPE) * 0.115 + r * Math.cos(a);
    dust.add(KIND.larynx, x, y, r * Math.sin(a), Math.cos(a), 0, Math.sin(a), cut ? -1.0 : 0.8, 1 - (TOP_OF_WINDPIPE - y) / (TOP_OF_WINDPIPE - FORK));
  }
  for (let i = 0; i < count * 0.05; i++) {
    const h = random();
    const a = random() * Math.PI * 2;
    const which = side();
    const r = 0.62;
    dust.add(KIND.larynx, 0.25 - 0.55 * h + r * Math.cos(a), FORK - 2.0 * h + r * Math.sin(a) * 0.5, which * (3.6 * h + r * Math.sin(a) * 0.9), Math.cos(a), 0.4, Math.sin(a), 0.8, 0);
  }
  return dust.finish();
}
