// The sound that has left the body: dust hanging in the air in front of the mouth and under the
// nostrils. It is dark until sound passes through it; the shader lights it in rings that travel
// outward, as bright as the voice was when each ring left.
import { seeded } from "../curve.ts";
import { Dust, KIND, type Part } from "../dust.ts";

export function makeSound(count: number): Part {
  const random = seeded(101);
  const dust = new Dust("sound", random, count);
  let made = 0;
  while (made < count) {
    // A direction, kept more often the closer it is to straight out of the opening.
    const u = random() * 2 - 1;
    const a = random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const x = r * Math.cos(a);
    const y = u;
    const z = r * Math.sin(a);
    const nostril = random() < 0.2;
    const toward = nostril ? x * 0.55 - y * 0.83 : x * 0.998 - y * 0.06;
    if (random() > Math.pow(Math.max(0, 0.1 + 0.9 * toward), nostril ? 2.5 : 1.3)) continue;
    dust.add(KIND.sound, x, y, z, random(), nostril ? (random() < 0.5 ? 1 : -1) : 0, 0, 1.0 + 0.8 * random() * random());
    made++;
  }
  return dust.finish();
}
