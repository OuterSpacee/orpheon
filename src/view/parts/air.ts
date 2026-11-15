// The air: the column that rings. A thin skin of dust marks its walls (the shape of the tube
// itself), and inside it dust travels with the breath. None of it has a fixed place: the shader
// lays it into the tube as the telemetry shapes it, and heats it where the sound is loud.
import { seeded } from "../curve.ts";
import { Dust, KIND, type Part } from "../dust.ts";

export function makeAir(count: number): Part {
  const random = seeded(71);
  const dust = new Dust("air", random, count);
  for (let i = 0; i < count; i++) {
    const pick = random();
    if (pick < 0.24) {
      // The walls of the column, roof side and floor side.
      dust.add(KIND.wall, random(), random() * 2 - 1, random() < 0.5 ? 0 : 1, 0, 0, 0, 0.75);
    } else if (pick < 0.29) {
      // Their cut edges down the middle.
      dust.add(KIND.wall, random(), 0, random() < 0.5 ? 0 : 1, 0, 0, 0, -0.9);
    } else if (pick < 0.83) {
      // The travelling dust, spread evenly through the lens-shaped cross-section.
      let side = random() * 2 - 1;
      while (random() > 1 - side * side) side = random() * 2 - 1;
      dust.add(KIND.flow, random(), side, random(), random(), 0, 0, 0.9 + 0.9 * random() * random());
    } else {
      // The air in the nose.
      dust.add(KIND.noseAir, random(), random() * 2 - 1, random(), random() < 0.5 ? 1 : -1, random(), 0, 0.9 + 0.5 * random());
    }
  }
  return dust.finish();
}
