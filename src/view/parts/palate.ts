// The roof of the mouth. The hard palate is a fixed plate of bone, arched like the tube's roof
// (it is the tube's roof) with the floor of the nose on top. The soft palate behind it is a flap
// the shader bends up to shut the nose or lets hang to open it.
import { LANDMARK } from "../../contract.ts";
import { seeded } from "../curve.ts";
import { Dust, KIND, type Part } from "../dust.ts";
import { acrossX, acrossY, arch, roofX, roofY } from "../tract.ts";

/** Where along the airway the hard palate begins (its back edge, where the soft palate hangs from). */
const HARD_FROM = 0.655;
/** How thick the plate is. */
const THICK = 0.5;

export function makePalate(count: number): Part {
  const random = seeded(53);
  const dust = new Dust("palate", random, count);
  const hard = Math.round(count * 0.66);
  for (let i = 0; i < hard; i++) {
    const s = HARD_FROM + random() * (LANDMARK.teeth - HARD_FROM);
    // It is as wide as the curve of the upper teeth lets it be.
    const wide = Math.min(2.5, Math.sqrt(Math.max(0.04, (8.2 - roofX(s)) / 0.55))) - 0.2;
    const pick = random();
    const z = pick > 0.86 ? 0 : (random() * 2 - 1) * wide;
    const drop = arch(s) * z * z;
    const x = roofX(s) + acrossX(s) * drop;
    const y = roofY(s) + acrossY(s) * drop;
    if (pick < 0.62) {
      // The underside: what the tongue touches.
      dust.add(KIND.rigid, x, y, z, acrossX(s), acrossY(s), -2 * arch(s) * z, 0.8 + random() * 0.3);
      if (i % 60 === 0) dust.mark(x, y, z);
    } else if (pick < 0.86) {
      // The top: the floor of the nose, flatter than the underside.
      dust.add(KIND.rigid, roofX(s), roofY(s) + THICK + 0.25 * drop, z, 0, 1, 0, 0.75);
    } else {
      // The cut face of the plate.
      const depth = random();
      dust.add(KIND.rigid, roofX(s), roofY(s) + THICK * depth, 0, 0, 0, 1, depth < 0.12 || depth > 0.9 ? -1.1 : -0.75);
    }
  }
  for (let i = hard; i < count; i++) {
    const t = Math.pow(random(), 0.9);
    const pick = random();
    const side = random() * 2 - 1;
    if (pick < 0.42) dust.add(KIND.velum, t, side, 0, 0, 0, 0, 0.85);
    else if (pick < 0.72) dust.add(KIND.velum, t, side, 1, 0, 0, 0, 0.8);
    else if (pick < 0.8) dust.add(KIND.velum, t, side < 0 ? -1 : 1, random(), 0, 0, 0, 0.8);
    else if (pick < 0.84) dust.add(KIND.velum, 1, side, random(), 0, 0, 0, 0.8);
    else {
      const depth = random();
      dust.add(KIND.velum, random() < 0.1 ? 1 : t, 0, depth, 0, 0, 0, depth < 0.1 || depth > 0.9 ? -1.1 : -0.75);
    }
  }
  return dust.finish();
}
