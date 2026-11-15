// The nose's passages: two tall, narrow rooms either side of a thin wall, from the space behind
// the soft palate to the nostrils. Their outer walls carry three long ridges (the turbinates),
// which is what makes them read as a nose and not as a box.
import { SEPTUM, noseReach, noseTall, noseX, noseY } from "../body.ts";
import { seeded } from "../curve.ts";
import { Dust, KIND, type Part } from "../dust.ts";

export function makeNose(count: number): Part {
  const random = seeded(61);
  const dust = new Dust("nose", random, count);
  for (let i = 0; i < count; i++) {
    const t = random();
    const e = 0.01;
    const dx = noseX(t + e) - noseX(t - e);
    const dy = noseY(t + e) - noseY(t - e);
    const l = Math.hypot(dx, dy) || 1;
    const upX = -dy / l;
    const upY = dx / l;
    const tall = noseTall(t);
    const reach = noseReach(t);
    const pick = random();
    const side = random() < 0.5 ? 1 : -1;
    let u = random() * 2 - 1;
    let z: number;
    let nx = 0;
    let ny = 0;
    let nz = side;
    let size = 0.8;
    if (pick < 0.4) {
      // The three scrolls of bone on the outer wall (the turbinates), one above another.
      const k = Math.floor(random() * 3) - 1;
      const along = 0.3 + random() * 0.56;
      const swell = Math.pow(Math.sin((Math.PI * (along - 0.3)) / 0.56), 0.5);
      const r = 0.2 * swell * (k === 0 ? 1.15 : 0.9) + 0.03;
      const a = random() * Math.PI * 2;
      const tallHere = noseTall(along);
      const at = k * 0.3 * tallHere + r * Math.sin(a) * 1.3;
      dust.add(
        KIND.rigid,
        noseX(along) + upX * at - 0.4 * k * k, noseY(along) + upY * at, side * (SEPTUM + noseReach(along) * 0.6 + r * Math.cos(a) * 1.5),
        upX * Math.sin(a), upY * Math.sin(a), side * Math.cos(a), 0.8,
      );
      continue;
    } else if (pick < 0.64) {
      // The outer wall.
      z = side * (SEPTUM + reach * Math.sqrt(Math.max(0, 1 - u * u * u * u)));
      ny = u * u * u;
      size = 0.6;
    } else if (pick < 0.8) {
      // The roof and the floor.
      u = random() < 0.5 ? 1 : -1;
      z = side * (SEPTUM + random() * reach * 0.5);
      nx = upX * u;
      ny = upY * u;
      nz = 0;
    } else if (pick < 0.88) {
      // The wall between the two.
      z = side * SEPTUM;
      size = 0.55;
    } else {
      // The cut face: the outline of the passage in the middle of the head.
      u = random() < 0.5 ? 1 : -1;
      z = 0;
      size = -1.0;
    }
    const x = noseX(t) + upX * u * tall * 0.5;
    const y = noseY(t) + upY * u * tall * 0.5;
    dust.add(KIND.rigid, x, y, z, nx, ny, nz, size);
    if (i % 90 === 0 && z !== 0) dust.mark(x, y, z);
  }
  return dust.finish();
}
