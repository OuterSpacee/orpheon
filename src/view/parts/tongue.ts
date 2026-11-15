// The tongue. Its particles carry no fixed place: each knows how far along the airway it is, how
// far to the side and how deep under the surface, and the shader puts it where the tube's shape
// says the tongue is this frame.
import { seeded } from "../curve.ts";
import { Dust, KIND, type Part } from "../dust.ts";
import { TONGUE_FROM, TONGUE_TO } from "../moving.ts";

export function makeTongue(count: number): Part {
  const random = seeded(31);
  const dust = new Dust("tongue", random, count);
  const span = TONGUE_TO - TONGUE_FROM;
  // The tip is rounded: toward the sides the tongue ends a little sooner.
  const along = (side: number) => TONGUE_FROM + random() * (span - 0.045 * side * side);
  for (let i = 0; i < count; i++) {
    const pick = random();
    if (pick < 0.62) {
      // Its skin. Across the tongue it is one rounded curve: flat over the top, rolling down at
      // the edges, and tucking in underneath toward the floor of the mouth.
      const round = (random() * 2 - 1) * 2.25;
      const over = Math.abs(round) - Math.PI / 2;
      const side = over <= 0 ? Math.sin(round) : Math.sign(round) * (1 - 0.3 * (over / 0.68) ** 2);
      const depth = over <= 0 ? 0.2 * (1 - Math.cos(round)) : 0.2 + 0.8 * (over / 0.68);
      dust.add(KIND.tongue, along(side), side, depth, 1, 0, 0, 0.8 + random() * 0.4);
    } else if (pick < 0.68) {
      // The tip and the root close it off.
      const tip = random() < 0.65;
      const side = random() * 2 - 1;
      dust.add(KIND.tongue, tip ? TONGUE_TO - 0.045 * side * side : TONGUE_FROM, side * 0.9, random(), 1, 0, 0, 0.8);
    } else if (pick < 0.76) {
      // A little dust inside, so it has body.
      dust.add(KIND.tongue, along(0.7), (random() * 2 - 1) * 0.75, 0.15 + random() * 0.8, 0, 0, 0, 0.6);
    } else if (pick < 0.86) {
      // The cut face: its outline down the middle …
      const where = random();
      if (where < 0.75) dust.add(KIND.tongue, along(0), 0, 0, 1, 0, 0, -1.1);
      else dust.add(KIND.tongue, where < 0.9 ? TONGUE_TO : TONGUE_FROM, 0, random(), 1, 0, 0, -1.0);
    } else {
      // … and the muscle within it, thinning with depth.
      dust.add(KIND.tongue, along(0), 0, Math.pow(random(), 1.3), 0, 0, 0, -0.8);
    }
  }
  return dust.finish();
}
